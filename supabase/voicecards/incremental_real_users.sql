-- ============================================================================
-- mv_real_users 증분 갱신 전환 (2026-09-07)
-- 대상 프로젝트: voice-cards (juyitkynbavhllyjidhz) — 메인 willow-invt DB 아님.
-- ----------------------------------------------------------------------------
-- 이 파일이 갱신 파이프라인의 정본이다. 아래 파일들의 refresh_vc_mvs() / cron 잡 3
-- 서술은 폐기됐다: mv_real_users.sql, mv_user_latest_meta.sql, hourly_mv_refresh.sql.
--
-- ── 왜 바꿨나 ───────────────────────────────────────────────────────────────
-- refresh_vc_mvs() 는 MV 6개를 한 트랜잭션에서 REFRESH CONCURRENTLY 했다. 실측
-- 합계 138.6초로 2분 statement timeout 을 넘겨 7일간 29회 실패했고(전부 09-01 이후),
-- 마지막 mv_event_stats 에서 죽으면 이미 끝난 mv_real_users 까지 롤백돼 전 계통이
-- 함께 밀렸다 — 2026-09-07 관측된 지연은 8시간 10분이었다. 그 결과 일별 활동자
-- (mv_event_stats 스냅샷)와 사용자 표(users·vc_device_journeys 라이브 조회)가 어긋났다.
--
-- ── 진짜 원가는 어디였나 ────────────────────────────────────────────────────
-- anonymous_device_canonical 이 뷰였다. 1,303행을 내놓으려고 anonymous_events 390k행을
-- 네 번 훑는다(세션별 device distinct 집계 + 정렬). EXPLAIN 실측 8.1초.
-- anonymous_events_deduped 가 이걸 조인하므로 mv_real_users 를 만들 때마다 재계산됐다.
-- 매트뷰로 굳히자 72.4초 → 2.5초. 하위 MV 5개도 48.7초로 함께 내려왔다(기존 66.2초).
--
-- ── 왜 증분이 가능한가 ──────────────────────────────────────────────────────
-- anonymous_events_real_users 의 변환은 행 단위다: canonical device 조인 + 봇 IP/기기
-- 필터뿐이고 집계가 없다. 새 이벤트만 덧붙이면 되므로 전량 재구축이 필요 없다.
-- 그래서 mv_real_users 를 매트뷰가 아니라 실테이블로 두고 INSERT/DELETE 한다.
--
-- ── 증분이 놓치는 것과 그 대비 ──────────────────────────────────────────────
-- (1) 봇 CIDR 추가로 과거 행을 소급 갱신할 때 (bot_ip_filter.sql 절차)
-- (2) anonymous_device_canonical 매핑 변경으로 옛 행의 device_id 가 바뀔 때
-- (3) 원본 행 삭제
-- 셋 다 드물어 매시간 훑을 이유는 없다. 야간 vc_reconcile_real_users() 가 전량 대조로
-- 바닥을 맞춘다(실측 42초, 전환 직후 차이 0건). 어긋남은 vc_real_users_drift() 로 본다.
--
-- ── 크론 배치 ───────────────────────────────────────────────────────────────
--   :05  refresh-anon-device-canonical   기기 병합 맵 (~8초)
--   :07  sync-mv-real-users              증분 (~2.5초)
--   :10  refresh-mv-user-latest-meta     (~10초)
--   :11  refresh-mv-device-journeys      (~10초)
--   :12  refresh-mv-user-rollup          (~9초)
--   :13  refresh-mv-user-activity-deltas (~1초)
--   :14  refresh-mv-event-stats          (~19초)
--   18:40 UTC(03:40 KST) reconcile-mv-real-users  전량 대조 (~42초)
-- MV 마다 별도 잡 = 별도 트랜잭션이라 한 곳이 실패해도 나머지가 롤백되지 않는다.
-- statement_timeout 은 **크론 명령에서** 건다. ALTER FUNCTION ... SET 은 소용없다 —
-- 타이머가 문 시작 시점에 걸려서 함수 진입 후 값을 바꿔도 재무장되지 않는다(실측 확인).
-- ============================================================================

-- ① anonymous_device_canonical: 뷰 → 매트뷰
--    CASCADE 로 anonymous_events_deduped, anonymous_events_real_users 가 함께 지워지므로
--    원래 정의 그대로 복구한다(정의 변경 없음 — 결과 동일함을 행수로 확인: 1,303 / 378,258).
-- DROP VIEW public.anonymous_device_canonical CASCADE;
-- CREATE MATERIALIZED VIEW public.anonymous_device_canonical AS <원래 뷰 정의 그대로>;
CREATE UNIQUE INDEX IF NOT EXISTS anonymous_device_canonical_device_id_idx
  ON public.anonymous_device_canonical (device_id);
GRANT ALL ON public.anonymous_device_canonical TO postgres, service_role;

-- ② mv_real_users: 매트뷰 → 실테이블
--    CASCADE 대상은 vc_device_journeys_live → mv_device_journeys → vc_device_journeys 셋뿐.
--    나머지 집계는 함수(vc_user_rollup_live 등) 경유라 이름으로 늦게 바인딩되어 영향 없다.
--    증분이 created_at 구간으로 훑으므로 전용 인덱스가 필요하다.
CREATE INDEX IF NOT EXISTS mv_real_users_created_at ON public.mv_real_users (created_at);
-- 원본 쪽도 마찬가지 — 기존 인덱스는 전부 (device_id|event_name|user_id, created_at) 복합이라
-- 선행 컬럼이 달라 구간 스캔에 못 탄다. 없을 때 390k행 seq scan 이 돌아 증분이 23초였다.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_anon_events_created_at
  ON public.anonymous_events (created_at);

-- ③ 증분 상태
CREATE TABLE IF NOT EXISTS public.vc_sync_state (
  name                   text PRIMARY KEY,
  watermark              timestamptz NOT NULL DEFAULT '-infinity',
  last_sync_at           timestamptz,
  last_full_reconcile_at timestamptz,
  last_upserted          bigint DEFAULT 0,
  last_deleted           bigint DEFAULT 0
);
GRANT ALL ON public.vc_sync_state TO postgres, service_role;

-- ④ 함수 정의는 DB 에 적용된 것이 정본이다. 요약:
--    vc_sync_real_users(p_overlap interval default '30 minutes')
--      created_at 워터마크로 [watermark - overlap, now()] 구간을 ON CONFLICT (id) 로 멱등
--      upsert 하고, 같은 구간에서 원본이 더는 내주지 않는 행을 지운다.
--      overlap 을 두는 이유: id 가 uuid 라 단조증가 키가 없고, created_at 은 트랜잭션
--      시작 시각이라 "늦게 커밋된 이른 행"이 생긴다. 겹친 구간은 upsert 로 흡수한다.
--    vc_reconcile_real_users()  전량 대조(야간). 증분과 같은 advisory lock 을 써 동시 실행 방지.
--    vc_real_users_drift()      mv vs 원본의 행수·누락·잉여·지연. 전체 anti-join 이라 상시 호출 금지.
--    refresh_vc_mv(mv)          매트뷰 5개 + canonical 단건 갱신. mv_real_users 는 예외를 던진다.

-- ⑤ 권한: 새 함수는 기본으로 PUBLIC 실행 권한을 갖는다. 아래 넷은 SECURITY DEFINER
--    유지보수 함수라 anon 키로 호출되면 소유자 권한으로 갱신·전체대조가 돌아간다
--    (DoS + 권한 상승). 크론(postgres)과 서버(service_role)만 부르면 된다.
REVOKE ALL ON FUNCTION public.vc_sync_real_users(interval) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vc_reconcile_real_users()    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_vc_mv(text)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vc_real_users_drift()        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE    public.vc_sync_state                FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vc_sync_real_users(interval) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.vc_reconcile_real_users()    TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_vc_mv(text)          TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.vc_real_users_drift()        TO postgres, service_role;
