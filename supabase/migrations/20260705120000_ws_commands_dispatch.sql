-- 워크스테이션 명령 버스: 윌리(인바운드) → 로컬 디스패처(codex exec) → 결과 보고
-- 한 fan-out은 batch_id로 묶이고, 대상 프로젝트마다 한 행.
create table if not exists public.ws_commands (
  id             uuid primary key default gen_random_uuid(),
  batch_id       uuid not null default gen_random_uuid(),
  source         text not null default 'telegram',
  source_chat_id bigint,                       -- 결과 보고용 텔레그램 chat id
  project        text not null,                -- 프로젝트 키 (willow-invt, valuechain-wiki, ...)
  cwd            text not null,                -- 로컬 레포 경로 (디스패처가 codex 실행할 cwd)
  instruction    text not null,                -- 실행할 지시
  status         text not null default 'pending', -- pending|running|done|failed|skipped
  result         text,                         -- codex 최종 출력 요약
  error          text,
  created_by     text,                         -- 지시 주체(윌리/CEO)
  created_at     timestamptz not null default now(),
  started_at     timestamptz,
  finished_at    timestamptz
);

create index if not exists ws_commands_status_idx on public.ws_commands (status, created_at);
create index if not exists ws_commands_batch_idx  on public.ws_commands (batch_id);

-- RLS: service_role 전용 (ws_* 평면과 동일, 서비스키는 RLS 우회)
alter table public.ws_commands enable row level security;
