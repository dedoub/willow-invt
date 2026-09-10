alter table public.willow_mgmt_schedules
  add column if not exists source_key text;

create unique index if not exists willow_mgmt_schedules_source_key_key
  on public.willow_mgmt_schedules (source_key);

comment on column public.willow_mgmt_schedules.source_key is
  '외부 원장에서 자동 생성한 일정의 멱등 식별자. 수기 일정은 null.';
