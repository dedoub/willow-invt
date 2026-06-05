-- 돌파(breakout) 저항선을 종가가 아닌 직전 N일 '고가' 기준으로 계산하기 위해
-- sector_index_quotes에 일별 고가(high) 컬럼 추가.
-- 과거 행은 NULL → API/계산에서 종가로 폴백. sector-rotation-fetch가 이후 채움.
ALTER TABLE sector_index_quotes ADD COLUMN IF NOT EXISTS high numeric;
