-- 일별 보유 카드 시리즈 — 대시보드 '보유 카드' sparkline + 오늘/7일 증가분 기준선.
--
-- 두 소스를 합쳐 '긴 히스토리 + 정확한 레벨' 둘 다 확보한다:
--   user_sheet_snapshots : 유저별 자정 스냅샷(card_count = user_analytics.total_cards 합).
--                          liveCards(userStats.totalCards)와 정의 동일 → 레벨 정확. 단 최근(~07-14~)만 존재.
--   daily_inventory_snapshots : 레거시 일별 스냅샷(~60일). 모집단이 상수(~3205)만큼 작아 절대 레벨은
--                          낮지만 일별 delta 는 정확 → 긴 궤적(shape) 확보용.
-- 복원: 두 스냅샷이 겹치는 최신 날짜의 차이(offset)를 daily_inventory 전체에 더해 실제 레벨로 올린다.
--   → 끝점 = 실 보유 카드(총계와 일치), 과거는 daily_inventory 의 정확한 delta 로 60일 추세 유지.
-- (오늘/전일 diff 는 클라이언트에서 테이블 per-user 델타 합으로 계산 — 이 시리즈는 sparkline·7일 추세용.)
create or replace function public.vc_daily_card_inventory()
 returns table(date date, total_cards bigint, total_sheets bigint)
 language sql
 stable
as $function$
  with sheet_agg as (
    select s.date, sum(s.card_count)::bigint as cards, sum(s.sheet_count)::bigint as sheets
    from user_sheet_snapshots s
    group by s.date
  ),
  card_offset as (
    -- 겹치는 최신 날짜의 (정확 user_sheet_snapshots − 레거시 daily_inventory) 차이.
    select (sa.cards - di.total_cards) as off
    from sheet_agg sa
    join daily_inventory_snapshots di on di.date = sa.date
    where sa.cards is not null
    order by sa.date desc
    limit 1
  ),
  recon as (
    select di.date,
           (di.total_cards + coalesce((select off from card_offset), 0))::bigint as total_cards
    from daily_inventory_snapshots di
  )
  select r.date, r.total_cards,
         coalesce((select sa.sheets from sheet_agg sa where sa.date = r.date), 0)::bigint as total_sheets
  from recon r
  order by r.date
$function$;
