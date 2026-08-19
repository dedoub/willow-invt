-- 법인카드 청구내역(이용명세서).
-- 승인내역이 "언제 썼나"라면 이건 "언제 얼마가 청구됐나"다.
-- 할부·연회비·해외이용이 반영된 월별 사용액은 이쪽이 정본이다.
create table if not exists public.tensw_codef_card_billing (
  id uuid primary key default gen_random_uuid(),
  organization text not null,
  billing_month text not null,          -- YYYYMM 청구년월
  card_no text,
  payment_due_date date,
  total_amount numeric not null default 0,
  domestic_use numeric,
  overseas_use numeric,
  full_amount numeric,                  -- 일시불
  installment_amount numeric,           -- 할부
  cash_service numeric,
  annual_fee numeric,
  late_fee numeric,
  amount_outstanding numeric,           -- 전월 미결제
  payment_account text,
  department_name text,
  raw jsonb not null default '{}'::jsonb,
  fingerprint text not null,
  synced_at timestamptz not null default now()
);

create unique index if not exists tensw_codef_card_billing_fingerprint_key
  on public.tensw_codef_card_billing (fingerprint);

create index if not exists tensw_codef_card_billing_month_idx
  on public.tensw_codef_card_billing (billing_month desc);

alter table public.tensw_codef_card_billing enable row level security;
