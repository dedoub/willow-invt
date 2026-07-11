-- mv_real_users: anonymous_events_real_users(→anonymous_events_deduped, 세션승자 device dedup을
-- 매 호출마다 전체 이벤트에 재계산 = ~200ms+, 이벤트 증가할수록 느려지고 타임아웃) 의 스냅샷.
--
-- 문제: 대시보드 유저 통계 1회 로드에 이 무거운 뷰를 4개 RPC + getAppDbRevenue가 각각 재계산 →
--       88k 이벤트에서 ~1s+, 계속 증가 → "데이터로드 지연·실패" (2026-07-12).
-- 해결: 무거운 dedup을 5분마다 1회만(pg_cron REFRESH)로 계산하고, 소비자는 인덱스된 스냅샷을 읽음.
--       intent RPC 실측 225ms → 60ms, 이벤트 증가에도 상수 시간 유지.
--
-- 소비자(모두 mv_real_users로 리포인트됨):
--   RPC: vc_user_intent_signals, vc_user_listen_counts, vc_user_purchased_credits, vc_user_activity_deltas
--   JS : getAppDbRevenue(payingEvents) — src/lib/voicecards-server.ts
--   (vc_user_latest_meta는 원래 anonymous_events 직접 사용 — 가벼워 미변경)
-- apply: 원격 project juyitkynbavhllyjidhz

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_real_users AS
  SELECT * FROM anonymous_events_real_users;

CREATE UNIQUE INDEX IF NOT EXISTS mv_real_users_id ON mv_real_users (id);            -- REFRESH CONCURRENTLY 필수
CREATE INDEX IF NOT EXISTS mv_real_users_user_event ON mv_real_users (user_id, event_name);
CREATE INDEX IF NOT EXISTS mv_real_users_event_created ON mv_real_users (event_name, created_at);

-- 5분 주기 새로고침 (CONCURRENTLY = 새로고침 중에도 읽기 blocking 없음)
-- select cron.schedule('refresh-mv-real-users', '*/5 * * * *', $$REFRESH MATERIALIZED VIEW CONCURRENTLY mv_real_users$$);
