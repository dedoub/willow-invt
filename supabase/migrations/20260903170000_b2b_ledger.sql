-- B2B 용역 거래 원장 (Inter-company Service Ledger), Phase 1 schema
-- spec: docs/superpowers/specs/2026-09-03-b2b-service-ledger-design.md §5
-- 법인 서류함(willow_corp_*) 위에 얹는 두 번째 System of Record. 시퀀스는 willow_corp_sequences를 공유한다.

-- ─── willow_corp_sequences.kind check 확장 (decision|document → + b2b_work|b2b_engagement|b2b_settlement) ───
do $$
declare v_conname text;
begin
  select conname into v_conname
  from pg_constraint
  where conrelid = 'public.willow_corp_sequences'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%kind%';
  if v_conname is not null then
    execute format('alter table public.willow_corp_sequences drop constraint %I', v_conname);
  end if;
end $$;

alter table public.willow_corp_sequences
  add constraint willow_corp_sequences_kind_check
  check (kind in ('decision', 'document', 'b2b_work', 'b2b_engagement', 'b2b_settlement'));

-- ─── ref_no 발급 ───
create or replace function public.b2b_next_ref_no(p_provider text, p_client text, p_kind text, p_year int)
returns text
language plpgsql
as $$
declare
  v_provider_initial text;
  v_client_initial   text;
  v_prefix            text;
  v_company            text;
  v_kind                text;
  v_seq                int;
  v_seq_text           text;
begin
  v_provider_initial := case p_provider when 'willow' then 'W' when 'tensw' then 'T' when 'biblo' then 'B' else null end;
  v_client_initial   := case p_client   when 'willow' then 'W' when 'tensw' then 'T' when 'biblo' then 'B' else null end;
  if v_provider_initial is null then raise exception 'unknown provider company: %', p_provider; end if;
  if v_client_initial is null then raise exception 'unknown client company: %', p_client; end if;
  if p_kind not in ('work', 'engagement', 'settlement') then raise exception 'unknown kind: %', p_kind; end if;

  v_prefix  := v_provider_initial || v_client_initial;
  v_company := p_provider || '>' || p_client;
  v_kind    := 'b2b_' || p_kind;

  insert into public.willow_corp_sequences (company, kind, year, last)
  values (v_company, v_kind, p_year, 1)
  on conflict (company, kind, year) do update set last = public.willow_corp_sequences.last + 1
  returning last into v_seq;
  v_seq_text := case when v_seq < 1000 then lpad(v_seq::text, 3, '0') else v_seq::text end;

  return case p_kind
    when 'engagement' then format('%s-E-%s-%s', v_prefix, p_year, v_seq_text)
    when 'settlement' then format('%s-S-%s-%s', v_prefix, p_year, v_seq_text)
    else format('%s-%s-%s', v_prefix, p_year, v_seq_text)
  end;
end;
$$;

-- ─── 기본 용역계약 ───
create table if not exists public.b2b_agreements (
  id                    uuid primary key default gen_random_uuid(),
  provider_company      text not null check (provider_company in ('willow', 'tensw', 'biblo')),
  client_company        text not null check (client_company in ('willow', 'tensw', 'biblo')),
  title                 text not null,
  scope                 jsonb not null default '[]',
  rate_card             jsonb not null default '[]',
  effective_from        date,
  effective_to          date,
  document_doc_no       text,
  approval_decision_ref text,
  status                text not null default 'draft' check (status in ('draft', 'active', 'terminated')),
  source_key            text unique,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ─── 프로젝트별 개별 약정 ───
create table if not exists public.b2b_engagements (
  id                 uuid primary key default gen_random_uuid(),
  ref_no             text not null unique,
  agreement_id       uuid not null references public.b2b_agreements(id),
  project_id         uuid references public.tensw_projects(id),
  client_contract_id uuid references public.tensw_project_contracts(id),
  provider_company   text not null check (provider_company in ('willow', 'tensw', 'biblo')),
  client_company     text not null check (client_company in ('willow', 'tensw', 'biblo')),
  role_scope         jsonb not null default '[]',
  fee_basis          text not null check (fee_basis in ('fixed', 'percent_of_contract', 'rate_card')),
  fee_percent        numeric,
  fee_amount         numeric,
  basis_text         text,
  billing_plan       jsonb not null default '[]',
  agreed_at          date,
  document_doc_no    text,
  status             text not null default 'draft' check (status in ('draft', 'active', 'completed', 'cancelled')),
  source_key         text unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists b2b_engagements_agreement_idx on public.b2b_engagements (agreement_id);

-- ─── 정산(청구) 단위 ─── (work_records보다 먼저 만든다: work_records.settlement_id가 여기를 참조)
create table if not exists public.b2b_settlements (
  id                    uuid primary key default gen_random_uuid(),
  ref_no                text not null unique,
  agreement_id          uuid not null references public.b2b_agreements(id),
  engagement_id         uuid references public.b2b_engagements(id),
  provider_company      text not null check (provider_company in ('willow', 'tensw', 'biblo')),
  client_company        text not null check (client_company in ('willow', 'tensw', 'biblo')),
  period_label          text,
  supply_amount         numeric not null default 0,
  vat_amount            numeric not null default 0,
  total_amount          numeric not null default 0,
  confirmation_doc_no   text,
  statement_doc_no      text,
  tax_invoice_willow_id uuid references public.willow_finance_tax_invoices(id),
  tax_invoice_tensw_id  uuid references public.tensw_codef_tax_invoices(id),
  cash_willow_ids       uuid[] not null default '{}',
  cash_tensw_ids        uuid[] not null default '{}',
  reconciliation        jsonb,
  status                text not null default 'open' check (status in ('open', 'evidence_drafted', 'confirmed', 'documents_ready', 'paid', 'closed', 'disputed')),
  opened_from           text check (opened_from in ('tax_invoice', 'work_records')),
  bundle_doc_no         text,
  source_key            text unique,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists b2b_settlements_engagement_idx on public.b2b_settlements (engagement_id);
create index if not exists b2b_settlements_status_idx on public.b2b_settlements (provider_company, client_company, status);

-- ─── 업무기록 ───
create table if not exists public.b2b_work_records (
  id               uuid primary key default gen_random_uuid(),
  ref_no           text not null unique,
  agreement_id     uuid not null references public.b2b_agreements(id),
  engagement_id    uuid references public.b2b_engagements(id),
  project_id       uuid references public.tensw_projects(id),
  provider_company text not null check (provider_company in ('willow', 'tensw', 'biblo')),
  client_company   text not null check (client_company in ('willow', 'tensw', 'biblo')),
  title            text not null,
  requested_at     date,
  period_from      date,
  period_to        date,
  request_text     text,
  performed_text   text,
  purpose          text,
  contacts         jsonb not null default '[]',
  status           text not null default 'draft' check (status in ('draft', 'confirmed', 'priced', 'settled')),
  settlement_id    uuid references public.b2b_settlements(id),
  source_key       text unique,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists b2b_work_records_settlement_idx on public.b2b_work_records (settlement_id);
create index if not exists b2b_work_records_engagement_idx on public.b2b_work_records (engagement_id);

-- ─── 산출물・업무 흔적 링크 ───
create table if not exists public.b2b_work_evidence (
  id               uuid primary key default gen_random_uuid(),
  work_record_id   uuid not null references public.b2b_work_records(id),
  provider_company text not null check (provider_company in ('willow', 'tensw', 'biblo')),
  client_company   text not null check (client_company in ('willow', 'tensw', 'biblo')),
  kind             text not null check (kind in ('todo', 'comment', 'wiki', 'email', 'file', 'commit', 'meeting', 'doc', 'other')),
  source_table     text,
  source_id        text,
  title            text,
  url              text,
  occurred_at      timestamptz,
  doc_no           text,
  source_key       text unique,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists b2b_work_evidence_work_idx on public.b2b_work_evidence (work_record_id);

-- ─── 용역대가 산정 ───
create table if not exists public.b2b_pricings (
  id               uuid primary key default gen_random_uuid(),
  work_record_id   uuid not null unique references public.b2b_work_records(id),
  provider_company text not null check (provider_company in ('willow', 'tensw', 'biblo')),
  client_company   text not null check (client_company in ('willow', 'tensw', 'biblo')),
  method           text not null check (method in ('rate_card', 'comparable', 'lump_sum')),
  factors          jsonb not null default '{}',
  basis_text       text not null check (btrim(basis_text) <> ''),
  computed_amount  numeric,
  agreed_amount    numeric not null,
  decided_at       date,
  decided_by       text,
  source_key       text unique,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ─── 대사 함수: 네 숫자의 일치를 계산한다 ───
create or replace function public.b2b_reconcile(p_settlement uuid)
returns jsonb
language plpgsql
as $$
declare
  v_settlement                 public.b2b_settlements%rowtype;
  v_work_sum                   numeric;
  v_invoice_provider_supply    numeric;
  v_invoice_client_supply      numeric;
  v_cash_provider_in           numeric;
  v_cash_client_out            numeric;
  v_engagement_fee             numeric;
  v_engagement_settled_before  numeric;
  v_engagement_remaining       numeric;
  v_confirmation_status        text;
  v_statement_status           text;
  v_documents_final            boolean;
  v_diffs                      text[] := '{}';
  v_ok                         boolean;
begin
  select * into v_settlement from public.b2b_settlements where id = p_settlement;
  if not found then
    raise exception 'b2b_reconcile: settlement % not found', p_settlement;
  end if;

  select coalesce(sum(p.agreed_amount), 0) into v_work_sum
  from public.b2b_pricings p
  join public.b2b_work_records w on w.id = p.work_record_id
  where w.settlement_id = p_settlement;

  select supply_amount into v_invoice_provider_supply
  from public.willow_finance_tax_invoices where id = v_settlement.tax_invoice_willow_id;

  select supply_amount into v_invoice_client_supply
  from public.tensw_codef_tax_invoices where id = v_settlement.tax_invoice_tensw_id;

  select coalesce(sum(amount), 0) into v_cash_provider_in
  from public.willow_mgmt_cash where id = any(v_settlement.cash_willow_ids);

  select abs(coalesce(sum(amount), 0)) into v_cash_client_out
  from public.tensw_mgmt_cash where id = any(v_settlement.cash_tensw_ids);

  if v_settlement.engagement_id is not null then
    select fee_amount into v_engagement_fee from public.b2b_engagements where id = v_settlement.engagement_id;
    select coalesce(sum(supply_amount), 0) into v_engagement_settled_before
    from public.b2b_settlements
    where engagement_id = v_settlement.engagement_id
      and id <> p_settlement
      and status in ('paid', 'closed');
  else
    v_engagement_fee := null;
    v_engagement_settled_before := 0;
  end if;
  v_engagement_remaining := case when v_engagement_fee is not null
    then v_engagement_fee - v_engagement_settled_before - v_settlement.supply_amount
    else null end;

  select status into v_confirmation_status from public.willow_corp_documents where doc_no = v_settlement.confirmation_doc_no;
  select status into v_statement_status from public.willow_corp_documents where doc_no = v_settlement.statement_doc_no;
  v_documents_final := v_settlement.confirmation_doc_no is not null
    and v_settlement.statement_doc_no is not null
    and v_confirmation_status = 'final'
    and v_statement_status = 'final';

  if v_work_sum is distinct from v_settlement.supply_amount then
    v_diffs := array_append(v_diffs, 'work_sum_mismatch');
  end if;

  if v_settlement.tax_invoice_willow_id is null then
    v_diffs := array_append(v_diffs, 'invoice_provider_missing');
  elsif v_invoice_provider_supply is distinct from v_settlement.supply_amount then
    v_diffs := array_append(v_diffs, 'invoice_provider_mismatch');
  end if;

  if v_settlement.tax_invoice_tensw_id is null then
    v_diffs := array_append(v_diffs, 'invoice_client_missing');
  elsif v_invoice_client_supply is distinct from v_settlement.supply_amount then
    v_diffs := array_append(v_diffs, 'invoice_client_mismatch');
  end if;

  if v_settlement.total_amount is distinct from (v_settlement.supply_amount + v_settlement.vat_amount) then
    v_diffs := array_append(v_diffs, 'total_mismatch');
  end if;

  if v_cash_provider_in is distinct from v_settlement.total_amount then
    v_diffs := array_append(v_diffs, 'cash_provider_mismatch');
  end if;

  if v_cash_client_out is distinct from v_settlement.total_amount then
    v_diffs := array_append(v_diffs, 'cash_client_mismatch');
  end if;

  if v_engagement_fee is not null and (v_engagement_settled_before + v_settlement.supply_amount) > v_engagement_fee then
    v_diffs := array_append(v_diffs, 'engagement_cap_exceeded');
  end if;

  if not v_documents_final then
    v_diffs := array_append(v_diffs, 'documents_not_final');
  end if;

  v_ok := (array_length(v_diffs, 1) is null);

  return jsonb_build_object(
    'ok', v_ok,
    'diffs', to_jsonb(v_diffs),
    'figures', jsonb_build_object(
      'work_sum', v_work_sum,
      'supply_amount', v_settlement.supply_amount,
      'vat_amount', v_settlement.vat_amount,
      'total_amount', v_settlement.total_amount,
      'invoice_provider_supply', v_invoice_provider_supply,
      'invoice_client_supply', v_invoice_client_supply,
      'cash_provider_in', v_cash_provider_in,
      'cash_client_out', v_cash_client_out,
      'engagement_fee', v_engagement_fee,
      'engagement_settled_before', v_engagement_settled_before,
      'engagement_remaining', v_engagement_remaining,
      'documents_final', v_documents_final
    )
  );
end;
$$;

-- ─── 정산 종료 가드: closed 전이는 대사 통과가 조건, closed 이후는 status/bundle_doc_no만 변경 가능 ───
create or replace function public.b2b_guard_settlement_close()
returns trigger
language plpgsql
as $$
declare
  v_result jsonb;
  old_j    jsonb;
  new_j    jsonb;
begin
  if new.status = 'closed' and old.status <> 'closed' then
    v_result := public.b2b_reconcile(new.id);
    if (v_result->>'ok') is distinct from 'true' then
      raise exception 'settlement % cannot close: %', old.ref_no, (v_result->'diffs')::text;
    end if;
    new.reconciliation := v_result;
  end if;

  if old.status = 'closed' then
    old_j := to_jsonb(old) - 'status' - 'bundle_doc_no' - 'updated_at';
    new_j := to_jsonb(new) - 'status' - 'bundle_doc_no' - 'updated_at';
    if old_j <> new_j then
      raise exception 'b2b_settlements %: closed settlement is immutable except status/bundle_doc_no', old.ref_no;
    end if;
  end if;

  return new;
end;
$$;
drop trigger if exists b2b_settlements_close_guard on public.b2b_settlements;
create trigger b2b_settlements_close_guard
  before update on public.b2b_settlements
  for each row execute function public.b2b_guard_settlement_close();

-- ─── updated_at 자동 갱신 (6테이블 공통) ───
create or replace function public.b2b_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['b2b_agreements', 'b2b_engagements', 'b2b_settlements', 'b2b_work_records', 'b2b_work_evidence', 'b2b_pricings'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.b2b_touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

-- ─── 서류함: counterparty_company (5.7) ───
alter table public.willow_corp_documents add column if not exists counterparty_company text;
create index if not exists willow_corp_documents_counterparty_company_idx on public.willow_corp_documents (counterparty_company);

-- ─── RLS: service_role 전용 ───
alter table public.b2b_agreements    enable row level security;
alter table public.b2b_engagements   enable row level security;
alter table public.b2b_settlements   enable row level security;
alter table public.b2b_work_records  enable row level security;
alter table public.b2b_work_evidence enable row level security;
alter table public.b2b_pricings      enable row level security;

do $$
declare t text;
begin
  foreach t in array array['b2b_agreements', 'b2b_engagements', 'b2b_settlements', 'b2b_work_records', 'b2b_work_evidence', 'b2b_pricings'] loop
    execute format('drop policy if exists "service_role all" on public.%I', t);
    execute format('create policy "service_role all" on public.%I for all to service_role using (true) with check (true)', t);
  end loop;
end $$;
