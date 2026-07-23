-- 사용자별 최신 앱버전/플랫폼/언어/국가 + 최근 이벤트 시각 (user당 1행)
-- 2026-07-23: 라이브 distinct-on(anonymous_events 9.4만행 2회 스캔, ~2.2s, 경합 시 스파이크로
--   meta 4열이 자주 빈칸 캐시되던 문제) → mv_user_latest_meta 롤업(materialized) 읽기로 전환.
--   함수는 이제 183행 MV 를 그대로 조회 → ~0.065ms. MV 정의·리프레시는 mv_user_latest_meta.sql 참조.
-- apply: 원격 project juyitkynbavhllyjidhz
CREATE OR REPLACE FUNCTION public.vc_user_latest_meta()
 RETURNS TABLE(user_id text, app_version text, platform text, locale text, country text, last_event timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $function$
  select user_id, app_version, platform, locale, country, last_event
  from public.mv_user_latest_meta
$function$;
