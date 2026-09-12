-- ============================================================================
-- 대시보드 "데이터 기준 시각" (2026-09-12)
-- 대상 프로젝트: voice-cards (juyitkynbavhllyjidhz) — 메인 willow-invt DB 아님.
-- ----------------------------------------------------------------------------
-- 왜: 보이스카드 카드 푸터의 "집계 HH:MM" 은 API 가 계산을 돌린 시각이었다. 새로고침을
--     누르면 캐시를 건너뛰고 다시 계산하므로 그 시각은 곧 버튼을 누른 시각이 되고,
--     정작 숫자의 원천(mv_real_users 증분 + 집계 MV 5개, 매시 :07~:14 갱신)이 언제
--     것인지는 알 길이 없었다. 원천 워터마크를 카드에 적기 위한 배선이다.
--
-- 무엇: (1) refresh_vc_mv(mv) 가 갱신에 성공하면 vc_sync_state 에 그 MV 의 행을 남긴다.
--          watermark = 갱신 시점의 mv_real_users 워터마크(그 MV 가 반영한 원천 범위),
--          last_sync_at = now().
--      (2) vc_data_as_of() — 대시보드가 읽는 6개(mv_real_users + 집계 MV 5개)의 워터마크
--          중 최솟값. 어느 하나라도 갱신이 실패해 밀려 있으면 그만큼 과거로 물러난다.
--          anonymous_device_canonical 은 :05(동기화 전)에 도니 늘 한 시간 전 워터마크를
--          갖는다 — 기록은 하되 as-of 계산에서는 뺀다.
--
-- 함수 정의는 DB 에 적용된 것이 정본(incremental_real_users.sql ④ 와 같은 규칙).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.refresh_vc_mv(mv text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE lock_key bigint; src_wm timestamptz;
BEGIN
  IF mv = 'mv_real_users' THEN
    RAISE EXCEPTION 'mv_real_users is an incrementally synced table — call vc_sync_real_users() instead';
  END IF;
  IF mv NOT IN ('anonymous_device_canonical','mv_user_latest_meta','mv_device_journeys',
                'mv_user_rollup','mv_user_activity_deltas','mv_event_stats') THEN
    RAISE EXCEPTION 'refresh_vc_mv: unknown materialized view %', mv;
  END IF;
  lock_key := hashtext('refresh_vc_mv:' || mv)::bigint;
  IF NOT pg_try_advisory_lock(lock_key) THEN
    RAISE NOTICE 'refresh_vc_mv(%) already running, skipping this tick', mv;
    RETURN;
  END IF;
  EXECUTE format('refresh materialized view concurrently public.%I', mv);

  -- 이 MV 가 반영한 원천 범위 = 지금의 mv_real_users 워터마크. 대시보드 "데이터 기준" 표시용.
  SELECT watermark INTO src_wm FROM vc_sync_state WHERE name = 'mv_real_users';
  INSERT INTO vc_sync_state (name, watermark, last_sync_at)
  VALUES (mv, COALESCE(src_wm, '-infinity'), now())
  ON CONFLICT (name) DO UPDATE SET watermark = EXCLUDED.watermark, last_sync_at = EXCLUDED.last_sync_at;

  PERFORM pg_advisory_unlock(lock_key);
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_advisory_unlock(lock_key);
  RAISE;
END $function$;

-- 대시보드가 읽는 계통의 원천 반영 시각. 행이 아직 없는 MV 가 있으면 NULL(표시 생략).
CREATE OR REPLACE FUNCTION public.vc_data_as_of()
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE WHEN count(*) = 6 THEN min(watermark) END
  FROM vc_sync_state
  WHERE name IN ('mv_real_users','mv_user_latest_meta','mv_device_journeys',
                 'mv_user_rollup','mv_user_activity_deltas','mv_event_stats')
    AND watermark > '-infinity';
$$;

-- 시각 하나뿐이라 노출 위험이 없다. 서버는 service_role, 폴백은 anon 키라 둘 다 연다.
REVOKE ALL ON FUNCTION public.vc_data_as_of() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vc_data_as_of() TO anon, authenticated, service_role;

-- 최초 1회 씨앗: 오늘 13:07Z 동기화 뒤 13:10~13:14Z 갱신 5건이 전부 성공했으므로
-- 다섯 MV 모두 현재 mv_real_users 워터마크를 반영하고 있다. 다음 정각부터는 함수가 채운다.
INSERT INTO vc_sync_state (name, watermark, last_sync_at)
SELECT m, s.watermark, s.last_sync_at
FROM unnest(ARRAY['mv_user_latest_meta','mv_device_journeys','mv_user_rollup',
                  'mv_user_activity_deltas','mv_event_stats']) AS m
CROSS JOIN (SELECT watermark, last_sync_at FROM vc_sync_state WHERE name = 'mv_real_users') s
ON CONFLICT (name) DO NOTHING;
