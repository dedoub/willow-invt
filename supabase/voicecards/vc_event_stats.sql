-- ============================================================================
-- VoiceCards 익명 이벤트 통계 집계 함수 (source of truth)
-- ----------------------------------------------------------------------------
-- 대상 프로젝트: voice-cards (juyitkynbavhllyjidhz) — 메인 willow-invt DB 아님.
-- 이 파일이 vc_event_stats() 의 정본. 원격에 apply 후 반드시 이 파일도 갱신할 것.
-- excluded_devices: 관리자/봇/테스트 계정 device_id 통째 제외 (로그인 前 익명 이벤트까지).
-- 2026-07-06: platforms/locales 옆에 country 분포(countries/signinCountries/payingCountries) 추가.
--   country 는 IP 백필(scripts/voicecards-country-backfill.ts). 미백필/미상은 'unknown'.
-- 주의: base CTE 를 MATERIALIZED 로 바꾸면 오히려 느려짐(회귀) → 인라인 유지 (~890ms, 60초 캐시).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.vc_event_stats()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
with excluded_devices as (
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
  select e.device_id, e.user_id, e.event_name, e.platform, e.locale, e.country, e.properties, e.created_at,
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
    -- 활동 디바이스: learning_session_ended(앱 백그라운드/종료 시 발화하는 세션-종료
    -- 이벤트, 실제 학습 아님)만 있는 디바이스는 활동으로 치지 않는다. (juanagil.u 케이스)
    count(distinct device_id) filter (where event_name <> 'learning_session_ended') as devices,
    count(*) filter (where event_name='app_opened') as app_opened,
    count(*) filter (where event_name='card_learned_anonymous') as cards_learned,
    count(*) filter (where event_name='prompt_shown') as prompt_shown,
    count(*) filter (where event_name='signin_completed') as signin_completed
  from base group by kdate
),
dev_day as (
  -- 로그인/익명 분리도 동일 기준: 세션-종료만 있는 디바이스는 그 날 활동으로 안 침.
  select kdate, device_id, bool_or(user_id is not null) as has_login
  from base where event_name <> 'learning_session_ended' group by kdate, device_id
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
countries as (
  select coalesce(nullif(country,''),'unknown') as country, count(distinct device_id) as devices
  from base group by 1
),
dev_meta as (
  select distinct on (device_id) device_id,
    coalesce(nullif(platform,''),'unknown') as platform,
    coalesce(nullif(locale,''),'unknown') as locale,
    coalesce(nullif(country,''),'unknown') as country
  from base order by device_id, created_at desc
),
signin_dev as (select distinct device_id from base where event_name='signin_completed'),
paying_dev as (select distinct device_id from base where event_name='credits_changed' and properties->>'reason'='purchase'),
signin_plat as (select m.platform, count(*) as devices from signin_dev s join dev_meta m using(device_id) group by 1),
signin_loc  as (select m.locale,   count(*) as devices from signin_dev s join dev_meta m using(device_id) group by 1),
signin_ctry as (select m.country,  count(*) as devices from signin_dev s join dev_meta m using(device_id) group by 1),
paying_plat as (select m.platform, count(*) as devices from paying_dev s join dev_meta m using(device_id) group by 1),
paying_loc  as (select m.locale,   count(*) as devices from paying_dev s join dev_meta m using(device_id) group by 1),
paying_ctry as (select m.country,  count(*) as devices from paying_dev s join dev_meta m using(device_id) group by 1),
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
  'countries', coalesce((select jsonb_agg(jsonb_build_object('country',country,'devices',devices) order by devices desc) from countries),'[]'::jsonb),
  'signinPlatforms', coalesce((select jsonb_agg(jsonb_build_object('platform',platform,'devices',devices) order by devices desc) from signin_plat),'[]'::jsonb),
  'signinLocales', coalesce((select jsonb_agg(jsonb_build_object('locale',locale,'devices',devices) order by devices desc) from signin_loc),'[]'::jsonb),
  'signinCountries', coalesce((select jsonb_agg(jsonb_build_object('country',country,'devices',devices) order by devices desc) from signin_ctry),'[]'::jsonb),
  'payingPlatforms', coalesce((select jsonb_agg(jsonb_build_object('platform',platform,'devices',devices) order by devices desc) from paying_plat),'[]'::jsonb),
  'payingLocales', coalesce((select jsonb_agg(jsonb_build_object('locale',locale,'devices',devices) order by devices desc) from paying_loc),'[]'::jsonb),
  'payingCountries', coalesce((select jsonb_agg(jsonb_build_object('country',country,'devices',devices) order by devices desc) from paying_ctry),'[]'::jsonb)
)
$function$;
