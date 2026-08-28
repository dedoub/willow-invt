import assert from 'node:assert/strict'
import test from 'node:test'
import {
  balanceLines, collectionGaps, dailyLines, isFresh, notifyMessage, outstandingLines,
} from './finance-notify.mjs'
import { financeCompany } from './tensw-local-finance.mjs'

const NOW = new Date('2026-08-26T20:40:00+09:00')
const FRESH = '2026-08-26T11:00:00.000Z'
const OLD = '2026-08-20T11:00:00.000Z'

const WILLOW = financeCompany('willow')

function willowArtifacts(overrides = {}) {
  return {
    'latest-tax-invoices.json': { collected_at: FRESH, sales: [{}], purchases: [] },
    'latest-shinhan-accounts.json': {
      collected_at: FRESH,
      accounts: [
        { currency: 'KRW', balance: 5_055_096 },
        { currency: 'USD', balance: 4.62 },
      ],
    },
    'latest-shinhan-transactions.json': { collected_at: FRESH, transactions: new Array(10).fill({}) },
    'latest-kb-card-approvals.json': { collected_at: FRESH, raw_count: 170, net_krw_amount: 7_077_778 },
    'latest-kb-card-statement.json': { collected_at: FRESH, billed_amount: 8_803_242, payment_date: '2026-08-27' },
    'latest-hometax-national-tax.json': { collected_at: FRESH, obligations: [] },
    'latest-wetax-obligations.json': { collected_at: FRESH, obligations: [{ status: 'unpaid', amount: 62_500 }] },
    'latest-nhis-obligations.json': {
      collected_at: FRESH,
      obligations: [
        { status: 'unpaid', amount: 517_680 },
        { status: 'paid', amount: 517_680 },
      ],
    },
    ...overrides,
  }
}

test('isFresh는 지난 실행에 남은 파일을 오늘 것으로 세지 않는다', () => {
  assert.equal(isFresh(FRESH, NOW), true)
  assert.equal(isFresh(OLD, NOW), false)
  assert.equal(isFresh(null, NOW), false)
  assert.equal(isFresh('어제', NOW), false)
})

test('오늘 결과를 낸 단계는 빠짐으로 잡히지 않는다', () => {
  const gaps = collectionGaps(willowArtifacts(), WILLOW, NOW)
  assert.deepEqual(gaps.stale, [])
  assert.deepEqual(gaps.missing, [])
})

test('알림은 두 턴이 다 끝난 뒤 나가므로 홈택스 파일도 12시간 한 기준으로 본다', () => {
  // 04시에 은행·카드, 07시에 홈택스를 받고 그 끝에서 한 통을 보낸다. 그 시점엔
  // 모든 파일이 몇 시간 안쪽이라 소스별 예외를 둘 이유가 없다.
  const todayFour = '2026-08-26T19:00:00.000Z' // 2026-08-27 04:00 KST
  const todaySeven = '2026-08-26T22:00:00.000Z' // 2026-08-27 07:00 KST
  const yesterdaySeven = '2026-08-25T22:00:00.000Z'
  const afterSeven = new Date('2026-08-27T07:10:00+09:00')

  assert.deepEqual(collectionGaps(willowArtifacts({
    'latest-hometax-national-tax.json': { collected_at: todaySeven, obligations: [] },
    'latest-tax-invoices.json': { collected_at: todaySeven, sales: [{}], purchases: [] },
    'latest-shinhan-accounts.json': { collected_at: todayFour, accounts: [] },
    'latest-shinhan-transactions.json': { collected_at: todayFour, transactions: [] },
    'latest-kb-card-approvals.json': { collected_at: todayFour, raw_count: 1, net_krw_amount: 1 },
    'latest-kb-card-statement.json': { collected_at: todayFour, billed_amount: 1, payment_date: '2026-08-27' },
    'latest-wetax-obligations.json': { collected_at: todayFour, obligations: [] },
    'latest-nhis-obligations.json': { collected_at: todayFour, obligations: [] },
  }), WILLOW, afterSeven).stale, [])

  // 07시 턴이 통째로 멈춰 어제 파일이 그대로면 그건 알아야 한다.
  assert.deepEqual(collectionGaps(willowArtifacts({
    'latest-hometax-national-tax.json': { collected_at: yesterdaySeven, obligations: [] },
  }), WILLOW, afterSeven).stale, ['국세'])
})

test('오래된 파일은 이름을 대서 알린다', () => {
  const artifacts = willowArtifacts({
    'latest-kb-card-approvals.json': { collected_at: OLD, raw_count: 999, net_krw_amount: 1 },
  })
  const { stale } = collectionGaps(artifacts, WILLOW, NOW)

  // 파일 이름이 아니라 사람이 읽는 이름이어야 어디를 볼지 안다.
  assert.deepEqual(stale, ['KB카드 승인내역'])
  assert.match(notifyMessage({
    company: 'willow', label: '윌로우인베스트먼트', status: 'ok',
    artifacts, config: WILLOW, now: NOW,
  }), /오늘 못 가져온 항목: KB카드 승인내역/)
})

test('아예 없는 파일도 이름을 대서 알린다 — 조용히 빠지면 정상처럼 보인다', () => {
  const artifacts = willowArtifacts()
  delete artifacts['latest-shinhan-accounts.json']
  delete artifacts['latest-shinhan-transactions.json']

  const { missing } = collectionGaps(artifacts, WILLOW, NOW)
  assert.deepEqual(missing, ['신한은행 계좌', '신한은행 거래내역'])
  assert.match(notifyMessage({
    company: 'willow', label: '윌로우인베스트먼트', status: 'ok',
    artifacts, config: WILLOW, now: NOW,
  }), /오늘 못 가져온 항목: 신한은행 계좌, 신한은행 거래내역/)
})

test('성공 알림은 오늘 추가와 현재 상태를 함께 보낸다', () => {
  const message = notifyMessage({
    company: 'willow', label: '윌로우인베스트먼트', status: 'ok',
    artifacts: willowArtifacts(), config: WILLOW, now: NOW,
    daily: { transactions: 10 },
    outstanding: { cardBilling: { amount: 8_803_242, dueDate: '2026-08-27' } },
  })

  assert.match(message, /^✅ 윌로우인베스트먼트 재무 자동화 완료/)
  assert.ok(!message.includes('막힌 단계'))
  assert.ok(message.includes('· 카드 청구 8,803,242원 (2026-08-27 결제)'))
})

test('실패 알림은 어느 단계에서 멈췄는지를 맨 앞에 둔다', () => {
  const message = notifyMessage({
    company: 'tensw', label: '텐소프트웍스', status: 'fail', step: '신한은행 수집',
    artifacts: {}, config: financeCompany('tensw'), now: NOW,
    logFile: '/Users/x/logs/tensw-local-finance/launchd.log',
  })

  assert.match(message, /^⚠️ 텐소프트웍스 재무 자동화 실패/)
  assert.match(message, /막힌 단계: 신한은행 수집/)
  assert.ok(message.includes('launchd.log'))
})

test('단계 이름이 없어도 실패 사실은 알린다', () => {
  const message = notifyMessage({
    company: 'willow', label: '윌로우인베스트먼트', status: 'fail',
    artifacts: {}, config: WILLOW, now: NOW,
  })
  assert.match(message, /막힌 단계: \(알 수 없음\)/)
})

test('오늘 추가는 0건인 항목을 적지 않는다', () => {
  assert.deepEqual(
    dailyLines({ transactions: 3, cardApprovals: 12, taxInvoices: 0, taxObligations: 0, cash: 3, pending: 0 }),
    ['계좌 거래내역 3건 · 카드 승인내역 12건 · 현금관리 반영 3건'],
  )
})

test('아무것도 안 들어온 날도 그렇다고 말한다', () => {
  // 줄이 통째로 사라지면 정상인지 못 돈 건지 알 수 없다.
  assert.deepEqual(dailyLines({ transactions: 0, cardApprovals: 0, cash: 0 }), ['새로 들어온 내역 없음'])
})

test('판단 대기는 사람이 손댈 신호라 따로 세운다', () => {
  assert.deepEqual(
    dailyLines({ transactions: 2, pending: 5 }),
    ['계좌 거래내역 2건', '판단 대기 5건'],
  )
})

test('세는 데 실패해도 알림은 나간다', () => {
  const message = notifyMessage({
    company: 'willow', label: '윌로우인베스트먼트', status: 'ok',
    artifacts: willowArtifacts(), config: WILLOW, now: NOW, daily: null,
  })
  assert.ok(!message.includes('[오늘 추가]'))
})

test('오늘 추가가 누적보다 먼저 온다 — 어제와 뭐가 달라졌는지가 먼저다', () => {
  const message = notifyMessage({
    company: 'willow', label: '윌로우인베스트먼트', status: 'ok',
    artifacts: willowArtifacts(), config: WILLOW, now: NOW,
    daily: { transactions: 3, cardApprovals: 12, pending: 1 },
    outstanding: { taxUnpaid: { count: 1, amount: 62_500, bySource: [{ label: '지방세', count: 1 }] } },
  })
  assert.ok(message.indexOf('[오늘 추가]') < message.indexOf('[현재]'))
  assert.match(message, /· 계좌 거래내역 3건 · 카드 승인내역 12건/)
  assert.match(message, /· 판단 대기 1건/)
})

test('잔액은 통화별 합계로 적고 돈이 든 계좌만 이름을 댄다', () => {
  // 텐소는 계좌가 9개인데 대부분 0원이다. 전부 적으면 미납·미수가 묻힌다.
  const lines = balanceLines([
    { label: '우리 1005-704-524272', balance: 20, currency: 'KRW' },
    { label: '우리 1005-204-474909', balance: 0, currency: 'KRW' },
    { label: '신한 140-013-150883', balance: 46_374_940, currency: 'KRW' },
    { label: '우리 1005-903-636048', balance: 21_037_862, currency: 'KRW' },
    { label: '우리 1005-403-461450', balance: 8_281_398, currency: 'KRW' },
  ])

  assert.equal(lines.length, 1)
  assert.match(lines[0], /^잔액 75,694,220원 \(/)
  assert.match(lines[0], /신한 140-013-150883 46,374,940원/)
  assert.match(lines[0], /외 2개\)$/)
})

test('계좌가 하나면 합계를 두 번 적지 않는다', () => {
  assert.deepEqual(
    balanceLines([{ label: '신한 140-013-427476', balance: 5_055_096, currency: 'KRW' }]),
    ['잔액 신한 140-013-427476 5,055,096원'],
  )
})

test('외화는 소수를 살리고 라벨의 통화 표기는 지운다', () => {
  assert.deepEqual(
    balanceLines([{ label: '신한 180-011-030723 (USD)', balance: 4.62, currency: 'USD' }]),
    ['잔액 신한 180-011-030723 4.62 USD'],
  )
})

test('원화를 먼저 적는다 — 본 계좌가 앞에 와야 한다', () => {
  const lines = balanceLines([
    { label: '신한 (USD)', balance: 4.62, currency: 'USD' },
    { label: '신한 140', balance: 5_055_096, currency: 'KRW' },
  ])
  assert.match(lines[0], /5,055,096원/)
  assert.match(lines[1], /USD/)
})

test('현재 상태는 남아 있는 것만 적는다', () => {
  const lines = outstandingLines({
    balances: [{ label: '신한 140', balance: 5_055_096, currency: 'KRW' }],
    cardBilling: { amount: 8_803_242, dueDate: '2026-08-27' },
    taxUnpaid: { count: 4, amount: 1_253_620, bySource: [{ label: '지방세', count: 1 }, { label: '4대보험', count: 3 }] },
    receivable: { count: 0, amount: 0, currency: 'KRW' },
  })

  assert.deepEqual(lines, [
    '잔액 신한 140 5,055,096원',
    '카드 청구 8,803,242원 (2026-08-27 결제)',
    '세금 미납 1,253,620원 (지방세 1 · 4대보험 3)',
  ])
  // 0건인 미수는 적지 않는다.
  assert.ok(!lines.some(line => line.includes('미수')))
})

test('미수는 통화를 지켜 적는다 — 윌로우는 해외 인보이스가 USD다', () => {
  const lines = outstandingLines({ receivable: { count: 2, amount: 7_401.21, currency: 'USD' } })
  assert.deepEqual(lines, ['매출 미수 7,401.21 USD (2건)'])
})
