-- AI 비서가 통화 중 MCP 도구 save_call_memo 로 남긴 메모. 통화 ID가 오지 않아 웹훅이 통화 시간대로 짝짓는다.
create table if not exists public.tensw_phone_memos (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  caller_name text,
  caller_org text,
  callback_number text,
  purpose text,
  urgent boolean,
  category text,
  raw jsonb
);
create index if not exists tensw_phone_memos_created_idx on public.tensw_phone_memos (created_at desc);
alter table public.tensw_phone_memos enable row level security;
