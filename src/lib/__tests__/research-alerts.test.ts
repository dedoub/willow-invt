import assert from 'node:assert/strict'
import test from 'node:test'

async function loadHelpers() {
  return import('../research-alerts').catch(() => ({} as Record<string, unknown>))
}

test('missing composite score stays unscored instead of becoming research T2', async () => {
  const helpers = await loadHelpers()
  assert.equal(typeof helpers.deriveResearchVerdict, 'function')

  const deriveVerdict = helpers.deriveResearchVerdict as (score: number | null) => string
  assert.equal(deriveVerdict(null), 'unscored')
})

test('a newly discovered research T1 creates an immediate alert', async () => {
  const helpers = await loadHelpers()
  assert.equal(typeof helpers.classifyResearchChange, 'function')

  const classify = helpers.classifyResearchChange as (previous: unknown, current: unknown) => unknown
  assert.deepEqual(classify(null, {
    ticker: 'NBIS',
    company_name: 'Nebius Group',
    verdict: 'pass_tier1',
    composite_score: 76,
    source: 'market_scan',
    gap_from_high_pct: -7.4,
  }), {
    kind: 'new_tier1',
    immediate: true,
    scoreDelta: null,
  })
})

test('an unchanged repeat scan does not create an alert', async () => {
  const helpers = await loadHelpers()
  const classify = helpers.classifyResearchChange as (previous: unknown, current: unknown) => unknown

  assert.equal(classify({ verdict: 'pass_tier1', composite_score: 76 }, {
    ticker: 'NBIS',
    company_name: 'Nebius Group',
    verdict: 'pass_tier1',
    composite_score: 76,
    source: 'market_scan',
    gap_from_high_pct: -7.4,
  }), null)
})

test('T2 to T1 promotion and a ten-point score jump are material changes', async () => {
  const helpers = await loadHelpers()
  const classify = helpers.classifyResearchChange as (previous: unknown, current: unknown) => { kind: string; immediate: boolean; scoreDelta: number | null }

  assert.deepEqual(classify({ verdict: 'pass_tier2', composite_score: 62 }, {
    ticker: 'CEG',
    company_name: 'Constellation Energy',
    verdict: 'pass_tier1',
    composite_score: 68,
    source: 'market_scan',
    gap_from_high_pct: null,
  }), { kind: 'promoted_tier1', immediate: true, scoreDelta: 6 })

  assert.deepEqual(classify({ verdict: 'pass_tier2', composite_score: 50 }, {
    ticker: 'ASTS',
    company_name: 'AST SpaceMobile',
    verdict: 'pass_tier2',
    composite_score: 61,
    source: 'market_scan',
    gap_from_high_pct: null,
  }), { kind: 'score_jump', immediate: true, scoreDelta: 11 })
})

test('a new T2 is batched and cross-source confirmation is immediate', async () => {
  const helpers = await loadHelpers()
  const classify = helpers.classifyResearchChange as (previous: unknown, current: unknown) => unknown

  assert.deepEqual(classify(null, {
    ticker: 'APLD',
    company_name: 'Applied Digital',
    verdict: 'pass_tier2',
    composite_score: 60,
    source: 'market_scan',
    gap_from_high_pct: null,
  }), { kind: 'new_tier2', immediate: false, scoreDelta: null })

  assert.deepEqual(classify({ verdict: 'pass_tier2', composite_score: 60, source: 'valuechain' }, {
    ticker: 'APLD',
    company_name: 'Applied Digital',
    verdict: 'pass_tier2',
    composite_score: 61,
    source: 'cross_signal',
    gap_from_high_pct: null,
  }), { kind: 'cross_signal', immediate: true, scoreDelta: 1 })
})
