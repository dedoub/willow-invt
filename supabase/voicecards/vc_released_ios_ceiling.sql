-- ============================================================================
-- VoiceCards 출시 iOS 버전 상한 (source of truth)
-- ----------------------------------------------------------------------------
-- 대상 프로젝트: voice-cards (juyitkynbavhllyjidhz) — 메인 willow-invt DB 아님.
-- 반환: 실사용자가 쓸 수 있는 최고 iOS app_version(semver). 이보다 높은 버전은 App Store
--   심사/TestFlight 미출시 빌드로 보고 통계에서 뺀다.
-- 두 갈래 중 높은 쪽을 쓴다:
--   (1) 개발자/테스트 계정을 뺀 실사용자가 **로그인한** 최고 버전.
--   (2) **퍼짐**으로 본 출시 — (1)보다 높으면서 기기 3대 이상·나라 2개 이상인 최고 버전.
-- (2)가 2026-09-18 에 붙었다. 1.1.155 가 09-17 08:48 UTC 에 App Store 라이브가 됐는데
-- 27시간 동안 그 버전 사용자가 아무도 로그인하지 않아, 실사용자 기기가 통째로 심사 빌드로
-- 몰려 일별 활동자에서 사라졌다(09-17 26 → 실제 28, 09-18 8 → 실제 12). 로그인 하나에만
-- 기대면 출시마다 이 구멍이 다시 열린다. 심사 트래픽은 애플 IP 대역에서 먼저 걸러지고,
-- 남는 것도 한두 대·한 나라였다(1.1.154 는 2대 1나라, 1.1.151·1.1.149 는 1대 1나라).
-- excluded_devices 정의는 vc_event_stats.sql 과 동일해야 한다(두 곳이 같은 상한을 공유).
-- 소비처: vc_event_stats_live() 의 ios_ceiling(이 함수를 부른다) + vc_dau_today() +
--   src/lib/voicecards-server.ts getVoicecardsAnonymousStats() 저니 필터.
--
-- 2026-09-07 성능: 6,818ms → 89~152ms.
--   정렬 키가 string_to_array(app_version,'.')::int[] 라 텍스트 인덱스로는 순서가 안 맞고
--   ('1.1.9' > '1.1.10' 이 텍스트 정렬) 378k행을 매번 seq scan + 정렬했다.
--   그 표현식을 그대로 내림차순 색인하니 Index Only Scan 이 첫 행에서 멈춘다(Heap Fetches 0).
--   부분 인덱스 술어에 정규식을 포함해야 비숫자 버전에 int[] 캐스팅이 시도되지 않는다
--   (빠뜨리면 인덱스 생성 자체가 실패한다).
--   본문의 coalesce(is_likely_bot,false)=false 를 is_likely_bot IS NOT TRUE 로 바꾼 것은
--   의미가 아니라 표기 때문이다 — 부분 인덱스 술어와 문자 그대로 맞아야 플래너가 인덱스를 쓴다.
--   결과가 기존 로직과 동일함을 대조 확인했다(둘 다 1.1.150).
-- ============================================================================
create or replace function public.vc_released_ios_ceiling()
returns text
language sql
stable
as $$
  with excluded_devices as (
    select distinct e.device_id from mv_real_users e join users u on u.user_id=e.user_id
    where e.device_id is not null and (
      u.nickname in ('류하아빠','큐트도넛') or lower(u.email) like '%@cloudtestlabaccounts.com'
      or lower(u.email)='dw.kim@willowinvt.com' or lower(u.email)='qwe.gpt22022@gmail.com'
      or u.email ~ '\.[0-9]{5,}@gmail\.com' or u.email ~ 'batch[0-9]+@gmail\.com' or u.email ~ 'wave[0-9]+batch[0-9]+')),
  -- (1) 실사용자가 로그인한 최고 버전.
  by_login as (
    select app_version from mv_real_users
    where platform='ios' and user_id is not null and is_likely_bot is not true
      and app_version ~ '^[0-9]+(\.[0-9]+)*$'
      and (device_id is null or device_id not in (select device_id from excluded_devices))
    order by string_to_array(app_version,'.')::int[] desc
    limit 1
  ),
  -- (2) 퍼짐으로 본 출시. 로그인 상한 위쪽으로만 본다 — 전 버전을 group by 하면 iOS 45만 행을
  -- 통째로 훑어 7.6초가 걸렸고, 상한이 올라갈 수 있는 구간은 어차피 그 위뿐이다(570ms).
  by_spread as (
    select app_version from mv_real_users
    where platform='ios' and is_likely_bot is not true
      and app_version ~ '^[0-9]+(\.[0-9]+)*$'
      and string_to_array(app_version,'.')::int[]
          > (select string_to_array(app_version,'.')::int[] from by_login)
      and (device_id is null or device_id not in (select device_id from excluded_devices))
    group by app_version
    having count(distinct device_id) >= 3 and count(distinct country) >= 2
    order by string_to_array(app_version,'.')::int[] desc
    limit 1
  )
  select app_version
  from (select app_version from by_login union all select app_version from by_spread) s
  order by string_to_array(app_version,'.')::int[] desc
  limit 1
$$;
-- 퍼짐 판정용 인덱스. 위 인덱스는 술어에 user_id is not null 이 있어 비로그인 행을 못 덮는다.
-- 퍼짐은 비로그인 기기를 세는 것이라 같은 정렬 키로 하나 더 둔다 — 로그인 상한 위쪽만 훑고 멈춘다.
create index concurrently if not exists mv_real_users_ios_version_spread
on public.mv_real_users (((string_to_array(app_version, '.'))::int[]) desc)
include (device_id, country)
where platform = 'ios' and is_likely_bot is not true
  and app_version ~ '^[0-9]+(\.[0-9]+)*$';

-- 정렬 표현식 인덱스 — 이게 있어야 위 order by 가 스캔을 첫 행에서 멈춘다.
create index concurrently if not exists mv_real_users_ios_ceiling
on public.mv_real_users (((string_to_array(app_version, '.'))::int[]) desc)
include (device_id, app_version)
where platform = 'ios' and user_id is not null and is_likely_bot is not true
  and app_version ~ '^[0-9]+(\.[0-9]+)*$';

-- excluded_devices CTE 커버링 인덱스. 관리자·봇 20명의 이벤트 83k행에서 device_id 만
-- 뽑는데 (user_id, event_name) 인덱스에 device_id 가 없어 매 행 heap fetch 가 붙었다.
-- 같은 CTE 가 vc_event_stats_live·vc_device_journeys_live 에도 있어 함께 빨라진다.
create index concurrently if not exists mv_real_users_user_device
on public.mv_real_users (user_id) include (device_id)
where user_id is not null and device_id is not null;

-- 실제 배포 권한은 service_role 만이다(2026-06-21 RLS 하드닝으로 anon 제거됨).
-- 이 파일에 남아 있던 `grant ... to anon, authenticated` 는 그 시점부터 실제와 달랐다.
revoke all on function public.vc_released_ios_ceiling() from public, anon, authenticated;
grant execute on function public.vc_released_ios_ceiling() to postgres, service_role;
