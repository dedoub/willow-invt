-- re_complexes.is_tracked 기본값을 false 로 (2026-09-13)
-- 대상: willow-dash-tensw-todo (axcfvieqsaphhvbkyzzv)
--
-- 왜: 수집은 구 단위 전량이다. 크론이 re_trades·re_rentals 에서 본 단지명을 그대로
-- re_complexes 에 업서트하므로(syncComplexes), 구를 하나 켜면 그 구의 단지 수백 개가
-- 행으로 생긴다. 그런데 이 컬럼의 기본값이 true 였다 — 화면·API·MCP 가 전부
-- is_tracked = true 로 읽으므로, 새 구를 켜는 순간 호가도 없는 단지가 표와 통계에
-- 쏟아진다. 지금 563행 중 추적은 22행뿐이고 나머지 541행은 손으로 꺼 둔 것이다.
--
-- 추적은 골라서 켜는 것이지 기본이 아니다. 기본값을 뒤집어 그 사실을 스키마에 적는다.
-- 기존 행의 값은 건드리지 않는다 — DEFAULT 는 새 행에만 걸린다.
--
-- 추적을 켜려면 여전히 두 곳이 함께 맞아야 한다:
--   1) scripts/naver-listings-pipeline.ts 의 TARGET_COMPLEXES 에 단지명 + 네이버 hscpNo
--   2) 여기 is_tracked = true
-- (선례: 20260705140000_apgujeong_hyundai_consolidation.sql, 커밋 5f206e8c·60294211)

ALTER TABLE public.re_complexes ALTER COLUMN is_tracked SET DEFAULT false;

-- 값이 비어 있는 행이 생기면 조회에서 조용히 빠지므로 NULL 도 막는다.
UPDATE public.re_complexes SET is_tracked = false WHERE is_tracked IS NULL;
ALTER TABLE public.re_complexes ALTER COLUMN is_tracked SET NOT NULL;
