-- ============================================================================
-- 사용자별 통합 롤업 (vc_user_listen_counts + vc_user_purchased_credits +
--   vc_user_intent_signals 3개를 mv_real_users 1회 스캔으로 통합)
-- ----------------------------------------------------------------------------
-- 대상 프로젝트: voice-cards (juyitkynbavhllyjidhz) — 메인 willow-invt DB 아님.
-- 배경: getVoicecardsUserStats 가 위 3 RPC 를 병렬 호출했는데 각각 mv_real_users(10만행)를
--   독립 스캔 → MV 리프레시/체크포인트 경합 구간에 동시 스캔이 겹쳐 사용자 테이블이 자주 깨짐.
--   같은 테이블·같은 predicate(is_likely_bot=false, user_id not null)에 event_name FILTER만
--   달랐으므로 1회 스캔 + FILTER 집계로 합침. mv_real_users_event_created 인덱스(bitmap)를 타 ~50ms.
-- 검증(2026-07-23): 기존 3 RPC 합집합과 유저별·필드별 완전 동일 (115행, mismatch 0).
--   credits_spent 는 credit_transactions 완전 원장 음수 delta 합. (이벤트 집계 대비 AI 채점 차감
--     누락 + 분수 TTS 과대집계를 해소 — 잔액에서 실제 빠진 모든 차감을 담는 원장이라 정확.)
-- 유지 대상(합치지 않음):
--   - vc_user_latest_meta: 소스가 anonymous_events. mv 로 바꾸면 3명 메타 누락(mv 필터) → 유지.
--   - vc_user_activity_deltas: 오늘/7일 시간한정(인덱스 레인지 저렴) + aux 테이블 다수 → 유지.
-- 반환 컬럼 변경 시 drop 후 재생성 필요 (return type 은 replace 불가).
-- ============================================================================
drop function if exists public.vc_user_rollup();
create or replace function public.vc_user_rollup()
 returns table(
   user_id text,
   listen_count bigint, flip_count bigint, credits_spent bigint,
   purchased_credits bigint,
   premium_voice boolean, ai_feature boolean, banner_tap boolean, gated boolean,
   last_intent timestamptz
 )
 language sql
 stable
as $function$
  with ev as (
    select user_id,
      count(*) filter (where event_name in ('tts_played','voice_preview_played'))::bigint as listen_count,
      count(*) filter (where event_name = 'card_flipped_manual')::bigint as flip_count,
      sum(case when event_name = 'credits_changed' and properties->>'reason' = 'purchase'
            then case properties->>'product_id'
                   when 'com.monor.voicecards.credits.1000'  then 1000
                   when 'com.monor.voicecards.credits.5500'  then 5500
                   when 'com.monor.voicecards.credits.12000' then 12000
                   else 0 end
            else 0 end)::bigint as purchased_credits,
      bool_or(event_name in ('voice_preview_played','tts_premium_toggle_changed','voice_settings_opened')) as premium_voice,
      bool_or(event_name in ('ai_generation_opened','ai_generation_submitted','ai_teaser_generate_tapped')) as ai_feature,
      bool_or(event_name = 'credit_banner_tapped') as banner_tap,
      bool_or(event_name in ('add_sheet_opened_anonymous','add_sheet_signin_and_create_clicked','prompt_signin_clicked')) as gated,
      max(created_at) filter (where event_name in (
        'voice_preview_played','tts_premium_toggle_changed','voice_settings_opened',
        'ai_generation_opened','ai_generation_submitted','ai_teaser_generate_tapped',
        'credit_banner_tapped',
        'add_sheet_opened_anonymous','add_sheet_signin_and_create_clicked','prompt_signin_clicked'
      )) as last_intent
    from mv_real_users
    where is_likely_bot = false and user_id is not null
      and event_name in (
        'tts_played','voice_preview_played','card_flipped_manual','credits_changed',
        'tts_premium_toggle_changed','voice_settings_opened',
        'ai_generation_opened','ai_generation_submitted','ai_teaser_generate_tapped',
        'credit_banner_tapped',
        'add_sheet_opened_anonymous','add_sheet_signin_and_create_clicked','prompt_signin_clicked'
      )
    group by user_id
  ),
  spend as (
    select user_id, coalesce(sum(-delta), 0)::bigint as credits_spent
    from credit_transactions
    where delta < 0 and user_id is not null
    group by user_id
  ),
  ids as (select user_id from ev union select user_id from spend)
  select i.user_id,
    coalesce(e.listen_count, 0)::bigint,
    coalesce(e.flip_count, 0)::bigint,
    coalesce(s.credits_spent, 0)::bigint,
    coalesce(e.purchased_credits, 0)::bigint,
    coalesce(e.premium_voice, false),
    coalesce(e.ai_feature, false),
    coalesce(e.banner_tap, false),
    coalesce(e.gated, false),
    e.last_intent
  from ids i
  left join ev e using(user_id)
  left join spend s using(user_id)
$function$;
