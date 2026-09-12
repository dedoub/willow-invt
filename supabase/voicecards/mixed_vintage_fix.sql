-- ============================================================================
-- 사용자 표 집계 시점 혼합 제거 (2026-09-13)
-- 대상 프로젝트: voice-cards (juyitkynbavhllyjidhz) — 메인 willow-invt DB 아님.
-- ----------------------------------------------------------------------------
-- ── 증상 ────────────────────────────────────────────────────────────────────
-- 한 사용자 행에 서로 다른 시각의 값이 섞여 산수가 닫히지 않았다. 실측(09-13 00:46 KST,
-- cedrynafb.pro): 사용 12 · 오늘 +13 · 보유 0 · 오늘 −13 으로 보였으나 원장 정답은
-- 사용 100 · 오늘 +100 · 보유 0 · 오늘 −100 이었다. 보유 0 옆에 −13 이 서 있으니
-- 자정에 13크레딧을 갖고 시작했다는 말이 되어, 행 자체가 읽을 수 없는 상태였다.
--
-- ── 원인 ────────────────────────────────────────────────────────────────────
-- vc_user_rollup_live() 와 vc_user_activity_deltas_live() 는 큰 이벤트 테이블
-- (mv_real_users, 415k행)만 읽는 게 아니라 **작은 실시간 테이블**도 함께 읽는다:
--   credit_transactions(10,940행) · users(799) · user_analytics(577) · user_sheet_snapshots.
-- 이 함수를 통째로 매트뷰로 굳히면 실시간 테이블 읽기까지 같이 얼어붙는다. 앱은 그
-- 얼어붙은 값(사용·오늘델타)을 자기가 직접 실시간으로 읽은 값(보유 = users.credits,
-- 카드·활동 = user_analytics) 옆에 나란히 그린다 — 한 행에 최대 1시간 차이의 두 시점.
-- 갱신이 매시 :07~:14 이므로 방금 활동한 사용자일수록 어긋남이 커진다.
--
-- ── 처리 ────────────────────────────────────────────────────────────────────
-- 원칙: **비싼 이벤트 전량 스캔만 굳히고, 싼 실시간 테이블은 조회 시점에 읽는다.**
--   (1) mv_cost_aware_versions — 과금 신호를 보낼 줄 아는 앱 버전 목록(42행). 이 distinct
--       스캔만 2.9초라 꼬리 병합 경로에 둘 수 없어 따로 굳힌다. 시간당 갱신.
--   (2) vc_user_rollup() — 누적 이벤트(전량 스캔 15초)는 MV 유지. 대신
--       · credits_spent 는 credit_transactions 에서 **실시간**으로 다시 읽고,
--       · MV 워터마크 이후의 이벤트 꼬리를 원본에서 읽어 더한다(2시간 456건·20ms).
--       MV 의 credits_spent 열은 남지만 더 이상 읽지 않는다.
--   (3) vc_user_activity_deltas() — 매트뷰를 버리고 실시간 계산(1.3초)으로 되돌린다.
--       9개 열 중 5개(카드·말하기·사용·잔액델타·덱)가 작은 실시간 테이블에서 나오고,
--       나머지 4개도 7일 창이라 굳힐 이유가 없었다. 이벤트 쪽은 MV + 꼬리로 읽는다.
--       덤으로 자정 경계도 풀린다 — 굳힌 "오늘"은 00:00~갱신 전까지 어제를 가리켰다.
--   (4) vc_data_as_of() — 이제 사용자 표 숫자는 꼬리까지 반영해 현재 시각이다. 남은
--       지연은 메타·기기저니·이벤트통계 MV 뿐이라 그 셋의 워터마크로 바닥을 잡는다.
--
-- 꼬리 경계의 한계: 워터마크보다 이른 created_at 을 갖고 뒤늦게 커밋된 행은 다음 증분
-- 동기화의 overlap 이 흡수할 때까지 양쪽 어디에도 없다 — 기존 증분 설계와 같은 한계다.
--
-- 이 파일이 사용자 표 집계 경로의 정본이다. 아래 서술은 폐기됐다:
--   vc_user_activity_deltas.sql · mv_dashboard_aggregates.sql 의 mv_user_activity_deltas 부분
--     (그 매트뷰는 여기서 삭제됐다 — 껍데기는 실시간 계산을 부른다)
--   mv_data_as_of.sql 의 refresh_vc_mv 허용목록과 vc_data_as_of 대상 목록
-- 함수 정의는 DB 에 적용된 것이 정본(incremental_real_users.sql ④ 와 같은 규칙).
-- ============================================================================

-- ── (1) 과금 인지 버전 목록 ─────────────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_cost_aware_versions AS
  SELECT DISTINCT app_version
  FROM public.anonymous_events
  WHERE properties ? 'fractional_cost' AND app_version IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mv_cost_aware_versions_v
  ON public.mv_cost_aware_versions (app_version);

GRANT SELECT ON public.mv_cost_aware_versions TO anon, authenticated, service_role;

-- ── (2) 누적 롤업: 이벤트는 MV+꼬리, 크레딧 원장은 실시간 ───────────────────
CREATE OR REPLACE FUNCTION public.vc_user_rollup()
RETURNS TABLE(user_id text, listen_count bigint, premium_listen_count bigint,
              free_listen_count bigint, unclassified_listen_count bigint, flip_count bigint,
              credits_spent bigint, purchased_credits bigint, premium_voice boolean,
              ai_feature boolean, banner_tap boolean, gated boolean,
              last_intent timestamp with time zone, last_purchase timestamp with time zone)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  with wm as (
    -- 이 MV 가 반영한 원천 범위. 행이 없으면 꼬리를 비워 기존 동작으로 떨어진다.
    select coalesce((select watermark from vc_sync_state where name = 'mv_user_rollup'),
                    'infinity'::timestamptz) as w
  ),
  tail as materialized (
    -- 워터마크 이후 이벤트. mv_real_users 와 같은 필터를 통과한 원본 뷰에서 읽는다.
    select coalesce(e.user_id, 'device:' || e.device_id) as user_id,
           e.event_name, e.properties, e.app_version, e.created_at
    from anonymous_events_real_users e, wm
    where e.created_at > wm.w
      and e.is_likely_bot = false
      and (e.user_id is not null or e.device_id is not null)
      and e.event_name in (
        'tts_played','voice_preview_played','device_tts_played','card_flipped_manual','credits_changed',
        'tts_premium_toggle_changed','voice_settings_opened',
        'ai_generation_opened','ai_generation_submitted','ai_teaser_generate_tapped',
        'credit_banner_tapped',
        'add_sheet_opened_anonymous','add_sheet_signin_and_create_clicked','prompt_signin_clicked'
      )
  ),
  tail_agg as (
    -- 표현식은 vc_user_rollup_live() 의 ev 와 1:1로 같게 유지할 것.
    select t.user_id,
      count(*) filter (where t.event_name in ('tts_played','voice_preview_played','device_tts_played'))::bigint as listen_count,
      count(*) filter (where t.event_name in ('tts_played','voice_preview_played')
                         and t.properties ? 'fractional_cost')::bigint as premium_listen_count,
      count(*) filter (where t.event_name in ('tts_played','voice_preview_played','device_tts_played')
                         and not (t.properties ? 'fractional_cost')
                         and t.app_version in (select app_version from mv_cost_aware_versions))::bigint as free_listen_count,
      count(*) filter (where t.event_name in ('tts_played','voice_preview_played','device_tts_played')
                         and not (t.properties ? 'fractional_cost')
                         and (t.app_version is null
                              or t.app_version not in (select app_version from mv_cost_aware_versions)))::bigint as unclassified_listen_count,
      count(*) filter (where t.event_name = 'card_flipped_manual'
                         and coalesce(t.properties->>'sheet_id','') not like 'demo-%')::bigint as flip_count,
      sum(case when t.event_name = 'credits_changed' and t.properties->>'reason' = 'purchase'
            then coalesce(
                   nullif(t.properties->>'delta','')::numeric,
                   case t.properties->>'product_id'
                     when 'com.monor.voicecards.credits.100'   then 100
                     when 'com.monor.voicecards.credits.1000'  then 1100
                     when 'com.monor.voicecards.credits.5500'  then 5750
                     when 'com.monor.voicecards.credits.12000' then 12000
                     else 0 end)
            else 0 end)::bigint as purchased_credits,
      bool_or(t.event_name in ('voice_preview_played','tts_premium_toggle_changed','voice_settings_opened')) as premium_voice,
      bool_or(t.event_name in ('ai_generation_opened','ai_generation_submitted','ai_teaser_generate_tapped')) as ai_feature,
      bool_or(t.event_name = 'credit_banner_tapped') as banner_tap,
      bool_or(t.event_name in ('add_sheet_opened_anonymous','add_sheet_signin_and_create_clicked','prompt_signin_clicked')) as gated,
      max(t.created_at) filter (where t.event_name in (
        'voice_preview_played','tts_premium_toggle_changed','voice_settings_opened',
        'ai_generation_opened','ai_generation_submitted','ai_teaser_generate_tapped',
        'credit_banner_tapped',
        'add_sheet_opened_anonymous','add_sheet_signin_and_create_clicked','prompt_signin_clicked'
      )) as last_intent,
      max(t.created_at) filter (where t.event_name = 'credits_changed'
                                  and t.properties->>'reason' = 'purchase') as last_purchase
    from tail t group by t.user_id
  ),
  merged as (
    -- MV 의 credits_spent 는 굳은 원장이라 읽지 않는다. 아래 spend 가 대신한다.
    select coalesce(m.user_id, a.user_id) as user_id,
      coalesce(m.listen_count,0) + coalesce(a.listen_count,0) as listen_count,
      coalesce(m.premium_listen_count,0) + coalesce(a.premium_listen_count,0) as premium_listen_count,
      coalesce(m.free_listen_count,0) + coalesce(a.free_listen_count,0) as free_listen_count,
      coalesce(m.unclassified_listen_count,0) + coalesce(a.unclassified_listen_count,0) as unclassified_listen_count,
      coalesce(m.flip_count,0) + coalesce(a.flip_count,0) as flip_count,
      coalesce(m.purchased_credits,0) + coalesce(a.purchased_credits,0) as purchased_credits,
      coalesce(m.premium_voice,false) or coalesce(a.premium_voice,false) as premium_voice,
      coalesce(m.ai_feature,false)    or coalesce(a.ai_feature,false)    as ai_feature,
      coalesce(m.banner_tap,false)    or coalesce(a.banner_tap,false)    as banner_tap,
      coalesce(m.gated,false)         or coalesce(a.gated,false)         as gated,
      greatest(m.last_intent,   a.last_intent)   as last_intent,
      greatest(m.last_purchase, a.last_purchase) as last_purchase
    from mv_user_rollup m
    full join tail_agg a on a.user_id = m.user_id
  ),
  spend as (
    -- 실시간 원장. 환불은 차감을 되돌린 것이라 실사용에서 뺀다
    -- (vc_user_rollup_live().spend 와 같은 규칙 — 바꿀 때 함께 바꿀 것).
    select c.user_id,
      greatest(0, coalesce(sum(case when c.delta < 0 then -c.delta
                                    when c.reason in ('tts_refund','ai_refund','ai_grading_refund') then -c.delta
                                    else 0 end), 0))::bigint as credits_spent
    from credit_transactions c
    where c.user_id is not null
      and (c.delta < 0 or c.reason in ('tts_refund','ai_refund','ai_grading_refund'))
    group by c.user_id
  ),
  ids as (select user_id from merged union select user_id from spend)
  select i.user_id,
    coalesce(m.listen_count, 0)::bigint,
    coalesce(m.premium_listen_count, 0)::bigint,
    coalesce(m.free_listen_count, 0)::bigint,
    coalesce(m.unclassified_listen_count, 0)::bigint,
    coalesce(m.flip_count, 0)::bigint,
    coalesce(s.credits_spent, 0)::bigint,
    coalesce(m.purchased_credits, 0)::bigint,
    coalesce(m.premium_voice, false),
    coalesce(m.ai_feature, false),
    coalesce(m.banner_tap, false),
    coalesce(m.gated, false),
    m.last_intent,
    m.last_purchase
  from ids i
  left join merged m using(user_id)
  left join spend s using(user_id)
$function$;

-- ── (3) 오늘 델타: 매트뷰를 버리고 실시간 계산 ──────────────────────────────
-- 전문은 DB 정본. 핵심 변경 두 가지:
--   · event_rows 가 mv_real_users(워터마크까지) UNION ALL 원본 꼬리(워터마크 이후)를 읽는다.
--     두 구간은 created_at 으로 겹치지 않는다.
--   · 껍데기가 MV 대신 _live 를 부른다 — credit_transactions·users·user_analytics·
--     user_sheet_snapshots 를 조회 시점에 읽으므로 앱이 직접 읽는 값과 같은 시점이 된다.
--     자정 경계도 함께 풀린다: 굳힌 "오늘"은 00:00~첫 갱신 전까지 어제를 가리켰다.
-- 실측 849행 82ms(웜) / 1.3초(콜드). 1시간 캐시 뒤라 회당 비용으로 충분하다.

CREATE OR REPLACE FUNCTION public.vc_user_activity_deltas()
RETURNS TABLE(user_id text, cards_today bigint, attempts_today bigint, listen_today bigint,
              flips_today bigint, spent_today bigint, active_days_7d integer,
              purchased_today bigint, balance_delta_today bigint, sheets_delta_today bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$ select d.* from public.vc_user_activity_deltas_live() d $function$;

DROP MATERIALIZED VIEW IF EXISTS public.mv_user_activity_deltas;
DELETE FROM public.vc_sync_state WHERE name = 'mv_user_activity_deltas';

-- vc_user_rollup_live() 의 cost_aware_versions CTE 도 mv_cost_aware_versions 를 읽도록 바꿨다
-- (2.9초짜리 distinct 스캔 제거 — 시간당 mv_user_rollup 갱신이 그만큼 짧아진다). 전문은 DB 정본.

-- ── (4) 갱신 대상·기준 시각 배선 ────────────────────────────────────────────
-- refresh_vc_mv 허용목록: mv_user_activity_deltas 제거, mv_cost_aware_versions 추가.
-- vc_data_as_of(): 사용자 표는 이제 꼬리까지 반영해 현재 시각이므로 rollup·deltas 는 빠지고,
-- 아직 굳어 있는 셋(mv_user_latest_meta·mv_device_journeys·mv_event_stats)만 바닥을 잡는다.
-- 두 함수 전문은 DB 정본.

-- 크론 (KST = UTC+9, 분만 의미 있음):
--   :05 anonymous_device_canonical   :07 vc_sync_real_users
--   :09 mv_cost_aware_versions       :10 mv_user_latest_meta
--   :11 mv_device_journeys           :12 mv_user_rollup
--   :14 mv_event_stats
-- (:13 mv_user_activity_deltas 잡은 unschedule 했다.)
--   select cron.unschedule(10);
--   select cron.schedule('refresh-mv-cost-aware-versions', '9 * * * *',
--     $$SET statement_timeout = '10min'; SELECT public.refresh_vc_mv('mv_cost_aware_versions');$$);

-- ── 검증 (2026-09-13 01:0x KST 실측) ────────────────────────────────────────
--   · 수정 전: credits_spent 가 원장과 어긋난 사용자 1/851, 최대 격차 88.
--   · 수정 후: 0/851. vc_user_rollup() 과 vc_user_rollup_live() 는 849명 중 847명 완전 일치,
--     차이 2명은 꼬리 활동자(262·59건)로 원본 직접 집계와 대조해 정확히 맞음(이중계상 없음).
--   · cedrynafb.pro: 사용 12→100, 오늘 +13→+100, 오늘 −13→−100, 듣기 1→75, 뒤집기 0→5.
--     보유 0 은 그대로 — 이제 같은 시점의 값끼리 산수가 닫힌다.
--   · 앱 경로(getVoicecardsUserStats) 550명 전원 spent_today <= credits_spent 불변식 통과.
