import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateFactualScores,
  calculateResearchScore,
} from '../research-factual-score'

test('calculates deterministic scores from Yahoo financial and price metrics', () => {
  const scores = calculateFactualScores({
    revenueGrowthPct: 32,
    profitMarginPct: 22,
    debtToEquity: 45,
    trailingPE: 24,
    priceToSales: 7,
    gapFromHighPct: -2,
    changePct: 3,
  })

  assert.deepEqual(scores, {
    growth: 90,
    quality: 83,
    momentum: 78,
    value: 68,
  })
})

test('keeps a candidate unscored when fewer than four dimensions are available', () => {
  const result = calculateResearchScore({
    scores: { growth: 80, quality: 70, momentum: null, value: null, sentiment: 75, insider: null },
    evidenceSourceCount: 2,
  })

  assert.equal(result.compositeScore, null)
  assert.equal(result.verdict, 'unscored')
  assert.equal(result.confidence, 'low')
})

test('caps a high score at Research T2 without five dimensions', () => {
  const result = calculateResearchScore({
    scores: { growth: 90, quality: 85, momentum: 88, value: 80, sentiment: null, insider: null },
    evidenceSourceCount: 2,
  })

  assert.equal(result.compositeScore, 86)
  assert.equal(result.verdict, 'pass_tier2')
  assert.equal(result.confidence, 'medium')
})

test('allows Research T1 with five dimensions and two independent sources', () => {
  const result = calculateResearchScore({
    scores: { growth: 85, quality: 80, momentum: 75, value: 65, sentiment: 70, insider: null },
    evidenceSourceCount: 2,
  })

  assert.equal(result.compositeScore, 77)
  assert.equal(result.verdict, 'pass_tier1')
  assert.equal(result.confidence, 'high')
})

test('requires two independent sources for Research T1', () => {
  const result = calculateResearchScore({
    scores: { growth: 85, quality: 80, momentum: 75, value: 65, sentiment: 70, insider: null },
    evidenceSourceCount: 1,
  })

  assert.equal(result.verdict, 'pass_tier2')
  assert.equal(result.confidence, 'medium')
})
