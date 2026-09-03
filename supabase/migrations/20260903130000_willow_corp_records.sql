-- 법인 서류함 (Corporate Records, System of Record)
-- spec: docs/superpowers/specs/2026-09-03-corp-records-design.md §5

-- ─── 시퀀스 (ref_no / doc_no) ───
create table if not exists public.willow_corp_sequences (
  company text not null,
  kind    text not null check (kind in ('decision', 'document')),
  year    int  not null,
  last    int  not null default 0,
  primary key (company, kind, year)
);

create or replace function public.willow_corp_next_ref_no(p_company text, p_kind text, p_year int)
returns text
language plpgsql
as $$
declare
  v_seq int;
  v_seq_text text;
  v_prefix text;
begin
  v_prefix := case p_company when 'willow' then 'WI' when 'tensw' then 'TS' else null end;
  if v_prefix is null then raise exception 'unknown company: %', p_company; end if;
  if p_kind not in ('decision', 'document') then raise exception 'unknown kind: %', p_kind; end if;
  insert into public.willow_corp_sequences (company, kind, year, last)
  values (p_company, p_kind, p_year, 1)
  on conflict (company, kind, year) do update set last = public.willow_corp_sequences.last + 1
  returning last into v_seq;
  v_seq_text := case when v_seq < 1000 then lpad(v_seq::text, 3, '0') else v_seq::text end;
  return case p_kind
    when 'document' then format('%s-DOC-%s-%s', v_prefix, p_year, v_seq_text)
    else format('%s-%s-%s', v_prefix, p_year, v_seq_text)
  end;
end;
$$;

-- ─── 문서 ───
create table if not exists public.willow_corp_documents (
  id                 uuid primary key default gen_random_uuid(),
  company            text not null default 'willow',
  doc_no             text not null unique,
  decision_id        uuid,                       -- fk 추가는 decisions 생성 후
  doc_type           text not null,
  category           text not null default 'other',
  title              text not null,
  status             text not null default 'draft' check (status in ('draft', 'final')),
  current_version_id uuid,
  issued_by          text,
  issued_at          date,
  valid_from         date,
  valid_to           date,
  counterparty       text,
  contract_start     date,
  contract_end       date,
  tags               text[] not null default '{}',
  source_key         text unique,                -- 시드 idempotency
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.willow_corp_document_versions (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.willow_corp_documents(id),
  version_no   int  not null,
  kind         text not null check (kind in ('draft', 'final_signed', 'reissue')),
  storage_path text not null unique,
  mime         text not null,
  size_bytes   bigint not null,
  sha256       text not null,
  content_text text,
  generated_by text not null default 'upload' check (generated_by in ('agent', 'upload')),
  note         text,
  created_by   text,
  created_at   timestamptz not null default now(),
  unique (document_id, version_no),
  unique (document_id, sha256)
);

alter table public.willow_corp_documents
  add constraint willow_corp_documents_current_version_fk
  foreign key (current_version_id) references public.willow_corp_document_versions(id);

-- ─── 규정 ───
create table if not exists public.willow_corp_rules (
  id                     uuid primary key default gen_random_uuid(),
  company                text not null default 'willow',
  rule_type              text not null check (rule_type in ('articles', 'retirement_regulation', 'bonus_regulation', 'survivor_regulation', 'other')),
  title                  text not null,
  version_no             int  not null,
  effective_from         date not null,
  effective_to           date,
  parent_rule_id         uuid references public.willow_corp_rules(id),
  adopted_by_decision_id uuid,
  document_id            uuid references public.willow_corp_documents(id),
  content_text           text not null,
  articles               jsonb not null default '[]',
  note                   text,
  source_key             text unique,
  created_at             timestamptz not null default now(),
  unique (company, rule_type, version_no),
  check (effective_to is null or effective_to >= effective_from)
);

create or replace function public.willow_corp_rules_effective_at(p_company text, p_at date)
returns setof public.willow_corp_rules
language sql
stable
as $$
  select * from public.willow_corp_rules
  where company = p_company
    and effective_from <= p_at
    and (effective_to is null or effective_to >= p_at)
  order by rule_type, version_no desc;
$$;

-- ─── 의사결정 ───
create table if not exists public.willow_corp_decisions (
  id             uuid primary key default gen_random_uuid(),
  company        text not null default 'willow',
  ref_no         text not null unique,
  category       text not null,
  title          text not null,
  request_text   text,
  summary        text,
  decision_date  date,
  effective_from date,
  effective_to   date,
  amount         numeric,
  currency       text not null default 'KRW',
  parties        jsonb not null default '[]',
  basis          jsonb not null default '[]',
  agent_plan     jsonb not null default '{}',
  status         text not null default 'draft' check (status in ('draft', 'awaiting_signature', 'finalized', 'superseded', 'void')),
  supersedes_id  uuid references public.willow_corp_decisions(id),
  finalized_at   timestamptz,
  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.willow_corp_documents
  add constraint willow_corp_documents_decision_fk
  foreign key (decision_id) references public.willow_corp_decisions(id);
alter table public.willow_corp_rules
  add constraint willow_corp_rules_adopted_by_fk
  foreign key (adopted_by_decision_id) references public.willow_corp_decisions(id);

-- ─── 회사 사실 스냅샷 ───
create table if not exists public.willow_corp_profiles (
  id                 uuid primary key default gen_random_uuid(),
  company            text not null default 'willow',
  as_of              date not null,
  source_document_id uuid references public.willow_corp_documents(id),
  facts              jsonb not null,
  source_key         text unique,
  created_at         timestamptz not null default now()
);

-- ─── 액션 (decision_id null = 상시 서류·프로필 기반 액션) ───
create table if not exists public.willow_corp_actions (
  id          uuid primary key default gen_random_uuid(),
  company     text not null default 'willow',
  decision_id uuid references public.willow_corp_decisions(id),
  document_id uuid references public.willow_corp_documents(id),
  kind        text not null check (kind in ('confirm', 'sign', 'provide')),
  description text not null,
  status      text not null default 'pending' check (status in ('pending', 'done', 'skipped')),
  due_at      date,
  done_at     timestamptz,
  result      jsonb,
  source_key  text unique,
  created_at  timestamptz not null default now()
);

-- ─── 링크 ───
create table if not exists public.willow_corp_links (
  id           uuid primary key default gen_random_uuid(),
  company      text not null default 'willow',
  decision_id  uuid references public.willow_corp_decisions(id),
  document_id  uuid references public.willow_corp_documents(id),
  target_table text not null,
  target_id    text not null,
  relation     text not null check (relation in ('basis_for', 'evidence_of')),
  created_at   timestamptz not null default now(),
  check (decision_id is not null or document_id is not null)
);

-- ─── 감사 이벤트 (해시 체인) ───
create table if not exists public.willow_corp_events (
  id          bigserial primary key,
  company     text not null default 'willow',
  entity_type text not null,
  entity_id   text not null,
  event       text not null,
  actor       text not null,
  payload     jsonb not null default '{}',
  prev_hash   text not null,
  hash        text not null unique,
  at          timestamptz not null default now()
);
create index if not exists willow_corp_events_company_idx on public.willow_corp_events (company, id);
create index if not exists willow_corp_events_entity_idx  on public.willow_corp_events (entity_type, entity_id);
create index if not exists willow_corp_documents_type_idx on public.willow_corp_documents (company, doc_type);
create index if not exists willow_corp_rules_effective_idx on public.willow_corp_rules (company, rule_type, effective_from);
create index if not exists willow_corp_actions_pending_idx on public.willow_corp_actions (company, status, due_at);

-- ─── 불변성 트리거 ───
create or replace function public.willow_corp_guard_version()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'willow_corp_document_versions: delete is not allowed (id=%)', old.id;
  end if;
  if old.kind in ('final_signed', 'reissue') then
    raise exception 'willow_corp_document_versions: version % of document % is immutable', old.version_no, old.document_id;
  end if;
  return new;
end;
$$;
drop trigger if exists willow_corp_document_versions_guard on public.willow_corp_document_versions;
create trigger willow_corp_document_versions_guard
  before update or delete on public.willow_corp_document_versions
  for each row execute function public.willow_corp_guard_version();

create or replace function public.willow_corp_guard_event()
returns trigger
language plpgsql
as $$
begin
  raise exception 'willow_corp_events: rows are append-only (id=%)', old.id;
end;
$$;
drop trigger if exists willow_corp_events_guard on public.willow_corp_events;
create trigger willow_corp_events_guard
  before update or delete on public.willow_corp_events
  for each row execute function public.willow_corp_guard_event();

create or replace function public.willow_corp_guard_decision()
returns trigger
language plpgsql
as $$
declare
  old_j jsonb;
  new_j jsonb;
begin
  if old.status = 'finalized' then
    if new.status not in ('finalized', 'superseded', 'void') then
      raise exception 'willow_corp_decisions %: finalized decision can only move to superseded/void', old.ref_no;
    end if;
    old_j := to_jsonb(old) - 'status' - 'supersedes_id' - 'updated_at';
    new_j := to_jsonb(new) - 'status' - 'supersedes_id' - 'updated_at';
    if old_j <> new_j then
      raise exception 'willow_corp_decisions %: finalized decision is immutable', old.ref_no;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists willow_corp_decisions_guard on public.willow_corp_decisions;
create trigger willow_corp_decisions_guard
  before update on public.willow_corp_decisions
  for each row execute function public.willow_corp_guard_decision();

create or replace function public.willow_corp_guard_rule()
returns trigger
language plpgsql
as $$
declare
  old_j jsonb;
  new_j jsonb;
begin
  if tg_op = 'DELETE' then
    raise exception 'willow_corp_rules: delete is not allowed (%)', old.id;
  end if;
  old_j := to_jsonb(old) - 'effective_to' - 'adopted_by_decision_id' - 'document_id';
  new_j := to_jsonb(new) - 'effective_to' - 'adopted_by_decision_id' - 'document_id';
  if old_j <> new_j then
    raise exception 'willow_corp_rules %: only effective_to/adopted_by_decision_id/document_id may change', old.id;
  end if;
  return new;
end;
$$;
drop trigger if exists willow_corp_rules_guard on public.willow_corp_rules;
create trigger willow_corp_rules_guard
  before update or delete on public.willow_corp_rules
  for each row execute function public.willow_corp_guard_rule();

create or replace function public.willow_corp_touch_document()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists willow_corp_documents_touch on public.willow_corp_documents;
create trigger willow_corp_documents_touch
  before update on public.willow_corp_documents
  for each row execute function public.willow_corp_touch_document();

-- ─── RLS: service_role 전용 ───
alter table public.willow_corp_sequences         enable row level security;
alter table public.willow_corp_documents         enable row level security;
alter table public.willow_corp_document_versions enable row level security;
alter table public.willow_corp_rules             enable row level security;
alter table public.willow_corp_decisions         enable row level security;
alter table public.willow_corp_profiles          enable row level security;
alter table public.willow_corp_actions           enable row level security;
alter table public.willow_corp_links             enable row level security;
alter table public.willow_corp_events            enable row level security;

do $$
declare t text;
begin
  foreach t in array array['willow_corp_sequences','willow_corp_documents','willow_corp_document_versions','willow_corp_rules','willow_corp_decisions','willow_corp_profiles','willow_corp_actions','willow_corp_links','willow_corp_events'] loop
    execute format('drop policy if exists "service_role all" on public.%I', t);
    execute format('create policy "service_role all" on public.%I for all to service_role using (true) with check (true)', t);
  end loop;
end $$;
