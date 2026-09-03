import assert from 'node:assert/strict'
import test from 'node:test'
import { computeFee, computePricing, assertBasisAllowed } from './pricing.mjs'

test('computeFee fixed basis returns amount as-is', () => {
  assert.equal(computeFee({ basis: 'fixed', amount: 500000 }), 500000)
})

test('computeFee percent_of_contract rounds to nearest won', () => {
  assert.equal(computeFee({ basis: 'percent_of_contract', percent: 12.5, contractAmount: 1000001 }), 125000)
})

test('computeFee rate_card basis returns caller-computed amount', () => {
  assert.equal(computeFee({ basis: 'rate_card', amount: 750000 }), 750000)
})

test('computeFee throws on unknown basis', () => {
  assert.throws(() => computeFee({ basis: 'discount', amount: 100 }), /basis/)
})

test('computePricing rate_card sums days x unit amount by role', () => {
  const rateCard = { pm: { amount: 100000 }, dev: { amount: 80000 } }
  const factors = { lines: [{ role: 'pm', days: 2 }, { role: 'dev', days: 3 }] }
  assert.equal(computePricing({ method: 'rate_card', factors, rateCard }), 2 * 100000 + 3 * 80000)
})

test('computePricing rate_card throws when a role is missing from the rate card', () => {
  const rateCard = { pm: { amount: 100000 } }
  const factors = { lines: [{ role: 'dev', days: 1 }] }
  assert.throws(() => computePricing({ method: 'rate_card', factors, rateCard }), /dev/)
})

test('computePricing comparable and lump_sum pass through factors.amount', () => {
  assert.equal(computePricing({ method: 'comparable', factors: { amount: 300000 } }), 300000)
  assert.equal(computePricing({ method: 'lump_sum', factors: { amount: 900000 } }), 900000)
})

test('assertBasisAllowed throws when basis_text is empty or whitespace', () => {
  assert.throws(() => assertBasisAllowed('', {}), /basis_text required/)
  assert.throws(() => assertBasisAllowed('   ', {}), /basis_text required/)
})

test('assertBasisAllowed throws when forbidden Korean phrase appears in text', () => {
  assert.throws(
    () => assertBasisAllowed('이 계약은 이익 분배 목적임', {}),
    /basis must cite market evidence, not profit or cash/,
  )
})

test('assertBasisAllowed throws when forbidden phrase appears inside factors', () => {
  assert.throws(
    () => assertBasisAllowed('시장 비교 견적 기반', { note: '남은 돈으로 정산' }),
    /basis must cite market evidence, not profit or cash/,
  )
})

test('assertBasisAllowed passes for market-evidence text with no forbidden phrase', () => {
  assert.doesNotThrow(() => assertBasisAllowed('동종 업계 견적 3건 평균', { comparables: 3 }))
})
