-- 권역 실거래 지수 (2026-09-13)
-- 대상: willow-dash-tensw-todo (axcfvieqsaphhvbkyzzv)
--
-- 목적: 강남3구와 서울 외곽(노도강·금관구)의 매매가 추세를 견준다.
--
-- ── 왜 평균이 아니라 지수인가 ────────────────────────────────────────────────
-- 구의 월평균 평당가는 시장이 아니라 그달에 무엇이 팔렸는지를 따라간다. 실측으로
-- 강남구 월평균이 2026-03 10,206 → 07 12,012 → 08 10,905 으로 흔들리는데, 대형·신축이
-- 몇 건 섞이면 그만큼 움직인다. 권역끼리 비교하면 이 왜곡이 두 배가 된다 — 외곽은
-- 소형·구축 비중이 크고 그 구성비도 달마다 바뀌기 때문이다.
--
-- ── 어떻게 없애는가 ─────────────────────────────────────────────────────────
-- 같은 물건끼리만 견준다. 셀 = (자치구, 단지명, 전용면적㎡ 반올림). 같은 단지의 같은
-- 평형은 MOLIT 이 늘 같은 면적으로 신고하므로, 면적을 1㎡ 로 반올림하면 사실상
-- 타입 단위로 갈린다.
--   1) 기준기간(2025-01~06, 자료가 시작되는 첫 6개월) 셀별 평당가 중앙값 = 그 셀의 100
--   2) 매달 셀별 중앙값 ÷ 기준값 = 그 셀의 배수
--   3) 권역의 그달 지수 = 그 배수들의 중앙값 × 100
-- 셀마다 자기 자신과 비교하므로 구성이 바뀌어도 지수는 흔들리지 않는다.
--
-- 가중을 주지 않는다. 셀 하나가 관측 하나다 — 거래건수로 가중하면 그달에 많이 팔린
-- 단지 쪽으로 다시 끌려가 애써 없앤 구성 효과가 돌아온다.
--
-- 전월 대비 연쇄가 아니라 기준시점 고정이다. 전월과 짝이 맞는 셀은 세 구만 합쳐도
-- 월 83개까지 내려가지만(2026-09-13 실측), 기준 고정이면 그달에 거래된 셀을 전부 쓴다.
-- 연쇄는 오차도 누적한다.
--
-- ── 평당가는 전용 기준이다 ──────────────────────────────────────────────────
-- re_trades.price_per_pyeong 은 생성 컬럼(deal_amount / (area_sqm/3.3058))이라 전용평
-- 기준이다. 화면의 평당가는 공급 기준이고 그 변환표를 네이버 호가에서 만드는데, 외곽은
-- 호가를 수집하지 않아 변환이 0.75 고정값으로 떨어진다. 지수는 셀을 자기 기준과만
-- 비교하므로 전용 기준으로 두면 그 의존이 통째로 사라진다.
-- ⚠️ 그래서 이 지수의 숫자를 화면의 '만/평' 값과 나란히 놓으면 안 된다. 기준이 다르다.
--
-- ── 읽을 때 주의 ────────────────────────────────────────────────────────────
-- 최근 1~2개월은 신고지연으로 계속 채워진다. cells·trades 를 함께 내보내니 소비하는
-- 쪽에서 얇은 달을 잠정으로 표시할 것.
--
-- 갱신: 매트뷰다. 매일 실거래 동기화가 끝난 뒤 refresh_re_zone_index() 를 부른다.
-- 원자료가 하루 한 번만 바뀌므로 굳혀도 잃을 신선도가 없고, 뷰로 두면 5.7초가 걸린다.

DROP MATERIALIZED VIEW IF EXISTS public.re_zone_index;

CREATE MATERIALIZED VIEW public.re_zone_index AS
WITH z AS (
  SELECT
    CASE
      WHEN district_code IN ('11680','11650','11710') THEN '강남3구'
      WHEN district_code IN ('11350','11320','11305') THEN '노도강'
      WHEN district_code IN ('11545','11620','11530') THEN '금관구'
    END AS zone,
    district_code,
    complex_name,
    round(area_sqm)::int AS area_key,
    date_trunc('month', deal_date)::date AS month_start,
    price_per_pyeong::numeric AS ppp
  FROM public.re_trades
  WHERE cancel_yn = 'N'
    AND price_per_pyeong > 0
    AND deal_date >= '2025-01-01'
    AND district_code IN ('11680','11650','11710','11350','11320','11305','11545','11620','11530')
),
base AS (
  SELECT zone, district_code, complex_name, area_key,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY ppp) AS base_ppp
  FROM z
  WHERE month_start BETWEEN '2025-01-01' AND '2025-06-01'
  GROUP BY 1,2,3,4
),
cell_month AS (
  SELECT zone, month_start, district_code, complex_name, area_key,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY ppp) AS m_ppp,
         count(*) AS n
  FROM z
  GROUP BY 1,2,3,4,5
)
SELECT
  c.month_start,
  c.zone,
  count(*)::int AS cells,
  sum(c.n)::int AS trades,
  round((100 * percentile_cont(0.5) WITHIN GROUP (ORDER BY c.m_ppp / b.base_ppp))::numeric, 1) AS idx
FROM cell_month c
JOIN base b
  ON b.zone = c.zone
 AND b.district_code = c.district_code
 AND b.complex_name = c.complex_name
 AND b.area_key = c.area_key
WHERE b.base_ppp > 0
GROUP BY 1,2;

-- CONCURRENTLY 갱신에 필요하다.
CREATE UNIQUE INDEX re_zone_index_pk ON public.re_zone_index (month_start, zone);

GRANT SELECT ON public.re_zone_index TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.refresh_re_zone_index()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  -- 갱신이 겹쳐 쌓이지 않게 한다. 동기화가 늦어져 다음 실행과 물릴 수 있다.
  IF NOT pg_try_advisory_lock(hashtext('refresh_re_zone_index')::bigint) THEN
    RAISE NOTICE 'refresh_re_zone_index already running, skipping';
    RETURN;
  END IF;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.re_zone_index;
  PERFORM pg_advisory_unlock(hashtext('refresh_re_zone_index')::bigint);
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_advisory_unlock(hashtext('refresh_re_zone_index')::bigint);
  RAISE;
END $$;

REVOKE ALL ON FUNCTION public.refresh_re_zone_index() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_re_zone_index() TO postgres, service_role;
