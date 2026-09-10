import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildTenswFinanceScheduleRows,
  planTenswFinanceScheduleSync,
} from './tensw-finance-schedule-sync.mjs'

const SALES_TAX = {
  id: 'tax-sales',
  transe_type: 'sales',
  approval_no: 'sales-approval',
  issue_date: '2026-08-03',
  supplier_company: null,
  contractor_company: '서울특별시체육회',
  total_amount: 1_920_000,
  rep_items: '웹사이트 유지보수',
  status: 'issued',
}

const PURCHASE_TAX = {
  id: 'tax-purchase',
  transe_type: 'purchase',
  approval_no: 'purchase-approval',
  issue_date: '2026-08-04',
  supplier_company: '세무법인 형운',
  contractor_company: null,
  total_amount: 165_000,
  rep_items: '기장수수료',
  status: 'issued',
}

test('세금계산서 매출·매입은 승인번호 기준으로 중복 제거해 재무 일정을 만든다', () => {
  const rows = buildTenswFinanceScheduleRows({
    taxInvoices: [SALES_TAX, { ...SALES_TAX, id: 'duplicate' }, PURCHASE_TAX],
    cashRows: [],
    taxObligations: [],
  })

  assert.equal(rows.length, 2)
  assert.deepEqual(rows.map(row => [row.source_key, row.category, row.is_completed]), [
    ['tensw-finance:tax-invoice:sales-approval:issued', 'finance', true],
    ['tensw-finance:tax-invoice:purchase-approval:issued', 'finance', true],
  ])
  assert.match(rows[0].title, /매출 세금계산서.*서울특별시체육회.*₩1,920,000/)
  assert.match(rows[1].title, /매입 세금계산서.*세무법인 형운.*₩165,000/)
})

test('세금계산서 관련 입출금과 급여·법인카드·이자 비용을 표준 제목으로 만든다', () => {
  const rows = buildTenswFinanceScheduleRows({
    taxInvoices: [SALES_TAX, PURCHASE_TAX],
    cashRows: [
      { id: 'cash-sales', type: 'revenue', counterparty: '서울특별시체육회', description: '웹사이트 유지보수', amount: 1_920_000, payment_date: '2026-09-07', status: 'completed' },
      { id: 'cash-purchase', type: 'expense', counterparty: '세무법인 형운', description: '기장수수료 (매입 세금계산서)', amount: 165_000, payment_date: '2026-08-25', status: 'completed' },
      { id: 'salary', type: 'expense', counterparty: '급여', description: '8월 급여 이체', amount: 17_497_978, payment_date: '2026-08-25', status: 'completed' },
      { id: 'card', type: 'expense', counterparty: '우리카드', description: '법인카드 대금 결제', amount: 2_079_316, payment_date: '2026-09-07', status: 'completed' },
      { id: 'interest', type: 'expense', counterparty: '우리은행', description: '대출이자 (1220700845657)', amount: 1_090_520, payment_date: '2026-08-18', status: 'completed' },
      { id: 'loan-interest', type: 'expense', counterparty: '김철형', description: '대표이사 대여금 이자 상환', amount: 250_000, payment_date: '2026-08-19', status: 'completed' },
      { id: 'noise', type: 'expense', counterparty: '편의점', description: '소모품', amount: 3_000, payment_date: '2026-08-18', status: 'completed' },
    ],
    taxObligations: [],
  })

  assert.equal(rows.length, 8)
  assert.match(rows[2].title, /매출대금 입금.*서울특별시체육회/)
  assert.match(rows[3].title, /매입대금 이체.*세무법인 형운/)
  assert.match(rows[4].title, /급여 이체.*₩17,497,978/)
  assert.match(rows[5].title, /법인카드 결제.*₩2,079,316/)
  assert.match(rows[6].title, /대출이자 상환.*₩1,090,520/)
  assert.match(rows[7].title, /대여금 이자 상환.*₩250,000/)
})

test('세금·사회보험 고지는 납부기한 일정으로 묶고 완료 상태를 반영한다', () => {
  const rows = buildTenswFinanceScheduleRows({
    taxInvoices: [],
    cashRows: [],
    taxObligations: [
      { id: 'vat', source: 'hometax', obligation_type: 'vat', title: '부가가치세', amount: 5_000_000, due_date: '2026-09-30', status: 'unpaid' },
      { id: 'pension', source: 'nhis', obligation_type: 'pension', title: '국민연금 (연금)', amount: 1_915_560, due_date: '2026-09-10', status: 'paid' },
      { id: 'health', source: 'nhis', obligation_type: 'health_insurance', title: '건강보험 (건강)', amount: 1_721_320, due_date: '2026-09-10', status: 'paid' },
    ],
  })

  assert.equal(rows.length, 2)
  assert.deepEqual(rows.map(row => [row.schedule_date, row.is_completed]), [
    ['2026-09-30', false],
    ['2026-09-10', true],
  ])
  assert.match(rows[0].title, /부가가치세 납부.*₩5,000,000/)
  assert.match(rows[1].title, /4대보험 납부.*₩3,636,880/)
})

test('기존 수기 재무 일정은 승계하고 source_key 일정은 멱등 갱신한다', () => {
  const desired = buildTenswFinanceScheduleRows({
    taxInvoices: [SALES_TAX],
    cashRows: [{ id: 'salary', type: 'expense', counterparty: '급여', description: '8월 급여 이체', amount: 17_497_978, payment_date: '2026-08-25', status: 'completed' }],
    taxObligations: [],
  })
  const existing = [
    { id: 'legacy-tax', title: '서울시체육회 세금계산서 발행', schedule_date: '2026-08-03', category: null, source_key: null, is_completed: true },
    { ...desired[1], id: 'current-salary' },
  ]

  const plan = planTenswFinanceScheduleSync(desired, existing)

  assert.deepEqual(plan.insert, [])
  assert.equal(plan.update.length, 1)
  assert.equal(plan.update[0].id, 'legacy-tax')
  assert.equal(plan.update[0].values.category, 'finance')
})
