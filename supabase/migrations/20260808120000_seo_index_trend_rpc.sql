-- 색인 추이를 DB에서 집계한다.
--
-- 예전엔 getIndexStatusSummary가 30일치 원본 행을 통째로 받아 TS에서 날짜별로 접었다.
-- PostgREST가 응답을 1,000행에서 자르기 때문에, 보이스카드처럼 하루 669행인 사이트는
-- 최신 하루(669) + 직전 하루의 임의 331행만 받았다. 결과적으로 추이 차트에 점이 두 개만
-- 찍히고, 그중 하나는 잘린 부분집합이라 직전 대비 증감도 틀렸다. 잘렸다는 신호가
-- 아무 데도 안 남아 조용히 틀린 그림을 보여줬다.
--
-- 로케일 판정 규칙(어떤 2자 세그먼트가 로케일인지)은 TS(src/lib/umami.ts LOCALES)가
-- 단일 진실원이다. 여기 목록을 박아 두면 두 곳이 갈라지므로 p_locales로 받는다.
create or replace function public.seo_index_trend(
  p_site_key text,
  p_since date,
  p_locales text[],
  p_base_locale text default null
)
returns table (
  checked_on date,
  total bigint,
  indexed bigint,
  base_total bigint,
  base_indexed bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with rows as (
    select
      s.checked_on,
      s.is_indexed,
      -- 2자 세그먼트가 실제 로케일일 때만 로케일로 친다. 목록에 없으면 원본 경로다
      -- (`/cdl/...` 같은 슬러그가 로케일로 오인되면 안 된다).
      case when seg.v = any(p_locales) then seg.v end as locale
    from public.seo_index_status s
    -- 경로 앞 로케일 세그먼트. pathLocale/canonicalPath의 정규식과 같은 모양이다.
    cross join lateral (
      select substring(s.path from '^/([a-z]{2})(?:-[a-zA-Z]{2})?(?:/|$)') as v
    ) seg
    where s.site_key = p_site_key
      and s.checked_on >= p_since
  )
  select
    r.checked_on,
    count(*) as total,
    count(*) filter (where r.is_indexed) as indexed,
    -- base = 로케일 프리픽스가 없거나(원본), 그 사이트의 기본 로케일인 것
    count(*) filter (where r.locale is null or r.locale = p_base_locale) as base_total,
    count(*) filter (where (r.locale is null or r.locale = p_base_locale) and r.is_indexed) as base_indexed
  from rows r
  group by r.checked_on
  order by r.checked_on
$$;

revoke all on function public.seo_index_trend(text, date, text[], text) from public, anon, authenticated;
grant execute on function public.seo_index_trend(text, date, text[], text) to service_role;
