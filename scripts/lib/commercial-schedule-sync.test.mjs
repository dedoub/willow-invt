import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCommercialScheduleRows,
  planCommercialScheduleSync,
} from './commercial-schedule-sync.mjs'

const ETC_DRAFT = {
  id: 'etc-19',
  invoice_no: '#26-ETC-19',
  invoice_date: '2026-09-09',
  bill_to_company: 'Exchange Traded Concepts, LLC',
  total_amount: 5046.09,
  currency: 'USD',
  status: 'draft',
  line_items: [{ description: 'Monthly Fee - September 2026', amount: 5046.09 }],
  sent_at: null,
  sent_to_etc_at: null,
  sent_to_bank_at: null,
  paid_at: null,
}

const AKROS_TAX = {
  id: 'tax-august',
  transe_type: 'sales',
  reporting_date: '2026-08-25',
  issue_date: '2026-08-25',
  contractor_reg_number: '160-88-02104',
  contractor_company: '(주)아크로스테크놀로지스',
  total_amount: 13_750_000,
  rep_items: '미국 ETF 비즈니스 자문',
  approval_no: '20260825-10260825-12345678',
}

const ETC_PAYMENT = {
  id: 'cash-etc',
  type: 'revenue',
  counterparty: 'Exchange Traded Concepts',
  description: 'ETF 자문수수료 ($2,083.33 x 1,418.40)',
  amount: 2_954_995,
  issue_date: null,
  payment_date: '2026-08-05',
  status: 'completed',
  account_number: '신한 180-011-030723 (USD)',
  notes: null,
}

const AKROS_PAYMENT = {
  id: 'cash-akros',
  type: 'revenue',
  counterparty: '주식회사 아크로스',
  description: '아크로스 ETF 자문수수료',
  amount: 13_750_000,
  issue_date: null,
  payment_date: '2026-07-24',
  status: 'completed',
  account_number: '신한 140-013-427476',
  notes: null,
}

test('ETC 인보이스, 아크로스 세금계산서, 양사 입금 일정을 만든다', () => {
  const rows = buildCommercialScheduleRows({
    etcInvoices: [ETC_DRAFT],
    taxInvoices: [AKROS_TAX],
    cashRows: [ETC_PAYMENT, AKROS_PAYMENT],
  })

  assert.equal(rows.length, 4)
  assert.deepEqual(rows.map(row => [row.source_key, row.schedule_date, row.category, row.is_completed]), [
    ['commercial:etc-invoice:etc-19:issued', '2026-09-09', 'etf-etc', false],
    ['commercial:akros-tax:tax-august:issued', '2026-08-25', 'akros', true],
    ['commercial:etc-cash:cash-etc:paid', '2026-08-05', 'etf-etc', true],
    ['commercial:akros-cash:cash-akros:paid', '2026-07-24', 'akros', true],
  ])
  assert.match(rows[0].title, /#26-ETC-19.*인보이스 발행/)
  assert.match(rows[1].description, /승인번호.*12345678/)
  assert.match(rows[2].title, /\$2,083\.33/)
  assert.match(rows[3].title, /₩13,750,000/)
})

test('ETC 인보이스는 실제 발송 또는 입금이 확인돼야 완료된다', () => {
  const draft = buildCommercialScheduleRows({ etcInvoices: [ETC_DRAFT], taxInvoices: [], cashRows: [] })[0]
  const sent = buildCommercialScheduleRows({
    etcInvoices: [{ ...ETC_DRAFT, status: 'sent', sent_to_etc_at: '2026-09-10T01:00:00Z' }],
    taxInvoices: [],
    cashRows: [],
  })[0]
  const paid = buildCommercialScheduleRows({
    etcInvoices: [{ ...ETC_DRAFT, status: 'paid', paid_at: '2026-09-12T01:00:00Z' }],
    taxInvoices: [],
    cashRows: [],
  })[0]

  assert.equal(draft.is_completed, false)
  assert.equal(sent.is_completed, true)
  assert.equal(paid.is_completed, true)
})

test('Referral Fee 인보이스는 은행 발송만으로 발행 완료가 된다', () => {
  const referral = {
    ...ETC_DRAFT,
    line_items: [{ description: 'Referral Fee - July 2026', amount: 5046.09 }],
    sent_to_bank_at: '2026-09-09T23:36:06Z',
  }
  const bankSent = buildCommercialScheduleRows({ etcInvoices: [referral], taxInvoices: [], cashRows: [] })[0]
  const etcOnly = buildCommercialScheduleRows({
    etcInvoices: [{ ...referral, sent_to_bank_at: null, sent_to_etc_at: '2026-09-10T01:00:00Z' }],
    taxInvoices: [],
    cashRows: [],
  })[0]

  assert.equal(bankSent.is_completed, true)
  assert.match(bankSent.description, /은행 발송 완료/)
  assert.equal(etcOnly.is_completed, false)
})

test('아크로스 매출과 ETC·아크로스 실제 입금만 포함한다', () => {
  const rows = buildCommercialScheduleRows({
    etcInvoices: [],
    taxInvoices: [
      { ...AKROS_TAX, id: 'purchase', transe_type: 'purchase' },
      { ...AKROS_TAX, id: 'other', contractor_reg_number: '123-45-67890', contractor_company: '다른 회사' },
    ],
    cashRows: [
      { ...ETC_PAYMENT, id: 'expense', type: 'expense' },
      { ...ETC_PAYMENT, id: 'other-cash', counterparty: '다른 회사' },
      { ...ETC_PAYMENT, id: 'missing-date', payment_date: null, issue_date: null },
    ],
  })

  assert.deepEqual(rows, [])
})

test('같은 날짜의 기존 수기 일정은 자동 일정으로 승계하고 나머지만 추가한다', () => {
  const desired = buildCommercialScheduleRows({
    etcInvoices: [ETC_DRAFT],
    taxInvoices: [AKROS_TAX],
    cashRows: [],
  })
  const existing = [{
    id: 'legacy-akros',
    title: '아크로스 세금계산서 발행',
    schedule_date: '2026-08-25',
    category: 'akros',
    description: null,
    source_key: null,
    type: 'meeting',
    is_completed: true,
  }]

  const plan = planCommercialScheduleSync(desired, existing)

  assert.equal(plan.update.length, 1)
  assert.equal(plan.update[0].id, 'legacy-akros')
  assert.equal(plan.update[0].values.source_key, 'commercial:akros-tax:tax-august:issued')
  assert.equal(plan.insert.length, 1)
  assert.equal(plan.insert[0].source_key, 'commercial:etc-invoice:etc-19:issued')
})

test('source_key가 붙은 일정은 다시 추가하지 않고 최신 완료 상태로 갱신한다', () => {
  const desired = buildCommercialScheduleRows({
    etcInvoices: [{ ...ETC_DRAFT, status: 'sent', sent_at: '2026-09-10T01:00:00Z' }],
    taxInvoices: [],
    cashRows: [],
  })
  const existing = [{ ...desired[0], id: 'schedule-1', is_completed: false }]

  const plan = planCommercialScheduleSync(desired, existing)

  assert.deepEqual(plan.insert, [])
  assert.equal(plan.update.length, 1)
  assert.equal(plan.update[0].id, 'schedule-1')
  assert.equal(plan.update[0].values.is_completed, true)
})

test('이미 최신인 자동 일정은 매일 다시 쓰지 않는다', () => {
  const desired = buildCommercialScheduleRows({ etcInvoices: [ETC_DRAFT], taxInvoices: [], cashRows: [] })
  const existing = [{ ...desired[0], id: 'schedule-1' }]

  const plan = planCommercialScheduleSync(desired, existing)

  assert.deepEqual(plan, { insert: [], update: [] })
})
