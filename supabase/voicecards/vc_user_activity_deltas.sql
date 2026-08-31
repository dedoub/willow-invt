-- 사용자별 오늘 증가분(카드/말하기/듣기/뒤집기/사용/구매/보유/시트) + 최근 7일 활동일 수 (user당 1행)
-- 대시보드 사용자 테이블의 전일대비 diff 둘째 줄 + 7일 활동일 열에 사용.
--   cards: 보유 카드 오늘 증가분 = live(user_analytics.total_cards 합) − 자정 스냅샷(user_sheet_snapshots.card_count)
--   attempts: 말하기 오늘 증가분 = live(user_analytics.total_attempts 합) − 자정 스냅샷(attempt_count).
--     카드와 같은 방식. time_series_analytics 는 date 가 단말 로컬 날짜라 폴백으로만 쓴다(아래 주석).
--   listen/flips/purchased: mv_real_users (이벤트 로그, 오늘 필터)
--     flips = card_flipped_manual(데모 제외), purchased = credits_changed/purchase 상품매핑
--   active_days_7d 핵심 활동일: 학습 또는 시트·카드 생성 완료 이벤트의 KST 날짜 수
--   spent: credit_transactions net (음수 delta 합 − 환불) (완전 원장, 2026-07-22; 상세는 spent_today CTE 주석)
--   반환 컬럼 변경 시에만 drop 후 재생성 필요 (return type replace 불가).
-- ── 배선 (2026-08-31) ────────────────────────────────────────────────────────
-- vc_user_rollup.sql 과 같은 구조: **_live 계산 + MV + 얇은 래퍼**를 한 세트로 정의한다.
-- 예전엔 여기서 vc_user_activity_deltas() 자체를 무거운 계산으로 만들어서, 이 파일을
-- 적용할 때마다 mv_dashboard_aggregates.sql 의 MV 래퍼가 조용히 덮였다(2026-08-30 재발).
-- 계산식을 고칠 일이 있으면 아래 _live 본문만 고치고 파일 전체를 그대로 다시 적용한다.
--
-- 오늘 증가분이 최대 1시간(refresh_vc_mvs 주기)까지 늦다. 대시보드 자체가 1시간 캐시라
-- 실효 지연은 같고, 새로고침 버튼은 캐시만 건너뛴다.

drop materialized view if exists public.mv_user_activity_deltas;
drop function if exists public.vc_user_activity_deltas_live();

create function public.vc_user_activity_deltas_live()
 returns table(user_id text, cards_today bigint, attempts_today bigint, listen_today bigint, flips_today bigint, spent_today bigint, active_days_7d integer, purchased_today bigint, balance_delta_today bigint, sheets_delta_today bigint)
 language sql
 stable
 set search_path = public, pg_temp
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
--
-- 로그인 없이 쓰는 기기(user_id null)는 device:<device_id> 계정으로 돌린다 — 대시보드가
-- 소유자를 정하는 규칙과 같다(voicecards-device-journey.ts voicecardsLocalActivationOwnerId).
-- user_id is not null 로 걸러내던 동안 기기 계정 행은 듣기·뒤집기·활동일이 늘 0이었다:
-- 2026-08-30 하루만 봐도 듣기 이벤트 2,718건 중 1,281건(기기 7대, 전부 사용자표에 있는
-- device: 계정)이 통째로 빠져 헤더 '오늘'이 1,435 로 나왔다(이벤트 시리즈는 2,604).
event_rows as materialized (
  select coalesce(e.user_id, 'device:' || e.device_id) as user_id,
         e.event_name, e.properties, e.is_likely_bot,
         (e.created_at at time zone 'Asia/Seoul')::date as event_date
  from mv_real_users e, td
  where (e.user_id is not null or e.device_id is not null)
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
    -- 데모 덱 뒤집기는 뺀다 — 사용자표 '뒤집기' 열(vc_user_rollup)과 같은 규칙(2026-08-10).
    -- 열은 데모를 빼는데 오늘 델타만 넣고 있어 '오늘 +N'이 열 증가분과 안 맞았다.
    count(*) filter (
      where e.event_date = td.d and e.event_name = 'card_flipped_manual'
        and coalesce(e.properties->>'sheet_id','') not like 'demo-%'
    )::bigint as fc,
    count(distinct e.event_date) filter (
      where e.event_name in (
        'card_attempted','tts_played','voice_preview_played','device_tts_played','card_flipped_manual',
        'deck_created','pending_local_sheet_created'
      )
    )::int as active_days,
    -- 구매 크레딧: 이벤트 delta(실제 지급량) 우선, 없으면 상품표 폴백 (vc_user_rollup 과 같은 규칙).
    coalesce(sum(coalesce(
      nullif(e.properties->>'delta','')::numeric,
      case e.properties->>'product_id'
        when 'com.monor.voicecards.credits.100'   then 100
        when 'com.monor.voicecards.credits.1000'  then 1100
        when 'com.monor.voicecards.credits.5500'  then 5750
        when 'com.monor.voicecards.credits.12000' then 12000 else 0 end)) filter (
        where e.event_date = td.d and e.event_name = 'credits_changed'
          and e.properties->>'reason' = 'purchase' and e.is_likely_bot = false
      ), 0)::bigint as pc
  from event_rows e cross join td
  group by e.user_id
),
-- 오늘 실사용과 잔액 변동도 원장을 한 번만 읽어 함께 계산한다.
credit_today as (
  -- 환불은 차감을 되돌린 것이라 실사용에서 뺀다(vc_user_rollup.credits_spent 와 같은 규칙).
  select c.user_id,
    greatest(0, coalesce(sum(case when c.delta < 0 then -c.delta
                                  when c.reason in ('tts_refund','ai_refund','ai_grading_refund') then -c.delta
                                  else 0 end), 0))::bigint as sc,
    sum(c.delta)::bigint as bd
  from credit_transactions c, td
  where c.user_id is not null
    and c.created_at >= (td.d::timestamp at time zone 'Asia/Seoul')
    and c.created_at < ((td.d + 1)::timestamp at time zone 'Asia/Seoul')
  group by c.user_id
),
live_sheets as (select user_id, coalesce(array_length(sheet_ids,1),0) as sc from users where user_id is not null),
-- 현재 보유 카드·누적 말하기. 둘 다 자정 스냅샷과 빼서 오늘 증가분을 만든다.
--
-- 카드는 **지금 sheet_ids 에 남아 있는 시트만** 센다 — 스냅샷(user_sheet_snapshots.card_count)이
-- 2026-08-29 부터 같은 규칙(buildVoicecardsCurrentCardMaps)으로 찍히는데 여기만 user_analytics
-- 전량을 더하고 있어, 지운 덱의 카드가 매일 '오늘 증가분'으로 잡혔다(2026-08-30 실측 오늘 8,346장).
-- 말하기(ta)는 스냅샷의 attempt_count 가 지운 덱까지 누적으로 유지하므로 전량 합이 맞다.
live_cards as (
  select ua.user_id,
         coalesce(sum(ua.total_cards) filter (where ua.sheet_id = any(u.sheet_ids)),0)::bigint as tc,
         coalesce(sum(ua.total_attempts),0)::bigint as ta
  from user_analytics ua
  join users u on u.user_id = ua.user_id
  group by ua.user_id
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

create materialized view public.mv_user_activity_deltas as
  select * from public.vc_user_activity_deltas_live();
create unique index mv_user_activity_deltas_user_id_idx on public.mv_user_activity_deltas (user_id);

-- 대시보드가 실제로 부르는 것.
drop function if exists public.vc_user_activity_deltas();
create function public.vc_user_activity_deltas()
 returns table(user_id text, cards_today bigint, attempts_today bigint, listen_today bigint, flips_today bigint, spent_today bigint, active_days_7d integer, purchased_today bigint, balance_delta_today bigint, sheets_delta_today bigint)
 language sql
 stable
 set search_path = public, pg_temp
as $wrapper$ select d.* from public.mv_user_activity_deltas d $wrapper$;

grant execute on function public.vc_user_activity_deltas() to public;
grant execute on function public.vc_user_activity_deltas() to anon, authenticated, service_role;
grant select on public.mv_user_activity_deltas to anon, authenticated, service_role;
