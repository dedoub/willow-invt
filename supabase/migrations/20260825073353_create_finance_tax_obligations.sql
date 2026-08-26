-- 홈택스·위택스·사회보험 고지를 회사별로 통합하는 지급의무 원장.
-- 실제 지출은 각 회사 cash 테이블이 단일 원장이므로 이 테이블은 지급상태와
-- 은행 거래 연결만 관리하고 별도의 expense 행을 만들지 않는다.
create table if not exists public.finance_tax_obligations (
  id uuid primary key default gen_random_uuid(),
  company text not null check (company in ('tensw', 'willow')),
  source text not null check (source in ('hometax', 'wetax', 'nhis')),
  obligation_type text not null check (obligation_type in (
    'national_tax', 'vat', 'local_tax', 'health_insurance', 'pension',
    'employment_insurance', 'industrial_accident', 'other'
  )),
  notice_number text,
  period_label text,
  title text not null,
  agency text not null,
  amount numeric not null check (amount >= 0),
  issued_date date,
  due_date date,
  status text not null default 'unpaid'
    check (status in ('unpaid', 'paid', 'overdue', 'cancelled')),
  paid_at date,
  matched_cash_id uuid,
  matched_cash_table text
    check (matched_cash_table in ('tensw_mgmt_cash', 'willow_mgmt_cash')),
  match_confidence text
    check (match_confidence in ('exact', 'manual')),
  source_payload jsonb not null default '{}'::jsonb,
  fingerprint text not null,
  collected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_tax_obligations_match_pair check (
    (matched_cash_id is null and matched_cash_table is null)
    or (matched_cash_id is not null and matched_cash_table is not null)
  )
);

create unique index if not exists finance_tax_obligations_fingerprint_key
  on public.finance_tax_obligations (company, source, fingerprint);

create index if not exists finance_tax_obligations_company_status_due_idx
  on public.finance_tax_obligations (company, status, due_date);

create index if not exists finance_tax_obligations_unmatched_amount_idx
  on public.finance_tax_obligations (company, amount, due_date)
  where status in ('unpaid', 'overdue') and matched_cash_id is null;

alter table public.finance_tax_obligations enable row level security;

revoke all on table public.finance_tax_obligations from anon, authenticated;
grant select, insert, update, delete on table public.finance_tax_obligations to service_role;

comment on table public.finance_tax_obligations is
  '회사별 홈택스·위택스·사회보험 고지와 은행 출금 지급 매칭 원장';
