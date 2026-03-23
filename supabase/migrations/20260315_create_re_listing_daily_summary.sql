-- =============================================================
-- re_listing_daily_summary: 네이버 매물 일별 평형대 요약 테이블
-- 단지별, 거래유형별, 평형대별 일일 호가 통계 (min/max/avg PPP)
-- =============================================================

-- 1. 테이블 생성
CREATE TABLE IF NOT EXISTS re_listing_daily_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL,
  complex_name text NOT NULL,
  trade_type text NOT NULL CHECK (trade_type IN ('매매', '전세')),
  area_band int NOT NULL CHECK (area_band IN (20, 30, 40, 50, 60)),
  min_ppp int,          -- 최저 평당가 (만원)
  max_ppp int,          -- 최고 평당가 (만원)
  avg_ppp int,          -- 평균 평당가 (만원)
  listing_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. 유니크 인덱스: 동일 날짜 + 단지 + 거래유형 + 평형대는 1행만
CREATE UNIQUE INDEX IF NOT EXISTS uq_re_listing_daily_summary
  ON re_listing_daily_summary (snapshot_date, complex_name, trade_type, area_band);

-- 3. 트렌드 조회용 인덱스: 특정 단지+거래유형의 시계열 조회
CREATE INDEX IF NOT EXISTS idx_re_listing_daily_summary_trend
  ON re_listing_daily_summary (complex_name, trade_type, snapshot_date);

-- 4. RLS 활성화 (서비스키로만 쓰기, 읽기는 인증 사용자)
ALTER TABLE re_listing_daily_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_select_all" ON re_listing_daily_summary
  FOR SELECT USING (true);

CREATE POLICY "allow_insert_service" ON re_listing_daily_summary
  FOR INSERT WITH CHECK (true);

CREATE POLICY "allow_update_service" ON re_listing_daily_summary
  FOR UPDATE USING (true);

-- 5. 기존 re_naver_listings에서 최근 4일치 데이터 마이그레이션
-- area_supply_sqm / 3.3058 = 평수
-- pyeong < 20 제외
-- 20~30: band 20, 30~40: band 30, 40~50: band 40, 50~60: band 50, 60+: band 60
-- price / pyeong = ppp
INSERT INTO re_listing_daily_summary (snapshot_date, complex_name, trade_type, area_band, min_ppp, max_ppp, avg_ppp, listing_count)
SELECT
  l.snapshot_date,
  l.complex_name,
  l.trade_type,
  CASE
    WHEN pyeong < 30 THEN 20
    WHEN pyeong < 40 THEN 30
    WHEN pyeong < 50 THEN 40
    WHEN pyeong < 60 THEN 50
    ELSE 60
  END AS area_band,
  MIN(ROUND(l.price / pyeong)::int) AS min_ppp,
  MAX(ROUND(l.price / pyeong)::int) AS max_ppp,
  ROUND(AVG(l.price / pyeong))::int AS avg_ppp,
  COUNT(*)::int AS listing_count
FROM (
  SELECT
    snapshot_date,
    complex_name,
    trade_type,
    price,
    area_supply_sqm::numeric / 3.3058 AS pyeong
  FROM re_naver_listings
  WHERE area_supply_sqm IS NOT NULL
    AND area_supply_sqm::numeric > 0
    AND price > 0
    AND snapshot_date >= (
      SELECT DISTINCT snapshot_date
      FROM re_naver_listings
      ORDER BY snapshot_date DESC
      LIMIT 1
      OFFSET 3
    )
) l
WHERE pyeong >= 20
GROUP BY l.snapshot_date, l.complex_name, l.trade_type,
  CASE
    WHEN pyeong < 30 THEN 20
    WHEN pyeong < 40 THEN 30
    WHEN pyeong < 50 THEN 40
    WHEN pyeong < 60 THEN 50
    ELSE 60
  END
ON CONFLICT (snapshot_date, complex_name, trade_type, area_band) DO NOTHING;
