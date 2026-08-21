-- =============================================================
-- re_complex_pyeongs: 단지 평형별 세대수/면적
-- 네이버 단지 상세(complexPyeongDetailList)에서 수집.
-- 합산 시가총액(평형별 세대수 × 공급면적 × 평당가) 계산의 기반.
-- =============================================================

CREATE TABLE IF NOT EXISTS re_complex_pyeongs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complex_name text NOT NULL,
  pyeong_name text NOT NULL,            -- 예: "34A", "45B"
  supply_sqm numeric,                   -- 공급면적 (㎡)
  exclusive_sqm numeric,                -- 전용면적 (㎡)
  household_count int NOT NULL DEFAULT 0 CHECK (household_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 동일 단지 + 평형명은 1행만 (백필 재실행 시 upsert)
CREATE UNIQUE INDEX IF NOT EXISTS uq_re_complex_pyeongs
  ON re_complex_pyeongs (complex_name, pyeong_name);

-- 읽기는 공개(리서치 데이터), 쓰기는 service_role만 (RLS 우회)
ALTER TABLE re_complex_pyeongs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_select_all" ON re_complex_pyeongs
  FOR SELECT USING (true);
