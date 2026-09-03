-- B2B 업무기록 재배정 방어: 정산에 붙은 업무기록을 다른 정산으로 옮기거나
-- 마감된 정산에서 떼는 UPDATE를 트리거 레벨에서도 막는다 (JS 가드의 최종 방어선).
-- spec: docs/superpowers/specs/2026-09-03-b2b-service-ledger-design.md §5

create or replace function public.b2b_guard_work_attach()
returns trigger
language plpgsql
as $$
declare
  v_old_settlement_status text;
  v_settlement_agreement  uuid;
begin
  if old.settlement_id is not null and new.settlement_id is distinct from old.settlement_id then
    select status into v_old_settlement_status from public.b2b_settlements where id = old.settlement_id;
    if v_old_settlement_status = 'closed' then
      raise exception 'work % is attached to closed settlement', old.ref_no;
    end if;
  end if;

  if new.settlement_id is not null then
    select agreement_id into v_settlement_agreement from public.b2b_settlements where id = new.settlement_id;
    if v_settlement_agreement is distinct from new.agreement_id then
      raise exception 'work % agreement mismatch', new.ref_no;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists b2b_work_records_attach_guard on public.b2b_work_records;
create trigger b2b_work_records_attach_guard
  before update on public.b2b_work_records
  for each row execute function public.b2b_guard_work_attach();
