-- ============================================================================
-- VoiceCards 출시 iOS 버전 상한 (source of truth)
-- ----------------------------------------------------------------------------
-- 대상 프로젝트: voice-cards (juyitkynbavhllyjidhz) — 메인 willow-invt DB 아님.
-- 반환: 개발자/테스트 계정(excluded_devices)을 제외한 실사용자가 로그인한 iOS 기기의
--   최고 app_version(semver). App Store 심사/TestFlight 미출시 빌드는 이보다 높은 버전이라
--   심사봇 판정에 쓴다. 새 버전이 출시돼 실사용자가 로그인하면 상한이 자동 상승 → 제출마다
--   device_id 등록 불필요.
-- excluded_devices 정의는 vc_event_stats.sql 과 동일해야 한다(두 곳이 같은 상한을 공유).
-- 소비처: vc_event_stats() 의 ios_ceiling(인라인 동일 로직) + src/lib/voicecards-server.ts
--   getVoicecardsAnonymousStats() 저니 필터(이 RPC 호출).
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
      or u.email ~ '\.[0-9]{5,}@gmail\.com' or u.email ~ 'batch[0-9]+@gmail\.com' or u.email ~ 'wave[0-9]+batch[0-9]+'))
  select app_version from mv_real_users
  where platform='ios' and user_id is not null and coalesce(is_likely_bot,false)=false
    and app_version ~ '^[0-9]+(\.[0-9]+)*$'
    and (device_id is null or device_id not in (select device_id from excluded_devices))
  order by string_to_array(app_version,'.')::int[] desc
  limit 1
$$;
revoke all on function public.vc_released_ios_ceiling() from public;
grant execute on function public.vc_released_ios_ceiling() to anon, authenticated, service_role;
