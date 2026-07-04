-- Workstation context layer
-- cross-project 진행중 스레드 / 세션로그 / 결정 / 이메일 연결을 담는 운영 맥락 평면.
-- knowledge_entities(온톨로지)와 entity_ids 배열로 연결한다.
-- 접근은 service_role 전용 (MCP 서버 / telegram bot). anon 차단.

-- updated_at 자동 갱신 트리거 함수 (없으면 생성)
create or replace function public.ws_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── ws_threads: cross-project 진행중 논의 / 미결 ───
create table if not exists public.ws_threads (
  id uuid primary key default gen_random_uuid(),
  project text not null default 'global',
  title text not null,
  status text not null default 'open',        -- open | blocked | resolved | archived
  priority text not null default 'normal',    -- high | normal | low
  summary text,                               -- 현재 상태 한 줄
  entity_ids uuid[] not null default '{}',    -- knowledge_entities 연결
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_touched_at timestamptz not null default now()
);

create index if not exists ws_threads_status_idx on public.ws_threads (status);
create index if not exists ws_threads_project_idx on public.ws_threads (project);
create index if not exists ws_threads_touched_idx on public.ws_threads (last_touched_at desc);

drop trigger if exists ws_threads_updated_at on public.ws_threads;
create trigger ws_threads_updated_at
  before update on public.ws_threads
  for each row execute function public.ws_touch_updated_at();

-- ─── ws_thread_events: 스레드별 append 로그 ───
create table if not exists public.ws_thread_events (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.ws_threads(id) on delete cascade,
  project text not null default 'global',
  kind text not null default 'note',          -- progress | decision | blocker | note | email_ref | commit
  body text not null,
  ref jsonb not null default '{}',            -- {gmail_thread_id, url, commit_sha, session_id}
  author text,                                -- agent / session / human 식별
  created_at timestamptz not null default now()
);

create index if not exists ws_thread_events_thread_idx on public.ws_thread_events (thread_id, created_at desc);
create index if not exists ws_thread_events_kind_idx on public.ws_thread_events (kind);
create index if not exists ws_thread_events_project_idx on public.ws_thread_events (project);

-- ─── ws_sessions: 프로젝트 / 워크트리별 Claude 세션 요약 ───
create table if not exists public.ws_sessions (
  id uuid primary key default gen_random_uuid(),
  project text not null default 'global',
  worktree_path text,
  title text,
  summary text,
  highlights text[] not null default '{}',
  thread_ids uuid[] not null default '{}',    -- 이 세션이 건드린 스레드
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists ws_sessions_project_idx on public.ws_sessions (project, started_at desc);

-- ─── RLS: service_role 전용 ───
alter table public.ws_threads enable row level security;
alter table public.ws_thread_events enable row level security;
alter table public.ws_sessions enable row level security;

drop policy if exists "service_role all" on public.ws_threads;
create policy "service_role all" on public.ws_threads
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "service_role all" on public.ws_thread_events;
create policy "service_role all" on public.ws_thread_events
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "service_role all" on public.ws_sessions;
create policy "service_role all" on public.ws_sessions
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
