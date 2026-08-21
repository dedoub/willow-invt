# Willow Dashboard System

Willow의 운영 화면은 Stripe의 숫자 신뢰감, Vercel의 콘솔 단순성, Supabase의 정보구조를 참고하되, 실제 구현은 현재 코드의 `linear-*` 컴포넌트를 단일 기준으로 삼는다.

## 디자인 읽기

- 화면 유형: 내부 운영 대시보드, 제품 분석 콘솔, 업무 관리 콘솔
- 사용자: 대표와 운영자가 매일 수치, 상태, 예외를 스캔하는 사용자
- 분위기: 조용하고 빠른 업무 도구
- 밀도: 높음. 장식보다 스캔성과 반복 사용성을 우선한다

## 벤치마크에서 가져올 것

| 기준 | 가져올 점 | Willow 적용 |
|---|---|---|
| Stripe Dashboard | 돈과 숫자를 과장 없이 신뢰감 있게 보여줌 | 매출, 인보이스, 투자, 크레딧, 구독 KPI |
| Vercel Dashboard | 프로젝트/배포/상태를 짧은 경로로 스캔 | 제품, 잡, MCP, 리서치 파이프라인 상태 |
| Supabase Dashboard | 복잡한 기능군을 좌측 정보구조로 묶음 | 제품별 DB, 위키, 사용자, 운영 도구 분리 |
| PostHog | 이벤트 기반 제품 분석 | VoiceCards, ReviewNotes 활성화/잔존/전환 |
| Datadog | 이상 감지와 시계열 모니터링 | 자동화 잡, 실패 로그, 알림 |

## 화면 구성 원칙

1. **한 화면은 하나의 판단을 돕는다.**
   홈/제품/운영/분석 화면은 모든 정보를 한 번에 보여주기보다, 현재 판단에 필요한 KPI, 추세, 예외, 액션을 앞에 둔다.

2. **숫자는 카드보다 위계가 중요하다.**
   KPI는 `LStat`로 통일하고, 값의 크기, 변화 방향, 보조 기간, 지표 설명을 같은 위치에 둔다.

3. **색은 의미만 말한다.**
   브랜드 blue는 주요 액션과 정보 강조, green은 긍정, red는 부정, amber는 주의다. 장식용 색상은 추가하지 않는다.

4. **표면 구분은 배경색이 기본이다.**
   페이지, 카드, 내부 패널, 행은 `t.neutrals`의 표면 계층으로 구분한다. 구조선은 상단바, 표 푸터, 편집기 툴바처럼 경계가 필요한 곳에만 쓴다.

5. **모션은 상태 피드백만 담당한다.**
   refresh 회전, hover 색 변화, skeleton shimmer처럼 상태 이해에 필요한 수준만 허용한다.

## 시스템 레이어

### Foundation

- `t.font.sans`: Inter Tight 기반 한글/Windows 폴백 포함
- `t.font.mono`: JetBrains Mono 기반 숫자/라벨
- `t.neutrals`: page, card, inner, line, text, muted, subtle
- `t.brand`: 네이비/블루 단일 브랜드 축
- `t.accent`: pos, neg, warn
- `tonePalettes`: 상태 배지와 필터 tone
- `t.radius`: 4, 6, 8, pill
- `t.density`: header, control, page, card, panel, table, gap
- `t.type`: section title, panel title, label, table head/cell/body

### Sizing Contract

Willow 대시보드는 작은 차이가 많이 보이는 조밀한 운영 UI다. 따라서 새 화면은 아래 값을 임의로 다시 만들지 않는다.

| 용도 | 기준 |
|---|---|
| Header | 48px height, 20px horizontal padding |
| Page body | 16px top, 20px sides, 24px bottom |
| Block gap | 12px |
| LCard padding | 16px |
| Inner panel | 8px 10px padding |
| KPI grid | 8px gap |
| Table | 6px column gap, 2px row gap, 8px row side padding |
| Controls | 28px small, 34px medium, 40px large |
| Radius | 4px row/button/badge, 6px compact header button, 8px card |
| Type | 15px section title, 9.5px panel label, 9px table head |

### Components

- Shell: `LinearSidebar`, `LinearHeader`
- Section: `LCard`, `LSectionHead`
- Metric: `LStat`
- Action: `LBtn`, icon-only direct button
- Status: `LBadge`, `LTableBadge`
- Filter: `LSegmented`, `LFilterChip`
- Table: `DataTable`, `LTableHead`, `LTableRow`, `LTableBody`, `LTableEmpty`, `LTableAmount`
- Chart: `DistributionPie`, domain-specific Recharts
- Loading: `Bone`, page skeletons

### Patterns

- KPI row: `LStat` grid
- Block card: `LCard` + `LSectionHead` + inner panels
- Analysis table: `DataTable`
- Operational list: `LTable*`
- Distribution panel: `DistributionPie`
- Filter toolbar: `LSegmented` for mode, `LFilterChip` for categories
- Dialog footer: left destructive or spacer, right cancel/save using `LBtn`

## Component Usage Rules

### LCard

Use for top-level blocks. Do not nest `LCard` inside `LCard`. Inner areas use `t.neutrals.inner` and `t.radius.sm`.

```tsx
<LCard>
  <LSectionHead title="VoiceCards" action={<LBtn size="sm">새로고침</LBtn>} />
  <div style={{ display: 'grid', gap: t.density.gapMd }}>
    ...
  </div>
</LCard>
```

### LSectionHead

Use once per block. `eyebrow` is allowed only when a block needs a stable category label. For most blocks, use `title` and `meta` only.

```tsx
<LSectionHead title="사용자 활성화" meta="KST 기준" />
```

Responsive behavior is built in — call sites do not handle it:

- Desktop: when the action is wider than the remaining space, it drops below the title (right-aligned) instead of squeezing it.
- Mobile: title and action always share the first line; `meta` moves to its own full-width line below the header. Wide action content wraps inside its own box.

Do not add `whiteSpace: nowrap` containers inside `action` expecting them to shrink.

- `meta`: values that must always be visible (period, counts). Next to the title on desktop, own line below on mobile.
- `note`: supplementary explanation chip (data source, aggregation caveat). Hidden on mobile — never put must-see info here.

```tsx
<LSectionHead
  title="방문 → 가입 → 결제"
  note="집계 시작 26.07.15 · 봇 제외"
  action={<LHeadBtn icon="refresh" title="데이터 새로고침" onClick={onRefresh} busy={refreshing} />}
/>
```

### LHeadBtn

The only button primitive for section-header actions: refresh, settings, external links, short labeled actions. 28px square (`t.density.controlHSm`), grows with `label`. `href` renders an external `<a>` (new tab). Never re-implement a local RefreshButton/iconBtn/linkBtn.

```tsx
<LHeadBtn icon="refresh" title="데이터 새로고침" onClick={onRefresh} busy={refreshing} />
<LHeadBtn icon="settings" title="지표 설정" onClick={openSettings} />
<LHeadBtn label="GSC" title="Search Console" href={consoleUrl} />
```

Header action policy:
- One refresh button per data-loading block, in its first section head only. Secondary section heads (user tables, sub-sections) do not repeat it.
- Icon-only buttons must set `title`.
- Long informational text goes to `note` (or `title` tooltip), never as a nowrap chip inside `action`.

### LStat

Use for all KPI values. Values use `toLocaleString()` or domain formatter before passing in. Use `tone` only when direction matters.

```tsx
<LStat
  label="ACTIVE 7D"
  value={active7d.toLocaleString()}
  sub="최근 7일 학습 활성"
  tone="info"
  sparkline={series}
/>
```

### LBtn

Use for visible actions. Default action is `primary`, secondary action is `secondary`, destructive action is `danger`, brand action is only for high-commit actions.

```tsx
<LBtn size="sm" variant="secondary">취소</LBtn>
<LBtn size="sm">저장</LBtn>
<LBtn size="sm" variant="danger">삭제</LBtn>
```

### Filters

- 2-5 mutually exclusive modes: `LSegmented`
- 5+ categories or multi-select tags: `LFilterChip`
- Search input: use inner surface, 28-34px height, icon at left

### Tables

Use `DataTable` when the table owns title, sorting and pagination. Use `LTable*` when the parent block already owns filters and summaries.

Do not align table cells with independent flex widths. Define columns once and share the definition between head and rows.

## Layout Recipes

### Standard Page

```tsx
<div style={{ display: 'flex', flexDirection: 'column', gap: t.density.blockGap }}>
  <LCard>...</LCard>
  <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: t.density.blockGap }}>
    <LCard>...</LCard>
    <LCard>...</LCard>
  </div>
</div>
```

### KPI Grid

```tsx
<div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 8 }}>
  <LStat ... />
</div>
```

### Dense Panel

```tsx
<div style={{
  background: t.neutrals.inner,
  borderRadius: t.radius.sm,
  padding: `${t.density.panelPadY}px ${t.density.panelPadX}px`,
}}>
  ...
</div>
```

## What Not To Do

- Do not introduce a second card system for new dashboard pages.
- Do not use gradient, glass, shadow or decorative border in operational pages.
- Do not use color just to make a block look different.
- Do not put long prose into section headers.
- Do not create a new table row layout without `LTable*` or `DataTable`.
- Do not copy login/signup visual language into the dashboard.
- Do not add a new icon library inside linear pages.

## 적용 순서

1. 신규 대시보드 UI는 `current-elements.md`의 공식 컴포넌트 중 하나로 매핑한다.
2. 기존 화면 수정 시 `linear-tokens`를 먼저 보고, 빠진 토큰이 있으면 토큰을 추가한 뒤 사용한다.
3. height, padding, gap, radius, font-size는 숫자를 직접 만들기 전에 `t.density`, `t.radius`, `t.type`에서 고른다.
4. 반복되는 inline style이 3곳 이상 생기면 `linear-*` 컴포넌트로 승격한다.
5. 레거시 shadcn 화면을 수정할 때도 색, 반경, 밀도는 가능한 한 `linear-tokens`와 맞춘다.
