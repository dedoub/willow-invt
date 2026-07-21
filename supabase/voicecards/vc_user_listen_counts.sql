-- ============================================================================
-- 사용자별 듣기/뒤집기/크레딧사용 집계 (source of truth)
-- ----------------------------------------------------------------------------
-- 대상 프로젝트: voice-cards (juyitkynbavhllyjidhz) — 메인 willow-invt DB 아님.
-- user당 1행으로 DB 집계해 전수 이벤트 스캔(5만+행)을 회피한다.
--   listen_count:  tts_played + voice_preview_played (1건 = 1회) — mv_real_users 이벤트
--   flip_count:    card_flipped_manual — 학습 중 카드 앞뒤 수동 전환 — mv_real_users 이벤트
--   credits_spent: 실제 소진 크레딧 = credit_transactions 음수 delta 합 (완전 원장).
--     2026-07-22 변경: 기존엔 credits_changed(tts_premium) 이벤트 + ai_generation_success로
--     집계했으나, 이 방식은 (1) AI 채점(ai_grading) 차감을 전혀 못 세고 (2) 분수 TTS 과금 도입
--     이후 이벤트는 재생당 발화돼 실제 차감보다 과대집계됐다. credit_transactions는 잔액에서
--     실제로 빠진 모든 차감(tts_premium·ai_grading·ai_generation·향후 신규)을 담는 완전 원장이라
--     기능별 이벤트 emit 의존 없이 정확하다. (봇 제외는 JS visibleUserIds 필터가 담당.)
-- 반환 컬럼 변경 시 drop 후 재생성 필요 (return type은 replace 불가).
-- ============================================================================
drop function if exists public.vc_user_listen_counts();
create or replace function public.vc_user_listen_counts()
 returns table(user_id text, listen_count bigint, flip_count bigint, credits_spent bigint)
 language sql
 stable
as $function$
  with ev as (
    select user_id,
      count(*) filter (where event_name in ('tts_played','voice_preview_played'))::bigint as listen_count,
      count(*) filter (where event_name = 'card_flipped_manual')::bigint as flip_count
    from mv_real_users
    where event_name in ('tts_played','voice_preview_played','card_flipped_manual')
      and is_likely_bot = false and user_id is not null
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
         coalesce(s.credits_spent, 0)::bigint
  from ids i
  left join ev e using(user_id)
  left join spend s using(user_id)
$function$;
