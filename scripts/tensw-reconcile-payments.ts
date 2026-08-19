#!/usr/bin/env npx tsx
/**
 * tensw-reconcile-payments.ts
 *
 * 세금계산서(tensw_mgmt_sales)를 은행 내역과 대조해 결제 상태를 맞춘다.
 *   매출 → 입금 대조 → 수금완료
 *   매입 → 출금 대조 → 지급완료
 *
 * 대상은 홈택스에서 실제 발행이 확인된 계산서(tensw_codef_tax_invoices.status='promoted')뿐이다.
 * 계약확정·계약예정 행은 CEO가 계약서 기준으로 직접 관리하므로 건드리지 않는다.
 *
 * 소스 두 곳을 함께 본다.
 *   tensw_mgmt_cash          — 분류가 끝난 매출 입금 / 비용 출금 (과거 이력 전체)
 *   tensw_codef_transactions — CODEF 원본 (최근분, 분류 전이라도 잡힘)
 *
 * 일부 수금·지급(금액 < 합계금액)도 완료로 처리하되 부족액을 메모에 남긴다.
 *
 *   npx tsx scripts/tensw-reconcile-payments.ts --dry
 *   npx tsx scripts/tensw-reconcile-payments.ts
 */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const argv = process.argv.slice(2)
const DRY = argv.includes('--dry')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY!

/**
 * 상호 매칭으로 붙일 때의 하한 비율. 낮게 잡으면 반복 청구 거래처(한전·KT·구글클라우드)에서
 * 엉뚱한 달의 출금이 붙는다. 실제로 전기요금은 계산서가 계량기별로 쪼개져 오고 자동이체는
 * 합산 1건이라 금액이 절대 안 맞는다. 어중간하게 맞추느니 미매칭으로 남기는 편이 낫다.
 */
const MIN_RATIO = 0.9
/** 상호 매칭은 발행일 이후 이 기간 안에서만 본다. */
const NAME_MATCH_WINDOW = 60

/**
 * 법인카드 자동이체로 결제되는 거래처.
 * 은행에는 카드 대금 합계만 찍히므로 계산서별로 대응하는 출금이 아예 없다.
 * 미지급으로 남겨두면 실제로 밀린 돈처럼 보여 오해를 부른다.
 * 새 거래처가 늘면 여기에 추가한다.
 */
const CARD_AUTO_DEBIT = ['한국전력공사', '주식회사 케이티', '구글클라우드 코리아 유한회사']
/** 이체수수료 허용 오차. 법인 이체는 건당 500원 정도가 붙어 합계와 정확히 안 맞는다. */
const FEE_TOLERANCE = 1000
/** 발행일 기준 입금 탐색 창 (일). 선입금도 있어 앞뒤로 연다. */
const WINDOW_BEFORE = 30
const WINDOW_AFTER = 180

interface Deposit {
  source: string
  date: string
  amount: number
  label: string
  account: string | null
}

/** 상호 표기 흔들림을 흡수한다. "(주) 이맥스시스템" ↔ "(주)이맥스시스" */
function normalize(name: string): string {
  return name
    .replace(/[（(]주[)）]|주식회사|유한회사|사단법인|㈜/g, '')
    .replace(/[\s\-_.·]/g, '')
    .toLowerCase()
}

function isCardVendor(name: string): boolean {
  return CARD_AUTO_DEBIT.some(v => normalize(v) === normalize(name))
}

function nameMatches(counterparty: string, depositLabel: string): boolean {
  const a = normalize(counterparty)
  const b = normalize(depositLabel)
  if (!a || !b) return false
  if (a.includes(b) || b.includes(a)) return true
  // 은행 적요는 앞부분이 잘려 오는 경우가 많아 접두 4글자로도 본다.
  const head = a.slice(0, 4)
  return head.length >= 3 && b.includes(head)
}

const addDays = (iso: string, n: number) => {
  const d = new Date(iso)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('[reconcile] Supabase env(.env.local) 누락')
    process.exit(1)
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // 홈택스 발행이 확인된 계산서만 대상
  const { data: issued, error: issuedErr } = await sb
    .from('tensw_codef_tax_invoices')
    .select('sales_id, transe_type, reporting_date')
    .eq('status', 'promoted')
    .not('sales_id', 'is', null)
  if (issuedErr) { console.error(issuedErr.message); process.exit(1) }
  const issuedIds = (issued ?? []).map(r => r.sales_id as string)
  if (!issuedIds.length) {
    console.log('[reconcile] 홈택스 발행 확인된 계산서가 없습니다. 먼저 npm run tensw:tax:sync -- --promote 를 돌리세요.')
    return
  }

  const { data: invoices, error: invErr } = await sb
    .from('tensw_mgmt_sales')
    .select('id, invoice_type, issue_date, counterparty, supply_amount, total_amount, payment_status, paid_amount, paid_at, bank_ref, notes')
    .in('id', issuedIds)
    .order('issue_date')
  if (invErr) { console.error(invErr.message); process.exit(1) }

  // 입금 후보 수집
  const deposits: Deposit[] = []

  const withdrawals: Deposit[] = []

  const { data: cashRows } = await sb
    .from('tensw_mgmt_cash')
    .select('payment_date, counterparty, description, amount, account_number, type')
    .in('type', ['revenue', 'expense'])
    .gt('amount', 0)
  for (const r of cashRows ?? []) {
    if (!r.payment_date) continue
    const entry: Deposit = {
      source: 'cash',
      date: r.payment_date,
      amount: Number(r.amount),
      label: `${r.counterparty ?? ''} ${r.description ?? ''}`,
      account: r.account_number,
    }
    ;(r.type === 'revenue' ? deposits : withdrawals).push(entry)
  }

  const { data: rawRows } = await sb
    .from('tensw_codef_transactions')
    .select('tr_date, amount_in, amount_out, desc1, desc3, account_label')
  for (const r of rawRows ?? []) {
    const label = `${r.desc1 ?? ''} ${r.desc3 ?? ''}`
    if (Number(r.amount_in) > 0) {
      deposits.push({ source: 'bank', date: r.tr_date, amount: Number(r.amount_in), label, account: r.account_label })
    }
    if (Number(r.amount_out) > 0) {
      withdrawals.push({ source: 'bank', date: r.tr_date, amount: Number(r.amount_out), label, account: r.account_label })
    }
  }

  console.log(`[reconcile] 대상 계산서 ${invoices?.length ?? 0}건 / 입금 ${deposits.length}건 · 출금 ${withdrawals.length}건`)

  const used = new Set<string>()
  const key = (d: Deposit) => `${d.source}|${d.date}|${d.amount}|${d.account ?? ''}`

  type Invoice = NonNullable<typeof invoices>[number]
  let settled = 0
  let backfilled = 0
  let partial = 0
  const openInvoices: Invoice[] = []

  for (const inv of invoices ?? []) {
    const purchase = inv.invoice_type === 'purchase'
    const pool = purchase ? withdrawals : deposits
    const total = Number(inv.total_amount)
    const label = `${purchase ? '[매입]' : '[매출]'} ${inv.issue_date} ${inv.counterparty} ${total.toLocaleString()}`
    const alreadyComplete = inv.payment_status === 'paid' && inv.paid_amount !== null && inv.bank_ref
    if (alreadyComplete) { used.add('_'); continue }

    const from = addDays(inv.issue_date, -WINDOW_BEFORE)
    const to = addDays(inv.issue_date, WINDOW_AFTER)
    const window = pool.filter(d => !used.has(key(d)) && d.date >= from && d.date <= to)

    // 체육회 유지보수처럼 같은 금액이 매달 반복되므로, 후보를 발행일 기준으로 정렬해
    // 발행일 이후 가장 가까운 입금을 먼저 집는다. (그래야 5월분 계산서에 8월 입금이 붙지 않는다)
    const byProximity = (a: Deposit, b: Deposit) => {
      const aAfter = a.date >= inv.issue_date ? 0 : 1
      const bAfter = b.date >= inv.issue_date ? 0 : 1
      if (aAfter !== bAfter) return aAfter - bAfter
      const gap = (d: Deposit) =>
        Math.abs(new Date(d.date).getTime() - new Date(inv.issue_date).getTime())
      return gap(a) - gap(b)
    }
    window.sort(byProximity)

    // 1순위 합계금액 일치. 출금은 이체수수료가 붙어 몇백 원 더 나가므로 오차를 허용한다.
    let hit = window.find(d => d.amount === total || (d.amount > total && d.amount - total <= FEE_TOLERANCE))
    let note: string | null = null

    // 2순위 공급가액 일치 — 부가세를 빼고 입금하는 거래처가 있다. 은행 적요에 상호 대신
    // 사업명이 찍히는 경우가 많아 이름보다 금액이 확실한 신호다.
    if (!hit) {
      const supply = Number(inv.supply_amount)
      // 공급가액만 오가는 건은 계산서 발행 이후에 일어난다. 이 조건이 없으면 발행 전의
      // 우연히 같은 금액인 거래(대여금 상환 등)가 붙는다.
      const bySupply =
        supply > 0 && supply !== total
          ? window.find(d => d.amount === supply && d.date >= inv.issue_date)
          : undefined
      if (bySupply) {
        hit = bySupply
        note = purchase
          ? `일부 지급 — 공급가액 ${supply.toLocaleString()}원만 지급, 부가세 ${(total - supply).toLocaleString()}원 미지급 (${bySupply.date} ${bySupply.account ?? ''})`
          : `일부 수금 — 공급가액 ${supply.toLocaleString()}원만 입금, 부가세 ${(total - supply).toLocaleString()}원 미수 (${bySupply.date} ${bySupply.account ?? ''})`
        partial++
      }
    }

    // 3순위 상호 일치 + 하한 이상
    if (!hit) {
      const nameLimit = addDays(inv.issue_date, NAME_MATCH_WINDOW)
      const near = window.filter(
        d =>
          d.date >= inv.issue_date &&
          d.date <= nameLimit &&
          nameMatches(inv.counterparty, d.label) &&
          d.amount <= total &&
          d.amount >= total * MIN_RATIO
      )[0]
      if (near) {
        hit = near
        const short = total - near.amount
        note = purchase
          ? `일부 지급 — 지급 ${near.amount.toLocaleString()}원, 부족 ${short.toLocaleString()}원 (${near.date} ${near.account ?? ''})`
          : `일부 수금 — 입금 ${near.amount.toLocaleString()}원, 부족 ${short.toLocaleString()}원 (${near.date} ${near.account ?? ''})`
        partial++
      }
    }

    if (!hit) {
      openInvoices.push(inv)
      continue
    }
    used.add(key(hit))

    const bankRef = `${hit.date} ${hit.account ?? ''} ₩${hit.amount.toLocaleString()}`.trim()
    const wasPaid = inv.payment_status === 'paid'
    const nextNotes = note
      ? [inv.notes, note].filter(Boolean).join('\n')
      : inv.notes

    if (DRY) {
      console.log(`  ${wasPaid ? '·' : '+'} ${label} ← ${bankRef}${note ? `  [${note}]` : ''}`)
    } else {
      const { error } = await sb
        .from('tensw_mgmt_sales')
        .update({
          payment_status: 'paid',
          paid_amount: hit.amount,
          paid_at: `${hit.date}T00:00:00+09:00`,
          bank_ref: bankRef,
          notes: nextNotes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', inv.id)
      if (error) { console.error(`  ✗ ${label}: ${error.message}`); continue }
      console.log(`  ${wasPaid ? '·' : '+'} ${label} ← ${bankRef}${note ? `  [${note}]` : ''}`)
    }
    if (wasPaid) backfilled++
    else settled++
  }

  // 2차 패스 — 합산 결제.
  // AWS(지에스네오텍)나 클라우드 청구는 계산서가 항목별로 쪼개져 오고 출금은 한 번에 나간다.
  // 같은 거래처의 미매칭 계산서 두 건 합이 한 출금과 맞으면 둘 다 결제된 것으로 본다.
  let combined = 0
  const combinedIds = new Set<string>()

  for (let i = 0; i < openInvoices.length; i++) {
    const a = openInvoices[i]
    if (combinedIds.has(a.id as string)) continue
    for (let j = i + 1; j < openInvoices.length; j++) {
      const b = openInvoices[j]
      if (combinedIds.has(b.id as string)) continue
      if (a.counterparty !== b.counterparty || a.invoice_type !== b.invoice_type) continue
      // 카드 자동이체 거래처는 대응 출금 자체가 없다. 합산으로 억지로 붙이면
      // 2월분과 4월분 계산서가 6월 전기요금 출금에 엮이는 식으로 틀어진다.
      if (isCardVendor(a.counterparty)) continue
      // 서로 90일 안의 청구분만 묶는다. 무제한으로 열면 조합이 폭발한다.
      const gapDays = Math.abs(new Date(a.issue_date).getTime() - new Date(b.issue_date).getTime()) / 86400000
      if (gapDays > 90) continue

      const sum = Number(a.total_amount) + Number(b.total_amount)
      const pool2 = a.invoice_type === 'purchase' ? withdrawals : deposits
      const first = a.issue_date < b.issue_date ? a.issue_date : b.issue_date
      const last = a.issue_date > b.issue_date ? a.issue_date : b.issue_date
      const match = pool2.find(
        d =>
          !used.has(key(d)) &&
          d.date >= addDays(first, -3) &&
          d.date <= addDays(last, WINDOW_AFTER) &&
          // 적요에 거래처가 찍혀 있어야 한다. 이 조건이 진짜 안전장치다.
          // 금액만 보면 한전 계산서 두 장 합이 엉뚱한 출금과 맞아떨어지는 조합이 쏟아진다.
          nameMatches(a.counterparty, d.label) &&
          (d.amount === sum || (d.amount > sum && d.amount - sum <= FEE_TOLERANCE))
      )
      if (!match) continue

      used.add(key(match))
      const ref = `${match.date} ${match.account ?? ''} ₩${match.amount.toLocaleString()} (합산 ${sum.toLocaleString()})`.trim()
      const line = `합산 결제 — ${a.counterparty} 계산서 2건을 ${match.date}에 ${match.amount.toLocaleString()}원으로 한 번에 처리`

      for (const inv of [a, b]) {
        combinedIds.add(inv.id as string)
        if (!DRY) {
          await sb
            .from('tensw_mgmt_sales')
            .update({
              payment_status: 'paid',
              paid_amount: Number(inv.total_amount),
              paid_at: `${match.date}T00:00:00+09:00`,
              bank_ref: ref,
              notes: [inv.notes, line].filter(Boolean).join('\n'),
              updated_at: new Date().toISOString(),
            })
            .eq('id', inv.id as string)
        }
        console.log(`  = ${inv.invoice_type === 'purchase' ? '[매입]' : '[매출]'} ${inv.issue_date} ${inv.counterparty} ${Number(inv.total_amount).toLocaleString()} ← ${ref}`)
        combined++
      }
      break
    }
  }

  // 3차 패스 — 카드 자동이체.
  // 대응하는 출금이 없는 게 정상이므로 지급완료로 두되 근거를 남긴다.
  let carded = 0
  const cardIds = new Set<string>()
  for (const inv of openInvoices) {
    if (combinedIds.has(inv.id as string)) continue
    if (inv.invoice_type !== 'purchase') continue
    if (!isCardVendor(inv.counterparty)) continue

    cardIds.add(inv.id as string)
    const line = '카드 자동이체 — 법인카드로 결제되어 계산서별 은행 출금 없음'
    if (!DRY) {
      await sb
        .from('tensw_mgmt_sales')
        .update({
          payment_status: 'paid',
          paid_amount: Number(inv.total_amount),
          bank_ref: '카드 자동이체',
          notes: [inv.notes, line].filter(Boolean).join('\n'),
          updated_at: new Date().toISOString(),
        })
        .eq('id', inv.id as string)
    }
    carded++
  }
  if (carded) console.log(`  ⊙ 카드 자동이체 ${carded}건 지급완료 처리`)

  const stillOpen = openInvoices.filter(
    inv => !combinedIds.has(inv.id as string) && !cardIds.has(inv.id as string)
  )
  console.log(`\n[reconcile] 신규 완료 ${settled}건, 결제정보 보완 ${backfilled}건, 일부 결제 ${partial}건, 합산 결제 ${combined}건, 카드 자동이체 ${carded}건, 미매칭 ${stillOpen.length}건`)
  for (const inv of stillOpen) {
    const kind = inv.invoice_type === 'purchase' ? '[매입]' : '[매출]'
    console.log(`  - ${kind} ${inv.issue_date} ${inv.counterparty} ${Number(inv.total_amount).toLocaleString()} — 매칭 ${inv.invoice_type === 'purchase' ? '출금' : '입금'} 없음`)
  }
  if (DRY) console.log('(dry-run — DB 변경 없음)')
}

main().catch(err => { console.error(err instanceof Error ? err.message : err); process.exit(1) })
