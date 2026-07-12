-- 스토어 등록정보 방문(퍼널 최상단: 스토어 방문 → 설치 기기 → 로그인 → 연동 → 활성화 → 결제)
-- 수집: 일 1회 (플레이 GCS pubsite_prod_6002180457646708467/stats/store_performance + ASC Analytics 리포트)
-- 쓰기/읽기 모두 service key 경유라 정책 없이 RLS만 enable.
-- apply: 원격 project juyitkynbavhllyjidhz (2026-07-12)
CREATE TABLE IF NOT EXISTS public.store_visits (
  date date NOT NULL,
  platform text NOT NULL CHECK (platform IN ('android', 'ios')),
  visitors integer NOT NULL DEFAULT 0,
  impressions integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (date, platform)
);
CREATE INDEX IF NOT EXISTS idx_store_visits_date ON public.store_visits(date);
ALTER TABLE public.store_visits ENABLE ROW LEVEL SECURITY;
