-- ============================================================================
-- ReviewNotes 트래픽 집계 RPC (source of truth)
-- ----------------------------------------------------------------------------
-- 대상 프로젝트: review-notes (kumaqaizejnjrvfqhahu) — 메인 willow-invt DB 아님.
-- 배경(2026-07-15): 대시보드는 publishable(anon) 키로 ReviewNotes DB를 읽는데,
--   RLS 하드닝으로 PageView에 anon SELECT 정책이 없어 raw select가 에러 없이 0행을
--   반환 → 트래픽 카드가 조용히 0으로 표시되던 문제.
-- 해법: raw 행을 다시 열지 않고, 집계만 SECURITY DEFINER 함수로 노출 (vc_event_stats 패턴).
-- 소비처: src/lib/reviewnotes-supabase.ts getReviewNotesTrafficStats()
-- ============================================================================
create or replace function public.rn_traffic_stats(range_days int default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with cur as (
  select * from "PageView"
  where "createdAt" >= now() - make_interval(days => range_days)
),
prev as (
  select * from "PageView"
  where "createdAt" >= now() - make_interval(days => 2 * range_days)
    and "createdAt" < now() - make_interval(days => range_days)
),
daily as (
  select ("createdAt" at time zone 'Asia/Seoul')::date as kdate,
         count(*) as views, count(distinct "sessionId") as visitors
  from cur group by 1
),
refs as (
  select coalesce(nullif(referrer, ''), 'direct') as referrer, count(*) as n
  from cur group by 1 order by n desc limit 6
),
ctrs as (
  select coalesce(nullif(country, ''), 'Unknown') as country, count(*) as n
  from cur group by 1 order by n desc limit 6
)
select jsonb_build_object(
  'totals', jsonb_build_object(
    'views', (select count(*) from cur),
    'visitors', (select count(distinct "sessionId") from cur)),
  'prev', jsonb_build_object(
    'views', (select count(*) from prev),
    'visitors', (select count(distinct "sessionId") from prev)),
  -- 앱 내 로그인 활동 사용자 (EventLog, 윈도우 내 distinct userId) — 퍼널 카드용 (2026-07-15)
  'activeUsers', (select count(distinct "userId") from "EventLog"
    where "userId" is not null and "createdAt" >= now() - make_interval(days => range_days)),
  'prevActiveUsers', (select count(distinct "userId") from "EventLog"
    where "userId" is not null
      and "createdAt" >= now() - make_interval(days => 2 * range_days)
      and "createdAt" < now() - make_interval(days => range_days)),
  'daily', coalesce((select jsonb_agg(jsonb_build_object(
    'date', kdate, 'views', views, 'visitors', visitors) order by kdate) from daily), '[]'::jsonb),
  'topReferrers', coalesce((select jsonb_agg(jsonb_build_object(
    'referrer', referrer, 'count', n)) from refs), '[]'::jsonb),
  'topCountries', coalesce((select jsonb_agg(jsonb_build_object(
    'country', country, 'count', n)) from ctrs), '[]'::jsonb)
)
$$;
revoke all on function public.rn_traffic_stats(int) from public;
grant execute on function public.rn_traffic_stats(int) to anon, authenticated, service_role;
