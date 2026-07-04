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

console.error('usage: ws-context.mjs load [project] | log --project X --summary "..."')
process.exit(1)
