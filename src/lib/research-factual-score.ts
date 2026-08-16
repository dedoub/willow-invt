export interface ResearchFactualMetrics {
  revenueGrowthPct: number | null
  profitMarginPct: number | null
  debtToEquity: number | null
  trailingPE: number | null
  priceToSales: number | null
  gapFromHighPct: number | null
  changePct: number | null
}

export interface ResearchDimensionScores {
  growth: number | null
  quality: number | null
  momentum: number | null
  value: number | null
  sentiment: number | null
  insider: number | null
}

const SCORE_WEIGHTS: Record<keyof ResearchDimensionScores, number> = {
  growth: 25,
  quality: 20,
  momentum: 20,
  value: 15,
  sentiment: 10,
  insider: 10,
}

function average(values: Array<number | null>): number | null {
  const available = values.filter((value): value is number => value != null && Number.isFinite(value))
  if (available.length === 0) return null
  return Math.round(available.reduce((sum, value) => sum + value, 0) / available.length)
}

function scoreGrowth(value: number | null): number | null {
  if (value == null) return null
  if (value >= 30) return 90
  if (value >= 15) return 75
  if (value >= 5) return 60
  if (value >= 0) return 50
  return 30
}

function scoreMargin(value: number | null): number | null {
  if (value == null) return null
  if (value >= 20) return 85
  if (value >= 10) return 70
  if (value >= 0) return 55
  return 30
}

function scoreDebt(value: number | null): number | null {
  if (value == null) return null
  if (value <= 50) return 80
  if (value <= 100) return 65
  if (value <= 200) return 50
  return 30
}

function scoreHighGap(value: number | null): number | null {
  if (value == null) return null
  if (value >= -3) return 90
  if (value >= -10) return 75
  if (value >= -20) return 60
  if (value >= -35) return 45
  return 25
}

function scoreDailyChange(value: number | null): number | null {
  if (value == null) return null
  return Math.round(Math.max(20, Math.min(80, 50 + value * 5)))
}

function scorePE(value: number | null): number | null {
  if (value == null || value <= 0) return null
  if (value <= 15) return 85
  if (value <= 25) return 70
  if (value <= 40) return 55
  return 35
}

function scorePriceToSales(value: number | null): number | null {
  if (value == null || value <= 0) return null
  if (value <= 3) return 80
  if (value <= 8) return 65
  if (value <= 15) return 50
  return 30
}

export function calculateFactualScores(metrics: ResearchFactualMetrics) {
  return {
    growth: scoreGrowth(metrics.revenueGrowthPct),
    quality: average([scoreMargin(metrics.profitMarginPct), scoreDebt(metrics.debtToEquity)]),
    momentum: average([scoreHighGap(metrics.gapFromHighPct), scoreDailyChange(metrics.changePct)]),
    value: average([scorePE(metrics.trailingPE), scorePriceToSales(metrics.priceToSales)]),
  }
}

export function calculateResearchScore({
  scores,
  evidenceSourceCount,
}: {
  scores: ResearchDimensionScores
  evidenceSourceCount: number
}) {
  const available = Object.entries(scores).filter((entry): entry is [keyof ResearchDimensionScores, number] => entry[1] != null)
  if (available.length < 4) {
    return { compositeScore: null, verdict: 'unscored' as const, confidence: 'low' as const }
  }

  const weightedTotal = available.reduce((sum, [key, value]) => sum + value * SCORE_WEIGHTS[key], 0)
  const availableWeight = available.reduce((sum, [key]) => sum + SCORE_WEIGHTS[key], 0)
  const compositeScore = Math.round(weightedTotal / availableWeight)
  const qualifiesForTier1 = compositeScore >= 65 && available.length >= 5 && evidenceSourceCount >= 2
  const verdict = qualifiesForTier1
    ? 'pass_tier1'
    : compositeScore >= 50
      ? 'pass_tier2'
      : 'fail'
  const confidence = available.length >= 5 && evidenceSourceCount >= 2 ? 'high' : 'medium'

  return { compositeScore, verdict, confidence }
}
