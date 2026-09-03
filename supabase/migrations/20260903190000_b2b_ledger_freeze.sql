-- B2B 원장 최종 방어선
--   (A) b2b_reconcile: 문서번호가 걸려 있는데 서류함에 그 문서가 없으면(dangling) 대사를 통과시키지 않는다.
--       기존 식은 status가 null이면 결과가 null이 되어 `if not v_documents_final`이 거짓이 되고
--       documents_not_final이 붙지 않았다. coalesce(..., false)로 막는다.
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
