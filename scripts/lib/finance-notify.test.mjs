import assert from 'node:assert/strict'
import test from 'node:test'
import { isFresh, notifyMessage, summaryLines } from './finance-notify.mjs'
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
})

test('오래된 파일은 숫자로 세지 않고 갱신되지 않았다고 알린다', () => {
  const artifacts = willowArtifacts({
    'latest-kb-card-approvals.json': { collected_at: OLD, raw_count: 999, net_krw_amount: 1 },
  })
  const { lines, stale } = summaryLines(artifacts, WILLOW, NOW)

  assert.ok(!lines.some(line => line.includes('999')))
  assert.deepEqual(stale, ['latest-kb-card-approvals.json'])
  assert.match(notifyMessage({
    company: 'willow', label: '윌로우인베스트먼트', status: 'ok',
    artifacts, config: WILLOW, now: NOW,
  }), /오늘 갱신되지 않은 항목 1개/)
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
