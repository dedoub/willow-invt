# 현재 사용 요소 인벤토리

이 문서는 코드에서 실제로 사용 중인 UI 요소를 기준으로 디자인 시스템의 입력값을 고정한다.
신규 UI는 "예쁜 새 패턴"보다 이 인벤토리의 반복 요소를 먼저 재사용한다.

## 수집 범위

- 대상: `src/app/(dashboard)/(linear)`, `src/app/(dashboard)/_components`, `src/components`
- 제외: macOS resource fork 파일인 `._*`
- 기준: import 빈도, JSX 컴포넌트 사용 빈도, 반복 class/style 패턴

## 시스템 축

| 축 | 현재 소스 | 역할 | 사용 빈도 |
|---|---|---|---:|
| 토큰 | `linear-tokens.ts` | 색, 폰트, 반경, 밀도, 톤 팔레트 | 70 import |
| 아이콘 | `linear-icons.tsx` | 대시보드 전용 선형 아이콘 | 206 사용 |
| 카드 | `linear-card.tsx` | 섹션/블록 컨테이너 | 48 사용 |
| 섹션 헤더 | `linear-section-head.tsx` | 블록 제목, 메타, 액션 | 52 사용 |
| KPI | `linear-stat.tsx` | 숫자 타일, 스파크라인, 설명 툴팁 | 103 사용 |
| 버튼 | `linear-btn.tsx` | 대시보드 액션 버튼 | 63 사용 |
| 스켈레톤 | `linear-skeleton.tsx` | 페이지별 로딩 골격 | `Bone` 168 사용 |
| 표 | `linear-data-table.tsx`, `linear-table.tsx` | 분석 표, 업무 표 | `DataTable` 12 사용 |
| 필터 | `linear-segmented.tsx`, `linear-filter-chip.tsx` | 모드 전환, 태그 필터 | 14 사용 |
| 분포 차트 | `distribution-pie.tsx` | 보이스카드/리뷰노트 분포 | 6 사용 |

## 공식 컴포넌트

### App Shell

- `LinearSidebar`: 좌측 네이비 단색 내비게이션
- `LinearHeader`: 52px 상단바, breadcrumb, refresh, 페이지 액션
- `DashColsToggle`: 1열/2열 전환이 필요한 페이지 전용 액션

### Layout

- `LCard`: 기본 블록 컨테이너
- `LSectionHead`: 섹션 제목, 보조 메타(`meta`), 정보 칩(`note`, 모바일 숨김), 우측 액션. 액션이 넓으면 아랫줄로 줄바꿈
- `LHeadBtn`: 섹션 헤더 우측 컨트롤의 단일 프리미티브 (28px 정사각, 아이콘/라벨/외부링크/busy). 헤더에 로컬 버튼 복제 금지
- 직접 grid/flex layout: 페이지 조립용. 토큰의 `t.density`를 우선 사용

### Data Display

- `LStat`: KPI, 숫자, 스파크라인, 지표 설명
- `DistributionPie`: 작은 분포 도넛과 범례
- Recharts 직접 사용: 복합 차트가 필요할 때만 사용
- `DataTable`: 자체 제목, 정렬, 페이지네이션까지 가진 분석 표
- `LTable*`: 이미 필터/KPI/페이지네이션을 가진 블록 내부 목록 표

### Controls

- `LBtn`: 기본 액션 버튼
- `LSegmented`: 소수 옵션 모드 전환
- `LFilterChip`: 5개 이상 옵션, 태그/카테고리 필터
- `LBadge`: 일반 상태 배지
- `LTableBadge`: 표 내부 상태 배지
- 직접 `button`: 아이콘 버튼, 카드 내부 미세 액션 등 사이즈가 더 작은 경우

### Feedback

- `Bone`: 단일 스켈레톤 primitive
- 페이지별 skeleton: `MgmtSkeleton`, `InvestSkeleton`, 도메인 전용 skeleton
- `LTableEmpty`, `EmptyLine`: 표/패널 빈 상태
- `Loader2`: 로그인, 인증, 레거시 shadcn 영역에서만 유지

### Forms and Dialogs

- 대시보드 신규 작업: 가능한 한 `LBtn`, 토큰 기반 inline input, 기존 dialog shell 패턴 사용
- 레거시/비linear 영역: `@/components/ui/button`, `Input`, `Textarea`, `Dialog`, `Card` 유지
- Rich text: `TiptapEditor`

## 색과 표면

| 용도 | 토큰 |
|---|---|
| 페이지 | `t.neutrals.page` |
| 카드 | `t.neutrals.card` |
| 내부 패널/행 | `t.neutrals.inner` |
| 구조선 | `t.neutrals.line` |
| 본문 | `t.neutrals.text` |
| 보조 | `t.neutrals.muted` |
| 아주 약한 정보 | `t.neutrals.subtle` |
| 브랜드 액션 | `t.brand[500]`, `t.brand[600]`, `t.brand[700]` |
| 긍정 | `t.accent.pos` |
| 부정 | `t.accent.neg` |
| 주의 | `t.accent.warn` |

## 반경과 밀도

| 용도 | 토큰 |
|---|---|
| 작은 행, 버튼, 배지 | `t.radius.sm` |
| 중간 요소 | `t.radius.md` |
| 카드 | `t.radius.lg` |
| pill 필터 | `t.radius.pill` |
| 상단바 높이 | `t.density.headerH` |
| 컨트롤 높이 | `t.density.controlHSm`, `controlHMd`, `controlHLg` |
| 카드 패딩 | `t.density.cardPad` |
| 내부 패널 패딩 | `t.density.panelPadY`, `panelPadX` |
| 페이지 패딩 | `t.density.pagePadY`, `pagePadX`, `pagePadBottom` |
| 블록 간격 | `t.density.blockGap` |
| KPI 간격 | `t.density.kpiGap` |
| 표 간격 | `t.density.tableColGap`, `tableRowGap`, `tableRowPadX` |
| 작은 간격 | `t.density.gapSm` |
| 기본 간격 | `t.density.gapMd` |
| 큰 간격 | `t.density.gapLg` |

## 크기 타입 토큰

| 용도 | 토큰 |
|---|---|
| 섹션 제목 | `t.type.sectionTitle` |
| 내부 패널 제목 | `t.type.panelTitle` |
| 보조 설명 | `t.type.helper` |
| 작은 라벨 | `t.type.label` |
| 배지/작은 컨트롤 | `t.type.badge` |
| 표 헤더 | `t.type.tableHead` |
| 표 셀 | `t.type.tableCell` |
| 표 본문 | `t.type.tableBody` |
| 기본 본문/KPI 값 | `t.type.body` |

## 현재 예외

| 예외 | 위치 | 처리 |
|---|---|---|
| 로그인/회원가입의 gradient, glass, shadow, border | `src/app/login`, `src/app/signup` | 인증 랜딩 성격의 별도 표면으로 유지. 운영 대시보드 시스템에 복사 금지 |
| shadcn `Card/Button/Input/Dialog` | `src/components`, 일부 레거시 화면 | 기존 동작 보존. 신규 linear 페이지에서는 우선 사용하지 않음 |
| 직접 SVG path 아이콘 | `linear-icons.tsx` | 이미 프로젝트 전용 아이콘 시스템으로 쓰임. 신규 아이콘은 여기에 추가하되 stroke 1.5-2.0 유지 |
| 구조선 | `LinearHeader`, `DataTable`, 일부 editor toolbar | 표면 구분이 어려운 구조 경계에서만 `t.neutrals.line` 사용 |
| progress bar | 투자 리서치 카드 | 점수/등급 비교처럼 값 크기가 핵심일 때만 허용 |

## 신규 UI 선택 순서

1. 페이지가 `/(dashboard)/(linear)` 아래라면 `linear-*`를 먼저 사용한다.
2. 폼/모달이 필요하면 기존 linear dialog 패턴을 복제하고, 액션은 `LBtn`으로 맞춘다.
3. 표는 자체 제목/페이지네이션이 필요하면 `DataTable`, 블록 내부 목록이면 `LTable*`를 쓴다.
4. 상태 배지는 도메인별 색을 만들기 전에 `tonePalettes`에 매핑 가능한지 확인한다.
5. class 기반 shadcn 스타일은 레거시 영역 또는 인증 화면이 아니면 신규로 확산하지 않는다.
