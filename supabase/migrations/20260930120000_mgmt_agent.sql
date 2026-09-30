-- 경영관리 에이전트: 일정 원장 칸 + 규칙·기록부·결정함·커서
do $$ declare t text; begin
  foreach t in array array['tensw_mgmt_schedules','willow_mgmt_schedules'] loop
    execute format('alter table %I add column if not exists origin text', t);
    execute format('alter table %I add column if not exists recipe text', t);
    execute format('alter table %I add column if not exists agent_state text', t);
    execute format($f$alter table %I add column if not exists evidence jsonb not null default '[]'::jsonb$f$, t);
    execute format('alter table %I add column if not exists rule_id uuid', t);
    execute format('create unique index if not exists %I on %I (source_key) where source_key is not null', t || '_source_key_uq', t);
  end loop;
end $$;

create table if not exists mgmt_rules (
  id uuid primary key default gen_random_uuid(),
  company text not null check (company in ('tensw','willow')),
  task_key text not null,
  title text not null,
  rule jsonb not null,            -- {kind:'monthly_day'|'month_end'|'quarterly_day'|'yearly_date', day, months, shift:'prev'|'next'}
  lead_days int not null default 0,
  step text not null default 'do',
  recipe text,
  completion jsonb,               -- {kind:'tax', types:[...]} | {kind:'sent_mail', to, subject} | {kind:'cash', counterparty, direction}
  adopt_prefix text,              -- 같은 날 이 접두사 source_key 행이 있으면 새로 만들지 않고 그 행을 쓴다
  origin text not null default 'seed' check (origin in ('seed','inferred','manual')),
  confidence numeric,
  evidence jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company, task_key, step)
);

create table if not exists mgmt_cases (
  id uuid primary key default gen_random_uuid(),
  company text not null check (company in ('tensw','willow')),
  name text not null,
  counterparty text,
  stage text,
  status text not null default 'open' check (status in ('open','closed')),
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company, name)
);

create table if not exists mgmt_entries (
  id uuid primary key default gen_random_uuid(),
  company text not null check (company in ('tensw','willow')),
  case_id uuid references mgmt_cases(id),
  kind text not null check (kind in ('decision','todo','material','daily','security')),
  body text not null,
  actor text,
  assignee text,
  due_date date,
  done_at timestamptz,
  schedule_key text,
  source text not null,           -- 'chat' | 'mail'
  source_ref text not null,       -- spaces/…/messages/… 또는 gmail id
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (kind, source_ref, body)
);

create table if not exists mgmt_decisions (
  id uuid primary key default gen_random_uuid(),
  company text not null check (company in ('tensw','willow')),
  kind text not null,             -- send_approval | money | scope | attendee | classify | missed | security | rule_review
  subject_key text not null,      -- 같은 판단을 다시 묻지 않기 위한 키(거래처·성격·레시피)
  question text not null,
  options jsonb not null,         -- [{id,label}]
  recommended text,
  schedule_key text,
  refs jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open','sent','answered','expired')),
  answer text,
  answered_at timestamptz,
  telegram_message_id bigint,
  created_at timestamptz not null default now()
);
create unique index if not exists mgmt_decisions_open_uq on mgmt_decisions (subject_key) where status in ('open','sent');

create table if not exists mgmt_cursors (
  source text primary key,        -- 'mail:tensw' | 'mail:willow' | 'chat:spaces/AAA'
  last_seen_at timestamptz not null,
  last_ref text,
  updated_at timestamptz not null default now()
);

alter table mgmt_rules enable row level security;
alter table mgmt_cases enable row level security;
alter table mgmt_entries enable row level security;
alter table mgmt_decisions enable row level security;
alter table mgmt_cursors enable row level security;
