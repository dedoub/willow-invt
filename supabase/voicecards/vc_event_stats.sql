-- ============================================================================
-- VoiceCards 익명 이벤트 통계 집계 함수 (source of truth)
-- ----------------------------------------------------------------------------
-- 대상 프로젝트: voice-cards (juyitkynbavhllyjidhz) — 메인 willow-invt DB 아님.
-- 이 파일이 vc_event_stats() 의 정본. 원격에 apply 후 반드시 이 파일도 갱신할 것.
--   적용: supabase MCP apply_migration(project_id='juyitkynbavhllyjidhz', ...)
--
-- 소비처: src/lib/voicecards-server.ts getAnonymousEventStats() → rpc('vc_event_stats')
--         → MonoR 페이지 보이스카드 섹션(디바이스/플랫폼/언어/일별 활동자 등)
--
-- ⚠️ 제외 규칙 단일 소스 (아래 excluded_devices):
--   관리자/봇/테스트 계정은 device_id 단위로 통째 제외(로그인 前 익명 이벤트까지).
--   이 목록은 유저 통계(src/lib/voicecards-server.ts 의 EXCLUDED_VOICECARDS_* )와
--   반드시 동일하게 유지해야 함. 한 곳만 고치면 섹션 간 숫자가 어긋난다.
--   (2026-07-04: 이벤트 통계가 관리자 dw.kim + 봇패턴을 안 거르던 불일치를 이걸로 정리)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.vc_event_stats()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
with excluded_devices as (
  -- 관리자/봇/테스트 계정과 연결된 device_id를 통째로 제외 (로그인 前 익명 이벤트까지 제거)
  select distinct e.device_id
  from anonymous_events_real_users e
  join users u on u.user_id = e.user_id
  where e.device_id is not null
    and (
      u.nickname in ('류하아빠','큐트도넛')
      or lower(u.email) like '%@cloudtestlabaccounts.com'
      or lower(u.email) = 'dw.kim@willowinvt.com'
      or u.email ~ '\.[0-9]{3,}@gmail\.com'
      or u.email ~ 'batch[0-9]+@gmail\.com'
      or u.email ~ 'wave[0-9]+batch[0-9]+'
    )
),
base as (
  select e.device_id, e.user_id, e.event_name, e.platform, e.locale, e.properties, e.created_at,
         (e.created_at at time zone 'Asia/Seoul')::date as kdate
  from anonymous_events_real_users e
  where e.is_likely_bot = false
    and (e.device_id is null or e.device_id not in (select device_id from excluded_devices))
),
dev_first as (
  select device_id,
    min(kdate) as first_seen,
    min(kdate) filter (where event_name='card_learned_anonymous') as first_learn,
    min(kdate) filter (where event_name='signin_completed') as first_signin
  from base group by device_id
),
all_dates as (select distinct kdate from base),
cumulative as (
  select d.kdate,
    (select count(*) from dev_first f where f.first_seen  <= d.kdate) as devices,
    (select count(*) from dev_first f where f.first_learn <= d.kdate) as learned,
    (select count(*) from dev_first f where f.first_signin<= d.kdate) as signin
  from all_dates d
),
daily as (
  select kdate,
    count(distinct device_id) as devices,
    count(*) filter (where event_name='app_opened') as app_opened,
    count(*) filter (where event_name='card_learned_anonymous') as cards_learned,
    count(*) filter (where event_name='prompt_shown') as prompt_shown,
    count(*) filter (where event_name='signin_completed') as signin_completed
  from base group by kdate
),
dev_day as (
  -- 그 날 로그인 이벤트가 있던 디바이스(로그인) vs 없던 디바이스(익명)
  select kdate, device_id, bool_or(user_id is not null) as has_login
  from base group by kdate, device_id
),
login_daily as (
  select kdate,
    count(*) filter (where has_login) as logged_devices,
    count(*) filter (where not has_login) as anon_devices
  from dev_day group by kdate
),
credit_daily as (
  select kdate, count(*) as credits from base
  where event_name in ('tts_played','voice_preview_played') group by kdate
),
sheets as (
  select properties->>'sheet_id' as sheet_id, count(*) as cards, count(distinct device_id) as devices
  from base
  where event_name='card_learned_anonymous' and nullif(properties->>'sheet_id','') is not null
  group by properties->>'sheet_id'
),
platforms as (
  select coalesce(nullif(platform,''),'unknown') as platform, count(distinct device_id) as devices, count(*) as events
  from base group by 1
),
locales as (
  select coalesce(nullif(locale,''),'unknown') as locale, count(distinct device_id) as devices
  from base group by 1
),
dev_meta as (
  select distinct on (device_id) device_id,
    coalesce(nullif(platform,''),'unknown') as platform,
    coalesce(nullif(locale,''),'unknown') as locale
  from base order by device_id, created_at desc
),
signin_dev as (select distinct device_id from base where event_name='signin_completed'),
paying_dev as (select distinct device_id from base where event_name='credits_changed' and properties->>'reason'='purchase'),
signin_plat as (select m.platform, count(*) as devices from signin_dev s join dev_meta m using(device_id) group by 1),
signin_loc  as (select m.locale,   count(*) as devices from signin_dev s join dev_meta m using(device_id) group by 1),
paying_plat as (select m.platform, count(*) as devices from paying_dev s join dev_meta m using(device_id) group by 1),
paying_loc  as (select m.locale,   count(*) as devices from paying_dev s join dev_meta m using(device_id) group by 1),
summary as (
  select
    (select count(*) from base) as total_events,
    (select count(distinct device_id) from base) as total_devices,
    (select count(distinct device_id) from base where event_name='card_learned_anonymous') as learned_devices,
    (select count(distinct device_id) from base where event_name='signin_completed') as signin_devices
)
select jsonb_build_object(
  'summary', (select jsonb_build_object(
     'totalEvents', total_events, 'totalDevices', total_devices,
     'learnedDevices', learned_devices, 'signinDevices', signin_devices,
     'learnConversionPct',  case when total_devices>0 then round(100.0*learned_devices/total_devices)::int else 0 end,
     'signinConversionPct', case when total_devices>0 then round(100.0*signin_devices/total_devices)::int else 0 end
   ) from summary),
  'daily', coalesce((select jsonb_agg(jsonb_build_object('date',d.kdate,'devices',d.devices,'appOpened',d.app_opened,'cardsLearned',d.cards_learned,'promptShown',d.prompt_shown,'signinCompleted',d.signin_completed,'loggedDevices',coalesce(l.logged_devices,0),'anonDevices',coalesce(l.anon_devices,0)) order by d.kdate) from daily d left join login_daily l using(kdate)),'[]'::jsonb),
  'cumulativeDistinct', coalesce((select jsonb_agg(jsonb_build_object('date',kdate,'devices',devices,'learned',learned,'signin',signin) order by kdate) from cumulative),'[]'::jsonb),
  'dailyCreditUsage', coalesce((select jsonb_agg(jsonb_build_object('date',d.kdate,'credits',coalesce(c.credits,0)) order by d.kdate) from all_dates d left join credit_daily c using(kdate)),'[]'::jsonb),
  'demoSheets', coalesce((select jsonb_agg(jsonb_build_object('sheetId',sheet_id,'cards',cards,'devices',devices) order by cards desc) from sheets),'[]'::jsonb),
  'platforms', coalesce((select jsonb_agg(jsonb_build_object('platform',platform,'devices',devices,'events',events) order by events desc) from platforms),'[]'::jsonb),
  'locales', coalesce((select jsonb_agg(jsonb_build_object('locale',locale,'devices',devices) order by devices desc) from locales),'[]'::jsonb),
  'signinPlatforms', coalesce((select jsonb_agg(jsonb_build_object('platform',platform,'devices',devices) order by devices desc) from signin_plat),'[]'::jsonb),
  'signinLocales', coalesce((select jsonb_agg(jsonb_build_object('locale',locale,'devices',devices) order by devices desc) from signin_loc),'[]'::jsonb),
  'payingPlatforms', coalesce((select jsonb_agg(jsonb_build_object('platform',platform,'devices',devices) order by devices desc) from paying_plat),'[]'::jsonb),
  'payingLocales', coalesce((select jsonb_agg(jsonb_build_object('locale',locale,'devices',devices) order by devices desc) from paying_loc),'[]'::jsonb)
)
$function$;
