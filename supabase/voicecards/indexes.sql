-- VoiceCards 성능 인덱스.
-- idx_anon_events_user_created: vc_user_latest_meta 의 유저별 distinct-on(order by user_id, created_at desc)을
--   정렬 대신 인덱스 스캔으로 → vc_user_latest_meta 2.5s → 125ms.
-- apply: 원격 project juyitkynbavhllyjidhz
CREATE INDEX IF NOT EXISTS idx_anon_events_user_created
  ON public.anonymous_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
