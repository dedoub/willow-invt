create table if not exists public.stock_research_scan_history (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  scan_date date not null,
  scanned_at timestamptz not null default now(),
  source_type text not null check (source_type in ('valuechain', 'smallcap')),
  source text,
  previous_verdict text,
  current_verdict text,
  previous_composite_score numeric,
  current_composite_score numeric,
  change_kind text,
  snapshot jsonb not null default '{}'::jsonb
);

create index if not exists stock_research_scan_history_ticker_scanned_at_idx
  on public.stock_research_scan_history (ticker, scanned_at desc);

create index if not exists stock_research_scan_history_scan_date_idx
  on public.stock_research_scan_history (scan_date desc);

alter table public.stock_research_scan_history enable row level security;

comment on table public.stock_research_scan_history is
  'Append-only research scan snapshots used for tier and score change detection.';
