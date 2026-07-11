-- 사용자별 오늘 증가분(카드/말하기/듣기/구매/보유/시트) + 최근 7일 활동일 수 (user당 1행)
-- 대시보드 사용자 테이블의 전일대비 diff 둘째 줄 + 7일 활동일 열에 사용.
--   cards/attempts: time_series_analytics (앱 일별 기록)
--   listen/purchased: anonymous_events (이벤트 로그, 오늘 필터)
--   balance: credit_transactions.delta 합 (순변동 ±)
--   sheets: live users.sheet_ids − 오늘 user_sheet_snapshots (스냅샷 파이프라인)
--   active_days_7d: 학습/듣기 distinct 날짜 (최근 7일)
-- apply: 원격 project juyitkynbavhllyjidhz
CREATE OR REPLACE FUNCTION public.vc_user_activity_deltas()
 RETURNS TABLE(user_id text, cards_today bigint, attempts_today bigint, listen_today bigint, active_days_7d integer, purchased_today bigint, balance_delta_today bigint, sheets_delta_today bigint)
 LANGUAGE sql
 STABLE
AS $function$
with td as (select (now() at time zone 'Asia/Seoul')::date as d),
tsa_today as (
  select t.user_id, sum(t.problems_learned)::bigint as cards, sum(t.attempts)::bigint as attempts
  from time_series_analytics t, td where t.date = td.d group by t.user_id
),
listen_today as (
  select e.user_id, count(*)::bigint as listen
  from mv_real_users e, td
  where e.event_name in ('tts_played','voice_preview_played')
    and (e.created_at at time zone 'Asia/Seoul')::date = td.d and e.user_id is not null
  group by e.user_id
),
purchased_today as (
  select e.user_id, sum(case e.properties->>'product_id'
      when 'com.monor.voicecards.credits.1000'  then 1000
      when 'com.monor.voicecards.credits.5500'  then 5500
      when 'com.monor.voicecards.credits.12000' then 12000 else 0 end)::bigint as pc
  from mv_real_users e, td
  where e.event_name='credits_changed' and e.properties->>'reason'='purchase'
    and e.is_likely_bot = false and e.user_id is not null
    and (e.created_at at time zone 'Asia/Seoul')::date = td.d
  group by e.user_id
),
balance_today as (
  select c.user_id, sum(c.delta)::bigint as bd
  from credit_transactions c, td
  where (c.created_at at time zone 'Asia/Seoul')::date = td.d and c.user_id is not null
  group by c.user_id
),
live_sheets as (select user_id, coalesce(array_length(sheet_ids,1),0) as sc from users where user_id is not null),
sheet_snap as (select s.user_id, s.sheet_count from user_sheet_snapshots s, td where s.date = td.d),
learn_days as (
  select t.user_id, t.date as d from time_series_analytics t, td
  where t.date >= td.d - 6 and (coalesce(t.attempts,0) > 0 or coalesce(t.problems_learned,0) > 0)
),
listen_days as (
  select e.user_id, (e.created_at at time zone 'Asia/Seoul')::date as d
  from mv_real_users e, td
  where e.event_name in ('tts_played','voice_preview_played')
    and (e.created_at at time zone 'Asia/Seoul')::date >= td.d - 6 and e.user_id is not null
),
active7 as (
  select user_id, count(distinct d)::int as days
  from (select user_id, d from learn_days union select user_id, d from listen_days) x group by user_id
),
ids as (
  select user_id from live_sheets
  union select user_id from tsa_today
  union select user_id from listen_today
  union select user_id from purchased_today
  union select user_id from balance_today
  union select user_id from active7
)
select i.user_id,
       coalesce(t.cards,0)::bigint, coalesce(t.attempts,0)::bigint, coalesce(l.listen,0)::bigint,
       coalesce(a.days,0)::int,
       coalesce(p.pc,0)::bigint, coalesce(b.bd,0)::bigint,
       (case when ss.sheet_count is null then 0 else coalesce(ls.sc,0) - ss.sheet_count end)::bigint as sheets_delta_today
from ids i
left join tsa_today t using(user_id)
left join listen_today l using(user_id)
left join active7 a using(user_id)
left join purchased_today p using(user_id)
left join balance_today b using(user_id)
left join live_sheets ls using(user_id)
left join sheet_snap ss using(user_id);
