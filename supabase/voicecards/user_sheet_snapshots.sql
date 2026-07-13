-- 유저별 일별 시트 수 스냅샷 — 시트 "오늘 증가분"(전일대비) 산출용.
-- 매일 00:05 KST scripts/voicecards-sheet-snapshot.ts (launchd com.willow.voicecards-sheet-snapshot) 가 upsert.
--   시트는 users.sheet_ids(현재 배열)만 있고 변경 이력이 없어 스냅샷이 유일한 diff 원천.
-- apply: 원격 project juyitkynbavhllyjidhz
CREATE TABLE IF NOT EXISTS public.user_sheet_snapshots (
  user_id text NOT NULL,
  date date NOT NULL,
  sheet_count integer NOT NULL DEFAULT 0,
  card_count integer, -- 자정 기준 보유 카드(user_analytics.total_cards 합) — 2026-07-13 추가
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_user_sheet_snapshots_date ON public.user_sheet_snapshots(date);

-- RLS: 모든 접근(스냅샷 upsert 스크립트, vc_user_activity_deltas RPC)이 service key 경유라
-- 정책 없이 enable만 한다 — anon 직접 접근 차단 (2026-07-12 보안 어드바이저 지적).
ALTER TABLE public.user_sheet_snapshots ENABLE ROW LEVEL SECURITY;
