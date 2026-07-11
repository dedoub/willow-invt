-- 사용자별 구매 고려(purchase-intent) 신호. 대시보드 사용자 테이블 '구매신호' 칩/핫리드 배지/마지막 의도 시각용.
-- premium_voice: 프리미엄 보이스 관심 (미리듣기·프리미엄 토글·보이스 설정)
-- ai_feature: AI 생성 관심 (생성 열기/제출·티저 탭) — 크레딧 소모 기능
-- banner_tap: 크레딧/프리미엄 배너 탭
-- gated: 게이트 충돌 (익명 시트추가·로그인 프롬프트 클릭) — 약한 활성화 신호
-- last_intent: 가장 최근 구매의도 이벤트 시각
-- 봇 제외, 실유저(로그인) 매핑된 이벤트(mv_real_users)만.
-- apply: 원격 project juyitkynbavhllyjidhz
CREATE OR REPLACE FUNCTION public.vc_user_intent_signals()
 RETURNS TABLE(user_id text, premium_voice boolean, ai_feature boolean, banner_tap boolean, gated boolean, last_intent timestamptz)
 LANGUAGE sql
 STABLE
AS $function$
  select user_id,
    bool_or(event_name in ('voice_preview_played','tts_premium_toggle_changed','voice_settings_opened')) as premium_voice,
    bool_or(event_name in ('ai_generation_opened','ai_generation_submitted','ai_teaser_generate_tapped')) as ai_feature,
    bool_or(event_name = 'credit_banner_tapped') as banner_tap,
    bool_or(event_name in ('add_sheet_opened_anonymous','add_sheet_signin_and_create_clicked','prompt_signin_clicked')) as gated,
    max(created_at) as last_intent
  from mv_real_users
  where is_likely_bot = false
    and user_id is not null
    and event_name in (
      'voice_preview_played','tts_premium_toggle_changed','voice_settings_opened',
      'ai_generation_opened','ai_generation_submitted','ai_teaser_generate_tapped',
      'credit_banner_tapped',
      'add_sheet_opened_anonymous','add_sheet_signin_and_create_clicked','prompt_signin_clicked'
    )
  group by user_id
$function$;
