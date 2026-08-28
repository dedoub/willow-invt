#!/usr/bin/env node
// 세 앱의 크레딧 요율이 실측 원가 대비 마진 80~90% 안에 있는지 주 1회 본다.
//
//   npx tsx scripts/credit-rate-audit.mjs            # 텔레그램으로 보낸다
//   npx tsx scripts/credit-rate-audit.mjs --print    # 보내지 않고 찍기만 한다
//
// <b>요율도 판정 규칙도 여기 적지 않는다.</b> 예전에는 이 파일이 요율표를 따로
// 들고 있어서, 앱 요율을 고치면 이 보고가 조용히 거짓이 됐다. 지금은 각 앱 DB 의
// 요율 표를 그대로 읽고 `src/lib/credit-rates-core.ts` 의 규칙으로 판정한다 —
// 대시보드 화면(`/admin/rates`)이 보는 것과 <b>같은 값·같은 판단</b>이다.
//
// 사람이 부를 때는 `.claude/skills/credit-rate-audit/SKILL.md` 가 같은 답을 낸다.
// 헤드리스에서는 Supabase MCP 가 안 붙을 수 있어 스케줄은 이 스크립트가 돈다.

import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true })

// env 를 읽은 뒤에 불러온다 — 모듈이 뜰 때 서비스 키를 본다.
const { getAllRates } = await import('../src/lib/credit-rates-data.ts')
const { MARGIN_BAND, pct } = await import('../src/lib/credit-rates-core.ts')

function section(app) {
  if (app.error) return { text: `■ ${app.label}\n  읽지 못함: ${app.error}`, flagged: 0, blind: 0 }
  const lines = [`■ ${app.label}`]
  let flagged = 0
  let blind = 0
  for (const row of app.rows) {
    const v = row.verdict
    if (v.mark === '⚠️') flagged += 1
    if (v.mark === '❌') blind += 1
    const basis = v.basis === 'list' ? '정가' : `n=${v.n}`
    const worst = v.basis === 'measured' ? ` / 최악 ${pct(v.worstMargin)}` : ''
    const suggestion = v.suggested !== undefined
      ? ` → ${v.suggested < 10 ? v.suggested.toFixed(1) : Math.round(v.suggested)} 제안`
      : ''
    const now = row.overridden ? row.value : `${row.value}(코드)`
    lines.push(`  ${v.mark} ${row.label} ${now} · ${basis} · 평균 ${pct(v.margin)}${worst} · ${v.note}${suggestion}`)
  }
  return { text: lines.join('\n'), flagged, blind }
}

async function main() {
  const apps = await getAllRates()
  const sections = apps.map(section)
  const flagged = sections.reduce((sum, s) => sum + s.flagged, 0)
  // 실측 0건도 함께 센다. 「모두 띠 안」만 적으면 <b>보이지 않는 것</b>이 괜찮은
  // 것으로 읽힌다 — 값을 못 본 요율이 열 개여도 같은 문장이 나간다.
  const blind = sections.reduce((sum, s) => sum + s.blind, 0)
  const band = `${MARGIN_BAND[0] * 100}~${MARGIN_BAND[1] * 100}%`
  const head = [
    flagged > 0 ? `크레딧 요율 점검 — 띠 밖 ${flagged}건` : `크레딧 요율 점검 — 본 것은 모두 띠 안(${band})`,
    blind > 0 ? `실측 0건 ${blind}건은 판정하지 못했다` : null,
  ].filter(Boolean).join(' · ')
  const body = [head, ...sections.map((s) => s.text)].join('\n\n')

  if (process.argv.includes('--print')) {
    console.log(body)
    return
  }
  /**
   * 보낼 곳은 <b>DB 에서 찾는다</b>(`notify-job.mjs` 와 같은 길). chat id 를 env 에
   * 적어 두면 봇 대화가 바뀔 때 조용히 엉뚱한 곳으로 가거나 끊긴다.
   */
  const token = process.env.TELEGRAM_BOT_TOKEN
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!token || !url || !key) {
    console.log(body)
    console.error('텔레그램·Supabase 환경변수가 없어 보내지 못했다 — 위 내용만 남긴다.')
    return
  }
  const found = await fetch(
    `${url}/rest/v1/telegram_conversations?bot_type=eq.ceo&select=chat_id&order=updated_at.desc&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  )
  const chatId = found.ok ? (await found.json())[0]?.chat_id : null
  if (!chatId) {
    console.log(body)
    console.error('CEO 봇 대화를 찾지 못해 보내지 못했다 — 위 내용만 남긴다.')
    return
  }
  const sent = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: body }),
  })
  if (!sent.ok) {
    console.error('텔레그램 전송 실패', sent.status, await sent.text())
    console.log(body)
  }
}

await main()
