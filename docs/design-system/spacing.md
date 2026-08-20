# 간격 시스템

## 공식 밀도 토큰

linear 대시보드는 `t.density`를 먼저 사용한다.

| 용도 | Token | 값 |
|------|-------|----|
| 행 높이 | `t.density.rowH` | 34 |
| 상단바 높이 | `t.density.headerH` | 48 |
| 작은 컨트롤 높이 | `t.density.controlHSm` | 28 |
| 중간 컨트롤 높이 | `t.density.controlHMd` | 34 |
| 큰 컨트롤 높이 | `t.density.controlHLg` | 40 |
| 세그먼트 최소 폭 | `t.density.segmentedMinWSm` / `segmentedMinWMd` | 34 / 44 |
| 카드 패딩 | `t.density.cardPad` | 16 |
| KPI/skeleton 높이 | `t.density.statH` | 52 |
| 내부 패널 패딩 | `t.density.panelPadY` / `panelPadX` | 8 / 10 |
| 페이지 패딩 | `t.density.pagePadY` / `pagePadX` / `pagePadBottom` | 16 / 20 / 24 |
| 블록 간격 | `t.density.blockGap` | 12 |
| KPI 간격 | `t.density.kpiGap` | 8 |
| 표 컬럼 간격 | `t.density.tableColGap` | 6 |
| 표 행 간격 | `t.density.tableRowGap` | 2 |
| 표 행 좌우 패딩 | `t.density.tableRowPadX` | 8 |
| 최소 간격 | `t.density.gapXs` | 4 |
| 작은 간격 | `t.density.gapSm` | 6 |
| 기본 간격 | `t.density.gapMd` | 10 |
| 큰 간격 | `t.density.gapLg` | 16 |

## 사이즈/간격 민감 기준

linear 대시보드에서는 새 숫자를 만들기 전에 아래 계약을 먼저 따른다.

| 영역 | 기준 |
|------|------|
| 페이지 본문 | 데스크톱 `16px 20px 24px`, 모바일은 좌우 12px까지 축소 가능 |
| 상단바 | 높이 48px, 좌우 20px, 액션 gap 8px |
| 상위 블록 | `LCard` 단위, 블록 간격 12px |
| 카드 내부 | 카드 패딩 16px, 내부 패널은 8px 10px |
| KPI 그리드 | gap 8px, `LStat` 내부 텍스트와 스파크라인 gap 10px |
| 표 | 헤더/행 같은 grid 정의, 컬럼 gap 6px, 행 gap 2px, 행 좌우 8px |
| 버튼/필터 | 작은 컨트롤 28px, 중간 34px, 큰 40px |
| 탭/세그먼트 | `LSegmented` 사용. 한 글자 탭도 최소 34px 폭을 유지 |
| 반경 | 행/버튼/배지 4px, 헤더 버튼 6px, 카드 8px, chip은 pill |
| 제목 크기 | 섹션 15px, 패널 9.5px mono, 표 헤더 9px mono |

예외가 필요하면 화면별 inline 숫자를 늘리기보다 `linear-tokens.ts`에 역할 이름을 먼저 추가한다.

## 공식 반경

| 용도 | Token | 값 |
|------|-------|----|
| 버튼, 표 행, 배지 | `t.radius.sm` | 4 |
| 중간 패널 | `t.radius.md` | 6 |
| 카드 | `t.radius.lg` | 8 |
| pill 필터 | `t.radius.pill` | 999 |

---

## 레거시 Tailwind 기본 간격

아래 값은 shadcn/Tailwind 기반 레거시 화면에서만 사용한다. `/(dashboard)/(linear)` 신규 UI는 위의 `t.density`를 우선한다.

| 용도 | 클래스 |
|------|--------|
| 섹션 간 | `space-y-8` / `mb-8` |
| 카드 간 | `space-y-6` / `gap-6` |
| 요소 간 | `space-y-4` / `gap-4` |
| 작은 간격 | `space-y-2` / `gap-2` |
| 최소 간격 | `gap-1` |

---

## 카드 내부 간격

| 요소 | 클래스 |
|------|--------|
| CardHeader | `pb-2` |
| CardContent | `pt-0 space-y-3` |
| 필터-목록 간격 | `mb-4` |

---

## 그리드 패턴

| 용도 | 클래스 |
|------|--------|
| Stats 카드 (ETF) | `grid gap-4 md:grid-cols-3` |
| Stats Grid (색상) | `grid grid-cols-2 sm:grid-cols-4 gap-2` |
| 프로젝트 카드 | `grid sm:grid-cols-1 lg:grid-cols-2 gap-4` |
| POC 카드 | `grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` |
| Management (1:2) | `grid grid-cols-1 lg:grid-cols-3 gap-6` |
| 카드 내 2컬럼 | `grid grid-cols-1 sm:grid-cols-2 gap-3` |

---

## 모달 패딩 패턴

```
컨테이너: p-6 (전체 패딩)
├── Header: pb-4 border-b
├── Body: py-4 -mx-6 px-6 (스크롤 시 좌우 유지)
└── Footer: pt-4 border-t
```

---

## 인라인 폼 간격

```tsx
// 폼 컨테이너
<div className="rounded-lg p-3 bg-white dark:bg-slate-700">
  <div className="space-y-3">
    {/* 입력 필드들 */}
  </div>
  <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
    {/* 버튼들 */}
  </div>
</div>
```

---

## 페이지네이션 간격

```tsx
<div className="pt-4 border-t mt-4">
  {/* 페이지네이션 UI */}
</div>
```
