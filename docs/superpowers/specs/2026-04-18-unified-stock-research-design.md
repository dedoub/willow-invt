# Unified Stock Research — 리서치 결과물 통합 설계

## 목적

밸류체인 스캔(`stock_research`)과 중소형주 스캔(`smallcap_screening`)의 결과를 단일 테이블·단일 UI로 통합하여, 발굴 소스에 관계없이 동일한 형태로 리서치 결과를 관리한다.

## 현재 상태

| 항목 | 밸류체인 | 중소형주 |
|------|---------|---------|
| 테이블 | `stock_research` (25건) | `smallcap_screening` (490건) |
| 스크립트 | `stock-research-scan.ts` (09:00) | `market-research-scan.ts` (16:15) |
| API | `/api/willow-mgmt/stock-research` | `/api/willow-mgmt/smallcap-screening` |
| 등급 | pass_tier1 / pass_tier2 / fail | A / B / C / F |
| 스코어 | 없음 | 6개 (growth/value/quality/momentum/insider/sentiment) |
| 프론트 카드 | `InvestmentCardResearch` (type='research') | `InvestmentCardResearch` (type='smallcap') |

## 설계

### 1. DB 스키마 변경

`stock_research` 테이블에 컬럼 추가:

| 컬럼 | 타입 | 용도 |
|------|------|------|
| `source_type` | text CHECK ('valuechain', 'smallcap') | 발굴 소스 대분류 |
| `track` | text (nullable) | profitable / hypergrowth |
| `market` | text DEFAULT 'US' | KR / US |
| `sector` | text (nullable) | 단일 섹터 (smallcap용) |
| `market_cap_m` | numeric (nullable) | 시총 $M 단위 |
| `composite_score` | numeric (nullable) | 종합 스코어 0-100 |
| `growth_score` | numeric (nullable) | 성장 스코어 |
| `value_score` | numeric (nullable) | 가치 스코어 |
| `quality_score` | numeric (nullable) | 품질 스코어 |
| `momentum_score` | numeric (nullable) | 모멘텀 스코어 |
| `insider_score` | numeric (nullable) | 내부자 스코어 |
| `sentiment_score` | numeric (nullable) | 센티먼트 스코어 |
| `fail_reasons` | text[] (nullable) | 복수 탈락 사유 |
| `change_pct` | numeric (nullable) | 일간 변동률 |

verdict 체계:
- 기존 check constraint 유지: `pass_tier1`, `pass_tier2`, `fail`
- 기존 `source` 컬럼(manual/reddit/cross_signal 등)은 세부 소스로 유지
- `source_type`은 대분류 (valuechain/smallcap)

smallcap 상세 재무 데이터(pe, roe, debt_to_equity 등 20여개)는 보존하지 않음. 스코어로 이미 요약됨.

### 2. 데이터 마이그레이션

| smallcap 필드 | → stock_research 필드 | 변환 |
|---|---|---|
| ticker, company_name, scan_date | 그대로 | |
| tier A | verdict = `pass_tier1` | |
| tier B | verdict = `pass_tier2` | |
| tier C/F | verdict = `fail` | |
| sector | sector | |
| market_cap_m | market_cap_m | |
| price | current_price | |
| track | track | |
| 6개 스코어 + composite_score | 각각 매핑 | |
| fail_reasons | fail_reasons | |
| structural_thesis, value_chain_position | 그대로 | |
| change_pct | change_pct | |
| (생성) | source = 'market_scan', source_type = 'smallcap' | |

기존 stock_research 25건: `source_type` = 'valuechain'으로 업데이트.

마이그레이션 완료 후 `smallcap_screening` 테이블은 당분간 보존, 확인 후 추후 정리.

### 3. 스캔 스크립트 통합

`market-research-scan.ts`를 메인으로 유지, `stock-research-scan.ts` 로직을 합침.

실행 모드:
- `--phase=valuechain` (09:00 launchd): 포트폴리오 기반 밸류체인 발굴 → source_type='valuechain'
- `--phase=smallcap` (16:15 launchd): 시장 데이터 + 레딧 버즈 기반 → source_type='smallcap'
- 플래그 없이 실행: 둘 다 순차 실행

저장:
- 모두 `stock_research` 테이블에 통일된 스키마로 적재
- 밸류체인 결과: 스코어 6개가 null일 수 있음
- 중소형주 결과: high_12m, gap_from_high_pct 등이 null일 수 있음

파일 정리:
- `scripts/market-research-scan.ts` → 통합 스크립트로 확장
- `scripts/stock-research-scan.ts` → 폐기
- `scripts/run-stock-research-scan.sh` → 폐기

launchd:
- 기존 stock-research-scan plist → `market-research-scan --phase=valuechain`로 교체
- 기존 market-research-scan plist → `--phase=smallcap` 추가

### 4. API 통합

stock-research route 확장:
- `GET` 필터 추가: `?source_type=valuechain|smallcap`, `?track=`, `?scan_date=`
- 응답에 `scanDates` 배열 추가
- `PATCH` 추가 (thesis/value_chain 업데이트)
- 기존 `?verdict` 필터 유지

smallcap-screening route 폐기.

management page 데이터 로딩:
- `loadStockResearch` + `loadSmallcapScreening` → `loadStockResearch` 하나로 통합
- kanban props에서 `smallcapData`, `loadSmallcapScreening`, `isLoadingSmallcap` 제거

### 5. 프론트엔드 카드 통합

ResearchCardData 인터페이스:
- `type: 'research' | 'smallcap'` 제거
- `sourceType: 'valuechain' | 'smallcap'` 추가
- 모든 필드를 하나의 인터페이스에 통합 (대부분 nullable)

카드 배지:
```
T1 밸류체인  |  T1 소형주  |  T2 밸류체인  |  T2 소형주
```
- 등급 배지(T1/T2) + 소스 태그(작은 텍스트) 조합
- 색상은 등급 기준 (T1=초록, T2=파랑)

카드 본문 통합 (모든 카드 동일 구조):
- Row 1: 등급배지 + 소스태그 + 티커 + 종목명
- Row 2: 섹터 태그 + 시총 + 종합스코어(있으면)
- Row 3: 밸류체인/논거 (있으면)
- Row 4: 6개 스코어바 (있으면)
- Row 5: 날짜/소스 + 워치리스트 추가 버튼

칸반 리서치 열:
- 정렬: 추천순(verdict rank) / 모멘텀순(momentum_score 우선, 없으면 gap_from_high_pct 환산)
- 소스 필터 버튼 추가: 전체 / 밸류체인 / 소형주

리서치 모달:
- 기존 밸류체인 전용 모달에 스코어 입력 영역 추가 (optional)
- source_type 선택 추가

## 변경 범위 요약

| 영역 | 파일 | 변경 |
|------|------|------|
| DB | migration | 컬럼 추가 + 데이터 이관 |
| API | `stock-research/route.ts` | 필터/PATCH 확장 |
| API | `smallcap-screening/route.ts` | 폐기 |
| 스크립트 | `market-research-scan.ts` | 밸류체인 로직 합침, phase 분기 |
| 스크립트 | `stock-research-scan.ts` | 폐기 |
| 스크립트 | `run-stock-research-scan.sh` | 폐기 |
| launchd | plist 2개 | 커맨드 수정 |
| 프론트 | `investment-kanban.tsx` | props 단순화, 리서치열 통합 |
| 프론트 | `investment-card-research.tsx` | type→sourceType, 배지 변경 |
| 프론트 | `investment-research-modal.tsx` | 스코어/source_type 필드 추가 |
| 프론트 | `management/page.tsx` | 데이터 로딩 통합, smallcap 참조 제거 |
