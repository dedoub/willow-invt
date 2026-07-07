-- 유저별 일별 시트 수 스냅샷 — 시트 "오늘 증가분"(전일대비) 산출용.
-- 매일 00:05 KST scripts/voicecards-sheet-snapshot.ts (launchd com.willow.voicecards-sheet-snapshot) 가 upsert.
--   시트는 users.sheet_ids(현재 배열)만 있고 변경 이력이 없어 스냅샷이 유일한 diff 원천.
-- apply: 원격 project juyitkynbavhllyjidhz
CREATE TABLE IF NOT EXISTS public.user_sheet_snapshots (
  user_id text NOT NULL,
  date date NOT NULL,
  sheet_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_user_sheet_snapshots_date ON public.user_sheet_snapshots(date);
