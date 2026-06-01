# 포트폴리오 비중 도넛 — 수익률 그라데이션 보기

날짜: 2026-06-01
대상 파일: `src/app/(dashboard)/(linear)/invest/_components/analysis-block.tsx` (단일 파일)

## 목적
주식투자 페이지 "포트폴리오 비중" 도넛차트(테마별 / AI 인프라 세부 / 국내·해외)에서,
기존 카테고리 고정 컬러 보기에 더해 **슬라이스 색으로 수익률을 인코딩**하는 보기 옵션을 제공한다.
슬라이스 크기(비중)는 그대로 두고 색만 바꿔, "어느 묶음이 얼마나 벌고/잃는지"를 한눈에 본다.

## UI / 토글
- "포트폴리오 비중" 헤더 우측에 `LSegmented` 추가: `기본` | `수익률`
- 토글 1개로 도넛 3개 동시 전환
- 기본값 `기본`, localStorage 저장 (키: `invest-analysis-donut-color`)

## 데이터
- `radarData`의 각 그룹 항목에 기존 `pct`(비중) 유지 + `retPct`(수익률%) 추가
- 수익률% = (평가액KRW − 원금KRW) / 원금KRW × 100
  - 해외 종목: 평가액·원금 모두 현재 `usdKrwRate`로 KRW 환산 후 슬라이스(묶음) 단위 합산
  - 적용 대상: `byStock`, `byTheme`, `byMarket`, `byAiInfraSub`
  - 원금=0(데이터 없음)인 슬라이스는 `retPct=0` (회색 처리)

## 색상 — 발산형(파랑↔빨강, 0% 중심, 한국식)
- 헬퍼 `returnGradientColor(retPct: number): string`
  - clamp ±50%: `-50%↓`=진파랑, `0%`=연회색, `+50%↑`=진빨강
  - 0 근처는 채도 낮은 회색으로 보간 (HSL: 파랑 hue≈220, 빨강 hue≈0, lightness/saturation 보간)
  - 한국식: 음수=파랑, 양수=빨강 (기존 `pnlColor` 컨벤션과 일치)
- `기본` 모드: 기존 카테고리 컬러 그대로

## 렌더링 (DonutChart)
- prop 추가: `colorMode: 'category' | 'return'`, `returns?: number[]`(슬라이스별 retPct)
- `return` 모드: `Cell fill = returnGradientColor(returns[i])`
- **범례·툴팁 라벨은 비중% 유지** (사용자 확정). 색만 수익률을 의미.
  - 범례: 색 점 + `종목명 12.3%`(비중) — 현행 그대로
  - 툴팁: 현행 그대로 비중% 표기
- 인쇄 2단(`fixedWidth`) 경로 동작 유지. 토글은 화면 전용.

## 영향 범위
- 단일 파일. recharts 의존성 추가 없음(기존 PieChart/Pie/Cell 재사용).

## 비목표(YAGNI)
- 범례/툴팁에 수익률% 표기 (사용자가 비중 유지 선택)
- 순위형 그라데이션, clamp 사용자 조정 옵션

---

## 후속 변경 (2026-06-01): 주식투자 페이지 색 컨벤션 → 미국식

한국식(상승=빨강, 하락=파랑)에서 **미국식(상승/수익=녹색 `accent.pos`, 하락/손실=빨강 `accent.neg`)**으로 전환. 등락·손익·수익률을 색으로 인코딩하는 모든 지점 대상.

변경 파일:
- `holdings-block.tsx`: `pnlColor()` (양수 pos/음수 neg), 일일 등락 배지 (pos/neg)
- `stock-card.tsx`: `changeColor`, monitor 변화율, pyramiding 수익률 (3곳)
- `signal-bar.tsx`: `retTone` (수익 pos/손실 neg)
- `analysis-block.tsx`: `returnGradientColor` hue 음수=빨강(0)/양수=녹색(145). 도넛 범례 그라데이션 바 자동 반영
- `sector-rotation-block.tsx`: `returnColor` (양수 녹색 RGB/음수 빨강 RGB)

유지(변경 안 함):
- `trade-log.tsx` 매수/매도 배지·금액 → **중립색**으로 변경 (수익률 아님, 거래 종류 구분이라 색 의미 제거). 라벨 텍스트·부호로 구분.
- `real-estate-block.tsx` 괴리율 색 → **한국식 유지** (호가-실거래 괴리는 주식 수익률과 다른 개념)
- `portfolio-kanban.tsx` `brand[600]` → 등락색 아님(드래그 하이라이트/정렬 토글), 그대로
