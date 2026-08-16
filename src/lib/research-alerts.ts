export type ResearchVerdict = 'pass_tier1' | 'pass_tier2' | 'fail' | 'unscored'

export interface ResearchSnapshot {
  ticker?: string
  company_name?: string
  verdict: string | null
  composite_score: number | null
  source?: string | null
  gap_from_high_pct?: number | null
}

export type ResearchChangeKind =
  | 'new_tier1'
  | 'new_tier2'
  | 'promoted_tier1'
  | 'score_jump'
  | 'cross_signal'

export interface ResearchChange {
  kind: ResearchChangeKind
  immediate: boolean
  scoreDelta: number | null
}

export function deriveResearchVerdict(compositeScore: number | null): ResearchVerdict {
  if (compositeScore == null) return 'unscored'
  if (compositeScore >= 65) return 'pass_tier1'
  if (compositeScore >= 50) return 'pass_tier2'
  return 'fail'
}

export function classifyResearchChange(
  previous: ResearchSnapshot | null,
  current: ResearchSnapshot,
): ResearchChange | null {
  const scoreDelta = previous?.composite_score != null && current.composite_score != null
    ? current.composite_score - previous.composite_score
    : null

  if (!previous) {
    if (current.verdict === 'pass_tier1') return { kind: 'new_tier1', immediate: true, scoreDelta: null }
    if (current.verdict === 'pass_tier2') return { kind: 'new_tier2', immediate: false, scoreDelta: null }
    return null
  }

  if (current.source === 'cross_signal' && previous.source !== 'cross_signal') {
    return { kind: 'cross_signal', immediate: true, scoreDelta }
  }
  if (previous.verdict !== 'pass_tier1' && current.verdict === 'pass_tier1') {
    return { kind: 'promoted_tier1', immediate: true, scoreDelta }
  }
  if (scoreDelta != null && scoreDelta >= 10) {
    return { kind: 'score_jump', immediate: true, scoreDelta }
  }
  return null
}
