# Willow Management v2 Page — A (Refined) Variant

> **For agentic workers:** This spec defines a NEW page at `/willow-investment/management-v2`. Do NOT modify any existing files except to add a sidebar link.

## Goal

Create a standalone v2 of the Willow Investment management dashboard that implements the A (Refined) design variant from the Claude Design prototype. The page pulls real data from existing API endpoints. Zero impact on existing pages.

## Design Reference

Source: Claude Design handoff bundle (`/tmp/design-extract/willow-dashboard/project/`)
- `tokens.jsx` — A (Conservative/Refined) variant tokens
- `kit.jsx` — Component primitives (Badge, Card, SectionHead, Stat, Spark)
- `sections.jsx` — Section compositions (DashboardHome, KanbanDemo, InvoiceTable)

## Architecture

Single-file page component at `src/app/willow-investment/management-v2/page.tsx` with colocated helper components. No shared component modifications. Fonts loaded via `next/font/google` at page level with scoped CSS class.

## Design Tokens (A Refined)

### Typography
- Sans: `Inter` (weights 400/500/600/700)
- Mono: `JetBrains Mono` (weights 400/500)
- Display: `Inter` (same as sans for Refined variant)
- `font-variant-numeric: tabular-nums` on all numeric data

### Colors (Hex)
```
Neutrals:
  page:   #F7F6F3   (warm off-white — outer background)
  card:   #EFEDE8   (warm light gray — card surface)
  inner:  #FFFFFF   (white — inner areas, table cells)
  line:   rgba(17,24,39,0.06)  (subtle separator)
  text:   #1C1917   (near-black warm)
  muted:  #6B6760   (warm mid-gray)
  subtle: #9A9590   (warm light-gray — labels, placeholders)

Brand (sky blue):
  50:  #EAF5FB     500: #3F93C6
  100: #CFE7F5     600: #3078AA
  200: #A8D3EB     700: #265E87
  300: #7CBCDF     800: #1E4867
  400: #5AA8D4     900: #163449

Accent:
  pos:  #2F8F5B  (positive/gain — green)
  neg:  #B0413E  (negative/loss — red)
  warn: #B88A2A  (warning — amber)
```

### Spacing & Density
```
rowH:    40px    (table row height)
cardPad: 16px    (card internal padding)
gapSm:   8px     (small gap)
gapMd:   12px    (medium gap)
gapLg:   20px    (large gap)
```

### Radius
```
sm: 6px    md: 8px    lg: 10px    pill: 999px
```

### Badge
```
radius: 6px    weight: 500    padX: 8px    padY: 2px    size: 11.5px
```

### Decor: `minimal`
- No hairline separators between rows
- Zebra striping: alternating rows use `inner` (#FFFFFF) background
- No shadows, no borders anywhere

## Page Sections

### Section 1: KPI Stats Row (4 cards, horizontal grid)

**Layout:** `grid-cols-4` with `gapMd` (12px)

Each stat card:
- **Eyebrow label:** 11px, weight 500, `muted` color, uppercase if editorial (not for Refined)
- **Value:** 22px, weight 600, `text` color, tabular-nums, letter-spacing -0.5
- **Unit:** 0.55em of value size, `muted` color
- **Delta:** 11px, weight 500, colored by `pos`/`neg`
- **Sparkline:** SVG polyline, 28px height, with filled polygon at 12% opacity

**Data sources:**
| Card | Label | Data |
|------|-------|------|
| AUM | 총 운용자산 | Sum of stock portfolio current values from `/api/willow-mgmt/stock-quotes` |
| Monthly P&L | 이번달 수익 | Calculated from stock trades this month via `/api/willow-mgmt/stock-trades` |
| Active Projects | 진행 프로젝트 | Count of active milestones from `/api/willow-mgmt/milestones` |
| Receivables | 미수금 | Sum of `issued` invoices from `/api/willow-mgmt/invoices` |

### Section 2: Portfolio Table + Milestones Sidebar (2:1 grid)

**Left — Portfolio Table (Card):**
- **SectionHead:** eyebrow "PORTFOLIO", title "주식 포트폴리오", action = market badges (KR count, US count)
- **Table header:** 10.5px, weight 500, uppercase, `subtle` color, letter-spacing 0.6
- **Columns:** 종목 (name + ticker), 시장 (badge), 평균단가, 현재가, 수익률, 추이 (sparkline)
- **Row style:** 40px height, zebra striping (odd rows `inner` bg), tabular-nums
- **Data:** `/api/willow-mgmt/stock-trades` (holdings) + `/api/willow-mgmt/stock-quotes` (current prices)

**Right — Milestones Sidebar (Card):**
- **SectionHead:** eyebrow "MILESTONES", title "이번 주 일정"
- **Each milestone:** date block (day + month) + title + project badge
- **Date block:** 38px wide, `inner` bg, rounded `sm`, day=14px semibold, month=9px mono subtle
- **Data:** `/api/willow-mgmt/milestones` (upcoming, sorted by target_date)

### Section 3: Invoice Table (Card, full width)

- **SectionHead:** eyebrow "FINANCE", title "세금계산서 · 입출금", action = "추가" button
- **Table columns:** 일자, 거래처, 적요, 구분 (badge), 금액 (colored), 상태 (pill badge)
- **Row style:** 40px height, zebra striping, tabular-nums
- **Date column:** mono font, muted color, 11.5px
- **Amount:** right-aligned, +/- prefix, colored by revenue(pos)/expense(neg)
- **Status badges:** pill, 완료=done tone, 발행=pending tone
- **Data:** `/api/willow-mgmt/invoices` (recent, sorted by date desc)

## Component Patterns

### SectionHead
```
<div flex justify-between align-end mb={gapMd}>
  <div>
    <div 10.5px weight-600 uppercase letter-spacing-1.2 subtle>{eyebrow}</div>
    <div 15px weight-600 text letter-spacing--0.2>{title}</div>
  </div>
  {action}
</div>
```

### Badge
```
<span inline-flex items-center gap-4
  px={8} py={2} text={11.5px} weight-500 radius-6
  bg={palette.bg} color={palette.fg}>
  {children}
</span>
```

Badge palettes:
| Tone | BG | FG |
|------|-----|-----|
| neutral | #E8E6E0 | #2A2824 |
| pending | #FBEFD5 | #8B5A12 |
| progress | #DCE8F5 | #1F4E79 |
| done | #DAEEDD | #1F5F3D |
| brand | brand-100 | brand-700 |
| warn | #F9E8D0 | #8A5A1A |
| danger | #F3DADA | #8A2A2A |
| pos | #DAEEDD | #1F5F3D |
| neg | #F3DADA | #8A2A2A |

### Stat
```
<div>
  <div 11px weight-500 muted mb-4>{label}</div>
  <div flex items-baseline gap-6>
    <span 22px weight-600 text tabular-nums letter-spacing--0.5>
      {value}<span 0.55em muted ml-2>{unit}</span>
    </span>
    <span 11px weight-500 {deltaTone}>{delta}</span>
  </div>
</div>
```

### Spark (SVG polyline)
```
<svg width={w} height={h}>
  <polygon points="0,h {linePoints} w,h" fill={color} opacity=0.12 />
  <polyline points={linePoints} stroke={color} strokeWidth=1.5
    fill=none strokeLinecap=round strokeLinejoin=round />
</svg>
```

### Card
```
<div bg={card} radius={lg} p={cardPad} font={sans} color={text}>
  {children}
</div>
```

## Data Fetching

All data is fetched client-side with `fetch()` on mount, same pattern as existing management page. Use `SWR` or simple `useState`+`useEffect`. Auth via existing `auth_token` cookie (automatic).

API endpoints (all existing, no new endpoints needed):
- `GET /api/willow-mgmt/invoices`
- `GET /api/willow-mgmt/stock-trades`
- `GET /api/willow-mgmt/stock-quotes?tickers={}&markets={}`
- `GET /api/willow-mgmt/milestones`
- `GET /api/willow-mgmt/projects`
- `GET /api/willow-mgmt/clients`

## Font Loading Strategy

Load Inter and JetBrains Mono via `next/font/google` in a layout file at `src/app/willow-investment/management-v2/layout.tsx`. Apply font CSS variables to the page container. This scopes the fonts to v2 only — no impact on other pages.

## Sidebar Link

Add "경영관리 v2" item under the Willow Invest section in `src/components/layout/sidebar.tsx`, pointing to `/willow-investment/management-v2`.

## Non-Goals
- No CRUD modals (view-only dashboard for v2)
- No drag-and-drop
- No Gmail integration
- No real estate section
- No wiki section
- No dark mode (light only for now)
- No mobile responsiveness (desktop-first)
