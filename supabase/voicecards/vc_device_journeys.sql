-- vc_device_journeys — 기기별 익명→로그인 저니 요약 뷰
-- 원격: voice-cards project juyitkynbavhllyjidhz (migration: vc_device_journeys_view, 2026-07-13)
-- 목적: 비로그인 방문자 행동 분석을 이벤트 풀스캔 없이 한 쿼리로.
--   소비처: willow 대시보드, willy-bot (예: WHERE NOT signed_in AND last_seen_at >= now()-interval '48 hours')
-- journey_stage: opened → demo → intent(add_sheet/AI생성 진입) → signin_attempted(클릭했으나 미완료) → signed_in
-- 제외 규칙은 vc_event_stats()와 동일 (excluded_devices CTE + is_likely_bot). 정본: voicecards-stats 스킬 문서.
-- 컬럼 중간 삽입이 있어 재적용 시 drop 후 재생성 필요 (2026-07-15 anon_flips, anon_credits_spent 추가)
drop view if exists vc_device_journeys;
create or replace view vc_device_journeys as
with excluded_devices as (
  select distinct e.device_id
  from mv_real_users e
  join users u on u.user_id = e.user_id
  where e.device_id is not null
    and (
      u.nickname in ('류하아빠','큐트도넛')
      or lower(u.email) like '%@cloudtestlabaccounts.com'
      or lower(u.email) = 'dw.kim@willowinvt.com'
      or lower(u.email) = 'qwe.gpt22022@gmail.com'
      or u.email ~ '\.[0-9]{5,}@gmail\.com'
      or u.email ~ 'batch[0-9]+@gmail\.com'
      or u.email ~ 'wave[0-9]+batch[0-9]+'
    )
),
base as (
  select e.*
  from mv_real_users e
  where e.is_likely_bot = false
    and e.device_id is not null
    and e.device_id not in (select device_id from excluded_devices)
),
latest_meta as (
  select distinct on (device_id) device_id, platform, app_version, locale, country
  from base
  order by device_id, created_at desc
),
agg as (
  select device_id,
    min(created_at) as first_seen_at,
    max(created_at) as last_seen_at,
    count(distinct (created_at at time zone 'Asia/Seoul')::date) as active_days,
    count(*) as total_events,
    bool_or(event_name = 'demo_autostarted') as demo_autostarted,
    bool_or(event_name in ('learning_started','card_viewed','card_attempted',
      'card_learned_anonymous','tts_played','listen_session_started') and user_id is null) as demo_engaged,
    count(*) filter (where event_name = 'card_viewed' and user_id is null) as anon_cards_viewed,
    count(*) filter (where event_name = 'card_learned_anonymous') as anon_cards_learned,
    count(*) filter (where event_name = 'card_flipped_manual' and user_id is null) as anon_flips,
    -- 익명 상태 실사용 크레딧: TTS 차감 + AI 생성 (로그인 후 사용분 제외)
    coalesce(sum(case
      when user_id is not null then 0
      when event_name = 'credits_changed' and properties->>'reason' = 'tts_premium'
           and (properties->>'delta')::numeric < 0 then -(properties->>'delta')::numeric
      when event_name = 'ai_generation_success' then coalesce((properties->>'credits_used')::numeric, 0)
      else 0 end), 0)::bigint as anon_credits_spent,
    count(*) filter (where event_name = 'card_attempted' and user_id is null) as anon_speak_attempts,
    count(*) filter (where event_name = 'listen_session_started' and user_id is null) as anon_listen_sessions,
    count(*) filter (where event_name in ('add_sheet_opened_anonymous','add_sheet_opened')) as add_sheet_opens,
    count(*) filter (where event_name = 'template_browsed') as template_browses,
    count(*) filter (where event_name = 'ai_generation_opened') as ai_gen_opens,
    count(*) filter (where event_name = 'ai_generation_submitted') as ai_gen_submits,
    count(*) filter (where event_name = 'prompt_shown') as prompts_shown,
    count(*) filter (where event_name = 'prompt_dismissed') as prompts_dismissed,
    count(*) filter (where event_name in ('prompt_signin_clicked','add_sheet_signin_and_create_clicked')) as signin_clicks,
    bool_or(event_name = 'signin_completed' or user_id is not null) as signed_in,
    min(created_at) filter (where event_name = 'signin_completed') as first_signin_at,
    max(user_id) as user_id
  from base
  group by device_id
)
select
  a.device_id,
  a.first_seen_at,
  a.last_seen_at,
  (a.first_seen_at at time zone 'Asia/Seoul')::date as first_seen_kst,
  (a.last_seen_at at time zone 'Asia/Seoul')::date as last_seen_kst,
  a.active_days,
  a.total_events,
  m.platform, m.app_version, m.locale, m.country,
  a.demo_autostarted,
  a.demo_engaged,
  a.anon_cards_viewed,
  a.anon_cards_learned,
  a.anon_flips,
  a.anon_credits_spent,
  a.anon_speak_attempts,
  a.anon_listen_sessions,
  a.add_sheet_opens,
  a.template_browses,
  a.ai_gen_opens,
  a.ai_gen_submits,
  a.prompts_shown,
  a.prompts_dismissed,
  a.signin_clicks,
  a.signed_in,
  a.first_signin_at,
  a.user_id,
  (a.signed_in and u.created_at is not null
    and abs((u.created_at at time zone 'Asia/Seoul')::date
          - (a.first_seen_at at time zone 'Asia/Seoul')::date) <= 2) as is_new_signup,
  case
    when a.signed_in then 'signed_in'
    when a.signin_clicks > 0 then 'signin_attempted'
    when a.add_sheet_opens > 0 or a.ai_gen_opens > 0 then 'intent'
    when a.demo_engaged then 'demo'
    else 'opened'
  end as journey_stage
from agg a
join latest_meta m using (device_id)
left join users u on u.user_id = a.user_id;

comment on view vc_device_journeys is
  '기기별 익명→로그인 저니 요약. journey_stage: opened→demo→intent(add_sheet/AI)→signin_attempted→signed_in. 제외규칙=vc_event_stats 동일.';
