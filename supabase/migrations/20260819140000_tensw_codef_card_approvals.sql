-- 법인카드 승인내역 원본.
-- 한전·KT·구글클라우드처럼 카드로 자동이체되는 매입은 은행 출금이 없어 계산서와 붙지 않는다.
-- 승인내역의 가맹점 사업자번호(store_corp_no)가 매입 계산서의 공급자 사업자번호와 대응된다.
create table if not exists public.tensw_codef_card_approvals (
  id uuid primary key default gen_random_uuid(),
  organization text not null,
  card_no text not null,              -- 마스킹됨 (1234********5678)
  used_date date not null,
  used_time time,
  store_name text,
  store_corp_no text,                 -- 가맹점 사업자번호
  store_type text,
  amount numeric not null default 0,
  vat numeric,
  payment_type text,                  -- 1 일시불, 2 할부
  installment_month text,
  approval_no text,
  payment_due_date date,
  cancel_yn text,                     -- 0 정상, 1 취소, 2 부분취소, 3 거절
  cancel_amount numeric,
  purchase_yn text,
  purchase_date date,
  raw jsonb not null default '{}'::jsonb,
  fingerprint text not null,
  sales_id uuid references public.tensw_mgmt_sales(id) on delete set null,
  synced_at timestamptz not null default now()
);

create unique index if not exists tensw_codef_card_approvals_fingerprint_key
  on public.tensw_codef_card_approvals (fingerprint);

create index if not exists tensw_codef_card_approvals_date_idx
  on public.tensw_codef_card_approvals (used_date desc);

create index if not exists tensw_codef_card_approvals_store_idx
  on public.tensw_codef_card_approvals (store_corp_no, amount);

alter table public.tensw_codef_card_approvals enable row level security;
