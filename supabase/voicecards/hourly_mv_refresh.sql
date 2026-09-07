-- ⚠️ 폐기(2026-09-07): 아래 refresh_vc_mvs() / cron 잡 3 서술은 더 이상 유효하지 않다.
--    mv_real_users 는 실테이블 + 증분 갱신으로 바뀌었고 크론은 MV 별로 쪼개졌다.
--    정본: supabase/voicecards/incremental_real_users.sql

-- VoiceCards 분석 대시보드 Materialized View 갱신 주기 최적화.
-- 대상 프로젝트: voice-cards (juyitkynbavhllyjidhz).
-- 활성화·결제 알림은 별도 원본 조회를 사용하므로 이 변경의 영향을 받지 않는다.
--
-- 2026-08-16: 여기서 정한 매시 정각은 mv_dashboard_aggregates.sql 에서 15분으로 대체됐다.
-- 집계를 MV 로 굳혀 갱신 한 번이 훨씬 싸졌고, 그만큼 주기를 당겨도 부하가 늘지 않는다.

select cron.alter_job(
  3,
  schedule => '0 * * * *',
  command => 'SELECT public.refresh_vc_mvs();'
);
