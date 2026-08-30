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
--   credits_spent 는 credit_transactions 완전 원장 net (음수 delta 합 − 환불). (이벤트 집계 대비 AI 채점 차감
--     누락 + 분수 TTS 과대집계를 해소 — 잔액에서 실제 빠진 모든 차감을 담는 원장이라 정확.)
-- 유지 대상(합치지 않음):
--   - vc_user_latest_meta: 소스가 anonymous_events. mv 로 바꾸면 3명 메타 누락(mv 필터) → 유지.
--   - vc_user_activity_deltas: 오늘/7일 시간한정(인덱스 레인지 저렴) + aux 테이블 다수 → 유지.
-- 반환 컬럼 변경 시 drop 후 재생성 필요 (return type 은 replace 불가).
--
-- 2026-07-31 재생 엔진 분리:
--   듣기를 프리미엄/무과금(기기음성)/분류불가로 가른다. 판정은 이벤트 이름이 아니라
--   과금 신호 properties.fractional_cost 다. device_tts_played 는 배선만 돼 있고 앱이 보낸 적이
--   없으며(전 기간 0건), 프리미엄을 끈 뒤의 기기음성 재생도 tts_played 로 들어온다. 이름으로
--   가르면 0크레딧 재생이 프리미엄에 섞여 사용량이 2.6배로 부풀려졌다.
--   fractional_cost 는 1.1.90(2026-07-13)부터 붙는다. 날짜로 자르면 컷오버 이후에도 남아 있던
--   구버전 사용자(1.1.80 은 07-15 까지 활동)가 기기음성으로 오분류되므로, "그 앱 버전이 신호를
--   보낸 적 있는가"로 가른다. 이 조회는 idx_anon_events_cost_aware_version(indexes.sql)을 탄다 —
--   인덱스가 없으면 호출마다 anonymous_events 전량 seq scan 이다(143ms → 12ms).
--   listen_count = premium + free + unclassified + device_tts_played(현재 0건)
--
-- 2026-08-27 마지막 구매일:
--   사용자 표의 '구매일' 열. 스캔에 이미 들어와 있는 credits_changed 행에서 max 만 더 뽑는다 —
--   구매 크레딧과 같은 소스라 두 열이 어긋날 수 없다.
-- ============================================================================
drop function if exists public.vc_user_rollup();
create or replace function public.vc_user_rollup()
 returns table(
   user_id text,
   listen_count bigint, premium_listen_count bigint, free_listen_count bigint,
   unclassified_listen_count bigint, flip_count bigint, credits_spent bigint,
   purchased_credits bigint,
   premium_voice boolean, ai_feature boolean, banner_tap boolean, gated boolean,
   last_intent timestamptz,
   last_purchase timestamptz
 )
 language sql
 stable
as $function$
  with cost_aware_versions as (
    -- 과금 신호를 보낼 줄 아는 앱 버전. 여기 없는 버전의 재생은 판정 자체가 불가능하다.
    select distinct app_version
    from anonymous_events
    where properties ? 'fractional_cost' and app_version is not null
  ),
  ev as (
    -- 로그인 없이 쓰는 기기(user_id null)는 device:<device_id> 계정으로 돌린다 —
    -- vc_user_activity_deltas 와 같은 규칙(2026-08-30). user_id is not null 로 걸러내던 동안
    -- 사용자표의 기기 계정 행은 듣기·뒤집기가 0이라 카드 헤드라인(이벤트 전량)과 열 합이
    -- 어긋났다(실측 듣기 57,065 vs 열 합 53,346 / 뒤집기 13,238 vs 12,298).
    select coalesce(m.user_id, 'device:' || m.device_id) as user_id,
      -- 듣기 = 재생 엔진 무관 학습량. 무료 헤비 리스너가 "듣기 0" 으로 보이면 이탈처럼 읽힌다.
      count(*) filter (where m.event_name in ('tts_played','voice_preview_played','device_tts_played'))::bigint as listen_count,
      -- 크레딧이 실제로 나갈 수 있는 재생.
      count(*) filter (where m.event_name in ('tts_played','voice_preview_played')
                         and m.properties ? 'fractional_cost')::bigint as premium_listen_count,
      -- 0크레딧 재생. 과금 신호를 보낼 줄 아는 버전인데 신호가 없다 = 기기음성.
      count(*) filter (where m.event_name in ('tts_played','voice_preview_played','device_tts_played')
                         and not (m.properties ? 'fractional_cost')
                         and m.app_version in (select app_version from cost_aware_versions))::bigint as free_listen_count,
      -- 과금 신호를 보낸 적 없는 버전의 재생. 프리미엄인지 기기음성인지 알 수 없다.
      count(*) filter (where m.event_name in ('tts_played','voice_preview_played','device_tts_played')
                         and not (m.properties ? 'fractional_cost')
                         and (m.app_version is null
                              or m.app_version not in (select app_version from cost_aware_versions)))::bigint as unclassified_listen_count,
      -- 뒤집기도 데모를 뺀다(2026-08-10). 카드(ownCards)는 처음부터 데모를 빼왔는데
      -- 뒤집기는 2026-07-25에 활성화 기준으로 추가되면서 필터가 같이 안 붙었다. 그 결과
      -- 표에 '카드 N · 데모 · 활성화 완료' 같은 모순된 조합이 나왔다 — 데모만 만진 사람이
      -- 뒤집기 1회로 활성화가 됐기 때문. 세 축(시트·카드·뒤집기)을 같은 규칙으로 맞춘다.
      count(*) filter (where m.event_name = 'card_flipped_manual'
                         and coalesce(m.properties->>'sheet_id','') not like 'demo-%')::bigint as flip_count,
      -- 구매 크레딧은 이벤트의 delta(실제 지급량)를 먼저 쓴다. SKU 끝 숫자와 지급량은 다르고
      -- (1000팩 = 1,100 지급), 상품표로만 집계하면 팩 수량을 바꿀 때 과거 구매까지 소급 변한다.
      -- 상품표는 delta 없는 옛 이벤트 폴백. 표에 없는 상품(2026-08-16 엔트리팩 $0.99/100)은
      -- 0으로 집계돼 구매가 통째로 사라졌었다.
      sum(case when m.event_name = 'credits_changed' and m.properties->>'reason' = 'purchase'
            then coalesce(
                   nullif(m.properties->>'delta','')::numeric,
                   case m.properties->>'product_id'
                     when 'com.monor.voicecards.credits.100'   then 100
                     when 'com.monor.voicecards.credits.1000'  then 1100
                     when 'com.monor.voicecards.credits.5500'  then 5750
                     when 'com.monor.voicecards.credits.12000' then 12000
                     else 0 end)
            else 0 end)::bigint as purchased_credits,
      bool_or(m.event_name in ('voice_preview_played','tts_premium_toggle_changed','voice_settings_opened')) as premium_voice,
      bool_or(m.event_name in ('ai_generation_opened','ai_generation_submitted','ai_teaser_generate_tapped')) as ai_feature,
      bool_or(m.event_name = 'credit_banner_tapped') as banner_tap,
      bool_or(m.event_name in ('add_sheet_opened_anonymous','add_sheet_signin_and_create_clicked','prompt_signin_clicked')) as gated,
      max(m.created_at) filter (where m.event_name in (
        'voice_preview_played','tts_premium_toggle_changed','voice_settings_opened',
        'ai_generation_opened','ai_generation_submitted','ai_teaser_generate_tapped',
        'credit_banner_tapped',
        'add_sheet_opened_anonymous','add_sheet_signin_and_create_clicked','prompt_signin_clicked'
      )) as last_intent,
      -- 마지막 구매 시각. 구매 크레딧과 같은 행(credits_changed/reason=purchase)에서 뽑아
      -- 두 열이 어긋나지 않게 한다. purchase_receipts 는 6명분뿐이라 여기서 쓰지 않는다.
      max(m.created_at) filter (where m.event_name = 'credits_changed'
                                  and m.properties->>'reason' = 'purchase') as last_purchase
    from mv_real_users m
    where m.is_likely_bot = false and (m.user_id is not null or m.device_id is not null)
      and m.event_name in (
        'tts_played','voice_preview_played','device_tts_played','card_flipped_manual','credits_changed',
        'tts_premium_toggle_changed','voice_settings_opened',
        'ai_generation_opened','ai_generation_submitted','ai_teaser_generate_tapped',
        'credit_banner_tapped',
        'add_sheet_opened_anonymous','add_sheet_signin_and_create_clicked','prompt_signin_clicked'
      )
    group by coalesce(m.user_id, 'device:' || m.device_id)
  ),
  spend as (
    -- 환불(tts_refund·ai_refund·ai_grading_refund)은 차감을 되돌린 것이므로 실사용에서 뺀다.
    -- 음수 delta 만 세면 gross 가 되어, 환불이 일어난 사용자는 실제보다 많이 쓴 것으로 보인다
    -- (2026-08-24 juyearrr: 표시 119, 실제 순소진 99). 1.1.142 의 이어듣기 미재생 선합성분
    -- 자동 환급이 배포되면 이 왜곡이 상시화되므로 net 으로 바꾼다.
    -- greatest(0, …): 1크레딧 미만 TTS 차감은 tts_debt 에만 쌓여 원장 행이 없으므로,
    -- 대응 차감 행 없이 환불만 있는 사용자가 음수로 내려가지 않게 막는다.
    select user_id,
      greatest(0, coalesce(sum(case when delta < 0 then -delta
                                    when reason in ('tts_refund','ai_refund','ai_grading_refund') then -delta
                                    else 0 end), 0))::bigint as credits_spent
    from credit_transactions
    where user_id is not null
      and (delta < 0 or reason in ('tts_refund','ai_refund','ai_grading_refund'))
    group by user_id
  ),
  ids as (select user_id from ev union select user_id from spend)
  select i.user_id,
    coalesce(e.listen_count, 0)::bigint,
    coalesce(e.premium_listen_count, 0)::bigint,
    coalesce(e.free_listen_count, 0)::bigint,
    coalesce(e.unclassified_listen_count, 0)::bigint,
    coalesce(e.flip_count, 0)::bigint,
    coalesce(s.credits_spent, 0)::bigint,
    coalesce(e.purchased_credits, 0)::bigint,
    coalesce(e.premium_voice, false),
    coalesce(e.ai_feature, false),
    coalesce(e.banner_tap, false),
    coalesce(e.gated, false),
    e.last_intent,
    e.last_purchase
  from ids i
  left join ev e using(user_id)
  left join spend s using(user_id)
$function$;

grant execute on function public.vc_user_rollup() to public;
grant execute on function public.vc_user_rollup() to anon, authenticated, service_role;
