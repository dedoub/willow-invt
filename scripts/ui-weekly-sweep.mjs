#!/usr/bin/env node
/**
 * 주간 대시보드 UI 점검 — 배포본 전 화면을 ui-check 로 훑고, 기준선 대비 새 문제만 추려 CEO 봇에 보낸다.
 * launchd com.willow.ui-weekly-sweep 가 매주 월요일 07:00 에 부른다(scripts/run-ui-weekly-sweep.sh).
 *
 *   node scripts/ui-weekly-sweep.mjs            # 점검 + 텔레그램 + 공유 맥락 기록
 *   node scripts/ui-weekly-sweep.mjs --print    # 보내지 않고 출력만
 *
 * 부채(docs/ui-review/baseline.json)는 조용히 둔다. 알리는 것은 새 위반·점수 하락·열리지 않는 화면·해소된 부채뿐이다.
 */
import { spawnSync, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true })

const run = spawnSync(process.execPath, ['scripts/ui-check.mjs', '--all', '--base', 'https://dash.willowinvt.com'],
  { cwd: ROOT, encoding: 'utf8', timeout: 3 * 60 * 60 * 1000 })
const outDir = (run.stdout.match(/보고서·스크린샷: (\S+)/) || [])[1]
const report = outDir ? JSON.parse(fs.readFileSync(path.join(ROOT, outDir, 'report.json'), 'utf8')) : null
const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/ui-review/baseline.json'), 'utf8'))

let body
if (!report) {
  body = `대시보드 UI 주간 점검 — 실행 실패\n${(run.stderr || run.stdout || '').split('\n').slice(-6).join('\n')}`
} else {
  const lines = []
  let fixed = 0
  for (const p of report.pages) {
    fixed += p.fixed?.length || 0
    const base = baseline.judge?.[p.path]
    const score = p.judge?.score
    const drop = base != null && score != null && score < base - 3
    const problems = [
      p.error ? `열리지 않음: ${p.error.slice(0, 80)}` : null,
      ...(p.newViolations || []).map(v => `새 위반 [${v.rule}] ${v.card}: ${v.detail}`),
      drop ? `심사 ${score}점 (기준선 ${base})` : null,
      ...(!drop && p.judge && base == null && !p.pass ? p.judge.defects.filter(d => d.severity !== 'minor').map(d => `[${d.severity}] ${d.card}: ${d.detail}`) : []),
    ].filter(Boolean)
    if (problems.length) lines.push(`${p.path}\n  ${problems.slice(0, 4).join('\n  ')}`)
  }
  const failedPages = report.pages.filter(p => !p.pass).length
  body = [
    failedPages ? `대시보드 UI 주간 점검 — ${report.pages.length}개 화면 중 ${failedPages}개에 새 문제` : `대시보드 UI 주간 점검 — ${report.pages.length}개 화면 모두 기준선 유지`,
    fixed ? `해소된 부채 ${fixed}건 (기준선 갱신: node scripts/ui-check.mjs --all --update-baseline)` : null,
    ...lines,
    `스크린샷·보고서: ${outDir}`,
  ].filter(Boolean).join('\n\n')
}

if (process.argv.includes('--print')) { console.log(body); process.exit(0) }

// 받는 곳은 DB 에서 찾는다(credit-rate-audit.mjs 와 같은 길) — chat id 를 env 에 두면 봇 대화가 바뀔 때 끊긴다.
const token = process.env.TELEGRAM_BOT_TOKEN
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY
let sent = false
if (token && url && key) {
  const found = await fetch(`${url}/rest/v1/telegram_conversations?bot_type=eq.ceo&select=chat_id&order=updated_at.desc&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  const chatId = found.ok ? (await found.json())[0]?.chat_id : null
  if (chatId) {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: body.slice(0, 3900) }),
    })
    sent = r.ok
    if (!r.ok) console.error('텔레그램 전송 실패', r.status, await r.text())
  }
}
console.log(body)
if (!sent) console.error('텔레그램으로 보내지 못했다 — 위 내용만 남긴다.')
try {
  execFileSync(process.execPath, ['scripts/ws-context.mjs', 'log', '--project', 'willow-invt', '--summary', body.split('\n\n')[0]], { cwd: ROOT, stdio: 'ignore' })
} catch {}
