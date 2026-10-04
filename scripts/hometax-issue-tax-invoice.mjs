#!/usr/bin/env node
// 홈택스 전자세금계산서 건별 발급 — 매출관리(tensw_mgmt_sales) 예정 행을 그대로 작성한다.
//
//   node scripts/hometax-issue-tax-invoice.mjs --counterparty 체육회              # 작성만 하고 캡처(발급 안 함)
//   node scripts/hometax-issue-tax-invoice.mjs --counterparty 체육회 --issue      # CEO "발급해" 뒤에만
//   [--sale-id <uuid>] [--date 2026-10-01] [--supplier-email admin@tensoftworks.com] [--keep-open]
//
// 받는 곳(상호·대표·주소·업태·종목·이메일)은 같은 사업자번호로 직전에 발급한 세금계산서의 홈택스 상세에서 가져온다
// (8월분을 참고해 9월분을 쓴 2026-10-01 방식). 품목·금액은 매출관리 행의 items, 작성일자는 --date(기본 오늘).
// 발급 서명은 로그인과 같은 텐소 범용(기업) 인증서를 소유자 이름으로 골라 비밀번호를 한 번만 넣는다.
// 다른 인증서·두 번째 시도는 하지 않는다(잠금 카운터 5회).
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
const ISSUE = args.includes('--issue')
if (ISSUE) assertSendAllowed('hometax-issue-tax-invoice.mjs --issue')   // 발급은 메일 발송과 같다 — 디스패치 중에는 막힌다
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
const WRITE_DATE = flag('--date') ?? kstToday()
// 공급자(우리) 담당 이메일. 기본은 홈택스 계정 이메일(dw.kim). 대표 지시로 바꿀 때만 넘긴다(2026-10-04 admin@).
const SUPPLIER_EMAIL = flag('--supplier-email')
if (WRITE_DATE > kstToday()) { console.error(`작성일자 ${WRITE_DATE} 는 오늘 뒤예요 — 홈택스는 오늘까지만 받아요`); process.exit(1) }
const OUT_DIR = path.join(process.env.HOME, 'logs', 'tensw-local-finance', 'issue')
fs.mkdirSync(OUT_DIR, { recursive: true })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })
const P = '#mf_txppWframe_'
const log = m => console.log(`[issue] ${m}`)

// 1. 매출관리 행: --sale-id, 아니면 상대 이름으로 가장 이른 미발급(scheduled/planned) 행
async function loadSale() {
  let q = sb.from('tensw_mgmt_sales').select('*')
  if (flag('--sale-id')) q = q.eq('id', flag('--sale-id'))
  else q = q.ilike('counterparty', `%${flag('--counterparty') ?? ''}%`).in('payment_status', ['scheduled', 'planned']).order('issue_date', { ascending: true })
  const { data, error } = await q.limit(1)
  if (error) throw error
  if (!data?.length) throw new Error('발급할 매출관리 예정 행이 없어요')
  const sale = data[0]
  const items = sale.items ?? []
  const sum = k => items.reduce((a, it) => a + Number(it[k] ?? 0), 0)
  if (!items.length || sum('supply_amount') !== Number(sale.supply_amount) || sum('tax_amount') !== Number(sale.tax_amount))
    throw new Error(`매출관리 행의 품목 합(${sum('supply_amount')}/${sum('tax_amount')})이 공급가액·세액(${sale.supply_amount}/${sale.tax_amount})과 달라요`)
  if (items.length > 4) throw new Error('품목이 4줄을 넘어요 — 화면에 줄을 더 만들어야 해요')
  if (!sale.business_number) {                                            // 예정 행은 사업자번호가 비어 있곤 하다 — 같은 상대의 발급분에서
    const { data: prev } = await sb.from('tensw_mgmt_sales').select('business_number')
      .eq('counterparty', sale.counterparty).not('business_number', 'is', null).order('issue_date', { ascending: false }).limit(1)
    sale.business_number = prev?.[0]?.business_number ?? null
  }
  return sale
}

// 2. 같은 상대의 직전 발급분 상세에서 받는 곳 정보
async function previousRecipient(ctx, sale) {
  const p = await ctx.newPage()
  try {
    await p.goto('https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&tmIdx=46&tm2lIdx=4609050000&tm3lIdx=4609050300', { waitUntil: 'domcontentloaded', timeout: 45000 })
    await p.waitForSelector(`${P}trigger50`, { timeout: 40000 })
    await p.waitForTimeout(1500)
    const now = new Date(`${WRITE_DATE}T00:00:00Z`)
    for (let back = 0; back < 6; back++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
      await p.locator(`${P}radio3_input_0`).evaluate(e => e.click())
      await p.locator(`${P}radio4_input_0`).evaluate(e => e.click())
      await p.selectOption(`${P}selectboxYear`, String(d.getUTCFullYear()))
      await p.selectOption(`${P}selectboxMonth`, { label: `${String(d.getUTCMonth() + 1).padStart(2, '0')}월` })
      await p.locator(`${P}trigger50`).click()
      await p.waitForTimeout(4000)
      const row = p.locator(`${P}resultGrid_body_table tr`, { hasText: sale.business_number ?? flag('--counterparty') }).first()
      if (!(await row.count())) continue
      await row.getByText('상세보기').first().click()
      await p.waitForTimeout(4000)
      const text = await p.evaluate(() => [...document.querySelectorAll('[id*=UTEETBDA38]')].map(e => e.innerText).join('\n'))
      const from = text.indexOf('공급받는자'), part = text.slice(from, text.indexOf('계산서 수정', from))   // 받는 곳 표만
      if (process.env.ISSUE_DEBUG) fs.writeFileSync(path.join(OUT_DIR, 'recipient-debug.txt'), text)
      const pick = label => part.match(new RegExp(`(?:^|\\t)${label}\\t([^\\t\\n]+)`, 'm'))?.[1]?.trim()   // 칸은 '라벨<탭>값' — 표 설명문의 라벨 나열은 건너뛴다
      const rec = {
        bizNo: part.match(/(\d{3}-\d{2}-\d{5})/)?.[1], name: pick('상호'), ceo: pick('성명'), address: pick('사업장'),
        bizType: pick('업태'), bizItem: pick('종목'), email: part.match(/[\w.+-]+@[\w.-]+/)?.[0],
      }
      const missing = ['bizNo', 'name', 'ceo', 'email'].filter(k => !rec[k])
      if (missing.length) throw new Error(`직전 발급분에서 받는 곳 정보를 읽지 못했어요(${missing.join(', ')}) — ISSUE_DEBUG=1 로 상세 글을 남겨 보세요`)
      log(`직전 발급분 참고(${d.toISOString().slice(0, 7)}): ${rec.name} ${rec.bizNo} ${rec.email}`)
      return rec
    }
    throw new Error('최근 6개월에 같은 상대로 발급한 세금계산서가 없어요 — 받는 곳 정보를 알 수 없어요')
  } finally { await p.close().catch(() => {}) }
}

// 3. 건별발급 화면 작성
async function fillForm(page, sale, rec) {
  await page.goto('https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&tmIdx=46&tm2lIdx=4601010000&tm3lIdx=4601010100', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector(`${P}edtDmnrBsnoTop`, { timeout: 40000 })
  await page.waitForTimeout(1500)
  page.on('dialog', d => { log(`알림: ${d.message()}`); d.accept().catch(() => {}) })
  const set = async (id, v) => { const l = page.locator(P + id); await l.click(); await l.fill(''); await l.type(String(v), { delay: 10 }); await l.press('Tab'); await page.waitForTimeout(150) }
  await set('calWrtDtTop_input', WRITE_DATE)
  await set('edtDmnrBsnoTop', rec.bizNo.replaceAll('-', ''))
  await page.locator(`${P}btnDmnrBsnoCnfrTop`).click()
  await page.waitForTimeout(2500)
  await set('edtDmnrTnmNmTop', rec.name)
  await set('edtDmnrRprsFnmTop', rec.ceo)
  if (rec.address) await set('edtDmnrPfbAdrTop', rec.address)
  if (rec.bizType) await set('edtDmnrBcNmTop', rec.bizType)
  if (rec.bizItem) await set('edtDmnrItmNmTop', rec.bizItem)
  const [id, dom] = rec.email.split('@')
  await set('edtDmnrMchrgEmlIdTop', id)
  await set('edtDmnrMchrgEmlDmanTop', dom)
  if (SUPPLIER_EMAIL) {
    const [sid, sdom] = SUPPLIER_EMAIL.split('@')
    await set('edtSplrEmlIdTop', sid)
    await set('edtSplrEmlDmanTop', sdom)
  }
  const dd = WRITE_DATE.slice(8, 10)
  for (const [i, it] of (sale.items ?? []).entries()) {
    const r = `genEtxivLsatTop_${i}_`                      // 월 칸은 작성일자에서 자동으로 채워져 잠겨 있다
    await set(r + 'edtLsatSplDdTop', dd)
    await set(r + 'edtLsatNmTop', it.description)
    await set(r + 'edtLsatSplCftTop', it.supply_amount)
    await set(r + 'edtLsatTxamtTop', it.tax_amount)
  }
  await page.locator(`${P}rdoRecApeClCdTop_input_0`).evaluate(e => e.click())   // 청구(지난 발급분과 같다)
  await page.waitForTimeout(800)
  const got = await page.evaluate(P => {
    const v = id => { const e = document.getElementById(P + id); return e ? (e.value ?? e.textContent).trim() : undefined }   // 합계 칸은 input 이 아니라 span 이다
    return { total: v('edtTotaAmtTop'), supply: v('edtSumSplCftTop'), splrEmail: `${v('edtSplrEmlIdTop')}@${v('edtSplrEmlDmanTop')}`, date: v('calWrtDtTop_input') }
  }, P.slice(1))
  const n = s => Number(String(s ?? '').replaceAll(',', ''))
  if (n(got.total) !== Number(sale.total_amount) || n(got.supply) !== Number(sale.supply_amount))
    throw new Error(`화면 합계(${got.total}/${got.supply})가 매출관리(${sale.total_amount}/${sale.supply_amount})와 달라요 — 발급하지 않아요`)
  if (SUPPLIER_EMAIL && got.splrEmail !== SUPPLIER_EMAIL) throw new Error(`공급자 이메일이 ${got.splrEmail} 로 남았어요(원한 것 ${SUPPLIER_EMAIL}) — 발급하지 않아요`)
  log(`화면 확인 — 작성일자 ${got.date} · 공급자 이메일 ${got.splrEmail}`)
  const shot = path.join(OUT_DIR, `draft_${rec.bizNo}_${WRITE_DATE}.png`)
  const box = await page.evaluate(P => {
    const a = document.getElementById(P + 'edtSplrTnmNmTop').getBoundingClientRect(), b = document.getElementById(P + 'btnIsn').getBoundingClientRect()
    return { top: a.top + scrollY, bottom: b.bottom + scrollY }
  }, P.slice(1))
  const pin = hide => page.evaluate(hide => {                              // 고정된 상단 바가 받는 곳 칸을 가린다 — 찍는 동안만 숨긴다
    for (const e of document.querySelectorAll('body *')) if (/fixed|sticky/.test(getComputedStyle(e).position)) e.style.visibility = hide ? 'hidden' : ''
  }, hide)
  await pin(true)
  await page.screenshot({ path: shot, fullPage: true, clip: { x: 0, y: Math.max(0, box.top - 230), width: 1440, height: box.bottom - box.top + 260 } })
  await pin(false)
  log(`작성 완료 — 합계 ${got.total}원 · 캡처 ${shot}`)
  return shot
}

// 4. 발급: 확인 → 공동·금융 인증 → 범용 인증서 → 비밀번호 한 번
async function issue(page, sale) {
  const { text, shot } = await signAndIssue(page, {
    shot: approvals => path.join(OUT_DIR, `issued_${WRITE_DATE}_${approvals[0] ?? 'unknown'}.png`),
  })
  const approval = text.match(/승인번호\s*:\s*(\d{8}-\d{8}-\d{8})/)?.[1]
  if (!approval) throw new Error(`발급 결과를 확인하지 못했어요 — 캡처 ${shot}. 홈택스 발급목록을 사람이 확인해야 해요(다시 발급하지 말 것)`)
  const emails = text.match(/발급한 전자세금계산서가 ([^\n]+?)로 발송/)?.[1] ?? ''
  const { error } = await sb.from('tensw_mgmt_sales').update({
    issue_date: WRITE_DATE, payment_status: 'pending',
    notes: `홈택스 일반 청구 · 인터넷발급 · 승인 ${approval} · 발급 ${WRITE_DATE} · 전송 ${WRITE_DATE}${emails ? ` (${emails})` : ''}`,
    updated_at: new Date().toISOString(),
  }).eq('id', sale.id)
  if (error) log(`매출관리 갱신 실패: ${error.message} — 승인 ${approval} 을 손으로 적어야 해요`)
  log(`발급 완료 — 승인번호 ${approval} · ${emails} · 캡처 ${shot}`)
}

const sale = await loadSale()
log(`매출관리: ${sale.counterparty} · 합계 ${Number(sale.total_amount).toLocaleString()}원 · 품목 ${sale.items.map(i => i.description).join(' / ')}`)
const context = await chromium.launchPersistentContext(path.join(process.env.HOME, '.willow', 'browser-profiles', 'tensw-finance'), {
  channel: 'chrome', headless: false, viewport: { width: 1440, height: 1000 },
})
const page = context.pages()[0] || await context.newPage()
try {
  log(`로그인: ${await hometaxLogin(page, { log })}`)
  for (const p of context.pages()) if (p !== page && p.url().includes('popup.html')) await p.close().catch(() => {})
  const rec = await previousRecipient(context, sale)
  await fillForm(page, sale, rec)
  if (ISSUE) await issue(page, sale)
  else log('발급하지 않았어요. 확인 뒤 --issue 로 다시 실행하면 같은 내용으로 발급해요')
} finally {
  if (args.includes('--keep-open')) { log('창을 열어 둬요(닫으면 끝나요)'); await new Promise(r => context.on('close', r)) }
  else await context.close().catch(() => {})
}
