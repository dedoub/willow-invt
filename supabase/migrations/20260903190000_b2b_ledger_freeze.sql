-- B2B 원장 최종 방어선 2종
--   (A) b2b_reconcile: 문서번호가 걸려 있는데 서류함에 그 문서가 없으면(dangling) 대사를 통과시키지 않는다.
--       기존 식은 status가 null이면 결과가 null이 되어 `if not v_documents_final`이 거짓이 되고
--       documents_not_final이 붙지 않았다. coalesce(..., false)로 막는다.
--   (B) 마감(closed) 정산 동결: closed 정산에 딸린 업무기록·산정·증빙은 수정·삭제할 수 없고,
--       closed 정산에 업무기록을 새로 붙일 수도 없다. closed 이후 허용되는 전이는 disputed 하나뿐이며,
--       disputed에서 closed로 돌아갈 때는 기존 close 가드(재대사)를 다시 통과해야 한다.
-- spec: docs/superpowers/specs/2026-09-03-b2b-service-ledger-design.md §5.5, §8

-- ─── (A) 대사 함수: documents_final을 coalesce로 감싼다 (나머지는 20260903170000과 동일) ───
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
  -- 문서번호가 서류함에 없으면 status가 null이라 식 전체가 null이 된다. false로 접어 dangling을 걸러낸다.
  v_documents_final := coalesce(
    v_settlement.confirmation_doc_no is not null
      and v_settlement.statement_doc_no is not null
      and v_confirmation_status = 'final'
      and v_statement_status = 'final',
    false
  );

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

-- ─── (B-1) 마감 정산에 딸린 행 동결 ───
create or replace function public.b2b_guard_frozen_work()
returns trigger
language plpgsql
as $$
declare
  v_settlement_id uuid;
  v_status        text;
  v_ref           text;
begin
  if tg_table_name = 'b2b_work_records' then
    v_settlement_id := old.settlement_id;
  else
    select w.settlement_id into v_settlement_id
    from public.b2b_work_records w where w.id = old.work_record_id;
  end if;

  if v_settlement_id is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select status, ref_no into v_status, v_ref
  from public.b2b_settlements where id = v_settlement_id;

  if v_status = 'closed' then
    -- updated_at만 바뀌는 업데이트(touch 트리거)는 통과시킨다.
    if tg_op = 'UPDATE'
       and tg_table_name = 'b2b_work_records'
       and (to_jsonb(old) - 'updated_at') = (to_jsonb(new) - 'updated_at') then
      return new;
    end if;
    raise exception '% belongs to closed settlement %', tg_table_name, v_ref;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists b2b_pricings_freeze on public.b2b_pricings;
create trigger b2b_pricings_freeze
  before update or delete on public.b2b_pricings
  for each row execute function public.b2b_guard_frozen_work();

drop trigger if exists b2b_work_evidence_freeze on public.b2b_work_evidence;
create trigger b2b_work_evidence_freeze
  before update or delete on public.b2b_work_evidence
  for each row execute function public.b2b_guard_frozen_work();

drop trigger if exists b2b_work_records_freeze on public.b2b_work_records;
create trigger b2b_work_records_freeze
  before update or delete on public.b2b_work_records
  for each row execute function public.b2b_guard_frozen_work();

-- ─── (B-2) 업무기록 부착 가드: 마감 정산으로 새로 붙이는 것도 막는다 (insert 포함) ───
create or replace function public.b2b_guard_work_attach()
returns trigger
language plpgsql
as $$
declare
  v_old_settlement_id     uuid;
  v_old_settlement_status text;
  v_new_settlement_status text;
  v_new_settlement_ref    text;
  v_settlement_agreement  uuid;
begin
  if tg_op = 'UPDATE' then
    v_old_settlement_id := old.settlement_id;
  end if;

  if v_old_settlement_id is not null and new.settlement_id is distinct from v_old_settlement_id then
    select status into v_old_settlement_status from public.b2b_settlements where id = v_old_settlement_id;
    if v_old_settlement_status = 'closed' then
      raise exception 'work % is attached to closed settlement', old.ref_no;
    end if;
  end if;

  if new.settlement_id is not null then
    select agreement_id, status, ref_no
      into v_settlement_agreement, v_new_settlement_status, v_new_settlement_ref
    from public.b2b_settlements where id = new.settlement_id;
    if v_settlement_agreement is distinct from new.agreement_id then
      raise exception 'work % agreement mismatch', new.ref_no;
    end if;
    if new.settlement_id is distinct from v_old_settlement_id and v_new_settlement_status = 'closed' then
      raise exception 'settlement % is closed', v_new_settlement_ref;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists b2b_work_records_attach_guard on public.b2b_work_records;
create trigger b2b_work_records_attach_guard
  before insert or update on public.b2b_work_records
  for each row execute function public.b2b_guard_work_attach();

-- ─── (B-3) 마감 이후 허용 전이는 disputed 하나뿐 ───
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
    if new.status not in ('closed', 'disputed') then
      raise exception 'b2b_settlements %: closed settlement can only move to disputed (got %)', old.ref_no, new.status;
    end if;
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
