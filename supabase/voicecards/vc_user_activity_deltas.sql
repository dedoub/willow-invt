-- 사용자별 오늘 증가분(카드/말하기/듣기/뒤집기/사용/구매/보유/시트) + 최근 7일 활동일 수 (user당 1행)
-- 대시보드 사용자 테이블의 전일대비 diff 둘째 줄 + 7일 활동일 열에 사용.
--   cards: 보유 카드 오늘 증가분 = live(user_analytics.total_cards 합) − 자정 스냅샷(user_sheet_snapshots.card_count)
--   attempts: 말하기 오늘 증가분 = live(user_analytics.total_attempts 합) − 자정 스냅샷(attempt_count).
--     카드와 같은 방식. time_series_analytics 는 date 가 단말 로컬 날짜라 폴백으로만 쓴다(아래 주석).
--   listen/flips/purchased: mv_real_users (이벤트 로그, 오늘 필터)
--     flips = card_flipped_manual, purchased = credits_changed/purchase 상품매핑
--   active_days_7d 핵심 활동일: 학습 또는 시트·카드 생성 완료 이벤트의 KST 날짜 수
--   spent: credit_transactions 음수 delta 합 (완전 원장, 2026-07-22; 상세는 spent_today CTE 주석)
--   반환 컬럼 변경 시에만 drop 후 재생성 필요 (return type replace 불가).
create or replace function public.vc_user_activity_deltas()
 returns table(user_id text, cards_today bigint, attempts_today bigint, listen_today bigint, flips_today bigint, spent_today bigint, active_days_7d integer, purchased_today bigint, balance_delta_today bigint, sheets_delta_today bigint)
 language sql
 stable
as $function$
with td as (select (now() at time zone 'Asia/Seoul')::date as d),
tsa_today as (
  -- 스냅샷에 말하기 기준선이 없을 때만 쓰는 폴백(2026-08-02~). time_series_analytics.date 는
  -- **단말의 로컬 날짜**라 서버의 "오늘"과 맞출 수 없다 — 같은 KST 새벽에 KR 유저 행은 08-02,
  -- US·PE·IN·DE 유저 행은 08-01로 적힌다. 그래서 한국 밖 사용자는 KST 00~09시 내내 0으로 보였다.
  -- 폴백은 과소집계는 해도 과대집계는 하지 않는다.
  select t.user_id, sum(t.attempts)::bigint as attempts
  from time_series_analytics t, td where t.date = td.d group by t.user_id
),
-- 오늘 듣기/뒤집기/구매와 7일 활동일을 한 번의 MV 스캔으로 계산한다.
-- created_at 자체에 범위를 걸어 event_name, created_at 인덱스를 모두 사용한다.
event_rows as materialized (
  select e.user_id, e.event_name, e.properties, e.is_likely_bot,
         (e.created_at at time zone 'Asia/Seoul')::date as event_date
  from mv_real_users e, td
  where e.user_id is not null
    and e.event_name in (
      'tts_played','voice_preview_played','device_tts_played',
      'card_flipped_manual','card_attempted','credits_changed',
      'deck_created','pending_local_sheet_created'
    )
    and e.created_at >= ((td.d - 6)::timestamp at time zone 'Asia/Seoul')
    and e.created_at < ((td.d + 1)::timestamp at time zone 'Asia/Seoul')
),
event_activity as (
  select e.user_id,
    count(*) filter (
      where e.event_date = td.d
        and e.event_name in ('tts_played','voice_preview_played','device_tts_played')
    )::bigint as listen,
    count(*) filter (
      where e.event_date = td.d and e.event_name = 'card_flipped_manual'
    )::bigint as fc,
    count(distinct e.event_date) filter (
      where e.event_name in (
        'card_attempted','tts_played','voice_preview_played','device_tts_played','card_flipped_manual',
        'deck_created','pending_local_sheet_created'
      )
    )::int as active_days,
    coalesce(sum(case e.properties->>'product_id'
      when 'com.monor.voicecards.credits.1000'  then 1000
      when 'com.monor.voicecards.credits.5500'  then 5500
      when 'com.monor.voicecards.credits.12000' then 12000 else 0 end) filter (
        where e.event_date = td.d and e.event_name = 'credits_changed'
          and e.properties->>'reason' = 'purchase' and e.is_likely_bot = false
      ), 0)::bigint as pc
  from event_rows e cross join td
  group by e.user_id
),
-- 오늘 실사용과 잔액 변동도 원장을 한 번만 읽어 함께 계산한다.
credit_today as (
  select c.user_id,
    coalesce(sum(-c.delta) filter (where c.delta < 0), 0)::bigint as sc,
    sum(c.delta)::bigint as bd
  from credit_transactions c, td
  where c.user_id is not null
    and c.created_at >= (td.d::timestamp at time zone 'Asia/Seoul')
    and c.created_at < ((td.d + 1)::timestamp at time zone 'Asia/Seoul')
  group by c.user_id
),
live_sheets as (select user_id, coalesce(array_length(sheet_ids,1),0) as sc from users where user_id is not null),
-- 현재 보유 카드·누적 말하기. 둘 다 자정 스냅샷과 빼서 오늘 증가분을 만든다.
live_cards as (
  select ua.user_id,
         coalesce(sum(ua.total_cards),0)::bigint as tc,
         coalesce(sum(ua.total_attempts),0)::bigint as ta
  from user_analytics ua group by ua.user_id
),
sheet_snap as (select s.user_id, s.sheet_count, s.card_count, s.attempt_count from user_sheet_snapshots s, td where s.date = td.d),
u_created as (select u.user_id, (u.created_at at time zone 'Asia/Seoul')::date as cdate from users u where u.user_id is not null),
ids as (
  select user_id from live_sheets
  union select user_id from live_cards
  union select user_id from tsa_today
  union select user_id from event_activity
  union select user_id from credit_today
)
select i.user_id,
       (case when ss.card_count is not null then coalesce(lc.tc,0) - ss.card_count
             when uc.cdate = td.d then coalesce(lc.tc,0)
             else 0 end)::bigint as cards_today,
       -- 말하기: 스냅샷 기준선이 있으면 그 차이, 오늘 가입이면 전량, 둘 다 아니면 폴백.
       -- 음수는 0으로 — 값이 줄었다면 증가분이 아니라 데이터 초기화다.
       (case when ss.attempt_count is not null then greatest(coalesce(lc.ta,0) - ss.attempt_count, 0)
             when uc.cdate = td.d then coalesce(lc.ta,0)
             else coalesce(t.attempts,0) end)::bigint as attempts_today,
       coalesce(e.listen,0)::bigint,
       coalesce(e.fc,0)::bigint as flips_today, coalesce(c.sc,0)::bigint as spent_today,
       coalesce(e.active_days,0)::int,
       coalesce(e.pc,0)::bigint, coalesce(c.bd,0)::bigint,
       (case when ss.sheet_count is not null then coalesce(ls.sc,0) - ss.sheet_count
             when uc.cdate = td.d then coalesce(ls.sc,0)
             else 0 end)::bigint as sheets_delta_today
from ids i
cross join td
left join tsa_today t using(user_id)
left join event_activity e using(user_id)
left join credit_today c using(user_id)
left join live_sheets ls using(user_id)
left join live_cards lc using(user_id)
left join sheet_snap ss using(user_id)
left join u_created uc using(user_id);
$function$;
