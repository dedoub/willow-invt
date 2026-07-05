#!/usr/bin/env node
// Claude/Codex 세션 간 경량 브리지 CLI.
// 기존 workstation DB(ws_threads / ws_thread_events)를 재사용해
// 에이전트 간 메시지를 남기고 읽고 폴링할 수 있게 한다.
//
// 설계 원칙
// - 일반 운영 맥락에 섞이지 않도록 bridge thread는 기본 status=archived
// - 식별은 tags: ['agent-bridge', 'bridge:<agent>', 'channel:<name>']
// - 실제 메시지는 ws_thread_events.kind='note' + ref.bridge metadata 로 기록

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const HUB_ENV = process.env.WS_HUB_ENV || '/Volumes/PRO-G40/app-dev/willow-invt/.env.local'
const STATE_PATH = process.env.WS_BRIDGE_STATE || '/Volumes/PRO-G40/app-dev/willow-invt/scripts/logs/ws-bridge-state.json'

function loadEnv(filePath) {
  const out = {}
  let raw = ''
  try {
    raw = readFileSync(filePath, 'utf-8')
  } catch {
    return out
  }
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[m[1]] = v
  }
  return out
}

const env = loadEnv(HUB_ENV)
const URL = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SECRET_KEY

if (!URL || !KEY) {
  console.error('Supabase 크레덴셜을 찾지 못했어요. (.env.local / WS_HUB_ENV 확인)')
  process.exit(1)
}

const HEADERS = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
}

function has(flag) {
  return process.argv.includes(`--${flag}`)
}

function arg(flag) {
  const i = process.argv.indexOf(`--${flag}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function ensureParentDir(filePath) {
  mkdirSync(path.dirname(filePath), { recursive: true })
}

function loadState() {
  if (!existsSync(STATE_PATH)) return { agents: {} }
  try {
    const raw = readFileSync(STATE_PATH, 'utf-8').trim()
    if (!raw) return { agents: {} }
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && parsed.agents ? parsed : { agents: {} }
  } catch {
    return { agents: {} }
  }
}

function saveState(state) {
  ensureParentDir(STATE_PATH)
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8')
}

function getCursor(agent, threadId) {
  const state = loadState()
  return state.agents?.[agent]?.[threadId] || null
}

function setCursor(agent, threadId, isoTime) {
  const state = loadState()
  if (!state.agents[agent]) state.agents[agent] = {}
  state.agents[agent][threadId] = isoTime
  saveState(state)
}

async function api(pathAndQuery, init = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 6000)
  try {
    const res = await fetch(`${URL}/rest/v1/${pathAndQuery}`, {
      ...init,
      headers: { ...HEADERS, ...(init.headers || {}) },
      signal: ctrl.signal,
    })
    const text = await res.text()
    if (!res.ok) {
      throw new Error(text || `${res.status} ${res.statusText}`)
    }
    return text ? JSON.parse(text) : []
  } finally {
    clearTimeout(t)
  }
}

function kst(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  const f = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
  return f.replace(/\.\s*/g, '.').replace(/,$/, '')
}

function shortId(id) {
  return id?.slice(0, 8) || ''
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))]
}

function bridgeTags(a, b, channel) {
  return uniq([
    'agent-bridge',
    `bridge:${a}`,
    `bridge:${b}`,
    channel ? `channel:${channel}` : 'channel:default',
  ])
}

async function listBridgeThreads({ agent, project, channel } = {}) {
  const pf = project ? `&project=eq.${encodeURIComponent(project)}` : ''
  const rows = await api(`ws_threads?select=id,project,title,status,priority,summary,tags,last_touched_at,created_at${pf}&order=last_touched_at.desc&limit=200`)
  return (rows || []).filter((row) => {
    const tags = Array.isArray(row.tags) ? row.tags : []
    if (!tags.includes('agent-bridge')) return false
    if (agent && !tags.includes(`bridge:${agent}`)) return false
    if (channel && !tags.includes(`channel:${channel}`)) return false
    return true
  })
}

async function findBridgeThread({ a, b, project, channel }) {
  const threads = await listBridgeThreads({ project, channel })
  return threads.find((thread) => {
    const tags = Array.isArray(thread.tags) ? thread.tags : []
    return tags.includes(`bridge:${a}`) && tags.includes(`bridge:${b}`)
  }) || null
}

async function resolveThread(threadHint, project) {
  if (!threadHint) throw new Error('--thread 가 필요해요.')
  if (/^[0-9a-f-]{36}$/i.test(threadHint)) {
    const exact = await api(`ws_threads?id=eq.${threadHint}&select=id,project,title,status,priority,summary,tags,last_touched_at`).catch(() => [])
    if (exact?.[0]) return exact[0]
  }
  const threads = await listBridgeThreads({ project })
  const matches = threads.filter((thread) => thread.id.startsWith(threadHint))
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) throw new Error(`thread prefix ${threadHint} 가 ${matches.length}개와 겹쳐요.`)
  throw new Error(`thread ${threadHint} 를 찾지 못했어요.`)
}

async function fetchEvents(threadId, limit = 50, ascending = false) {
  const order = ascending ? 'asc' : 'desc'
  return await api(
    `ws_thread_events?thread_id=eq.${threadId}&select=id,kind,body,ref,author,created_at&order=created_at.${order}&limit=${limit}`
  )
}

function pickBridgeEvents(events) {
  return (events || []).filter((event) => event.ref?.bridge === true)
}

function latestBridgeEvent(events) {
  const picked = pickBridgeEvents(events)
  return picked.length ? picked[picked.length - 1] : null
}

async function touchThread(threadId) {
  await api(`ws_threads?id=eq.${threadId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ last_touched_at: new Date().toISOString() }),
  })
}

async function createOrReuseThread() {
  const a = arg('a') || arg('from')
  const b = arg('b') || arg('to')
  if (!a || !b) throw new Error('--a / --b 가 필요해요.')

  const project = arg('project') || 'bridge'
  const channel = arg('channel') || 'default'
  const title = arg('title') || `${a} ↔ ${b}`
  const summary = arg('summary') || `${a} ↔ ${b}`
  const existing = await findBridgeThread({ a, b, project, channel })

  if (existing) {
    console.log(`기존 bridge 재사용: ${shortId(existing.id)} ${existing.title}`)
    if (arg('message')) await sendMessage(existing, arg('message'), arg('from') || a, arg('to') || b, channel)
    return
  }

  const created = await api('ws_threads', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      project,
      title,
      status: 'archived',
      priority: 'low',
      summary,
      entity_ids: [],
      tags: bridgeTags(a, b, channel),
    }),
  })

  const thread = created?.[0]
  if (!thread) throw new Error('bridge thread 생성에 실패했어요.')
  console.log(`bridge 생성: ${shortId(thread.id)} ${thread.title}`)

  if (arg('message')) await sendMessage(thread, arg('message'), arg('from') || a, arg('to') || b, channel)
}

async function sendMessage(thread, inlineBody, senderOverride, recipientOverride, channelOverride) {
  const from = senderOverride || arg('from') || arg('author') || 'unknown-agent'
  const to = recipientOverride !== undefined ? recipientOverride : (arg('to') || null)
  const channel = channelOverride || arg('channel') || 'default'
  const kind = arg('kind') || 'note'
  const body = inlineBody || arg('body')
  if (!body) throw new Error('--body 가 필요해요.')

  const logged = await api('ws_thread_events', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      thread_id: thread.id,
      project: thread.project,
      kind,
      body,
      ref: { bridge: true, from, to, channel },
      author: from,
    }),
  })
  await touchThread(thread.id)
  console.log(`전송됨: ${shortId(thread.id)} ${from}${to ? ` → ${to}` : ''}`)
  return logged?.[0]
}

async function sendToThread() {
  const thread = await resolveThread(arg('thread'), arg('project'))
  await sendMessage(thread)
}

async function showInbox({ markRead = false, once = true } = {}) {
  const agent = arg('agent')
  if (!agent) throw new Error('--agent 가 필요해요.')
  const showAll = has('all')
  const channel = arg('channel')
  const threads = await listBridgeThreads({ agent, project: arg('project'), channel })

  const unreadBundles = []
  for (const thread of threads) {
    const events = pickBridgeEvents(await fetchEvents(thread.id, 30, true))
    if (!events.length) continue

    const cursor = getCursor(agent, thread.id)
    const unread = events.filter((event) => {
      const from = event.ref?.from || event.author
      const to = event.ref?.to || null
      if (!showAll) {
        if (from === agent) return false
        if (to && to !== agent) return false
        if (cursor && event.created_at <= cursor) return false
      }
      return true
    })

    if (!showAll && unread.length === 0) continue
    unreadBundles.push({ thread, unread: showAll ? events : unread, latest: latestBridgeEvent(events) })
  }

  if (!unreadBundles.length) {
    if (once) console.log(`inbox 비어 있어요: ${agent}`)
    return 0
  }

  for (const bundle of unreadBundles) {
    console.log(`\n[${shortId(bundle.thread.id)}] ${bundle.thread.title}`)
    for (const event of bundle.unread) {
      const from = event.ref?.from || event.author
      const to = event.ref?.to ? ` → ${event.ref.to}` : ''
      console.log(`- ${kst(event.created_at)} ${from}${to}: ${event.body}`)
    }
    if (markRead && bundle.latest?.created_at) setCursor(agent, bundle.thread.id, bundle.latest.created_at)
  }

  return unreadBundles.length
}

async function tailThread() {
  const thread = await resolveThread(arg('thread'), arg('project'))
  const limit = Number(arg('limit') || 20)
  const events = pickBridgeEvents(await fetchEvents(thread.id, limit, true))
  console.log(`[${shortId(thread.id)}] ${thread.title}`)
  console.log(`project=${thread.project} status=${thread.status} touched=${kst(thread.last_touched_at)}`)
  for (const event of events) {
    const from = event.ref?.from || event.author
    const to = event.ref?.to ? ` → ${event.ref.to}` : ''
    console.log(`- ${kst(event.created_at)} ${from}${to}: ${event.body}`)
  }
}

async function listThreads() {
  const threads = await listBridgeThreads({ agent: arg('agent'), project: arg('project'), channel: arg('channel') })
  if (!threads.length) {
    console.log('bridge thread가 없어요.')
    return
  }
  for (const thread of threads) {
    console.log(`${shortId(thread.id)}  [${thread.project}] ${thread.title}  (${thread.status}, ${kst(thread.last_touched_at)})`)
  }
}

async function watchInbox() {
  const agent = arg('agent')
  if (!agent) throw new Error('--agent 가 필요해요.')
  const intervalSec = Number(arg('interval') || 10)
  const once = has('once')

  if (once) {
    await showInbox({ markRead: true, once: true })
    return
  }

  console.log(`watch 시작: ${agent} (${intervalSec}s polling)`)
  for (;;) {
    try {
      await showInbox({ markRead: true, once: false })
    } catch (e) {
      console.error(`watch 오류: ${e.message}`)
    }
    await new Promise((r) => setTimeout(r, intervalSec * 1000))
  }
}

async function closeThread() {
  const thread = await resolveThread(arg('thread'), arg('project'))
  const reason = arg('reason') || 'bridge 종료'
  await api(`ws_threads?id=eq.${thread.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'archived', last_touched_at: new Date().toISOString() }),
  })
  await api('ws_thread_events', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      thread_id: thread.id,
      project: thread.project,
      kind: 'decision',
      body: `[bridge 종료] ${reason}`,
      ref: { bridge: true, closed: true },
      author: arg('author') || 'unknown-agent',
    }),
  })
  console.log(`bridge 종료: ${shortId(thread.id)}`)
}

function printHelp() {
  console.log(`
ws-bridge.mjs

사용 예시
  node scripts/ws-bridge.mjs open --a willy-bot --b local-claude --channel valuechain
  node scripts/ws-bridge.mjs open --a willy-bot --b local-claude --channel valuechain --message "수익률 sync 상태 어때?"
  node scripts/ws-bridge.mjs send --thread 1234abcd --from willy-bot --to local-claude --body "수익률 sync 상태 어때?"
  node scripts/ws-bridge.mjs inbox --agent local-claude
  node scripts/ws-bridge.mjs watch --agent local-claude --interval 8
  node scripts/ws-bridge.mjs tail --thread 1234abcd

명령
  open    bridge thread 생성/재사용
  send    thread에 메시지 기록
  inbox   agent 기준 최근 메시지 보기
  watch   inbox polling
  tail    특정 thread 대화 보기
  list    bridge thread 목록
  close   bridge 종료(archived 유지)
`.trim())
}

const cmd = process.argv[2]

try {
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    printHelp()
    process.exit(0)
  }

  if (cmd === 'open') await createOrReuseThread()
  else if (cmd === 'send') await sendToThread()
  else if (cmd === 'inbox') await showInbox({ markRead: has('mark-read'), once: true })
  else if (cmd === 'watch') await watchInbox()
  else if (cmd === 'tail') await tailThread()
  else if (cmd === 'list') await listThreads()
  else if (cmd === 'close') await closeThread()
  else {
    printHelp()
    process.exit(1)
  }
} catch (e) {
  console.error(`실패: ${e.message}`)
  process.exit(1)
}
