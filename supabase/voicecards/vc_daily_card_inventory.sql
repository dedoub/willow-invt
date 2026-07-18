-- 일별 보유 카드/시트 집계 — user_sheet_snapshots(유저별 자정 스냅샷)를 날짜별로 합산.
-- 대시보드 '보유 카드' 카드의 sparkline + 오늘/7일 증가분 기준선.
--   card_count/sheet_count 는 스냅샷 스크립트(scripts/voicecards-sheet-snapshot.ts)가 매일 00:05 KST 기록.
--   total_cards 정의(user_analytics.total_cards 합)가 liveCards(userStats.totalCards)와 동일 →
--   live − 스냅샷 = 오늘 증가분이 사용자 테이블 per-user delta 합과 정확히 일치.
-- (구 daily_inventory_snapshots 는 모집단이 달라 상시 오프셋 → 사용 중단)
create or replace function public.vc_daily_card_inventory()
 returns table(date date, total_cards bigint, total_sheets bigint)
 language sql
 stable
as $function$
  select s.date, sum(s.card_count)::bigint, sum(s.sheet_count)::bigint
  from user_sheet_snapshots s
  group by s.date
  order by s.date
$function$;
