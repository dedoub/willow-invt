#!/usr/bin/env node
// Workstation 맥락 평면 CLI (부팅 로드 / 세션 write-back)
// 모든 프로젝트/워크트리 세션에서 공용으로 쓰는 cross-project 맥락을 Supabase(서비스키)에 직접 붙어 처리.
// 사용:
//   node ws-context.mjs load [project]         → 부팅 맥락을 마크다운으로 출력 (SessionStart 훅용)
//   node ws-context.mjs log --project X --summary "..." [--worktree PATH] [--title T]
//
// 크레덴셜은 hub(willow-invt) .env.local에서 로드. WS_HUB_ENV 로 경로 오버라이드 가능.
// 실패 시 조용히 종료(세션 시작 방해 금지).

import { readFileSync } from 'node:fs'

const HUB_ENV = process.env.WS_HUB_ENV || '/Volumes/PRO-G40/app-dev/willow-invt/.env.local'

function loadEnv(path) {
  const out = {}
  let raw
  try { raw = readFileSync(path, 'utf-8') } catch { return out }
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

if (!URL || !KEY) process.exit(0) // 크레덴셜 없으면 조용히 종료

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

async function rest(pathAndQuery, init = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 4000)
  try {
    const res = await fetch(`${URL}/rest/v1/${pathAndQuery}`, { ...init, headers: { ...H, ...(init.headers || {}) }, signal: ctrl.signal })
    if (!res.ok) return null
    const txt = await res.text()
    return txt ? JSON.parse(txt) : []
  } catch { return null } finally { clearTimeout(t) }
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const cmd = process.argv[2]

if (cmd === 'load') {
  const project = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : undefined
  const pf = project ? `&project=eq.${encodeURIComponent(project)}` : ''
  const [threads, decisions, sessions] = await Promise.all([
    rest(`ws_threads?status=in.(open,blocked)&select=project,title,priority,summary${pf}&order=priority.asc,last_touched_at.desc&limit=20`),
    rest(`ws_thread_events?kind=eq.decision&select=project,body,created_at${pf}&order=created_at.desc&limit=8`),
    rest(`ws_sessions?select=project,title,summary,started_at${pf}&order=started_at.desc&limit=5`),
  ])

  if (!threads && !decisions && !sessions) process.exit(0)
  const lines = ['# 🗂️ 워크스테이션 공유 맥락 (cross-project)', '']

  if (threads?.length) {
    lines.push('## 열린 스레드')
    for (const t of threads) {
      const pri = t.priority === 'high' ? '🔴' : t.priority === 'low' ? '⚪' : '🟡'
      lines.push(`- ${pri} [${t.project}] **${t.title}**${t.summary ? ` — ${t.summary}` : ''}`)
    }
    lines.push('')
  }
  if (decisions?.length) {
    lines.push('## 최근 결정')
    for (const d of decisions) lines.push(`- [${d.project}] ${d.body}`)
    lines.push('')
  }
  if (sessions?.length) {
    lines.push('## 최근 세션')
    for (const s of sessions) lines.push(`- [${s.project}] ${s.title || s.summary?.slice(0, 80) || ''}`)
    lines.push('')
  }

  // 브리지 수신함 — 이 로컬 에이전트 앞으로 온 미읽음 메시지 (있을 때만 노출)
  try {
    const bridgeAgent = process.env.WS_BRIDGE_AGENT || 'local-claude'
    const proj = HUB_ENV.replace(/\/\.env\.local$/, '')
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const msgs = await rest(`ws_thread_events?select=thread_id,body,ref,author,created_at&ref->>bridge=eq.true&ref->>to=eq.${encodeURIComponent(bridgeAgent)}&created_at=gte.${dayAgo}&order=created_at.desc&limit=15`)
    let cursors = {}
    try { cursors = (JSON.parse(readFileSync(`${proj}/scripts/logs/ws-bridge-state.json`, 'utf-8')).agents?.[bridgeAgent]) || {} } catch { /* state 없음 */ }
    const unread = (msgs || []).filter(m => (m.ref?.from || m.author) !== bridgeAgent && (!cursors[m.thread_id] || m.created_at > cursors[m.thread_id]))
    if (unread.length) {
      lines.push(`## 📨 브리지 수신함 (${bridgeAgent} · ${unread.length}건 미읽음)`)
      for (const m of unread) lines.push(`- [${m.thread_id.slice(0, 8)}] ${m.ref?.from || m.author}: ${(m.body || '').replace(/\s+/g, ' ').slice(0, 120)}`)
      lines.push('_답장: `node scripts/ws-bridge.mjs send --thread <id> --from ' + bridgeAgent + ' --to <상대> --body "..."` (읽음 처리: `ws-bridge.mjs inbox --agent ' + bridgeAgent + ' --mark-read`)_')
      lines.push('')
    }
  } catch { /* 브리지 조회 실패는 맥락 로드를 막지 않는다 */ }

  lines.push('_이 맥락은 모든 프로젝트/워크트리 세션이 공유합니다. 의미있는 진행·결정·막힘은 `ws_*` MCP 툴 또는 `ws-context.mjs log`로 기록하세요._')
  process.stdout.write(lines.join('\n') + '\n')
  process.exit(0)
}

if (cmd === 'log') {
  const project = arg('project')
  const summary = arg('summary')
  if (!project || !summary) { console.error('필수: --project, --summary'); process.exit(1) }
  const body = {
    project,
    summary,
    worktree_path: arg('worktree') || process.cwd(),
    title: arg('title') || null,
    ended_at: new Date().toISOString(),
  }
  const res = await rest('ws_sessions', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) })
  if (!res) { console.error('세션 기록 실패'); process.exit(1) }
  console.log('세션 기록됨:', res?.[0]?.id || 'ok')
  process.exit(0)
}

// SessionEnd 훅용 자동 write-back. 훅 JSON을 stdin으로 받아 팩트 기반 세션 기록을 남긴다.
// 에이전트가 CLAUDE.md 지시대로 ws_session_log로 이미 기록했으면(최근 창) 스킵(중복 방지).
// 사소한 세션(1턴 · 편집/커밋 없음)도 스킵(노이즈 방지). 어떤 경우에도 훅을 실패시키지 않는다.
if (cmd === 'autolog') {
  let hook = {}
  try { hook = JSON.parse(readFileSync(0, 'utf-8') || '{}') } catch { /* stdin 없거나 파싱 실패 → 빈 객체 */ }
  const cwd = hook.cwd || process.cwd()

  // cwd → 프로젝트 키 매핑 (경로 마커 기반, 기본 willow-invt)
  const lc = cwd.toLowerCase()
  const project =
    lc.includes('valuechain') ? 'valuechain-wiki' :
    lc.includes('voicecards') ? 'voicecards' :
    lc.includes('review-notes') || lc.includes('reviewnotes') ? 'review-notes' :
    lc.includes('ryuha') ? 'ryuha' :
    lc.includes('portfolio') ? 'portfolio' :
    lc.includes('willow') || lc.includes('invt') ? 'willow-invt' :
    (cwd.split('/').filter(Boolean).pop() || 'global')

  // transcript 파싱: 첫 실제 user 요청 · user 턴수 · 편집 파일 · 커밋 수
  let firstReq = '', userTurns = 0, edits = new Set(), commits = 0
  if (hook.transcript_path) {
    try {
      const raw = readFileSync(hook.transcript_path, 'utf-8')
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue
        let o; try { o = JSON.parse(line) } catch { continue }
        if (o.type === 'user' && o.message) {
          const c = o.message.content
          const txt = typeof c === 'string' ? c : Array.isArray(c) ? c.filter(x => x.type === 'text').map(x => x.text).join(' ') : ''
          if (txt && !txt.trimStart().startsWith('<') && txt.trim().length > 4) {
            userTurns++
            if (!firstReq) firstReq = txt.trim().replace(/\s+/g, ' ').slice(0, 140)
          }
        } else if (o.type === 'assistant' && Array.isArray(o.message?.content)) {
          for (const item of o.message.content) {
            if (item.type !== 'tool_use') continue
            if ((item.name === 'Edit' || item.name === 'Write') && item.input?.file_path) edits.add(item.input.file_path)
            if (item.name === 'Bash' && typeof item.input?.command === 'string' && /\bgit commit\b/.test(item.input.command)) commits++
          }
        }
      }
    } catch { /* transcript 못 읽어도 계속 */ }
  }

  // 사소한 세션 스킵
  const meaningful = userTurns >= 2 || edits.size > 0 || commits > 0
  if (!meaningful) process.exit(0)

  // 중복 방지: 같은 worktree에서 최근 45분 내 세션 기록이 있으면(수동 로그 포함) 스킵
  const cutoff = new Date(Date.now() - 45 * 60 * 1000).toISOString()
  const recent = await rest(`ws_sessions?worktree_path=eq.${encodeURIComponent(cwd)}&ended_at=gte.${cutoff}&select=id&limit=1`)
  if (recent && recent.length) process.exit(0)

  const bits = []
  if (userTurns) bits.push(`${userTurns}턴`)
  if (edits.size) bits.push(`편집 ${edits.size}파일`)
  if (commits) bits.push(`커밋 ${commits}개`)
  const body = {
    project,
    title: `[auto] ${firstReq || '세션'}`,
    summary: `[자동] ${bits.join(' · ') || '세션 종료'}${firstReq ? ` — 첫 요청: ${firstReq}` : ''}`,
    worktree_path: cwd,
    ended_at: new Date().toISOString(),
  }
  await rest('ws_sessions', { method: 'POST', body: JSON.stringify(body) })
  process.exit(0)
}

console.error('usage: ws-context.mjs load [project] | log --project X --summary "..." | autolog (stdin: SessionEnd hook JSON)')
process.exit(1)
