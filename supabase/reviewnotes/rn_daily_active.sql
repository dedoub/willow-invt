-- ============================================================================
-- ReviewNotes 일별 활동자 RPC (source of truth)
-- ----------------------------------------------------------------------------
-- 대상 프로젝트: review-notes (kumaqaizejnjrvfqhahu) — 메인 willow-invt DB 아님.
-- 소비처: src/lib/reviewnotes-supabase.ts getReviewNotesTrafficStats() → dailyActive
--         화면: reviewnotes-block.tsx RnDauTrendCard (회원/신규/비로그인 3계열)
--
-- 세는 단위가 계열마다 다르다. 로그인 활동자는 userId, 비로그인은 sessionId 기준이라
-- active와 anon을 더한 값은 "사람 수"가 아니다. 막대는 함께 쌓되 툴팁에서 구분해 적는다.
--
-- 제외 규칙 (rn_traffic_stats와 동일하게 유지할 것):
--   관리자 = role='ADMIN' 또는 test@reviewnotes.app (스토어 심사용)
--   비로그인 쪽은 userId가 없으므로 관리자 userId가 쓴 sessionId를 통째로 뺀다.
--   봇은 /api/track 입구에서 isBotUserAgent()가 막아 테이블에 안 들어온다.
--
-- 2026-07-28: anon 계열 추가. 반환 컬럼이 늘어 drop 후 재생성해야 한다.
-- ============================================================================
drop function if exists public.rn_daily_active(integer);

create function public.rn_daily_active(range_days integer default 60)
 returns table(date date, active bigint, new_users bigint, member bigint, anon bigint)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
with admins as (
  select id from "User" where role = 'ADMIN' or email = 'test@reviewnotes.app'
),
admin_sessions as (
  select distinct "sessionId" from "EventLog"
  where "userId" in (select id from admins) and coalesce("sessionId", '') <> ''
),
day_user as (
  select distinct (("createdAt" at time zone 'UTC') at time zone 'Asia/Seoul')::date as d, "userId" as uid
  from "EventLog"
  where "userId" is not null and "userId" not in (select id from admins)
    and "createdAt" >= now() - make_interval(days => range_days)
),
flagged as (
  select du.d, du.uid,
    (u."createdAt" is not null and ((u."createdAt" at time zone 'UTC') at time zone 'Asia/Seoul')::date = du.d) as is_new
  from day_user du left join "User" u on u.id = du.uid
),
logged as (
  select d,
    count(*)::bigint as active,
    count(*) filter (where is_new)::bigint as new_users,
    count(*) filter (where not is_new)::bigint as member
  from flagged group by d
),
anon_day as (
  select (("createdAt" at time zone 'UTC') at time zone 'Asia/Seoul')::date as d,
         count(distinct "sessionId")::bigint as anon
  from "EventLog"
  where "userId" is null
    and coalesce("sessionId", '') <> ''
    and "sessionId" not in (select "sessionId" from admin_sessions)
    and "createdAt" >= now() - make_interval(days => range_days)
  group by 1
)
select coalesce(l.d, a.d) as date,
  coalesce(l.active, 0) as active,
  coalesce(l.new_users, 0) as new_users,
  coalesce(l.member, 0) as member,
  coalesce(a.anon, 0) as anon
from logged l full outer join anon_day a on a.d = l.d
order by 1
$function$;
