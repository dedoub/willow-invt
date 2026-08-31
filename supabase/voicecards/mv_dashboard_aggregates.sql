-- VoiceCards 대시보드 집계 구체화 (2026-08-16)
-- 대상 프로젝트: voice-cards (juyitkynbavhllyjidhz).
--
-- 문제:
--   vc_device_journeys(뷰) · vc_event_stats() · vc_user_rollup() · vc_user_activity_deltas() 가
--   각각 호출될 때마다 mv_real_users(84MB)를 처음부터 전체 스캔했다. 대시보드를 한 번 열면
--   넷이 전부 도는데, vc_device_journeys 는 한 로드에 세 번 조회되기까지 했다.
--
--   pg_stat_statements 호출당 평균:
--     vc_device_journeys 전체 조회   11,906 ms  (최대 29,215)
--     vc_event_stats()                6,112 ms  (최대 29,662, 누적 11시간)
--     vc_user_rollup()                5,665 ms  (최대 29,785)
--     vc_user_activity_deltas()       2,699 ms  (최대 24,289)
--
-- 핵심:
--   넷 다 원본이 mv_real_users 하나뿐이다. 그 MV 는 주기 갱신이라 결과는 이미 갱신 주기만큼
--   오래된 값이었다(측정 시점 실시간 대비 51분 지연). 즉 볼 때마다 12초씩 들여 같은 답을
--   다시 구하고 있었다 — 굳혀도 잃을 신선도가 없다.
--
-- 처리:
--   계산 본체는 *_live 이름으로 남기고, 앱이 부르는 이름(vc_*)은 MV 를 읽는 얇은 껍데기로
--   바꿨다. 앱 코드는 그대로다. 갱신은 refresh_vc_mvs() 가 mv_real_users 직후에 함께 한다.
--
-- 결과: vc_device_journeys 11,906ms → 0.34ms, vc_event_stats() 6,112ms → 0.65ms.
--       갱신 주기는 매시 정각 → 15분으로 당겼다(신선도도 같이 개선).
--
-- 되돌리려면: vc_* 껍데기를 drop 하고 *_live 를 원래 이름으로 rename 하면 된다.

-- ⚠️ 2026-08-31 — 이 파일은 **1회성 이관 기록**이다. 다시 적용하지 말 것 (RENAME 이 실패한다).
--   여기서 세운 배선이 조용히 풀린 적이 있다: vc_user_rollup.sql / vc_user_activity_deltas.sql 이
--   자기 이름의 함수를 무거운 계산으로 create or replace 하고 있어서, 지표를 고치려고 그 파일을
--   적용할 때마다 껍데기가 통째로 덮였다(2026-08-30). 대시보드는 다시 매 호출마다 mv_real_users
--   11만행을 재집계했고 vc_user_rollup() 은 콜드 12.8초 / 웜 2.9초로 돌아갔다.
--   그래서 두 파일이 이제 _live + MV + 껍데기를 한 세트로 정의한다 — 파일 하나만 적용해도
--   배선이 유지된다. 계산식은 그 파일에서 고치고, 이 파일은 읽기 전용 기록으로 둔다.

-- ── vc_device_journeys ───────────────────────────────────────────────────────
ALTER VIEW public.vc_device_journeys RENAME TO vc_device_journeys_live;

CREATE MATERIALIZED VIEW public.mv_device_journeys AS
  SELECT * FROM public.vc_device_journeys_live;
CREATE UNIQUE INDEX mv_device_journeys_device_id_idx
  ON public.mv_device_journeys (device_id);   -- REFRESH ... CONCURRENTLY 전제조건

CREATE VIEW public.vc_device_journeys AS
  SELECT * FROM public.mv_device_journeys;

GRANT SELECT ON public.vc_device_journeys      TO anon, authenticated, service_role;
GRANT SELECT ON public.vc_device_journeys_live TO service_role;
GRANT SELECT ON public.mv_device_journeys      TO anon, authenticated, service_role;

-- 아래 세 함수는 테이블명을 스키마 없이 참조해 호출자의 search_path 에 의존한다.
-- 갱신 작업(pg_cron)에서도 안전하도록 함수에 search_path 를 고정한다.

-- ── vc_user_rollup ───────────────────────────────────────────────────────────
ALTER FUNCTION public.vc_user_rollup() RENAME TO vc_user_rollup_live;
ALTER FUNCTION public.vc_user_rollup_live() SET search_path = public, pg_temp;

CREATE MATERIALIZED VIEW public.mv_user_rollup AS
  SELECT * FROM public.vc_user_rollup_live();
CREATE UNIQUE INDEX mv_user_rollup_user_id_idx ON public.mv_user_rollup (user_id);

CREATE FUNCTION public.vc_user_rollup()
RETURNS TABLE(user_id text, listen_count bigint, premium_listen_count bigint,
              free_listen_count bigint, unclassified_listen_count bigint, flip_count bigint,
              credits_spent bigint, purchased_credits bigint, premium_voice boolean,
              ai_feature boolean, banner_tap boolean, gated boolean,
              last_intent timestamp with time zone)
LANGUAGE sql STABLE SET search_path = public, pg_temp
AS $$ SELECT r.* FROM public.mv_user_rollup r $$;

-- ── vc_user_activity_deltas ──────────────────────────────────────────────────
ALTER FUNCTION public.vc_user_activity_deltas() RENAME TO vc_user_activity_deltas_live;
ALTER FUNCTION public.vc_user_activity_deltas_live() SET search_path = public, pg_temp;

CREATE MATERIALIZED VIEW public.mv_user_activity_deltas AS
  SELECT * FROM public.vc_user_activity_deltas_live();
CREATE UNIQUE INDEX mv_user_activity_deltas_user_id_idx
  ON public.mv_user_activity_deltas (user_id);

CREATE FUNCTION public.vc_user_activity_deltas()
RETURNS TABLE(user_id text, cards_today bigint, attempts_today bigint, listen_today bigint,
              flips_today bigint, spent_today bigint, active_days_7d integer,
              purchased_today bigint, balance_delta_today bigint, sheets_delta_today bigint)
LANGUAGE sql STABLE SET search_path = public, pg_temp
AS $$ SELECT d.* FROM public.mv_user_activity_deltas d $$;

-- ── vc_event_stats (jsonb 스칼라) ─────────────────────────────────────────────
ALTER FUNCTION public.vc_event_stats() RENAME TO vc_event_stats_live;
ALTER FUNCTION public.vc_event_stats_live() SET search_path = public, pg_temp;

-- 1행 MV. CONCURRENTLY 갱신 전제조건인 유니크 인덱스용으로 상수 키를 둔다.
CREATE MATERIALIZED VIEW public.mv_event_stats AS
  SELECT 1 AS id, public.vc_event_stats_live() AS payload;
CREATE UNIQUE INDEX mv_event_stats_id_idx ON public.mv_event_stats (id);

CREATE FUNCTION public.vc_event_stats()
RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public, pg_temp
AS $$ SELECT payload FROM public.mv_event_stats WHERE id = 1 $$;

GRANT EXECUTE ON FUNCTION public.vc_user_rollup(), public.vc_user_activity_deltas(),
                          public.vc_event_stats() TO anon, authenticated, service_role;
GRANT SELECT ON public.mv_user_rollup, public.mv_user_activity_deltas, public.mv_event_stats
  TO anon, authenticated, service_role;

-- ── 갱신 ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.refresh_vc_mvs()
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- 15분 주기로 당겼으므로 이전 갱신이 아직 돌고 있으면 겹쳐 쌓이지 않게 건너뛴다.
  -- (과거 최대 119초까지 걸린 적이 있다. 세션 종료 시 잠금은 자동 해제된다.)
  IF NOT pg_try_advisory_lock(hashtext('refresh_vc_mvs')::bigint) THEN
    RAISE NOTICE 'refresh_vc_mvs already running, skipping this tick';
    RETURN;
  END IF;

  -- 원본 먼저. 아래 집계들은 전부 이걸 읽는다.
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_real_users;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_user_latest_meta;

  -- 조회할 때마다 mv_real_users(84MB)를 전체 스캔하던 집계들.
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_device_journeys;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_user_rollup;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_user_activity_deltas;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_event_stats;

  PERFORM pg_advisory_unlock(hashtext('refresh_vc_mvs')::bigint);
END
$$;

SELECT cron.alter_job(3, schedule => '*/15 * * * *');
