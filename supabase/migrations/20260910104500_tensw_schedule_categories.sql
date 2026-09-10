alter table public.tensw_mgmt_schedules
  add column if not exists category text,
  add column if not exists source_key text;

update public.tensw_mgmt_schedules
set category = case
  when title ~ '(세금계산서|급여|부가세|부가가치세|법인세|소득세|지방세|원천징수|국세|세금|4대보험|국민연금|건강보험|고용보험|산재보험|법인카드|카드.*(대금|결제)|대출.*이자|대여금.*이자|수금)'
    then 'finance'
  else 'other'
end
where category is null;

alter table public.tensw_mgmt_schedules
  alter column category set default 'other',
  alter column category set not null;

alter table public.tensw_mgmt_schedules
  drop constraint if exists tensw_mgmt_schedules_category_check;

alter table public.tensw_mgmt_schedules
  add constraint tensw_mgmt_schedules_category_check
  check (category in ('finance', 'other'));

create unique index if not exists tensw_mgmt_schedules_source_key_uidx
  on public.tensw_mgmt_schedules (source_key)
  where source_key is not null;

comment on column public.tensw_mgmt_schedules.category is '일정 탭 분류: finance 또는 other';
comment on column public.tensw_mgmt_schedules.source_key is '재무 원본과 일정을 멱등 연결하는 키';
