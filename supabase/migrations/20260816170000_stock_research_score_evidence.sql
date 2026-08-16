alter table public.stock_research
  add column if not exists score_confidence text
    check (score_confidence in ('low', 'medium', 'high')),
  add column if not exists evidence_source_count integer not null default 0
    check (evidence_source_count >= 0),
  add column if not exists factual_metrics jsonb;

comment on column public.stock_research.score_confidence is
  'Confidence gate derived from available score dimensions and independent evidence sources.';
comment on column public.stock_research.evidence_source_count is
  'Number of independent evidence sources used for the current research verdict.';
comment on column public.stock_research.factual_metrics is
  'Yahoo financial and price metrics used to cross-check deterministic score dimensions.';
