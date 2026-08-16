-- 분석 뷰·MV·함수에서 anon/authenticated 접근 회수 (2026-08-17)
-- 대상 프로젝트: voice-cards (juyitkynbavhllyjidhz).
--
-- 문제:
--   뷰와 MV 에는 RLS 가 적용되지 않는다. 게다가 뷰는 소유자 권한으로 실행되므로 RLS 가 걸린
--   기반 테이블(users, anonymous_events)을 감싸도 그 RLS 를 우회한다. anon 키 하나만 있으면
--   전체 사용자 이메일·국가·크레딧 소비·퍼널을 그대로 읽을 수 있었다.
--
--   refresh_vc_mvs() / backfill_purchased_flag() 는 쓰기 작업인데도 anon 실행이 열려 있었다.
--   반복 호출로 DB 를 갈아버릴 수 있는 경로다.
--
-- 회수해도 안전한 근거:
--   · 보이스카드 앱 소스는 이 뷰·함수를 전혀 참조하지 않는다(문서·마이그레이션에만 등장).
--   · anon 으로 찍힌 139k 건은 willow 대시보드 서버(voicecards-server.ts)가 남긴 누적치다.
--     그쪽은 VOICECARDS_SUPABASE_SERVICE_KEY 를 우선 사용하고, Vercel 프로덕션에도 설정돼 있다.
--   · telegram-bot 은 anon 키를 쓰지만 users/anonymous_events/user_analytics 기반 테이블만
--     읽는다. 이 회수의 영향을 받지 않는다.
--
-- 유지 대상:
--   · vc_public_stats() — 랜딩 페이지 공개 통계용으로 의도된 RPC (앱 마이그레이션 050).
--   · RLS 가 걸린 기반 테이블(users, anonymous_events 등) — 앱의 정상 경로다.
--
-- 함수 회수 시 주의: Postgres 는 함수 생성 시 PUBLIC 에 EXECUTE 를 기본 부여한다.
-- anon 은 PUBLIC 을 통해 상속받으므로 역할에서만 REVOKE 하면 그대로 실행된다. PUBLIC 에서 거둬야 한다.

-- ── 뷰 · MV ──────────────────────────────────────────────────────────────────
DO $$
DECLARE
  rel text;
  rels text[] := ARRAY[
    -- materialized views (RLS 자체가 적용되지 않음)
    'mv_real_users','mv_device_journeys','mv_event_stats','mv_user_rollup',
    'mv_user_activity_deltas','mv_user_latest_meta',
    -- analytics views (소유자 권한 실행 → 기반 테이블 RLS 우회)
    'anonymous_events_real_users','anonymous_events_deduped','anonymous_device_canonical',
    'vc_device_journeys','vc_device_journeys_live','credit_source_report',
    'device_user_link_v1','funnel_anonymous_v1','funnel_summary_v1',
    'learning_drop_off_v1','signin_attribution_v1','signin_trigger_attribution_v1'
  ];
BEGIN
  FOREACH rel IN ARRAY rels LOOP
    IF to_regclass('public.' || rel) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', rel);
      EXECUTE format('GRANT SELECT ON public.%I TO service_role', rel);
    END IF;
  END LOOP;
END $$;

-- ── 함수 ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'vc_event_stats','vc_event_stats_live',
    'vc_user_rollup','vc_user_rollup_live',
    'vc_user_activity_deltas','vc_user_activity_deltas_live',
    'vc_user_latest_meta','vc_released_ios_ceiling','vc_purchase_signal_digest',
    -- 쓰기 작업
    'refresh_vc_mvs','backfill_purchased_flag','clamp_user_analytics_total_cards'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
               WHERE n.nspname='public' AND p.proname=fn) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I() FROM PUBLIC, anon, authenticated', fn);
    END IF;
  END LOOP;
END $$;

-- 대시보드 서버가 부르는 것들만 명시적으로 되돌려 준다
GRANT EXECUTE ON FUNCTION
  public.vc_event_stats(), public.vc_user_rollup(), public.vc_user_activity_deltas(),
  public.vc_user_latest_meta(), public.vc_released_ios_ceiling()
  TO service_role;

-- ── 검증 ─────────────────────────────────────────────────────────────────────
-- 적용 후 PostgREST 로 확인한 결과:
--   anon → vc_device_journeys        401
--   anon → rpc/vc_event_stats        401
--   anon → rpc/refresh_vc_mvs        401
--   anon → rpc/vc_public_stats       200  (의도된 공개)
--   anon → users                     200  (RLS 경유, 앱 정상 경로)
--   service_role → vc_device_journeys 200
--   service_role → rpc/vc_event_stats 200
