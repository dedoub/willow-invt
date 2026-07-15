-- ============================================================================
-- 사용자별 듣기/뒤집기/크레딧사용 집계 (source of truth)
-- ----------------------------------------------------------------------------
-- 대상 프로젝트: voice-cards (juyitkynbavhllyjidhz) — 메인 willow-invt DB 아님.
-- user당 1행으로 DB 집계해 전수 이벤트 스캔(5만+행)을 회피한다.
--   listen_count:  tts_played + voice_preview_played (1건 = 1회)
--   flip_count:    card_flipped_manual — 학습 중 카드 앞뒤 수동 전환 (2026-07-15 추가)
--   credits_spent: 실제 소진 크레딧 = TTS 차감(credits_changed/tts_premium 음수 delta)
--                  + AI 생성(ai_generation_success/credits_used) (2026-07-15 추가)
-- 봇/관리자 제외는 JS 쪽 visibleUserIds 필터가 담당 (여긴 is_likely_bot만 거름).
-- 반환 컬럼 변경 시 drop 후 재생성 필요 (return type은 replace 불가).
-- ============================================================================
drop function if exists public.vc_user_listen_counts();
create or replace function public.vc_user_listen_counts()
 returns table(user_id text, listen_count bigint, flip_count bigint, credits_spent bigint)
 language sql
 stable
as $function$
  select user_id,
    count(*) filter (where event_name in ('tts_played','voice_preview_played'))::bigint as listen_count,
    count(*) filter (where event_name = 'card_flipped_manual')::bigint as flip_count,
    coalesce(sum(case
      when event_name = 'credits_changed' and properties->>'reason' = 'tts_premium'
           and (properties->>'delta')::numeric < 0 then -(properties->>'delta')::numeric
      when event_name = 'ai_generation_success' then coalesce((properties->>'credits_used')::numeric, 0)
      else 0 end), 0)::bigint as credits_spent
  from mv_real_users
  where event_name in ('tts_played','voice_preview_played','card_flipped_manual','credits_changed','ai_generation_success')
    and is_likely_bot = false and user_id is not null
  group by user_id
$function$;
