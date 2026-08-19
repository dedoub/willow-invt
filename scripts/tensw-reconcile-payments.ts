#!/usr/bin/env npx tsx
/**
 * tensw-reconcile-payments.ts
 *
 * 세금계산서(tensw_mgmt_sales)를 은행 입금내역과 대조해 수금 상태를 맞춘다.
 *
 * 대상은 홈택스에서 실제 발행이 확인된 계산서(tensw_codef_tax_invoices.status='promoted')뿐이다.
 * 계약확정·계약예정 행은 CEO가 계약서 기준으로 직접 관리하므로 건드리지 않는다.
 *
 * 입금 소스 두 곳을 함께 본다.
 *   tensw_mgmt_cash          — 분류가 끝난 매출 입금 (과거 이력 전체)
 *   tensw_codef_transactions — CODEF 원본 입금 (최근분, 분류 전이라도 잡힘)
 *
 * 일부 수금(입금액 < 합계금액)도 수금완료로 처리하되 부족액을 메모에 남긴다.
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

/** 입금 하한 비율. 이보다 적게 들어오면 자동 매칭하지 않고 사람이 본다. */
const MIN_RATIO = 0.7
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
    .replace(/\(주\)|주식회사|㈜/g, '')
    .replace(/[\s\-_.·]/g, '')
    .toLowerCase()
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
    .select('sales_id, reporting_date, contractor_company')
    .eq('status', 'promoted')
    .eq('transe_type', 'sales')
    .not('sales_id', 'is', null)
  if (issuedErr) { console.error(issuedErr.message); process.exit(1) }
  const issuedIds = (issued ?? []).map(r => r.sales_id as string)
  if (!issuedIds.length) {
    console.log('[reconcile] 홈택스 발행 확인된 계산서가 없습니다. 먼저 npm run tensw:tax:sync -- --promote 를 돌리세요.')
    return
  }

  const { data: invoices, error: invErr } = await sb
    .from('tensw_mgmt_sales')
    .select('id, issue_date, counterparty, supply_amount, total_amount, payment_status, paid_amount, paid_at, bank_ref, notes')
    .in('id', issuedIds)
    .order('issue_date')
  if (invErr) { console.error(invErr.message); process.exit(1) }

  // 입금 후보 수집
  const deposits: Deposit[] = []

  const { data: cashRows } = await sb
    .from('tensw_mgmt_cash')
    .select('payment_date, counterparty, description, amount, account_number, type')
    .eq('type', 'revenue')
    .gt('amount', 0)
  for (const r of cashRows ?? []) {
    if (!r.payment_date) continue
    deposits.push({
      source: 'cash',
      date: r.payment_date,
      amount: Number(r.amount),
      label: `${r.counterparty ?? ''} ${r.description ?? ''}`,
      account: r.account_number,
    })
  }

  const { data: rawRows } = await sb
    .from('tensw_codef_transactions')
    .select('tr_date, amount_in, desc1, desc3, account_label')
    .gt('amount_in', 0)
  for (const r of rawRows ?? []) {
    deposits.push({
      source: 'bank',
      date: r.tr_date,
      amount: Number(r.amount_in),
      label: `${r.desc1 ?? ''} ${r.desc3 ?? ''}`,
      account: r.account_label,
    })
  }

  console.log(`[reconcile] 대상 계산서 ${invoices?.length ?? 0}건 / 입금 후보 ${deposits.length}건`)

  const used = new Set<string>()
  const key = (d: Deposit) => `${d.source}|${d.date}|${d.amount}|${d.account ?? ''}`

  let settled = 0
  let backfilled = 0
  let partial = 0
  const unresolved: string[] = []

  for (const inv of invoices ?? []) {
    const total = Number(inv.total_amount)
    const label = `${inv.issue_date} ${inv.counterparty} ${total.toLocaleString()}`
    const alreadyComplete = inv.payment_status === 'paid' && inv.paid_amount !== null && inv.bank_ref
    if (alreadyComplete) { used.add('_'); continue }

    const from = addDays(inv.issue_date, -WINDOW_BEFORE)
    const to = addDays(inv.issue_date, WINDOW_AFTER)
    const window = deposits.filter(d => !used.has(key(d)) && d.date >= from && d.date <= to)

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

    // 1순위 합계금액 일치
    let hit = window.find(d => d.amount === total)
    let note: string | null = null

    // 2순위 공급가액 일치 — 부가세를 빼고 입금하는 거래처가 있다. 은행 적요에 상호 대신
    // 사업명이 찍히는 경우가 많아 이름보다 금액이 확실한 신호다.
    if (!hit) {
      const supply = Number(inv.supply_amount)
      const bySupply = supply > 0 && supply !== total ? window.find(d => d.amount === supply) : undefined
      if (bySupply) {
        hit = bySupply
        note = `일부 수금 — 공급가액 ${supply.toLocaleString()}원만 입금, 부가세 ${(total - supply).toLocaleString()}원 미수 (${bySupply.date} ${bySupply.account ?? ''})`
        partial++
      }
    }

    // 3순위 상호 일치 + 하한 이상
    if (!hit) {
      const near = window.filter(
        d => nameMatches(inv.counterparty, d.label) && d.amount <= total && d.amount >= total * MIN_RATIO
      )[0]
      if (near) {
        hit = near
        const short = total - near.amount
        note = `일부 수금 — 입금 ${near.amount.toLocaleString()}원, 부족 ${short.toLocaleString()}원 (${near.date} ${near.account ?? ''})`
        partial++
      }
    }

    if (!hit) {
      unresolved.push(`${label} — 매칭 입금 없음 (현재 ${inv.payment_status})`)
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

  console.log(`\n[reconcile] 신규 수금완료 ${settled}건, 입금정보 보완 ${backfilled}건, 일부 수금 ${partial}건, 미매칭 ${unresolved.length}건`)
  for (const u of unresolved) console.log(`  - ${u}`)
  if (DRY) console.log('(dry-run — DB 변경 없음)')
}

main().catch(err => { console.error(err instanceof Error ? err.message : err); process.exit(1) })
