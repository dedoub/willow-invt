-- 사용자별 최신 앱버전/플랫폼/언어/국가 + 최근 이벤트 시각 (user당 1행)
-- 최적화(2026-07-07): correlated subquery(2.5s) → base 테이블 distinct-on 2회(125ms).
--   country 는 base anonymous_events 에서 최신 non-null 을 별도 distinct-on 으로.
--   idx_anon_events_user_created (indexes.sql) 가 distinct-on 을 인덱스 스캔으로 만듦.
-- apply: 원격 project juyitkynbavhllyjidhz
CREATE OR REPLACE FUNCTION public.vc_user_latest_meta()
 RETURNS TABLE(user_id text, app_version text, platform text, locale text, country text, last_event timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $function$
  with meta as (
    select distinct on (user_id) user_id, app_version, platform, locale, created_at as last_event
    from anonymous_events
    where user_id is not null and app_version is not null
    order by user_id, created_at desc
  ),
  ctry as (
    select distinct on (user_id) user_id, country
    from anonymous_events
    where user_id is not null and country is not null
    order by user_id, created_at desc
  )
  select m.user_id, m.app_version, m.platform, m.locale, c.country, m.last_event
  from meta m
  left join ctry c using(user_id)
$function$;
