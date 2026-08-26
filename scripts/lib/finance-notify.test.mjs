import assert from 'node:assert/strict'
import test from 'node:test'
import { dailyLines, isFresh, notifyMessage, summaryLines } from './finance-notify.mjs'
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

test('summaryLines는 수집기가 남긴 파일만 세고 오래된 건 따로 표시한다', () => {
  const { lines, stale } = summaryLines(willowArtifacts(), WILLOW, NOW)

  assert.ok(lines.some(line => line.includes('세금계산서 매출 1건 · 매입 0건')))
  // 외화 잔액은 원화 합계에 섞지 않는다.
  assert.ok(lines.some(line => line.includes('신한은행 계좌 2개 · 거래 10건 · 잔액 5,055,096원')))
  assert.ok(lines.some(line => line.includes('KB카드 승인 170건 · 순액 7,077,778원')))
  assert.ok(lines.some(line => line.includes('KB카드 청구 8,803,242원 (결제일 2026-08-27)')))
  assert.ok(lines.some(line => line.includes('국세 0건 · 미납 없음')))
  assert.ok(lines.some(line => line.includes('4대보험 2건 · 미납 1건 517,680원')))
  assert.deepEqual(stale, [])
  assert.deepEqual(summaryLines(willowArtifacts(), WILLOW, NOW).missing, [])
})

test('오래된 파일은 숫자로 세지 않고 이름을 대서 알린다', () => {
  const artifacts = willowArtifacts({
    'latest-kb-card-approvals.json': { collected_at: OLD, raw_count: 999, net_krw_amount: 1 },
  })
  const { lines, stale } = summaryLines(artifacts, WILLOW, NOW)

  assert.ok(!lines.some(line => line.includes('999')))
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

  const { missing } = summaryLines(artifacts, WILLOW, NOW)
  assert.deepEqual(missing, ['신한은행 계좌', '신한은행 거래내역'])
  assert.match(notifyMessage({
    company: 'willow', label: '윌로우인베스트먼트', status: 'ok',
    artifacts, config: WILLOW, now: NOW,
  }), /오늘 못 가져온 항목: 신한은행 계좌, 신한은행 거래내역/)
})

test('성공 알림은 무엇을 몇 건 가져왔는지 함께 보낸다', () => {
  const message = notifyMessage({
    company: 'willow', label: '윌로우인베스트먼트', status: 'ok',
    artifacts: willowArtifacts(), config: WILLOW, now: NOW,
  })

  assert.match(message, /^✅ 윌로우인베스트먼트 재무 자동화 완료/)
  assert.ok(!message.includes('멈춘 단계'))
  assert.ok(message.includes('· KB카드 청구 8,803,242원'))
})

test('실패 알림은 어느 단계에서 멈췄는지를 맨 앞에 둔다', () => {
  const message = notifyMessage({
    company: 'tensw', label: '텐소프트웍스', status: 'fail', step: '신한은행 수집',
    artifacts: {}, config: financeCompany('tensw'), now: NOW,
    logFile: '/Users/x/logs/tensw-local-finance/launchd.log',
  })

  assert.match(message, /^⚠️ 텐소프트웍스 재무 자동화 실패/)
  assert.match(message, /멈춘 단계: 신한은행 수집/)
  assert.ok(message.includes('launchd.log'))
})

test('단계 이름이 없어도 실패 사실은 알린다', () => {
  const message = notifyMessage({
    company: 'willow', label: '윌로우인베스트먼트', status: 'fail',
    artifacts: {}, config: WILLOW, now: NOW,
  })
  assert.match(message, /멈춘 단계: \(알 수 없음\)/)
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
  assert.ok(message.includes('[누적]'))
})

test('오늘 추가가 누적보다 먼저 온다 — 어제와 뭐가 달라졌는지가 먼저다', () => {
  const message = notifyMessage({
    company: 'willow', label: '윌로우인베스트먼트', status: 'ok',
    artifacts: willowArtifacts(), config: WILLOW, now: NOW,
    daily: { transactions: 3, cardApprovals: 12, pending: 1 },
  })
  assert.ok(message.indexOf('[오늘 추가]') < message.indexOf('[누적]'))
  assert.match(message, /· 계좌 거래내역 3건 · 카드 승인내역 12건/)
  assert.match(message, /· 판단 대기 1건/)
})
