-- 사용자별 오늘 증가분(카드/말하기/듣기/뒤집기/사용/구매/보유/시트) + 최근 7일 활동일 수 (user당 1행)
-- 대시보드 사용자 테이블의 전일대비 diff 둘째 줄 + 7일 활동일 열에 사용.
--   cards: 보유 카드 오늘 증가분 = live(user_analytics.total_cards 합) − 자정 스냅샷(user_sheet_snapshots.card_count)
--   attempts: time_series_analytics (앱 일별 기록)
--   listen/flips/purchased: mv_real_users (이벤트 로그, 오늘 필터)
--     flips = card_flipped_manual, purchased = credits_changed/purchase 상품매핑
--   spent: credit_transactions 음수 delta 합 (완전 원장, 2026-07-22; 상세는 spent_today CTE 주석)
--   반환 컬럼 변경 시 drop 후 재생성 필요 (return type replace 불가).
drop function if exists public.vc_user_activity_deltas();
create or replace function public.vc_user_activity_deltas()
 returns table(user_id text, cards_today bigint, attempts_today bigint, listen_today bigint, flips_today bigint, spent_today bigint, active_days_7d integer, purchased_today bigint, balance_delta_today bigint, sheets_delta_today bigint)
 language sql
 stable
as $function$
with td as (select (now() at time zone 'Asia/Seoul')::date as d),
tsa_today as (
  select t.user_id, sum(t.attempts)::bigint as attempts
  from time_series_analytics t, td where t.date = td.d group by t.user_id
),
listen_today as (
  select e.user_id, count(*)::bigint as listen
  from mv_real_users e, td
  where e.event_name in ('tts_played','voice_preview_played')
    and (e.created_at at time zone 'Asia/Seoul')::date = td.d and e.user_id is not null
  group by e.user_id
),
flips_today as (
  select e.user_id, count(*)::bigint as fc
  from mv_real_users e, td
  where e.event_name = 'card_flipped_manual'
    and (e.created_at at time zone 'Asia/Seoul')::date = td.d and e.user_id is not null
  group by e.user_id
),
spent_today as (
  -- 오늘 실사용 크레딧 = credit_transactions 음수 delta 합 (완전 원장).
  -- 2026-07-22: credits_changed(tts_premium)+ai_generation_success → credit_transactions.
  -- 이유는 vc_user_rollup.sql 헤더 참조 (AI 채점 누락 + 분수 TTS 과대집계 해소).
  select c.user_id, sum(-c.delta)::bigint as sc
  from credit_transactions c, td
  where c.delta < 0 and c.user_id is not null
    and (c.created_at at time zone 'Asia/Seoul')::date = td.d
  group by c.user_id
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
live_cards as (select ua.user_id, coalesce(sum(ua.total_cards),0)::bigint as tc from user_analytics ua group by ua.user_id),
sheet_snap as (select s.user_id, s.sheet_count, s.card_count from user_sheet_snapshots s, td where s.date = td.d),
u_created as (select u.user_id, (u.created_at at time zone 'Asia/Seoul')::date as cdate from users u where u.user_id is not null),
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
  union select user_id from live_cards
  union select user_id from tsa_today
  union select user_id from listen_today
  union select user_id from flips_today
  union select user_id from spent_today
  union select user_id from purchased_today
  union select user_id from active7
)
select i.user_id,
       (case when ss.card_count is not null then coalesce(lc.tc,0) - ss.card_count
             when uc.cdate = td.d then coalesce(lc.tc,0)
             else 0 end)::bigint as cards_today,
       coalesce(t.attempts,0)::bigint, coalesce(l.listen,0)::bigint,
       coalesce(f.fc,0)::bigint as flips_today, coalesce(sp.sc,0)::bigint as spent_today,
       coalesce(a.days,0)::int,
       coalesce(p.pc,0)::bigint, coalesce(b.bd,0)::bigint,
       (case when ss.sheet_count is not null then coalesce(ls.sc,0) - ss.sheet_count
             when uc.cdate = td.d then coalesce(ls.sc,0)
             else 0 end)::bigint as sheets_delta_today
from ids i
cross join td
left join tsa_today t using(user_id)
left join listen_today l using(user_id)
left join flips_today f using(user_id)
left join spent_today sp using(user_id)
left join active7 a using(user_id)
left join purchased_today p using(user_id)
left join balance_today b using(user_id)
left join live_sheets ls using(user_id)
left join live_cards lc using(user_id)
left join sheet_snap ss using(user_id)
left join u_created uc using(user_id);
$function$;
