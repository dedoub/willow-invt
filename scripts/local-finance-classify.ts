#!/usr/bin/env npx tsx
/**
 * local-finance-classify.ts
 *
 * 로컬 수집 스테이징의 status='new' 거래를 자동 분류해 그 회사의 현금관리에
 * 반영한다. 매일 아침 수집 파이프라인의 마지막 단계로 실행된다.
 *
 * 원칙: 확실한 것만 자동으로 넣는다.
 *   - 자사 계좌간 이체, 0원 거래 → ignored
 *   - 매입 세금계산서와 금액이 맞는 출금(±이체수수료 500원) → expense
 *   - 매출 세금계산서와 금액이 맞는 입금 → revenue
 *   - 반복 고정 패턴(카드대금·리스료·대출·4대보험·세금·공과금 등) → expense
 * 그 외(대여금·급여·처음 보는 거래처 등 회계 판단이 필요한 건)는 'new'로 남기고
 * ⚠ 로그를 남긴다 → tensw-sync-notify 가 텔레그램으로 CEO에게 알린다.
 *
 *   npx tsx scripts/local-finance-classify.ts --company tensw
 *   npx tsx scripts/local-finance-classify.ts --company willow --dry
 */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const DRY = process.argv.includes('--dry')
const COMPANY = (() => {
  const index = process.argv.indexOf('--company')
  const value = index >= 0 ? process.argv[index + 1] : 'tensw'
  if (value !== 'tensw' && value !== 'willow') {
    throw new Error(`등록되지 않은 회사예요: ${value}`)
  }
  return value
})()
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

type Pattern = {
  re: RegExp
  counterparty: string
  description: string
  /** 기본은 expense. 대여·환전처럼 손익이 아닌 건 따로 적는다. */
  type?: string
  /** 기본은 출금. 입금으로만 오는 건(구글 수입 등)은 'in' 으로 막아 둔다. */
  direction?: 'in' | 'out'
}

/** 어느 회사든 같은 뜻인 출금 패턴. */
const SHARED_EXPENSE_PATTERNS: Pattern[] = [
  { re: /국민연금/, counterparty: '국민연금', description: '4대보험 (국민연금)' },
  { re: /건강보험/, counterparty: '건강보험', description: '4대보험 (건강보험)' },
  { re: /고용보험|산재보험|근로복지공단/, counterparty: '근로복지공단', description: '4대보험 (고용·산재)' },
  { re: /국세|I-지로|인터넷지로/, counterparty: '국세', description: '국세 납부' },
  { re: /지방세|위택스/, counterparty: '지방세', description: '지방세 납부' },
]

/**
 * 회사별 설정. 패턴은 실제 거래내역에서 확인된 것만 넣는다 — 잘못 자동분류되면
 * 사람이 되돌려야 하므로, 애매한 건 보류(hold)로 남기는 편이 낫다.
 *
 * 윌로우는 김동욱 대여금·외화환전·TSW대여금처럼 회계 판단이 필요한 거래가 많아
 * 카드대금과 공과금만 자동으로 넘긴다.
 */
const COMPANIES = {
  tensw: {
    label: '텐소프트웍스',
    staging: 'tensw_codef_transactions',
    cash: 'tensw_mgmt_cash',
    balances: 'tensw_mgmt_bank_balances',
    invoices: 'tensw_codef_tax_invoices',
    // 매출관리 화면에서 사람이 확인해 승격한 계산서만 대조한다 — 취소·검토중을 뺀다.
    invoiceStatuses: ['promoted', 'linked'],
    transferPattern: /운영비이체/,
    patterns: [
      { re: /우리카드/, counterparty: '우리카드', description: '법인카드 대금 결제' },
      { re: /하나캐피탈/, counterparty: '하나캐피탈', description: '리스료' },
      { re: /SBI저축|SBI/, counterparty: 'SBI저축은행', description: '대출 원리금 상환' },
      { re: /대출이자/, counterparty: '우리은행', description: '대출이자' },
      { re: /한국전력|전기요금/, counterparty: '한국전력', description: '전기요금' },
      { re: /발급수수료|타행수수료|송금수수료/, counterparty: '우리은행', description: '은행 수수료' },
      ...SHARED_EXPENSE_PATTERNS,
    ] as Pattern[],
  },
  willow: {
    label: '윌로우인베스트먼트',
    staging: 'willow_finance_transactions',
    cash: 'willow_mgmt_cash',
    balances: 'willow_mgmt_bank_balances',
    invoices: 'willow_finance_tax_invoices',
    // 윌로우는 매출관리 화면이 없어 승격 단계 자체가 없다. 수집분은 홈택스에서
    // 그대로 온 정본이므로 'new' 도 대조 대상에 넣는다.
    invoiceStatuses: ['new', 'promoted', 'linked'],
    // 외화환전은 USD 계좌와 원화 계좌 사이의 내부 이동이다. 은행에는 원화 입금만
    // 찍히고 USD 출금액은 환율에 따라 달라져 알 수 없는데, 장부는 두 줄을 짝지어
    // 기록하므로 반쪽만 자동으로 넣으면 손으로 넣은 짝과 겹친다. 그래서 텐소의
    // 자사 계좌간 이체와 같이 제외하고 환전 기록은 사람이 남긴다.
    transferPattern: /외화환전/ as RegExp | null,
    // 아래 분류는 모두 기존 장부에 이미 쌓인 처리를 그대로 따른 것이다.
    patterns: [
      { re: /KB카드|국민카드|KB국민카드/, counterparty: 'KB카드', description: '법인카드 대금 결제' },
      { re: /신한카드/, counterparty: '신한카드', description: '법인카드 대금 결제' },
      { re: /발급수수료|타행수수료|송금수수료|제증명수수료/, counterparty: '은행수수료', description: '은행 수수료' },
      // 은행은 서울특별시를 '서울특징'으로 줄여 찍는다. 지방소득세가 이렇게 온다.
      { re: /서울특별시|서울특징/, counterparty: '지방세', description: '지방세 (서울시)' },
      // 대여금 상환과 급여는 같은 이름으로 오므로 적요로 가른다.
      { re: /김동욱대여|대여상환/, counterparty: '김동욱', description: '대여금 상환', type: 'liability' },
      { re: /김동욱급여/, counterparty: '김동욱', description: '김동욱 미지급급여 지급 (지급시점 비용인식)' },
      { re: /세무법인/, counterparty: '세무법인 형운', description: '기장수수료' },
      { re: /KR-GOOGLE/, counterparty: 'Google', description: '구글 수입 (KR-GOOGLE)', type: 'revenue', direction: 'in' },
      ...SHARED_EXPENSE_PATTERNS,
    ] as Pattern[],
  },
} as const

const CONFIG = COMPANIES[COMPANY]
const EXPENSE_PATTERNS: readonly Pattern[] = CONFIG.patterns

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
  if (CONFIG.transferPattern?.test(t)) return { kind: 'ignore', reason: '자사 계좌간 이체' }

  const byInvoice = matchInvoice(invoices, r)
  if (byInvoice) return byInvoice

  for (const p of EXPENSE_PATTERNS) {
    const direction = p.direction ?? 'out'
    const amount = direction === 'in' ? r.amount_in : r.amount_out
    if (amount <= 0) continue
    if (!p.re.test(t)) continue
    return {
      kind: 'cash',
      type: p.type ?? 'expense',
      counterparty: p.counterparty,
      description: p.description,
      amount,
      reason: `고정 패턴 (${p.counterparty})`,
    }
  }

  // 대여금·급여·환급·처음 보는 거래처 등은 사람이 판단한다.
  return { kind: 'hold', reason: '자동 분류 기준 없음' }
}

async function main() {
  const { data: rows, error } = await sb
    .from(CONFIG.staging)
    .select('id, account_label, tr_date, tr_time, amount_in, amount_out, balance_after, desc1, desc2, desc3, desc4')
    .eq('status', 'new')
    .order('tr_date')
    .order('tr_time')
  if (error) throw new Error(`스테이징 조회 실패: ${error.message}`)
  if (!rows?.length) {
    console.log(`[classify:${COMPANY}] 미분류 거래 없음.`)
    // dry 실행은 아무것도 쓰지 않는다 — 잔액 갱신도 쓰기다.
    if (!DRY) await syncBalances()
    return
  }

  // 최근 90일 세금계산서 (매입: promoted 만 — 취소·검토중 제외)
  const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
  const { data: invData, error: invErr } = await sb
    .from(CONFIG.invoices)
    .select('transe_type, issue_date, supplier_company, contractor_company, total_amount, rep_items, status')
    .gte('issue_date', since)
    .in('status', CONFIG.invoiceStatuses)
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
      if (!DRY) await sb.from(CONFIG.staging).update({ status: 'ignored' }).eq('id', r.id)
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
      .from(CONFIG.cash)
      .select('id')
      .eq('counterparty', d.counterparty)
      .eq('amount', d.amount)
      .eq('payment_date', r.tr_date)
      .limit(1)
    if (dup?.length) {
      await sb.from(CONFIG.staging).update({ status: 'classified', cash_id: dup[0].id }).eq('id', r.id)
      console.log('    (기존 행 존재 — 연결만)')
      continue
    }

    const { data: cash, error: insErr } = await sb
      .from(CONFIG.cash)
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
    await sb.from(CONFIG.staging).update({ status: 'classified', cash_id: cash.id }).eq('id', r.id)
    inserted++
  }

  console.log(`\n[classify:${COMPANY}] 자동 반영 ${inserted}건, 제외 ${ignored}건, 보류 ${held.length}건${DRY ? ' (dry)' : ''}`)
  if (held.length) {
    // ⚠ 는 tensw-sync-notify 가 잡아 텔레그램으로 CEO에게 보낸다.
    console.log(`  ⚠ 분류 판단 필요 ${held.length}건 — update-cash-transactions 로 처리하세요:`)
    for (const h of held) console.log(`    · ${h}`)
  }

  if (!DRY) await syncBalances()
}

/** 스테이징의 계좌별 최신 잔액으로 그 회사의 잔액 테이블을 갱신한다. */
async function syncBalances() {
  const { data } = await sb
    .from(CONFIG.staging)
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
      .from(CONFIG.balances)
      .select('id, balance_date')
      .eq('account_number', label)
      .maybeSingle()
    if (!cur || (cur.balance_date && cur.balance_date > v.tr_date)) continue
    await sb
      .from(CONFIG.balances)
      .update({ balance: v.balance_after, balance_date: v.tr_date, updated_at: new Date().toISOString() })
      .eq('id', cur.id)
    console.log(`  · 잔액 갱신: ${label} → ${v.balance_after.toLocaleString()}원 (${v.tr_date})`)
  }
}

main().catch(err => {
  console.error(`✗ [classify:${COMPANY}] 실패: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
