alter table public.stock_research
  drop constraint if exists stock_research_verdict_check;

alter table public.stock_research
  add constraint stock_research_verdict_check
  check (verdict in ('pass_tier1', 'pass_tier2', 'fail', 'unscored'));
