-- 경영관리 에이전트 교훈 장부 (Task 16)
-- mgmt_lessons: 대표 교정·되돌림에서 배운 문장. judge 프롬프트에 "지난 교훈" 으로 들어간다.
-- mgmt_agent_writes: 에이전트가 원장 행을 마지막으로 쓴 값(snapshot). 다음 실행이 지금 값과 비교해 되돌림을 찾는다.
create table if not exists mgmt_lessons (
  id uuid primary key default gen_random_uuid(),
  company text check (company in ('tensw','willow')),   -- null = 양사 공통
  scope text not null check (scope in ('judge','rule','close','decision')),
  lesson text not null,
  example jsonb,                  -- {input, expected}
  source text not null check (source in ('ceo_correction','reverted','rule_reject','auto')),
  source_ref text,
  hits int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (scope, lesson)
);
create table if not exists mgmt_agent_writes (
  table_name text not null,
  row_id uuid not null,
  source_key text,
  snapshot jsonb not null,        -- {title, schedule_date, is_completed, agent_state}
  written_at timestamptz not null default now(),
  primary key (table_name, row_id)
);
alter table mgmt_lessons enable row level security;
alter table mgmt_agent_writes enable row level security;
