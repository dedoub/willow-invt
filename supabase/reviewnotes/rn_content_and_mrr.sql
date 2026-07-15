-- ============================================================================
-- ReviewNotes 콘텐츠/학습 카운트 + 유료 전환 시점 + MRR 스냅샷 (source of truth)
-- ----------------------------------------------------------------------------
-- 대상 프로젝트: review-notes (kumaqaizejnjrvfqhahu) — 메인 willow-invt DB 아님.
-- 원격 migration: rn_paid_users_and_content_stats_and_mrr_snapshots (2026-07-16)
-- 모든 raw 테이블은 RLS로 anon 차단 → 집계만 SECURITY DEFINER로 노출 (rn_traffic_stats 패턴).
-- 소비처: src/lib/reviewnotes-supabase.ts / src/app/api/reviewnotes/stats/route.ts
-- ============================================================================

-- 1) 유료 유저 전환 시점 — Subscription 최초 생성일, 수동 부여(구독 없음)는 가입일 폴백
create or replace function public.rn_paid_users()
returns table(user_id text, paid_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select u.id as user_id,
    coalesce((select min(s."createdAt") from "Subscription" s where s."userId" = u.id), u."createdAt") as paid_at
  from "User" u
  where u."subscriptionPlan" <> 'FREE' and u.role <> 'ADMIN' and u.email <> 'test@reviewnotes.app'
$$;
revoke all on function public.rn_paid_users() from public;
grant execute on function public.rn_paid_users() to anon, authenticated, service_role;

-- 2) 콘텐츠/학습 카운트 — 총계 + 오늘/7일 + 일별(daily, 스파크라인용) (KST).
--    studyResults.correct = 정답 수 (정답률 계산용)
create or replace function public.rn_content_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with kst as (
  select (now() at time zone 'Asia/Seoul')::date as today
),
-- 통계 제외: role=ADMIN + 스토어 심사용 test@reviewnotes.app (2026-07-16)
admins as (
  select id from "User" where role = 'ADMIN' or email = 'test@reviewnotes.app'
),
notes_v as (select * from "Note" where "userId" not in (select id from admins)),
problems_v as (select p.* from "Problem" p join notes_v n on n.id = p."noteId"),
sets_v as (select * from "ProblemSet" where "userId" not in (select id from admins)),
results_v as (select * from "StudyResult" where "userId" not in (select id from admins)),
snotes_v as (select sn.* from "StudyNote" sn)
select jsonb_build_object(
  'notes', (select jsonb_build_object(
    'total', count(*),
    'today', count(*) filter (where ("createdAt" at time zone 'Asia/Seoul')::date = (select today from kst)),
    'd7', count(*) filter (where ("createdAt" at time zone 'Asia/Seoul')::date >= (select today from kst) - 6),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('date', d, 'n', n) order by d), '[]'::jsonb)
      from (select ("createdAt" at time zone 'Asia/Seoul')::date as d, count(*) as n from notes_v group by 1) x)
  ) from notes_v),
  'problems', (select jsonb_build_object(
    'total', count(*),
    'today', count(*) filter (where ("createdAt" at time zone 'Asia/Seoul')::date = (select today from kst)),
    'd7', count(*) filter (where ("createdAt" at time zone 'Asia/Seoul')::date >= (select today from kst) - 6),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('date', d, 'n', n) order by d), '[]'::jsonb)
      from (select ("createdAt" at time zone 'Asia/Seoul')::date as d, count(*) as n from problems_v group by 1) x)
  ) from problems_v),
  'problemSets', (select jsonb_build_object(
    'total', count(*),
    'today', count(*) filter (where ("createdAt" at time zone 'Asia/Seoul')::date = (select today from kst)),
    'd7', count(*) filter (where ("createdAt" at time zone 'Asia/Seoul')::date >= (select today from kst) - 6),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('date', d, 'n', n) order by d), '[]'::jsonb)
      from (select ("createdAt" at time zone 'Asia/Seoul')::date as d, count(*) as n from sets_v group by 1) x)
  ) from sets_v),
  'studyResults', (select jsonb_build_object(
    'total', count(*),
    'today', count(*) filter (where ("createdAt" at time zone 'Asia/Seoul')::date = (select today from kst)),
    'd7', count(*) filter (where ("createdAt" at time zone 'Asia/Seoul')::date >= (select today from kst) - 6),
    'correct', count(*) filter (where "isCorrect" = true),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('date', d, 'n', n) order by d), '[]'::jsonb)
      from (select ("createdAt" at time zone 'Asia/Seoul')::date as d, count(*) as n from results_v group by 1) x)
  ) from results_v),
  'studyNotes', (select jsonb_build_object(
    'total', count(*),
    'today', count(*) filter (where ("createdAt" at time zone 'Asia/Seoul')::date = (select today from kst)),
    'd7', count(*) filter (where ("createdAt" at time zone 'Asia/Seoul')::date >= (select today from kst) - 6),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('date', d, 'n', n) order by d), '[]'::jsonb)
      from (select ("createdAt" at time zone 'Asia/Seoul')::date as d, count(*) as n from snotes_v group by 1) x)
  ) from snotes_v)
)
$$;
revoke all on function public.rn_content_stats() from public;
grant execute on function public.rn_content_stats() to anon, authenticated, service_role;

-- 3) MRR 일별 스냅샷 — 대시보드가 LemonSqueezy에서 계산한 MRR을 방문 시 기록해 히스토리 축적.
--    (리뷰노트 쪽에 크론이 없어서 대시보드 로드가 곧 기록 트리거 — 하루 1행 upsert)
create table if not exists public.rn_mrr_snapshots (
  date date primary key,
  mrr integer not null default 0,
  active_subs integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.rn_mrr_snapshots enable row level security;

create or replace function public.rn_record_mrr(p_mrr integer, p_subs integer)
returns void
language sql
security definer
set search_path = public
as $$
  insert into rn_mrr_snapshots (date, mrr, active_subs, updated_at)
  values ((now() at time zone 'Asia/Seoul')::date, p_mrr, p_subs, now())
  on conflict (date) do update set mrr = excluded.mrr, active_subs = excluded.active_subs, updated_at = now()
$$;
revoke all on function public.rn_record_mrr(integer, integer) from public;
grant execute on function public.rn_record_mrr(integer, integer) to anon, authenticated, service_role;

create or replace function public.rn_mrr_history()
returns table(date date, mrr integer, active_subs integer)
language sql
stable
security definer
set search_path = public
as $$
  select date, mrr, active_subs from rn_mrr_snapshots order by date
$$;
revoke all on function public.rn_mrr_history() from public;
grant execute on function public.rn_mrr_history() to anon, authenticated, service_role;

-- 4) 유저별 콘텐츠/학습 누적 + 오늘 증가분 (KST) — 사용자 테이블 컬럼용 (2026-07-16).
--    문제는 Note 경유 귀속 (Problem.noteId → Note.userId).
create or replace function public.rn_user_content()
returns table(
  user_id text,
  notes bigint, notes_today bigint,
  problems bigint, problems_today bigint,
  problem_sets bigint, problem_sets_today bigint,
  solves bigint, solves_today bigint
)
language sql
stable
security definer
set search_path = public
as $$
with kst as (select (now() at time zone 'Asia/Seoul')::date as today),
n as (
  select "userId" as u, count(*) as c,
    count(*) filter (where ("createdAt" at time zone 'Asia/Seoul')::date = (select today from kst)) as ct
  from "Note" group by 1
),
p as (
  select nt."userId" as u, count(*) as c,
    count(*) filter (where (pr."createdAt" at time zone 'Asia/Seoul')::date = (select today from kst)) as ct
  from "Problem" pr join "Note" nt on nt.id = pr."noteId" group by 1
),
ps as (
  select "userId" as u, count(*) as c,
    count(*) filter (where ("createdAt" at time zone 'Asia/Seoul')::date = (select today from kst)) as ct
  from "ProblemSet" group by 1
),
sr as (
  select "userId" as u, count(*) as c,
    count(*) filter (where ("createdAt" at time zone 'Asia/Seoul')::date = (select today from kst)) as ct
  from "StudyResult" group by 1
)
select usr.id,
  coalesce(n.c, 0), coalesce(n.ct, 0),
  coalesce(p.c, 0), coalesce(p.ct, 0),
  coalesce(ps.c, 0), coalesce(ps.ct, 0),
  coalesce(sr.c, 0), coalesce(sr.ct, 0)
from "User" usr
left join n on n.u = usr.id
left join p on p.u = usr.id
left join ps on ps.u = usr.id
left join sr on sr.u = usr.id
$$;
revoke all on function public.rn_user_content() from public;
grant execute on function public.rn_user_content() to anon, authenticated, service_role;
