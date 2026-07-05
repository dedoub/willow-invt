#!/usr/bin/env -S npx tsx
// 워크스테이션 명령 디스패처 — 윌리가 ws_commands에 남긴 지시를 각 로컬 레포에서 codex로 실행.
//
// 흐름: CEO(텔레그램) → 윌리 dispatch_command 액션 → ws_commands(대상별 행)
//       → (이 디스패처) pending 원자적 클레임 → codex exec(cwd=레포) → 결과 write-back + 텔레그램 보고
//
// launchd StartInterval로 주기 실행(단일 패스 후 종료). 락 파일로 중복 실행 방지,
// 원자적 클레임(status pending→running)으로 겹침도 이중 방어. codex 호출은 공용 runAgent 재사용.
//
// 실행: npx tsx scripts/ws-dispatcher.ts        (pending 전부 처리 후 종료)

import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runAgent } from './lib/agent-cli'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// ─── env ───
function loadEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {}
  let raw: string
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
const env = loadEnv(join(ROOT, '.env.local'))
const URL = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SECRET_KEY
const TG = env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN
if (!URL || !KEY) { console.error('크레덴셜 없음(.env.local)'); process.exit(0) }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const CMD_TIMEOUT_MS = 15 * 60 * 1000 // 명령당 codex 상한 15분

async function rest(pathAndQuery: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${URL}/rest/v1/${pathAndQuery}`, { ...init, headers: { ...H, ...(init.headers || {}) } })
  if (!res.ok) throw new Error(`REST ${res.status}: ${await res.text()}`)
  const txt = await res.text()
  return txt ? JSON.parse(txt) : []
}

async function tgReport(chatId: number | null, text: string) {
  if (!TG || !chatId) return
  try {
    await fetch(`https://api.telegram.org/bot${TG}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    })
  } catch { /* 보고 실패는 무시 */ }
}

// pending 하나를 원자적으로 클레임 (status pending→running). 성공 시 행 반환, 없으면 null.
async function claimNext(): Promise<any | null> {
  const pending = await rest('ws_commands?status=eq.pending&order=created_at.asc&limit=1&select=id')
  if (!pending.length) return null
  const id = pending[0].id
  const claimed = await rest(`ws_commands?id=eq.${id}&status=eq.pending&select=*`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ status: 'running', started_at: new Date().toISOString() }),
  })
  return claimed.length ? claimed[0] : (await claimNext()) // 경합 시 다음 것
}

function short(s: string, n: number): string {
  const flat = (s || '').replace(/\s+/g, ' ').trim()
  return flat.length > n ? flat.slice(0, n - 1) + '…' : flat
}

async function runOne(cmd: any) {
  const label = `[${cmd.project}] ${short(cmd.instruction, 60)}`
  console.log(`▶ ${label}`)
  try {
    if (!existsSync(cmd.cwd)) throw new Error(`레포 경로 없음: ${cmd.cwd}`)
    const out = await runAgent(cmd.instruction, {
      backend: 'codex',
      cwd: cmd.cwd,
      timeoutMs: CMD_TIMEOUT_MS,
    } as any)
    await rest(`ws_commands?id=eq.${cmd.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'done', result: short(out, 4000), finished_at: new Date().toISOString() }),
    })
    console.log(`✅ ${label}`)
    await tgReport(cmd.source_chat_id, `✅ [${cmd.project}] 완료\n${short(cmd.instruction, 80)}\n\n${short(out, 500)}`)
  } catch (e) {
    const msg = (e as Error).message
    await rest(`ws_commands?id=eq.${cmd.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'failed', error: short(msg, 2000), finished_at: new Date().toISOString() }),
    })
    console.error(`❌ ${label}: ${msg}`)
    await tgReport(cmd.source_chat_id, `❌ [${cmd.project}] 막힘\n${short(cmd.instruction, 80)}\n\n${short(msg, 400)}`)
  }
}

// ─── main: 락 → pending 전부 순차 처리 → 종료 ───
const LOCK = join(ROOT, 'scripts', 'logs', 'ws-dispatcher.lock')
function alive(pid: number): boolean { try { process.kill(pid, 0); return true } catch { return false } }

async function main() {
  if (existsSync(LOCK)) {
    const pid = Number(readFileSync(LOCK, 'utf-8').trim())
    if (pid && alive(pid)) { console.log('다른 디스패처 실행 중 — 종료'); process.exit(0) }
  }
  try { writeFileSync(LOCK, String(process.pid)) } catch { /* logs 디렉토리 없을 수 있음 */ }

  let n = 0
  try {
    for (;;) {
      const cmd = await claimNext()
      if (!cmd) break
      await runOne(cmd)
      n++
    }
  } finally {
    try { rmSync(LOCK) } catch { /* noop */ }
  }
  console.log(n ? `디스패처: ${n}건 처리 완료` : '대기 명령 없음')
  process.exit(0)
}

main().catch(e => { console.error('디스패처 오류:', e); try { rmSync(LOCK) } catch {} process.exit(1) })
