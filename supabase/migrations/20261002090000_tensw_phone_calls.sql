-- 회사 대표번호(02-563-1271)로 걸려와 AI 비서(ClawOps)가 받은 통화 기록.
-- 웹훅 → /api/phone/clawops 가 통화·요약·녹취를 ClawOps API 에서 다시 읽어 여기 쌓는다.
create table if not exists public.tensw_phone_calls (
  call_id text primary key,                 -- ClawOps CallId
  from_number text,
  to_number text,
  started_at timestamptz,
  duration_sec integer,
  status text,
  category text,                            -- 고객문의·기관·거래처·채용·광고·기타
  urgent boolean not null default false,
  needs_callback boolean not null default false,
  caller_name text,
  caller_org text,
  summary text,
  follow_ups jsonb not null default '[]',
  transcript text,
  transfer jsonb,
  raw jsonb,
  chat_notified_at timestamptz,
  schedule_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tensw_phone_calls_started_idx on public.tensw_phone_calls (started_at desc);
alter table public.tensw_phone_calls enable row level security;
-- 정책 없음: service_role(서버)만 읽고 쓴다.
