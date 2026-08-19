-- CODEF 은행 스크래핑 원본 거래내역 스테이징.
-- 분류(revenue/expense/asset/liability)는 사람이 판단해야 하므로 tensw_mgmt_cash에
-- 바로 넣지 않고 여기에 먼저 쌓은 뒤, 확정된 건만 cash_id로 연결한다.
create table if not exists public.tensw_codef_transactions (
  id uuid primary key default gen_random_uuid(),
  organization text not null,
  account text not null,                -- 숫자만 (CODEF 입력값)
  account_label text not null,          -- tensw_mgmt_cash.account_number 와 동일 표기
  tr_date date not null,
  tr_time time,
  amount_in numeric not null default 0,
  amount_out numeric not null default 0,
  balance_after numeric,
  desc1 text,                           -- 보낸분/받는분
  desc2 text,                           -- 거래구분
  desc3 text,                           -- 적요
  desc4 text,                           -- 거래점
  raw jsonb not null default '{}'::jsonb,
  fingerprint text not null,
  status text not null default 'new',   -- new | classified | ignored
  cash_id uuid references public.tensw_mgmt_cash(id) on delete set null,
  synced_at timestamptz not null default now()
);

create unique index if not exists tensw_codef_transactions_fingerprint_key
  on public.tensw_codef_transactions (fingerprint);

create index if not exists tensw_codef_transactions_status_date_idx
  on public.tensw_codef_transactions (status, tr_date desc);

alter table public.tensw_codef_transactions enable row level security;
