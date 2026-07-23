-- ============================================================================
-- mv_user_latest_meta — 유저별 최신 메타(앱버전/플랫폼/언어/국가/최근이벤트) 롤업
-- ----------------------------------------------------------------------------
-- 대상 프로젝트: voice-cards (juyitkynbavhllyjidhz) — 메인 willow-invt DB 아님.
-- 배경: vc_user_latest_meta() 가 anonymous_events(9.4만행)를 distinct-on 2회 스캔(~2.2s)해
--   경합 시 스파이크 → 사용자 테이블의 플랫폼/앱버전/언어/국가 4열이 자주 빈칸 캐시됐다.
--   이 결과를 미리 계산해 저장하고 함수는 읽기만(~0.065ms). 정의는 기존 라이브 쿼리와 동일
--   (anonymous_events 기준) → 결과 완전 동일, ≤15분 staleness (메타는 거의 안 바뀌어 무방).
-- 리프레시: cron 잡 3 이 refresh_vc_mvs() 로 mv_real_users 다음에 CONCURRENTLY 갱신(15분).
-- 재적용(정의 변경) 시 함수가 참조하므로 drop 전 vc_user_latest_meta() 를 라이브 정의로 되돌릴 것.
-- ============================================================================
create materialized view if not exists public.mv_user_latest_meta as
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
  left join ctry c using(user_id);

-- REFRESH ... CONCURRENTLY 용 유니크 인덱스 (user당 1행)
create unique index if not exists mv_user_latest_meta_user on public.mv_user_latest_meta(user_id);

-- mv_real_users + mv_user_latest_meta 를 순차 CONCURRENTLY 리프레시 (동시 경합 방지)
create or replace function public.refresh_vc_mvs() returns void
 language plpgsql
as $function$
begin
  refresh materialized view concurrently public.mv_real_users;
  refresh materialized view concurrently public.mv_user_latest_meta;
end
$function$;

-- 기존 cron 잡 3(mv_real_users 단독 리프레시)을 위 함수 호출로 교체 (15분 주기 유지)
select cron.alter_job(3, command => 'SELECT public.refresh_vc_mvs();');
