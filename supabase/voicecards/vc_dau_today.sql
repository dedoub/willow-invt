-- ============================================================================
-- VoiceCards 오늘 활동자 (일별 활동자 차트의 마지막 칸)
-- ----------------------------------------------------------------------------
-- 대상 프로젝트: voice-cards (juyitkynbavhllyjidhz) — 메인 willow-invt DB 아님.
-- 이 파일이 vc_dau_today() 의 정본. 원격에 apply 후 반드시 이 파일도 갱신할 것.
--
-- 왜 따로 두나: 일별 활동자 차트는 vc_event_stats() 를 쓰고, 그건 mv_event_stats
-- (매시 :14 갱신)가 mv_real_users(매시 :07 동기)를 읽어 만든 스냅샷이다. 그 위에 API 가
-- 1시간 캐시를 또 얹어서, 오늘 칸은 최대 두 시간까지 제자리였다. 하루치 막대가 자라는 걸
-- 보려고 여는 차트인데 오전 내내 같은 높이였다(CEO 2026-09-18).
--
-- 그렇다고 35초짜리 mv_event_stats 리프레시를 15분마다 돌리면 디스크 IO 예산이 상한다.
-- 그래서 오늘 하루치만 원본에서 바로 센다 — 오늘 이벤트는 천 단위라 1초 안쪽이다.
-- 어제까지는 그대로 MV 가 정본이고, 자정이 지나면 이 칸도 MV 값으로 덮인다.
--
-- 정의는 vc_event_stats() 의 daily/login_daily 와 같게 맞춘다:
--   * 활동 기기 = 그날 learning_session_ended 아닌 이벤트가 하나라도 있는 기기(canonical).
--   * 로그인 = 이벤트에 user_id 가 있고 users 행도 있는 기기. 고아 계정은 비로그인으로 센다.
--   * 로그인·신규 = 그 계정이 오늘 가입(users.created_at KST). 기기·신규 = 그 기기의 첫 활동일이 오늘.
--   * 제외 = 관리자·테스트 계정 기기, 애플 IP(심사 트래픽), 출시 상한보다 높은 iOS 빌드(심사·TestFlight).
--
-- 두 군데서 MV 와 다르게 볼 수 있고, 둘 다 자정에 저절로 맞는다:
--   1) 관리자 기기 판정을 오늘 이벤트의 user_id 로만 한다. MV 는 그 기기의 전 기간을 본다.
--      로그아웃 상태로만 쓴 관리자 기기 하나가 오늘 칸에 더해질 수 있다.
--   2) 기기의 첫 활동일을 mv_device_journeys(매시 :11)에서 읽는다. 어제 마지막 갱신 뒤
--      처음 나타난 기기는 오늘 '신규'로 잡힌다.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.vc_dau_today()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
with k as (
  select ((now() at time zone 'Asia/Seoul')::date) as kdate,
         (((now() at time zone 'Asia/Seoul')::date)::timestamp at time zone 'Asia/Seoul') as ts
),
-- 관리자·테스트 계정. vc_event_stats() 의 excluded_devices 와 같은 목록.
excluded_users as (
  select u.user_id
  from users u
  where u.nickname in ('류하아빠','큐트도넛')
     or lower(u.email) like '%@cloudtestlabaccounts.com'
     or lower(u.email) = 'dw.kim@willowinvt.com'
     or lower(u.email) = 'qwe.gpt22022@gmail.com'
     or u.email ~ '\.[0-9]{5,}@gmail\.com'
     or u.email ~ 'batch[0-9]+@gmail\.com'
     or u.email ~ 'wave[0-9]+batch[0-9]+'
),
-- 출시 상한 — 실사용자가 로그인한 iOS 최고 버전. 이보다 높으면 심사/TestFlight 빌드.
ceiling as (select public.vc_released_ios_ceiling() as ver),
ev as (
  select e.device_id, e.user_id, e.event_name, e.platform, e.app_version, e.ip_address
  from anonymous_events_real_users e, k
  where e.created_at >= k.ts
    and coalesce(e.is_likely_bot, false) = false
    and e.device_id is not null
    and e.event_name <> 'learning_session_ended'
),
-- 기기 한 대가 한 행. coalesce 를 빼면 안 된다 — user_id 나 ip 가 전부 null 인 기기는
-- bool_or 가 null 을 내고, 그 뒤 not null 이 null 이 되어 그 기기가 통째로 사라진다.
dev as (
  select device_id,
    bool_or(user_id is not null) as has_login,
    max(user_id) as uid,
    coalesce(bool_or(user_id in (select user_id from excluded_users)), false) as is_admin,
    coalesce(bool_or(ip_address << '17.0.0.0/8'::inet
                  or ip_address << '144.178.0.0/16'::inet
                  or ip_address << '139.178.128.0/18'::inet), false) as apple_ip,
    coalesce(bool_or(platform = 'ios'
                 and app_version ~ '^[0-9]+(\.[0-9]+)*$'
                 and (select ver from ceiling) is not null
                 and string_to_array(app_version, '.')::int[]
                     > string_to_array((select ver from ceiling), '.')::int[]), false) as review_build
  from ev
  group by device_id
),
flags as (
  select
    (d.has_login and u.user_id is not null) as has_login,
    (u.user_id is not null and (u.created_at at time zone 'Asia/Seoul')::date = (select kdate from k)) as is_new,
    (j.device_id is null or j.first_seen_kst = (select kdate from k)) as is_new_device
  from dev d
  left join users u on u.user_id = d.uid
  left join mv_device_journeys j on j.device_id = d.device_id
  where not d.is_admin and not d.apple_ip and not d.review_build
)
select jsonb_build_object(
  'date', (select kdate from k),
  'devices', count(*),
  'loggedDevices', count(*) filter (where has_login),
  'newLoggedDevices', count(*) filter (where has_login and is_new),
  'memberLoggedDevices', count(*) filter (where has_login and not is_new),
  'anonDevices', count(*) filter (where not has_login),
  'newDeviceDevices', count(*) filter (where not has_login and is_new_device),
  'memberDeviceDevices', count(*) filter (where not has_login and not is_new_device),
  'asOf', now()
)
from flags;
$function$;

-- 분석 함수는 service_role 만 부른다 (revoke_public_execute_on_analytics_functions 와 같은 규칙).
REVOKE ALL ON FUNCTION public.vc_dau_today() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vc_dau_today() TO service_role;
