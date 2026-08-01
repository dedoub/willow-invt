-- VoiceCards 성능 인덱스.
-- idx_anon_events_user_created: vc_user_latest_meta 의 유저별 distinct-on(order by user_id, created_at desc)을
--   정렬 대신 인덱스 스캔으로 → vc_user_latest_meta 2.5s → 125ms.
-- apply: 원격 project juyitkynbavhllyjidhz
CREATE INDEX IF NOT EXISTS idx_anon_events_user_created
  ON public.anonymous_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- idx_anon_events_cost_aware_version: vc_user_rollup 의 cost_aware_versions CTE 는
--   "과금 신호(fractional_cost)를 보낸 적 있는 앱 버전"을 찾는다. 결과는 14개짜리 목록인데
--   인덱스가 없으면 호출마다 anonymous_events 13만행을 통째로 훑었다 (143ms → 12ms).
CREATE INDEX IF NOT EXISTS idx_anon_events_cost_aware_version
  ON public.anonymous_events (app_version)
  WHERE properties ? 'fractional_cost';
