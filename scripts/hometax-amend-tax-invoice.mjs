#!/usr/bin/env node
// 홈택스 수정세금계산서 — 기재사항 착오·정정(품목 이름 등). 당초분 취소 1장(자동)과 수정분 1장이 함께 나간다.
//
//   node scripts/hometax-amend-tax-invoice.mjs --approval 20261002-10261004-87387113 --item "독립기념관 유지보수 서비스 - 9월"           # 작성 + 캡처
//   node scripts/hometax-amend-tax-invoice.mjs --approval … --item "…" --issue                                                       # 대표 승인 뒤에만
//
// 금액·작성일자·받는 곳은 당초분 그대로다(이 사유는 작성일자가 당초와 같아야 한다). 품목 첫 줄 이름만 바꾼다.
// 발급은 받는 곳에 메일이 가는 일이라 --issue 는 send-guard 로 막혀 있고, 서명은 lib/hometax-sign.mjs 가 한다.
process.env.FINANCE_COMPANY = 'tensw'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { hometaxLogin } from './lib/hometax-session.mjs'
import { signAndIssue } from './lib/hometax-sign.mjs'
import { assertSendAllowed } from './lib/send-guard.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true })
const args = process.argv.slice(2)
const flag = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }
const APPROVAL = flag('--approval'), ITEM = flag('--item')
if (!/^\d{8}-\d{8}-\d{8}$/.test(APPROVAL ?? '') || !ITEM) { console.error('--approval <승인번호> --item "<새 품목 이름>" 이 필요해요'); process.exit(2) }
const ISSUE = args.includes('--issue')
if (ISSUE) assertSendAllowed('hometax-amend-tax-invoice.mjs --issue')
const OUT_DIR = path.join(process.env.HOME, 'logs', 'tensw-local-finance', 'issue')
fs.mkdirSync(OUT_DIR, { recursive: true })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })
const P = '#mf_txppWframe_'
const log = m => console.log(`[amend] ${m}`)
const n = s => Number(String(s ?? '').replaceAll(',', ''))

// 1. 매출관리에서 당초분 행(승인번호가 notes 에 있다)
const { data: rows, error } = await sb.from('tensw_mgmt_sales').select('*').ilike('notes', `%${APPROVAL}%`)
if (error) throw error
if (rows?.length !== 1) throw new Error(`매출관리에서 승인 ${APPROVAL} 행을 하나로 찾지 못했어요(${rows?.length ?? 0}건)`)
const sale = rows[0]
const writeDate = APPROVAL.slice(0, 8).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')
log(`당초분: ${sale.counterparty} · ${writeDate} · ${Number(sale.total_amount).toLocaleString()}원 · ${sale.items?.[0]?.description} → ${ITEM}`)

const context = await chromium.launchPersistentContext(path.join(process.env.HOME, '.willow', 'browser-profiles', 'tensw-finance'), {
  channel: 'chrome', headless: false, viewport: { width: 1440, height: 1000 },
})
const page = context.pages()[0] || await context.newPage()
try {
  log(`로그인: ${await hometaxLogin(page, { log })}`)
  for (const p of context.pages()) if (p !== page && p.url().includes('popup.html')) await p.close().catch(() => {})
  page.on('dialog', d => { log(`알림: ${d.message()}`); d.accept().catch(() => {}) })

  // 2. 발급목록(작성월)에서 당초분 → 상세 → 수정발급
  await page.goto('https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&tmIdx=46&tm2lIdx=4609050000&tm3lIdx=4609050300', { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForSelector(`${P}trigger50`, { timeout: 40000 })
  await page.waitForTimeout(1500)
  await page.locator(`${P}radio3_input_0`).evaluate(e => e.click())
  await page.locator(`${P}radio4_input_0`).evaluate(e => e.click())
  await page.selectOption(`${P}selectboxYear`, writeDate.slice(0, 4))
  await page.selectOption(`${P}selectboxMonth`, { label: `${writeDate.slice(5, 7)}월` })
  await page.locator(`${P}trigger50`).click()
  await page.waitForTimeout(4000)
  const row = page.locator(`${P}resultGrid_body_table tr`, { hasText: APPROVAL }).first()
  if (!(await row.count())) throw new Error(`발급목록에 승인 ${APPROVAL} 이 없어요`)
  await row.getByText('상세보기').first().click()
  await page.waitForTimeout(4000)
  await page.locator('[id$=_wframe_trigger30]', { hasText: '수정발급' }).first().click()
  await page.waitForTimeout(4000)

  // 3. 사유: 기재사항 착오 정정 등 → 발급하기
  const reasonBtn = await page.evaluate(() => {
    const h = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && e.textContent.trim() === '기재사항 착오 정정 등')
    for (let el = h, i = 0; el && i < 6; el = el.parentElement, i++) {
      const b = [...el.querySelectorAll('[id]')].find(x => x.children.length === 0 && /발급하기/.test(x.textContent))
      if (b) return b.id
    }
    return null
  })
  if (!reasonBtn) throw new Error("'기재사항 착오 정정 등' 사유를 찾지 못했어요")
  await page.locator(`#${reasonBtn}`).click()
  await page.waitForTimeout(5000)

  // 4. 새로 작성하는 계산서(아래, *Bot) 품목 이름만 바꾼다
  const name = page.locator(`${P}genEtxivLsatBot_0_edtLsatNmBot`)
  await name.click(); await name.fill(''); await name.type(ITEM, { delay: 10 }); await name.press('Tab')
  await page.waitForTimeout(800)
  const got = await page.evaluate(P => {
    const v = id => { const e = document.getElementById(P + id); return e ? (e.value ?? e.textContent).trim() : undefined }
    return {
      origin: document.body.innerText.match(/당초에 교부한 전자세금계산서 취소\s*(\d{8}-\d{8}-\d{8})/)?.[1],
      cancelTotal: v('edtTotaAmtTop'), total: v('edtTotaAmtBot'), supply: v('edtSumSplCftBot'),
      item: v('genEtxivLsatBot_0_edtLsatNmBot'), date: v('calWrtDtTop_input'),
    }
  }, P.slice(1))
  if (got.origin !== APPROVAL) throw new Error(`취소 대상이 ${got.origin} 이에요(원한 것 ${APPROVAL}) — 발급하지 않아요`)
  if (n(got.cancelTotal) !== -Number(sale.total_amount) || n(got.total) !== Number(sale.total_amount) || n(got.supply) !== Number(sale.supply_amount))
    throw new Error(`금액이 달라요(취소 ${got.cancelTotal} · 새 ${got.total}/${got.supply}) — 발급하지 않아요`)
  if (got.item !== ITEM) throw new Error(`품목이 "${got.item}" 로 남았어요 — 발급하지 않아요`)
  const shot = path.join(OUT_DIR, `amend_${APPROVAL}.png`)
  await page.screenshot({ path: shot, fullPage: true })
  log(`작성 완료 — 취소 ${got.cancelTotal} · 새 ${got.total} · 품목 "${got.item}" · 작성일자 ${got.date} · 캡처 ${shot}`)
  if (!ISSUE) { log('발급하지 않았어요. 확인 뒤 --issue 로 다시 실행하면 같은 내용으로 발급해요'); process.exitCode = 0 }
  else {
    const res = await signAndIssue(page, { shot: a => path.join(OUT_DIR, `amended_${APPROVAL}_${a.filter(x => x !== APPROVAL).join('_') || 'unknown'}.png`) })
    const fresh = res.approvals.filter(a => a !== APPROVAL)
    if (!fresh.length) throw new Error(`발급 결과를 확인하지 못했어요 — 캡처 ${res.shot}. 홈택스 발급목록을 사람이 확인해야 해요(다시 발급하지 말 것)`)
    const note = `\n수정발급(기재사항 착오·정정) ${new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)} · 품목 "${sale.items?.[0]?.description}" → "${ITEM}" · 새 승인번호 ${fresh.join(', ')}${res.emails ? ` (${res.emails})` : ''}`
    const items = (sale.items ?? []).map((it, i) => (i === 0 ? { ...it, description: ITEM } : it))
    const { error: upErr } = await sb.from('tensw_mgmt_sales').update({ items, notes: (sale.notes ?? '') + note, updated_at: new Date().toISOString() }).eq('id', sale.id)
    if (upErr) log(`매출관리 갱신 실패: ${upErr.message} — 손으로 적어야 해요`)
    log(`수정발급 완료 — 새 승인번호 ${fresh.join(', ')} · ${res.emails} · 캡처 ${res.shot}`)
  }
} finally {
  await context.close().catch(() => {})
}
