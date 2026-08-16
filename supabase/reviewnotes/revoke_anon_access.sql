-- 리뷰노트 anon 접근 회수 (2026-08-17)
-- 대상 프로젝트: review-notes (kumaqaizejnjrvfqhahu).
--
-- 노출 실체:
--   · User 테이블의 anon_select 정책이 TO anon USING(true) — 퍼블리셔블 키만 있으면
--     전체 유저의 이메일·플랜·스토리지·가입일이 그대로 읽혔다.
--   · rn_* SECURITY DEFINER RPC 11개가 anon 실행 가능 — 정의자 권한으로 도는 함수라
--     테이블 정책과 무관하게 트래픽·MRR·유저별 사용량을 내줬다.
--     그중 rn_record_mrr 은 volatile, 즉 **익명 쓰기**였다.
--   · reviewnotes_activated_users 뷰는 RLS 자체가 없고 anon SELECT 가 열려 있었다.
--
-- 전제조건(이걸 먼저 하지 않으면 대시보드·봇이 깨진다):
--   willow-invt 의 REVIEWNOTES_SUPABASE_KEY(퍼블리셔블) → REVIEWNOTES_SUPABASE_SERVICE_KEY 전환.
--   src/lib/reviewnotes-supabase.ts, scripts/telegram-bot.ts 둘 다 시크릿 키 우선으로 바꾸고
--   Vercel Production/Development 에 등록했다. (Preview 에는 REVIEWNOTES_* 가 원래 하나도
--   없어서 리뷰노트가 안 붙는 상태 — 회귀 대상 아님.)
--
-- 회수해도 안전한 근거 (voicecards 때와 같은 3종 확인):
--   ① 리뷰노트 앱은 @supabase/supabase-js 를 의존성으로 갖고 있지도 않다(createClient 0건).
--      Prisma 가 owner 로 접속하므로 RLS·GRANT 경로를 아예 타지 않는다. 앱 저장소 실측.
--   ② 대시보드는 시크릿 키로 전환 후 화면 렌더까지 확인.
--   ③ telegram-bot 전환 전후 보이는 행이 동일함을 실측 — User 는 anon 도 어차피 전수 조회였고,
--      activated_users 뷰 5행 동일, WebhookEvent 는 양쪽 0행(빈 테이블).
--
-- service_role 은 RLS 를 우회하므로 정책을 드롭해도 대시보드·봇은 그대로 동작한다.

-- ── User 테이블 ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS anon_select ON public."User";
REVOKE ALL ON public."User" FROM anon, authenticated;
GRANT SELECT ON public."User" TO service_role;

-- ── 분석 뷰 (RLS 미적용) ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.reviewnotes_activated_users') IS NOT NULL THEN
    REVOKE ALL ON public.reviewnotes_activated_users FROM anon, authenticated;
    GRANT SELECT ON public.reviewnotes_activated_users TO service_role;
  END IF;
END $$;

-- ── rn_* RPC 11개 ────────────────────────────────────────────────────────────
-- 주의: 역할에서만 REVOKE 하면 안 닫힌다. Postgres 가 함수 생성 시 PUBLIC 에 EXECUTE 를
-- 기본 부여하고 anon 이 그걸 상속받는다 (voicecards 때 같은 함정에 한 번 걸렸다).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'rn\_%'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- ── 검증 ─────────────────────────────────────────────────────────────────────
-- 적용 후 PostgREST 실측:
--   퍼블리셔블 → User                      401
--   퍼블리셔블 → reviewnotes_activated_users 401
--   퍼블리셔블 → rpc/rn_traffic_stats      401
--   퍼블리셔블 → rpc/rn_content_stats      401
--   퍼블리셔블 → rpc/rn_record_mrr (쓰기)  401
--   시크릿    → User / 뷰 / rn_traffic_stats / rn_content_stats  전부 200
