-- 호가 최저 평당가(min_ppp) 방식 통일: raw min → P10(10분위)
-- API listings 뷰는 이미 P10인데 daily_summary(요약 KPI·추이 차트)는 raw min이라
-- 화면마다 달랐음. 저가 아웃라이어 왜곡 방지 위해 P10로 통일.
-- go-forward는 scripts/naver-listings-pipeline.ts 에서 P10 산출.
-- 아래는 과거 daily_summary 백필 (naver_listings에서 재계산, API와 동일 공식 sorted[floor(n*0.1)]).
-- 멱등: min_ppp가 이미 P10이면 no-op.
with computed as (
  select snapshot_date, complex_name, trade_type, price,
    coalesce(nullif(area_supply_sqm,0),
             nullif(substring(coalesce(area_type,'') from '^[0-9]+\.?[0-9]*'),'')::numeric) / 3.3058 as pyeong
  from re_naver_listings where price > 0
),
banded as (
  select snapshot_date, complex_name, trade_type, price/pyeong as ppp,
    case when pyeong < 20 then null when pyeong < 30 then 20 when pyeong < 40 then 30
         when pyeong < 50 then 40 when pyeong < 60 then 50 else 60 end as band
  from computed where pyeong is not null and pyeong > 0
),
ranked as (
  select snapshot_date, complex_name, trade_type, band, ppp,
    row_number() over (partition by snapshot_date, complex_name, trade_type, band order by ppp) rn,
    count(*) over (partition by snapshot_date, complex_name, trade_type, band) cnt
  from banded where band is not null
),
p10 as (
  select snapshot_date, complex_name, trade_type, band, round(ppp)::int as p10_ppp
  from ranked where rn = floor(cnt*0.1) + 1
)
update re_listing_daily_summary s
set min_ppp = p.p10_ppp
from p10 p
where s.snapshot_date=p.snapshot_date and s.complex_name=p.complex_name
  and s.trade_type=p.trade_type and s.area_band=p.band
  and s.min_ppp is distinct from p.p10_ppp;
