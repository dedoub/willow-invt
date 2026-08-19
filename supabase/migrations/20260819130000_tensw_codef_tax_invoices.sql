-- 홈택스 전자세금계산서 원본 스테이징.
-- tensw_mgmt_sales 는 수금상태·입금예정일 같은 운영 정보를 사람이 관리하므로
-- 자동 수집분은 여기 먼저 쌓고, 확인된 건만 sales_id 로 연결해 승격한다.
create table if not exists public.tensw_codef_tax_invoices (
  id uuid primary key default gen_random_uuid(),
  transe_type text not null,             -- sales | purchase
  approval_no text,                      -- 승인번호 (마스킹되어 올 수 있음)
  reporting_date date not null,          -- 작성일자
  issue_date date,                       -- 발급일자
  send_date date,                        -- 전송일자
  supplier_reg_number text,
  supplier_company text,
  contractor_reg_number text,
  contractor_company text,
  contractor_name text,
  supply_amount numeric not null default 0,
  tax_amount numeric not null default 0,
  total_amount numeric not null default 0,
  invoice_kind text,                     -- 일반/영세 등
  issue_form text,                       -- 발급형태
  receipt_or_charge text,                -- 영수/청구
  rep_items text,                        -- 대표품목
  note text,
  raw jsonb not null default '{}'::jsonb,
  fingerprint text not null,
  status text not null default 'new',    -- new | promoted | ignored
  sales_id uuid references public.tensw_mgmt_sales(id) on delete set null,
  synced_at timestamptz not null default now()
);

create unique index if not exists tensw_codef_tax_invoices_fingerprint_key
  on public.tensw_codef_tax_invoices (fingerprint);

create index if not exists tensw_codef_tax_invoices_status_date_idx
  on public.tensw_codef_tax_invoices (status, reporting_date desc);

alter table public.tensw_codef_tax_invoices enable row level security;
