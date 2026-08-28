-- ============================================================================
-- ReviewNotes 트래픽 집계 RPC (source of truth)
-- ----------------------------------------------------------------------------
-- 대상 프로젝트: review-notes (kumaqaizejnjrvfqhahu) — 메인 willow-invt DB 아님.
-- 배경(2026-07-15): 대시보드는 publishable(anon) 키로 ReviewNotes DB를 읽는데,
--   RLS 하드닝으로 PageView/EventLog에 anon SELECT 정책이 없어 raw select가 에러 없이
--   0행을 반환 → 트래픽 카드가 조용히 0으로 표시되던 문제.
-- 해법: raw 행을 다시 열지 않고, 집계만 SECURITY DEFINER 함수로 노출 (vc_event_stats 패턴).
-- 대시보드는 range_days에 큰 값(3650)을 넘겨 집계 시작 이후 전체 누적으로 쓴다.
-- 통계 제외(2026-07-16): role=ADMIN + 스토어 심사용 test@reviewnotes.app.
--   방문(PageView)은 익명이라 직접 귀속이 안 되므로, EventLog에서 관리자 userId가 쓴
--   방문자 ID(sessionId)의 방문을 통째로 제외 (voicecards excluded_devices 패턴).
-- 자동화 제외(2026-08-23): 같은 날 동일 국가·기기·유입에서 10개 이상 몰린 익명 세션 중
--   체류 10초 이하·스크롤 0·핵심 행동 0인 군집을 제외한다. 단일 짧은 방문은 유지해
--   실제 사용자의 이탈을 봇으로 오인하지 않는다.
--   JS 쪽 동일 규칙: src/lib/reviewnotes-supabase.ts isExcludedReviewNotesUser().
-- 소비처: src/lib/reviewnotes-supabase.ts getReviewNotesTrafficStats()
-- ============================================================================
create or replace function public.rn_traffic_stats(range_days int default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with admins as (
  select id from "User" where role = 'ADMIN' or email = 'test@reviewnotes.app'
),
admin_sessions as (
  select distinct "sessionId" from "EventLog"
  where "userId" in (select id from admins) and coalesce("sessionId", '') <> ''
),
linked_sessions as (
  select distinct "sessionId" from "EventLog"
  where "userId" is not null and coalesce("sessionId", '') <> ''
),
session_quality as (
  select "sessionId",
    count(*) filter (where name = 'section_view' and meta->>'section' = 'hero') as hero_events,
    max(coalesce((meta->>'seconds')::int, 0)) filter (where name = 'page_engage') as max_seconds,
    max(coalesce((meta->>'maxScrollPct')::int, 0)) filter (where name = 'page_engage') as max_scroll,
    count(*) filter (where name not in ('page_view', 'section_view', 'page_engage')) as meaningful_events
  from "EventLog"
  group by 1
),
low_quality_sessions as (
  select distinct pv."sessionId",
    ((pv."createdAt" at time zone 'UTC') at time zone 'Asia/Seoul')::date as kdate,
    coalesce(pv.country, 'Unknown') as country,
    coalesce(pv.device, 'unknown') as device,
    coalesce(nullif(pv.referrer, ''), 'direct') as referrer
  from "PageView" pv
  join session_quality sq using ("sessionId")
  where pv."sessionId" not in (select "sessionId" from linked_sessions)
    and sq.hero_events > 0
    and sq.meaningful_events = 0
    and coalesce(sq.max_scroll, 0) = 0
    and coalesce(sq.max_seconds, 0) <= 10
),
automation_groups as (
  select kdate, country, device, referrer
  from low_quality_sessions
  group by 1, 2, 3, 4
  having count(*) >= 10
),
automated_sessions as (
  select distinct lqs."sessionId"
  from low_quality_sessions lqs
  join automation_groups ag using (kdate, country, device, referrer)
),
base as (
  select * from "PageView"
  where "sessionId" not in (select "sessionId" from admin_sessions)
    and "sessionId" not in (select "sessionId" from automated_sessions)
),
cur as (
  select * from base
  where "createdAt" >= now() - make_interval(days => range_days)
),
prev as (
  select * from base
  where "createdAt" >= now() - make_interval(days => 2 * range_days)
    and "createdAt" < now() - make_interval(days => range_days)
),
daily as (
  select (("createdAt" at time zone 'UTC') at time zone 'Asia/Seoul')::date as kdate,
         count(*) as views, count(distinct "sessionId") as visitors
  from cur group by 1
),
-- 회원 로그인 연인원: 하루에 유저당 1회만 카운트 (EventLog, KST)
login_daily as (
  select (("createdAt" at time zone 'UTC') at time zone 'Asia/Seoul')::date as kdate,
         count(distinct "userId") as users
  from "EventLog"
  where "userId" is not null
    and "userId" not in (select id from admins)
    and "createdAt" >= now() - make_interval(days => range_days)
  group by 1
),
refs as (
  select coalesce(nullif(referrer, ''), 'direct') as referrer, count(*) as n
  from cur group by 1 order by n desc limit 6
),
ctrs as (
  select coalesce(nullif(country, ''), 'Unknown') as country, count(*) as n
  from cur group by 1 order by n desc limit 6
),
-- 기기 분포 — 방문자(세션) 기준. device는 2026-07-15부터 수집, 이전 행은 unknown
devs as (
  select coalesce(nullif(device, ''), 'unknown') as device, count(distinct "sessionId") as n
  from cur group by 1 order by n desc
),
-- 회원/유료 유입경로·국가: EventLog와 PageView가 같은 방문자 ID(sessionId)를 공유 →
-- 유저별 첫 랜딩 방문(first-touch)의 referrer/country로 귀속. 랜딩을 안 거친 유저는 미포함.
user_sessions as (
  select distinct "userId", "sessionId" from "EventLog"
  where "userId" is not null and "userId" not in (select id from admins)
    and coalesce("sessionId", '') <> ''
),
user_touch as (
  select distinct on (us."userId") us."userId",
    coalesce(nullif(pv.referrer, ''), 'direct') as referrer,
    coalesce(nullif(pv.country, ''), 'Unknown') as country
  from user_sessions us
  join "PageView" pv on pv."sessionId" = us."sessionId"
  order by us."userId", pv."createdAt" asc
),
paid_users as (
  select id from "User"
  where "subscriptionPlan" <> 'FREE' and role <> 'ADMIN' and email <> 'test@reviewnotes.app'
),
member_refs as (select referrer, count(*) as n from user_touch group by 1),
member_ctrs as (select country, count(*) as n from user_touch group by 1),
paid_refs as (select ut.referrer, count(*) as n from user_touch ut join paid_users p on p.id = ut."userId" group by 1),
paid_ctrs as (select ut.country, count(*) as n from user_touch ut join paid_users p on p.id = ut."userId" group by 1)
select jsonb_build_object(
  'totals', jsonb_build_object(
    'views', (select count(*) from cur),
    'visitors', (select count(distinct "sessionId") from cur)),
  'prev', jsonb_build_object(
    'views', (select count(*) from prev),
    'visitors', (select count(distinct "sessionId") from prev)),
  'activeUsers', (select count(distinct "userId") from "EventLog"
    where "userId" is not null and "userId" not in (select id from admins)
      and "createdAt" >= now() - make_interval(days => range_days)),
  'prevActiveUsers', (select count(distinct "userId") from "EventLog"
    where "userId" is not null and "userId" not in (select id from admins)
      and "createdAt" >= now() - make_interval(days => 2 * range_days)
      and "createdAt" < now() - make_interval(days => range_days)),
  'daily', coalesce((select jsonb_agg(jsonb_build_object(
    'date', kdate, 'views', views, 'visitors', visitors) order by kdate) from daily), '[]'::jsonb),
  'dailyLogins', coalesce((select jsonb_agg(jsonb_build_object(
    'date', kdate, 'users', users) order by kdate) from login_daily), '[]'::jsonb),
  'topReferrers', coalesce((select jsonb_agg(jsonb_build_object(
    'referrer', referrer, 'count', n)) from refs), '[]'::jsonb),
  'topCountries', coalesce((select jsonb_agg(jsonb_build_object(
    'country', country, 'count', n)) from ctrs), '[]'::jsonb),
  'devices', coalesce((select jsonb_agg(jsonb_build_object(
    'device', device, 'count', n)) from devs), '[]'::jsonb),
  'memberReferrers', coalesce((select jsonb_agg(jsonb_build_object(
    'referrer', referrer, 'count', n)) from member_refs), '[]'::jsonb),
  'memberCountries', coalesce((select jsonb_agg(jsonb_build_object(
    'country', country, 'count', n)) from member_ctrs), '[]'::jsonb),
  'paidReferrers', coalesce((select jsonb_agg(jsonb_build_object(
    'referrer', referrer, 'count', n)) from paid_refs), '[]'::jsonb),
  'paidCountries', coalesce((select jsonb_agg(jsonb_build_object(
    'country', country, 'count', n)) from paid_ctrs), '[]'::jsonb)
)
$$;
revoke all on function public.rn_traffic_stats(int) from public;
grant execute on function public.rn_traffic_stats(int) to anon, authenticated, service_role;
