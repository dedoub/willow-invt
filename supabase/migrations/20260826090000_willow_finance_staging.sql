-- 윌로우인베스트먼트 로컬 재무 수집 스테이징.
-- 텐소프트웍스의 tensw_codef_* 와 같은 역할이지만, 윌로우는 CODEF 폐기(2026-08-25)
-- 이후에 배선했으므로 담는 내용으로 이름을 붙였다.
--
-- 수집 경로: 홈택스(세금계산서·국세) · 신한은행(계좌) · KB카드(승인·명세서) ·
-- 위택스(지방세) · 사회보험통합징수포털(4대보험).
-- 국세·지방세·4대보험은 회사 공통 원장 finance_tax_obligations 로 들어가므로
-- 여기에는 계좌·세금계산서·카드만 둔다.

-- 은행 거래내역. 분류(revenue/expense/asset/liability)는 사람이 판단하므로
-- willow_mgmt_cash 에 바로 넣지 않고 여기 쌓은 뒤 확정된 건만 cash_id 로 연결한다.
create table if not exists public.willow_finance_transactions (
  id uuid primary key default gen_random_uuid(),
  organization text not null,
  account text not null,                -- 숫자만
  account_label text not null,          -- willow_mgmt_cash.account_number 와 동일 표기
  tr_date date not null,
  tr_time time,
  amount_in numeric not null default 0,
  amount_out numeric not null default 0,
  balance_after numeric,
  desc1 text,
  desc2 text,
  desc3 text,
  desc4 text,
  raw jsonb not null default '{}'::jsonb,
  fingerprint text not null,
  status text not null default 'new',   -- new | classified | ignored
  cash_id uuid references public.willow_mgmt_cash(id) on delete set null,
  synced_at timestamptz not null default now()
);

create unique index if not exists willow_finance_transactions_fingerprint_key
  on public.willow_finance_transactions (fingerprint);

create index if not exists willow_finance_transactions_status_date_idx
  on public.willow_finance_transactions (status, tr_date desc);

alter table public.willow_finance_transactions enable row level security;

-- 홈택스 전자세금계산서. 윌로우는 아직 매출관리 화면이 없어 승격 대상 테이블이
-- 없으므로 텐소와 달리 sales_id 를 두지 않는다. 화면이 생기면 그때 추가한다.
create table if not exists public.willow_finance_tax_invoices (
  id uuid primary key default gen_random_uuid(),
  transe_type text not null,             -- sales | purchase
  approval_no text,
  reporting_date date not null,          -- 작성일자
  issue_date date,
  send_date date,
  supplier_reg_number text,
  supplier_company text,
  contractor_reg_number text,
  contractor_company text,
  contractor_name text,
  supply_amount numeric not null default 0,
  tax_amount numeric not null default 0,
  total_amount numeric not null default 0,
  invoice_kind text,
  issue_form text,
  receipt_or_charge text,
  rep_items text,
  note text,
  raw jsonb not null default '{}'::jsonb,
  fingerprint text not null,
  status text not null default 'new',    -- new | promoted | ignored
  synced_at timestamptz not null default now()
);

create unique index if not exists willow_finance_tax_invoices_fingerprint_key
  on public.willow_finance_tax_invoices (fingerprint);

create index if not exists willow_finance_tax_invoices_status_date_idx
  on public.willow_finance_tax_invoices (status, reporting_date desc);

alter table public.willow_finance_tax_invoices enable row level security;

-- KB 법인카드 승인내역. 카드로 자동이체되는 매입은 은행 출금이 없어 계산서와
-- 붙지 않으므로, 가맹점 사업자번호로 매입 계산서와 대응시킨다.
create table if not exists public.willow_finance_card_approvals (
  id uuid primary key default gen_random_uuid(),
  organization text not null,
  card_no text not null,              -- 마스킹됨
  used_date date not null,
  used_time time,
  store_name text,
  store_corp_no text,
  store_type text,
  amount numeric not null default 0,  -- 해외승인이면 외화 금액
  krw_amount numeric,                 -- 해외승인의 원화 청구액
  home_foreign_type text,             -- 1 국내, 2 해외
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
  synced_at timestamptz not null default now()
);

create unique index if not exists willow_finance_card_approvals_fingerprint_key
  on public.willow_finance_card_approvals (fingerprint);

create index if not exists willow_finance_card_approvals_date_idx
  on public.willow_finance_card_approvals (used_date desc);

create index if not exists willow_finance_card_approvals_store_idx
  on public.willow_finance_card_approvals (store_corp_no, amount);

alter table public.willow_finance_card_approvals enable row level security;

-- 카드 청구내역(이용대금명세서). 승인내역이 "언제 썼나"라면 이건 "언제 얼마가
-- 청구됐나"다. 할부·연회비·해외이용이 반영된 월별 청구액은 이쪽이 정본이다.
create table if not exists public.willow_finance_card_billing (
  id uuid primary key default gen_random_uuid(),
  organization text not null,
  billing_month text not null,          -- YYYYMM
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

create unique index if not exists willow_finance_card_billing_fingerprint_key
  on public.willow_finance_card_billing (fingerprint);

create index if not exists willow_finance_card_billing_month_idx
  on public.willow_finance_card_billing (billing_month desc);

alter table public.willow_finance_card_billing enable row level security;
