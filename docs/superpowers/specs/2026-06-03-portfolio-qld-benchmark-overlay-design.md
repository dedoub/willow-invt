# 포트폴리오 수익률 추이 — QLD 벤치마크 오버레이

날짜: 2026-06-03
대상 파일: `src/app/(dashboard)/(linear)/invest/_components/analysis-block.tsx` (주 변경)

## 배경 / 철학
CEO 포트폴리오의 벤치마크는 **QLD (ProShares Ultra QQQ, 2x 나스닥100)**. 기본 베팅 리스크 자체가
"나스닥 마켓베타의 2배"라, 성과 평가 기준은 절대수익이 아니라 **"2x QQQ 초과 = 알파"**다.
(메모리: project_portfolio_benchmark_qld) 현재 포트폴리오 분석의 수익률 추이 차트엔 이 기준선이 없다.

## 목적
포트폴리오 분석의 **수익률 추이 차트에만** QLD 누적수익률 라인을 오버레이하고,
헤더에 "내 수익률 + vs QLD 알파"를 표시해 알파를 한눈에 본다.

## 데이터 — QLD 누적수익률 (동액 적립 / dollar-matched)
내 매수 현금흐름을 그대로 QLD에 복제한다 (내 포트폴리오와 동일한 평균단가 기준 → 공정 비교 + 타이밍 알파 반영):
- 내가 `날짜 D`에 `금액 M`(원화 환산)을 매수 → 그날 QLD를 M원어치 샀다고 가정
  - QLD 주수 += M_krw / (그날 QLD종가 × 그날 환율)   ※ QLD는 USD 자산
  - 투입원금 += M_krw
- 매도 시: 평균단가 기준으로 QLD 주수·원금 차감 (내 포트폴리오 timeline과 동일 규칙)
- 각 날짜: `qldVal = QLD주수 × 당일종가 × 당일환율`, `qldPct = (qldVal − qldCost) / qldCost × 100`
- 매수 timeline은 **전체 포트폴리오 거래(stockTrades) 전부**를 현금흐름으로 사용 (viewMode 무관, 항상 전체 기준)

## 데이터 소스
- QLD 시계열: `sector_index_quotes`에 이미 적재됨. 클라이언트는 RLS로 직접 못 읽으므로
  **기존 stock-history API에 QLD를 함께 요청**(`tickers=...,QLD & markets=...,US`)해서 받는다.
  (stock-history는 2026-06-03 변경으로 DB 우선 + Yahoo fallback → QLD도 DB에서 안정적으로 옴)
  → 별도 엔드포인트 불필요.
- 환율: 기존 `fxForDate` (trendData에 이미 forward-fill 구현됨) 재사용.

## 계산 위치
- `trendData` useMemo 안에서, 기존 종목 timeline 계산 직후 QLD 별도 timeline을 한 번 더 돌려
  각 날짜 entry에 `qldPct` 컬럼 추가. (QLD를 holdingStates에 섞지 않음 — 독립 계산)
- today append 구간에도 동일하게 QLD 마지막 점(`stockQuotes['QLD']` 또는 시계열 마지막값) 추가.
  - QLD 현재가는 stockQuotes에 없을 수 있음 → 시계열 마지막 종가로 today 보완.

## 렌더링
- 수익률 추이 차트(`chart.suffix === 'pct'`)일 때만 QLD `<Line dataKey="qldPct">` 추가
  - 점선(`strokeDasharray="4 3"`), 회색 `#94a3b8`, `dot={false}`, `connectNulls`
  - 내 라인(기존 색)은 그대로
- 헤더: 기존 `수익률 추이 +75.1%` → `수익률 추이 +75.1% · vs QLD +12.3%p`
  - 알파 = 내 최종 `전체pct` − QLD 최종 `qldPct`
  - 알파 색: 미국식(양수=녹색 accent.pos, 음수=빨강 accent.neg) — 페이지 색 컨벤션 일관
- 평가액·수익금 차트: 변경 없음 (QLD 라인 없음)

## viewMode 처리
- viewMode(전체/마켓/테마) 전환과 무관하게 QLD 라인은 **항상 전체 포트폴리오 vs QLD** 기준 1개로 고정.
  (마켓/테마로 쪼개도 벤치마크는 2x 나스닥 하나)

## 영향 범위
- `analysis-block.tsx`: trendData에 qldPct 추가 + 수익률 차트 Line + 헤더 알파 지표
- `invest/page.tsx`: stock-history 호출 시 tickers에 QLD 추가 (1줄), stockQuotes 호출에도 QLD 추가(선택)
- 신규 API 없음. DB/RLS 변경 없음.

## 비목표 (YAGNI)
- 평가액/수익금 차트의 QLD 가상 라인
- SPY/QQQ 등 다른 벤치마크 동시 표시 (QLD 단일)
- 마켓/테마별 개별 벤치마크
- 알파의 시계열 별도 차트 (헤더 단일 숫자로 충분)

## 엣지 케이스
- QLD 시계열이 특정 과거 날짜에 없으면: forward-fill(priceLookup과 동일)로 보완. 그래도 없으면 그날 qldPct=null → connectNulls로 선 이어짐.
- 포트폴리오 첫 거래일 이전: qldPct 미산출(내 라인과 동일 시작점).
- 원금 0 구간(전량 매도 후): qldPct=0 처리.
