#!/usr/bin/env npx tsx
/**
 * tensw-auto-classify.ts
 *
 * tensw_codef_transactions(스테이징)의 status='new' 거래를 자동 분류해
 * tensw_mgmt_cash(현금관리)에 반영한다. 매일 08:00 동기화 파이프라인에서
 * codef 수집 직후 실행된다.
 *
 * 원칙: 확실한 것만 자동으로 넣는다.
 *   - 자사 계좌간 이체(운영비이체), 0원 거래 → ignored
 *   - 매입 세금계산서와 금액이 맞는 출금(±이체수수료 500원) → expense
 *   - 매출 세금계산서와 금액이 맞는 입금 → revenue
 *   - 반복 고정 패턴(카드대금·리스료·대출·4대보험·세금·공과금 등) → expense
 * 그 외(대여금·급여·처음 보는 거래처 등 회계 판단이 필요한 건)는 'new'로 남기고
 * ⚠ 로그를 남긴다 → tensw-sync-notify 가 텔레그램으로 CEO에게 알린다.
 *
 *   npx tsx scripts/tensw-auto-classify.ts
 *   npx tsx scripts/tensw-auto-classify.ts --dry
 */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const DRY = process.argv.includes('--dry')
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY!

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

type StagingRow = {
  id: string
  account_label: string
  tr_date: string
  tr_time: string | null
  amount_in: number
  amount_out: number
  balance_after: number | null
  desc1: string | null
  desc2: string | null
  desc3: string | null
  desc4: string | null
}

type Decision =
  | { kind: 'ignore'; reason: string }
  | { kind: 'cash'; type: string; counterparty: string; description: string; amount: number; reason: string }
  | { kind: 'hold'; reason: string }

/** 반복 고정 패턴. 출금 전용 — 새 패턴은 검증된 것만 추가한다. */
const EXPENSE_PATTERNS: Array<{ re: RegExp; counterparty: string; description: string }> = [
  { re: /우리카드/, counterparty: '우리카드', description: '법인카드 대금 결제' },
  { re: /하나캐피탈/, counterparty: '하나캐피탈', description: '리스료' },
  { re: /SBI저축|SBI/, counterparty: 'SBI저축은행', description: '대출 원리금 상환' },
  { re: /대출이자/, counterparty: '우리은행', description: '대출이자' },
  { re: /국민연금/, counterparty: '국민연금', description: '4대보험 (국민연금)' },
  { re: /건강보험/, counterparty: '건강보험', description: '4대보험 (건강보험)' },
  { re: /고용보험|산재보험|근로복지공단/, counterparty: '근로복지공단', description: '4대보험 (고용·산재)' },
  { re: /한국전력|전기요금/, counterparty: '한국전력', description: '전기요금' },
  { re: /국세|I-지로|인터넷지로/, counterparty: '국세', description: '국세 납부' },
  { re: /지방세|위택스/, counterparty: '지방세', description: '지방세 납부' },
  { re: /발급수수료|타행수수료|송금수수료/, counterparty: '우리은행', description: '은행 수수료' },
]

function text(r: StagingRow): string {
  return [r.desc1, r.desc2, r.desc3, r.desc4].filter(Boolean).join(' ')
}

/** 매입/매출 세금계산서와 금액 대조. 이체수수료 500원 오차 허용, 발행일 ±45일. */
function matchInvoice(
  invoices: Array<{ transe_type: string; issue_date: string; supplier_company: string | null; contractor_company: string | null; total_amount: number; rep_items: string | null }>,
  r: StagingRow,
): Decision | null {
  const out = r.amount_out > 0
  const amt = out ? r.amount_out : r.amount_in
  const want = out ? 'purchase' : 'sales'
  for (const inv of invoices) {
    if (inv.transe_type !== want) continue
    const diff = amt - Number(inv.total_amount)
    if (diff !== 0 && !(out && diff > 0 && diff <= 500)) continue
    const gap = Math.abs(new Date(r.tr_date).getTime() - new Date(inv.issue_date).getTime())
    if (gap > 45 * 86400000) continue
    const party = (out ? inv.supplier_company : inv.contractor_company) ?? '(미상)'
    const fee = diff > 0 ? ` + 이체수수료 ${diff}원` : ''
    return {
      kind: 'cash',
      type: out ? 'expense' : 'revenue',
      counterparty: party,
      description: `${inv.rep_items ?? '세금계산서 대금'} (${out ? '매입' : '매출'} 세금계산서 ${inv.issue_date} ${Number(inv.total_amount).toLocaleString()}원${fee})`,
      amount: amt,
      reason: `세금계산서 매칭 (${party})`,
    }
  }
  return null
}

function classify(r: StagingRow, invoices: Parameters<typeof matchInvoice>[0]): Decision {
  const t = text(r)

  if (r.amount_in === 0 && r.amount_out === 0) return { kind: 'ignore', reason: '0원 거래' }
  if (/운영비이체/.test(t)) return { kind: 'ignore', reason: '자사 계좌간 이체' }

  const byInvoice = matchInvoice(invoices, r)
  if (byInvoice) return byInvoice

  if (r.amount_out > 0) {
    for (const p of EXPENSE_PATTERNS) {
      if (p.re.test(t)) {
        return { kind: 'cash', type: 'expense', counterparty: p.counterparty, description: p.description, amount: r.amount_out, reason: `고정 패턴 (${p.counterparty})` }
      }
    }
  }

  // 대여금·급여·환급·처음 보는 거래처 등은 사람이 판단한다.
  return { kind: 'hold', reason: '자동 분류 기준 없음' }
}

async function main() {
  const { data: rows, error } = await sb
    .from('tensw_codef_transactions')
    .select('id, account_label, tr_date, tr_time, amount_in, amount_out, balance_after, desc1, desc2, desc3, desc4')
    .eq('status', 'new')
    .order('tr_date')
    .order('tr_time')
  if (error) throw new Error(`스테이징 조회 실패: ${error.message}`)
  if (!rows?.length) {
    console.log('[auto-classify] 미분류 거래 없음.')
    await syncBalances()
    return
  }

  // 최근 90일 세금계산서 (매입: promoted 만 — 취소·검토중 제외)
  const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
  const { data: invData, error: invErr } = await sb
    .from('tensw_codef_tax_invoices')
    .select('transe_type, issue_date, supplier_company, contractor_company, total_amount, rep_items, status')
    .gte('issue_date', since)
    .in('status', ['promoted', 'linked'])
  if (invErr) throw new Error(`세금계산서 조회 실패: ${invErr.message}`)
  const invoices = (invData ?? []).map(v => ({ ...v, total_amount: Number(v.total_amount) }))

  let inserted = 0
  let ignored = 0
  const held: string[] = []

  for (const r of rows as StagingRow[]) {
    const d = classify(r, invoices)
    const label = `${r.tr_date} ${r.account_label} ${r.amount_in > 0 ? `입금 ${r.amount_in.toLocaleString()}` : `출금 ${r.amount_out.toLocaleString()}`}원 ${text(r)}`

    if (d.kind === 'ignore') {
      console.log(`  - 제외: ${label} — ${d.reason}`)
      if (!DRY) await sb.from('tensw_codef_transactions').update({ status: 'ignored' }).eq('id', r.id)
      ignored++
      continue
    }

    if (d.kind === 'hold') {
      held.push(label)
      continue
    }

    console.log(`  + ${d.type}: ${label} — ${d.reason}`)
    if (DRY) { inserted++; continue }

    // 중복 방지: 같은 날짜+금액+거래처가 이미 있으면 스테이징만 마감한다.
    const { data: dup } = await sb
      .from('tensw_mgmt_cash')
      .select('id')
      .eq('counterparty', d.counterparty)
      .eq('amount', d.amount)
      .eq('payment_date', r.tr_date)
      .limit(1)
    if (dup?.length) {
      await sb.from('tensw_codef_transactions').update({ status: 'classified', cash_id: dup[0].id }).eq('id', r.id)
      console.log('    (기존 행 존재 — 연결만)')
      continue
    }

    const { data: cash, error: insErr } = await sb
      .from('tensw_mgmt_cash')
      .insert({
        type: d.type,
        counterparty: d.counterparty,
        description: d.description,
        amount: d.amount,
        payment_date: r.tr_date,
        status: 'completed',
        account_number: r.account_label,
        balance_after: r.balance_after,
        transaction_time: r.tr_time,
      })
      .select('id')
      .single()
    if (insErr || !cash) {
      console.error(`  ✗ 현금관리 INSERT 실패: ${insErr?.message}`)
      continue
    }
    await sb.from('tensw_codef_transactions').update({ status: 'classified', cash_id: cash.id }).eq('id', r.id)
    inserted++
  }

  console.log(`\n[auto-classify] 자동 반영 ${inserted}건, 제외 ${ignored}건, 보류 ${held.length}건${DRY ? ' (dry)' : ''}`)
  if (held.length) {
    // ⚠ 는 tensw-sync-notify 가 잡아 텔레그램으로 CEO에게 보낸다.
    console.log(`  ⚠ 분류 판단 필요 ${held.length}건 — update-cash-transactions 로 처리하세요:`)
    for (const h of held) console.log(`    · ${h}`)
  }

  if (!DRY) await syncBalances()
}

/** 스테이징의 계좌별 최신 잔액으로 tensw_mgmt_bank_balances 를 갱신한다. */
async function syncBalances() {
  const { data } = await sb
    .from('tensw_codef_transactions')
    .select('account_label, tr_date, tr_time, balance_after')
    .not('balance_after', 'is', null)
    .order('tr_date', { ascending: false })
    .order('tr_time', { ascending: false })
    .limit(200)
  if (!data?.length) return
  const latest = new Map<string, { tr_date: string; balance_after: number }>()
  for (const r of data) {
    if (!latest.has(r.account_label)) latest.set(r.account_label, { tr_date: r.tr_date, balance_after: Number(r.balance_after) })
  }
  for (const [label, v] of latest) {
    const { data: cur } = await sb
      .from('tensw_mgmt_bank_balances')
      .select('id, balance_date')
      .eq('account_number', label)
      .maybeSingle()
    if (!cur || (cur.balance_date && cur.balance_date > v.tr_date)) continue
    await sb
      .from('tensw_mgmt_bank_balances')
      .update({ balance: v.balance_after, balance_date: v.tr_date, updated_at: new Date().toISOString() })
      .eq('id', cur.id)
    console.log(`  · 잔액 갱신: ${label} → ${v.balance_after.toLocaleString()}원 (${v.tr_date})`)
  }
}

main().catch(err => {
  console.error(`✗ auto-classify 실패: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
