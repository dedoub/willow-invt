# Unified Stock Research Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge `stock_research` and `smallcap_screening` into a single table, API, scan script, and unified frontend card.

**Architecture:** Extend `stock_research` table with score columns + source_type, migrate smallcap data in, unify the API route, merge scan scripts with `--phase` flag, and converge the frontend to one card format with source badges.

**Tech Stack:** Supabase (PostgreSQL migration), Next.js API routes, TypeScript scan scripts, launchd plists

**Spec:** `docs/superpowers/specs/2026-04-18-unified-stock-research-design.md`

---

### Task 1: DB Migration — Add columns to stock_research

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_unify_stock_research.sql` (timestamp at creation time)

- [ ] **Step 1: Write the migration SQL**

```sql
-- Add new columns to stock_research for unified schema
ALTER TABLE stock_research
  ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'valuechain',
  ADD COLUMN IF NOT EXISTS track text,
  ADD COLUMN IF NOT EXISTS market text DEFAULT 'US',
  ADD COLUMN IF NOT EXISTS sector text,
  ADD COLUMN IF NOT EXISTS market_cap_m numeric,
  ADD COLUMN IF NOT EXISTS composite_score numeric,
  ADD COLUMN IF NOT EXISTS growth_score numeric,
  ADD COLUMN IF NOT EXISTS value_score numeric,
  ADD COLUMN IF NOT EXISTS quality_score numeric,
  ADD COLUMN IF NOT EXISTS momentum_score numeric,
  ADD COLUMN IF NOT EXISTS insider_score numeric,
  ADD COLUMN IF NOT EXISTS sentiment_score numeric,
  ADD COLUMN IF NOT EXISTS fail_reasons text[],
  ADD COLUMN IF NOT EXISTS change_pct numeric;

-- Add check constraint for source_type
ALTER TABLE stock_research
  ADD CONSTRAINT stock_research_source_type_check
  CHECK (source_type IN ('valuechain', 'smallcap'));

-- Set existing rows as valuechain
UPDATE stock_research SET source_type = 'valuechain' WHERE source_type IS NULL;

-- Make source_type NOT NULL after backfill
ALTER TABLE stock_research ALTER COLUMN source_type SET NOT NULL;
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Run: `mcp__supabase__apply_migration` with the SQL above.

- [ ] **Step 3: Verify migration applied**

Run: `mcp__supabase__execute_sql` with:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'stock_research'
ORDER BY ordinal_position;
```

Expected: All new columns present (source_type, track, market, sector, market_cap_m, composite_score, growth_score, value_score, quality_score, momentum_score, insider_score, sentiment_score, fail_reasons, change_pct).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "Add unified research columns to stock_research table"
```

---

### Task 2: Data Migration — Move smallcap_screening → stock_research

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_migrate_smallcap_to_research.sql`

- [ ] **Step 1: Write the data migration SQL**

```sql
-- Migrate smallcap_screening data into stock_research
INSERT INTO stock_research (
  ticker, company_name, scan_date, source, source_type, market,
  sector, current_price, market_cap_m, track,
  composite_score, growth_score, value_score, quality_score,
  momentum_score, insider_score, sentiment_score,
  change_pct, fail_reasons, structural_thesis, value_chain_position,
  verdict
)
SELECT
  ticker,
  company_name,
  scan_date,
  'market_scan',        -- source (detail)
  'smallcap',           -- source_type (category)
  'US',                 -- market
  sector,
  price,                -- → current_price
  market_cap_m,
  track,
  composite_score,
  growth_score,
  value_score,
  quality_score,
  momentum_score,
  insider_score,
  sentiment_score,
  change_pct,
  fail_reasons,
  structural_thesis,
  value_chain_position,
  CASE tier
    WHEN 'A' THEN 'pass_tier1'
    WHEN 'B' THEN 'pass_tier2'
    ELSE 'fail'
  END                   -- verdict mapping
FROM smallcap_screening;
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Run: `mcp__supabase__apply_migration` with the SQL above.

- [ ] **Step 3: Verify migration**

Run: `mcp__supabase__execute_sql` with:
```sql
SELECT source_type, verdict, count(*)
FROM stock_research
GROUP BY source_type, verdict
ORDER BY source_type, verdict;
```

Expected: `valuechain` rows (25) + `smallcap` rows (~490), verdicts correctly mapped.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "Migrate smallcap_screening data into stock_research"
```

---

### Task 3: API — Extend stock-research route and remove smallcap route

**Files:**
- Modify: `src/app/api/willow-mgmt/stock-research/route.ts`
- Delete: `src/app/api/willow-mgmt/smallcap-screening/route.ts`

- [ ] **Step 1: Extend GET with new filters and scanDates**

In `src/app/api/willow-mgmt/stock-research/route.ts`, replace the GET handler:

```typescript
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const verdict = searchParams.get('verdict')
  const sourceType = searchParams.get('source_type')
  const track = searchParams.get('track')
  const scanDate = searchParams.get('scan_date')
  const limit = parseInt(searchParams.get('limit') || '500')

  const supabase = getServiceSupabase()

  let query = supabase
    .from('stock_research')
    .select('*')
    .order('scan_date', { ascending: false })
    .limit(limit)

  if (verdict) {
    query = query.eq('verdict', verdict)
  }
  if (sourceType) {
    query = query.eq('source_type', sourceType)
  }
  if (track) {
    query = query.eq('track', track)
  }
  if (scanDate) {
    query = query.eq('scan_date', scanDate)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const items = (data || []).map((r) => ({
    ...r,
    market_cap_b: r.market_cap_b ? Number(r.market_cap_b) : null,
    market_cap_m: r.market_cap_m ? Number(r.market_cap_m) : null,
    current_price: r.current_price ? Number(r.current_price) : null,
    high_12m: r.high_12m ? Number(r.high_12m) : null,
    gap_from_high_pct: r.gap_from_high_pct ? Number(r.gap_from_high_pct) : null,
    composite_score: r.composite_score ? Number(r.composite_score) : null,
    growth_score: r.growth_score ? Number(r.growth_score) : null,
    value_score: r.value_score ? Number(r.value_score) : null,
    quality_score: r.quality_score ? Number(r.quality_score) : null,
    momentum_score: r.momentum_score ? Number(r.momentum_score) : null,
    insider_score: r.insider_score ? Number(r.insider_score) : null,
    sentiment_score: r.sentiment_score ? Number(r.sentiment_score) : null,
    change_pct: r.change_pct ? Number(r.change_pct) : null,
  }))

  // Get available scan dates for filter
  const { data: dates } = await supabase
    .from('stock_research')
    .select('scan_date')
    .order('scan_date', { ascending: false })

  const scanDates = [...new Set((dates || []).map(d => d.scan_date))].slice(0, 20)

  return NextResponse.json({ items, scanDates })
}
```

- [ ] **Step 2: Extend POST to accept new fields**

Update the POST handler to include the new columns:

```typescript
export async function POST(request: Request) {
  const body = await request.json()
  const {
    ticker, company_name, scan_date, source, source_type,
    market, sector, track,
    market_cap_b, market_cap_m, current_price,
    revenue_growth_yoy, margin, value_chain_position, structural_thesis,
    sector_tags, high_12m, gap_from_high_pct, trend_verdict, verdict, fail_reason, notes,
    composite_score, growth_score, value_score, quality_score,
    momentum_score, insider_score, sentiment_score,
    fail_reasons, change_pct,
  } = body

  if (!ticker || !company_name) {
    return NextResponse.json({ error: 'ticker and company_name are required' }, { status: 400 })
  }

  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from('stock_research')
    .insert({
      ticker,
      company_name,
      scan_date: scan_date || new Date().toISOString().split('T')[0],
      source: source || 'manual',
      source_type: source_type || 'valuechain',
      market: market || 'US',
      sector: sector || null,
      track: track || null,
      market_cap_b: market_cap_b || null,
      market_cap_m: market_cap_m || null,
      current_price: current_price || null,
      revenue_growth_yoy: revenue_growth_yoy || null,
      margin: margin || null,
      value_chain_position: value_chain_position || null,
      structural_thesis: structural_thesis || null,
      sector_tags: sector_tags || [],
      high_12m: high_12m || null,
      gap_from_high_pct: gap_from_high_pct || null,
      trend_verdict: trend_verdict || null,
      verdict: verdict || null,
      fail_reason: fail_reason || null,
      notes: notes || null,
      composite_score: composite_score || null,
      growth_score: growth_score || null,
      value_score: value_score || null,
      quality_score: quality_score || null,
      momentum_score: momentum_score || null,
      insider_score: insider_score || null,
      sentiment_score: sentiment_score || null,
      fail_reasons: fail_reasons || null,
      change_pct: change_pct || null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
```

- [ ] **Step 3: Extend PUT to accept new fields**

Update the PUT handler — no structural changes needed, `...updates` spread already handles new columns. Just ensure it sets `updated_at`:

```typescript
export async function PUT(request: Request) {
  const body = await request.json()
  const { id, ...updates } = body

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from('stock_research')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
```

- [ ] **Step 4: Add PATCH for thesis/value_chain update**

Add a PATCH handler (from the old smallcap route):

```typescript
export async function PATCH(request: Request) {
  const body = await request.json()
  const { id, structural_thesis, value_chain_position } = body

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const supabase = getServiceSupabase()
  const { error } = await supabase
    .from('stock_research')
    .update({
      structural_thesis: structural_thesis ?? null,
      value_chain_position: value_chain_position ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 5: Delete smallcap-screening route**

```bash
rm src/app/api/willow-mgmt/smallcap-screening/route.ts
rmdir src/app/api/willow-mgmt/smallcap-screening
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/willow-mgmt/
git commit -m "Unify stock-research API route, remove smallcap-screening"
```

---

### Task 4: Frontend — Unify card component

**Files:**
- Modify: `src/components/willow-mgmt/investment-card-research.tsx`

- [ ] **Step 1: Update ResearchCardData interface**

Replace the interface — remove `type`, add `sourceType`:

```typescript
export interface ResearchCardData {
  id: string
  sourceType: 'valuechain' | 'smallcap'
  ticker: string
  companyName: string
  verdict?: 'pass_tier1' | 'pass_tier2' | 'fail'
  sectorTags?: string[]
  sector?: string | null
  marketCapB?: number | null
  marketCapM?: number | null
  currentPrice?: number | null
  thesis?: string | null
  valueChain?: string | null
  scanDate?: string
  source?: string
  gapFromHighPct?: number | null
  failReason?: string | null
  failReasons?: string[] | null
  notes?: string | null
  track?: 'profitable' | 'hypergrowth' | null
  compositeScore?: number | null
  changePct?: number | null
  growthScore?: number | null
  valueScore?: number | null
  qualityScore?: number | null
  momentumScore?: number | null
  insiderScore?: number | null
  sentimentScore?: number | null
}
```

- [ ] **Step 2: Update badge config and rendering**

Replace the badge logic to show verdict + source tag:

```typescript
const verdictBadge: Record<string, { label: string; bg: string; text: string }> = {
  pass_tier1: { label: 'T1', bg: 'bg-emerald-100 dark:bg-emerald-900/50', text: 'text-emerald-700 dark:text-emerald-400' },
  pass_tier2: { label: 'T2', bg: 'bg-blue-100 dark:bg-blue-900/50', text: 'text-blue-700 dark:text-blue-400' },
}

const sourceLabel: Record<string, string> = {
  valuechain: '밸류체인',
  smallcap: '소형주',
}
```

- [ ] **Step 3: Update the component rendering**

In the `InvestmentCardResearch` component, update Row 1 to show verdict badge + source tag:

```tsx
export function InvestmentCardResearch({ data, onAddToWatchlist, onEdit }: Props) {
  const badge = data.verdict ? verdictBadge[data.verdict] : null
  const srcLabel = sourceLabel[data.sourceType] || ''

  const mcap = formatMarketCap(data.marketCapB, data.marketCapM)
  const sectors = data.sectorTags?.length ? data.sectorTags : (data.sector ? [data.sector] : [])
  const hasScores = data.growthScore != null || data.valueScore != null
  const hasThesis = data.thesis || data.valueChain

  return (
    <div className="group rounded-lg p-2.5 bg-white dark:bg-slate-700">
      {/* Row 1: verdict badge + source tag + ticker + company + edit */}
      <div className="flex items-center gap-1.5">
        {badge && (
          <span className={cn('px-1.5 py-0.5 text-[10px] font-bold rounded', badge.bg, badge.text)}>
            {badge.label}
          </span>
        )}
        {srcLabel && (
          <span className="text-[9px] text-slate-400 dark:text-slate-500">{srcLabel}</span>
        )}
        {data.track === 'hypergrowth' && (
          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-400">HG</span>
        )}
        <span className="text-xs font-bold text-slate-900 dark:text-white">{data.ticker}</span>
        <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate flex-1">{data.companyName}</span>
        {onEdit && (
          <button onClick={onEdit} className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-600">
            <Pencil className="h-3 w-3 text-slate-400" />
          </button>
        )}
      </div>

      {/* Row 2: sector tags + market cap + composite score */}
      <div className="flex items-center gap-1 mt-1 flex-wrap">
        {sectors.map((tag, i) => (
          <span key={i} className="px-1.5 py-0.5 text-[10px] rounded bg-slate-100 dark:bg-slate-600 text-slate-500 dark:text-slate-400">{tag}</span>
        ))}
        {mcap && (
          <span className="px-1.5 py-0.5 text-[10px] rounded bg-slate-100 dark:bg-slate-600 text-slate-500 dark:text-slate-400">{mcap}</span>
        )}
        {data.compositeScore != null && (
          <span className={cn('px-1.5 py-0.5 text-[10px] font-bold rounded',
            data.compositeScore >= 70 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
              : data.compositeScore >= 50 ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'
                : 'bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-300'
          )}>{data.compositeScore.toFixed(0)}점</span>
        )}
      </div>

      {/* Row 3: thesis (if available) */}
      {hasThesis && (
        <div className="mt-1.5 space-y-0.5">
          {data.valueChain && <p className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-1"><span className="text-slate-400">밸류체인:</span> {data.valueChain}</p>}
          {data.thesis && <p className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-2"><span className="text-slate-400">논거:</span> {data.thesis}</p>}
        </div>
      )}

      {/* Row 4: score bars (if available) */}
      {hasScores && (
        <div className="grid grid-cols-3 gap-x-2 gap-y-1 mt-1.5">
          <ScoreBar label="성장" value={data.growthScore} />
          <ScoreBar label="가치" value={data.valueScore} />
          <ScoreBar label="품질" value={data.qualityScore} />
          <ScoreBar label="모멘텀" value={data.momentumScore} />
          <ScoreBar label="내부자" value={data.insiderScore} />
          <ScoreBar label="센티먼트" value={data.sentimentScore} />
        </div>
      )}

      {/* Row 5: footer — date/source + action */}
      <div className="flex items-center justify-between mt-2 pt-1.5">
        <span className="text-[10px] text-slate-400">
          {data.scanDate?.slice(5).replace('-', '/')}
          {data.source && data.source !== 'manual' && ` · ${data.source}`}
        </span>
        {onAddToWatchlist && (
          <button
            onClick={onAddToWatchlist}
            className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 text-[10px] text-slate-400 hover:text-emerald-600 px-1 py-0.5 rounded"
          >
            <span>워치리스트 추가</span>
            <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/willow-mgmt/investment-card-research.tsx
git commit -m "Unify research card: verdict badge + source tag for all entries"
```

---

### Task 5: Frontend — Unify kanban research column

**Files:**
- Modify: `src/components/willow-mgmt/investment-kanban.tsx`

- [ ] **Step 1: Remove SmallcapScreening interface and simplify Props**

At the top of the file, remove the `SmallcapScreening` interface. Update the `Props` interface:

```typescript
interface Props {
  stockResearch: StockResearch[]
  loadStockResearch: () => Promise<void>
  isLoadingResearch: boolean
  stockTrades: StockTrade[]
  stockQuotes?: Record<string, { price: number; change: number; changePercent: number; currency: string }>
  usdKrwRate?: number
}
```

Update the component signature to match:

```typescript
export function InvestmentKanban({
  stockResearch, loadStockResearch,
  isLoadingResearch, stockTrades, stockQuotes, usdKrwRate,
}: Props) {
```

- [ ] **Step 2: Add StockResearch interface fields for new columns**

Update the `StockResearch` interface at the top to include the new unified fields:

```typescript
interface StockResearch {
  id: string; ticker: string; company_name: string; scan_date: string; source: string
  source_type: 'valuechain' | 'smallcap'
  market_cap_b: number | null; market_cap_m: number | null
  current_price: number | null; revenue_growth_yoy: string | null
  margin: string | null; value_chain_position: string | null; structural_thesis: string | null
  sector_tags: string[]; sector: string | null; high_12m: number | null
  gap_from_high_pct: number | null; trend_verdict: string | null
  verdict: string | null; fail_reason: string | null; notes: string | null
  track: 'profitable' | 'hypergrowth' | null
  composite_score: number | null; growth_score: number | null; value_score: number | null
  quality_score: number | null; momentum_score: number | null
  insider_score: number | null; sentiment_score: number | null
  fail_reasons: string[] | null; change_pct: number | null
  created_at: string; updated_at: string
}
```

- [ ] **Step 3: Unify research card building logic**

Replace the research column building (lines ~323-378) with a single loop:

```typescript
  // Build research column data — only pass verdicts, exclude portfolio/watchlist tickers
  const rankOrder: Record<string, number> = { pass_tier1: 0, pass_tier2: 1 }
  function getRecommendRank(card: ResearchCardData): number {
    return card.verdict ? (rankOrder[card.verdict] ?? 2) : 2
  }

  const researchCards: ResearchCardData[] = []
  const seenTickers = new Set<string>()

  for (const r of stockResearch) {
    if (!r.verdict?.startsWith('pass')) continue
    if (seenTickers.has(r.ticker)) continue
    if (watchlistTickers.has(r.ticker)) continue
    seenTickers.add(r.ticker)
    researchCards.push({
      id: r.id, sourceType: r.source_type, ticker: r.ticker,
      companyName: r.company_name || r.ticker,
      verdict: r.verdict as 'pass_tier1' | 'pass_tier2' | undefined,
      sectorTags: r.sector_tags, sector: r.sector,
      marketCapB: r.market_cap_b, marketCapM: r.market_cap_m,
      currentPrice: r.current_price,
      thesis: r.structural_thesis, valueChain: r.value_chain_position,
      scanDate: r.scan_date, source: r.source,
      gapFromHighPct: r.gap_from_high_pct,
      failReason: r.fail_reason, failReasons: r.fail_reasons,
      notes: r.notes,
      track: r.track, compositeScore: r.composite_score,
      changePct: r.change_pct,
      growthScore: r.growth_score, valueScore: r.value_score,
      qualityScore: r.quality_score, momentumScore: r.momentum_score,
      insiderScore: r.insider_score, sentimentScore: r.sentiment_score,
    })
  }

  // Sort research cards
  function getResearchMomentum(card: ResearchCardData): number {
    if (card.momentumScore != null) return card.momentumScore
    if (card.gapFromHighPct != null) return Math.max(0, 100 + card.gapFromHighPct)
    return -1
  }
  if (researchSort === 'recommend') {
    researchCards.sort((a, b) => getRecommendRank(a) - getRecommendRank(b))
  } else {
    researchCards.sort((a, b) => getResearchMomentum(b) - getResearchMomentum(a))
  }
```

- [ ] **Step 4: Add source filter state and UI**

Add a source filter state near the existing sort state:

```typescript
const [researchSourceFilter, setResearchSourceFilter] = useState<'all' | 'valuechain' | 'smallcap'>('all')
```

Apply the filter before rendering cards — after the sort, before the map:

```typescript
const filteredResearchCards = researchSourceFilter === 'all'
  ? researchCards
  : researchCards.filter(c => c.sourceType === researchSourceFilter)
```

Add filter buttons in the research column header (next to the existing sort buttons):

```tsx
<button
  onClick={() => setResearchSourceFilter(f => f === 'all' ? 'valuechain' : f === 'valuechain' ? 'smallcap' : 'all')}
  className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-600 text-slate-500"
>
  {researchSourceFilter === 'all' ? '전체' : researchSourceFilter === 'valuechain' ? '밸류체인' : '소형주'}
</button>
```

- [ ] **Step 5: Update card onClick handler for sourceType**

In the `handleMoveToWatchlist` call, update references from `card.type` to use `card.sourceType`:

Any remaining references to `card.type === 'research'` or `card.type === 'smallcap'` should be changed to `card.sourceType === 'valuechain'` or `card.sourceType === 'smallcap'`.

- [ ] **Step 6: Commit**

```bash
git add src/components/willow-mgmt/investment-kanban.tsx
git commit -m "Unify kanban research column: single data source, source filter"
```

---

### Task 6: Frontend — Update management page

**Files:**
- Modify: `src/app/willow-investment/management/page.tsx`

- [ ] **Step 1: Remove SmallcapScreening interface and dead state**

Remove the `SmallcapScreening` interface (lines 1070-1126).

Remove all smallcap-specific state variables (lines 1138-1149):
```
smallcapData, smallcapSummary, smallcapScanDates, smallcapSelectedDate,
isLoadingSmallcap, smallcapTierFilter, smallcapTrackFilter,
smallcapPage, smallcapPerPage, expandedSmallcap,
smallcapSortKey, smallcapSortAsc
```

Remove `loadSmallcapScreening` callback (lines 2528-2548).

Remove the `useEffect` that calls `loadSmallcapScreening` (lines 3197-3202).

- [ ] **Step 2: Update StockResearch interface with new fields**

Add the new columns to the existing `StockResearch` interface in the page:

```typescript
// Add these fields to the existing StockResearch interface:
source_type: 'valuechain' | 'smallcap'
market: string
sector: string | null
track: 'profitable' | 'hypergrowth' | null
market_cap_m: number | null
composite_score: number | null
growth_score: number | null
value_score: number | null
quality_score: number | null
momentum_score: number | null
insider_score: number | null
sentiment_score: number | null
fail_reasons: string[] | null
change_pct: number | null
```

- [ ] **Step 3: Update loadStockResearch to parse new fields**

In the existing `loadStockResearch` callback, add number parsing for the new numeric fields (similar to how `market_cap_b` is parsed).

- [ ] **Step 4: Update InvestmentKanban props**

Update the `<InvestmentKanban>` component invocation — remove `smallcapData`, `loadSmallcapScreening`, `isLoadingSmallcap` props:

```tsx
<InvestmentKanban
  stockResearch={stockResearch}
  loadStockResearch={loadStockResearch}
  isLoadingResearch={isLoadingResearch}
  stockTrades={stockTrades}
  stockQuotes={stockQuotes}
  usdKrwRate={usdKrwRate}
/>
```

- [ ] **Step 5: Update useAgentRefresh**

Remove `'smallcap_screening'` from the refresh array:

```typescript
useAgentRefresh(['willow_mgmt', 'work_wiki', 'financial', 'stock_research', 'stock_trades', 're_'], refreshAllData)
```

- [ ] **Step 6: Commit**

```bash
git add src/app/willow-investment/management/page.tsx
git commit -m "Remove smallcap state from management page, unify data loading"
```

---

### Task 7: Frontend — Update research modal

**Files:**
- Modify: `src/components/willow-mgmt/investment-research-modal.tsx`

- [ ] **Step 1: Add source_type selector**

Add `sourceType` state and a toggle in the modal form (after the verdict selector):

```typescript
const [sourceType, setSourceType] = useState<'valuechain' | 'smallcap'>('valuechain')
```

In `useEffect` for editing:
```typescript
setSourceType((editing.source_type as 'valuechain' | 'smallcap') || 'valuechain')
```

Add UI toggle after the verdict selector:

```tsx
<div>
  <label className="text-xs text-slate-500 mb-1 block">소스</label>
  <div className="grid grid-cols-2 gap-2">
    <button type="button" onClick={() => setSourceType('valuechain')} className={cn('py-2 text-sm font-medium rounded-lg transition-colors', sourceType === 'valuechain' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300')}>밸류체인</button>
    <button type="button" onClick={() => setSourceType('smallcap')} className={cn('py-2 text-sm font-medium rounded-lg transition-colors', sourceType === 'smallcap' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-400' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300')}>소형주</button>
  </div>
</div>
```

- [ ] **Step 2: Add optional score inputs**

Add score state variables:

```typescript
const [compositeScore, setCompositeScore] = useState('')
const [growthScore, setGrowthScore] = useState('')
const [valueScore, setValueScore] = useState('')
const [qualityScore, setQualityScore] = useState('')
const [momentumScore, setMomentumScore] = useState('')
const [insiderScore, setInsiderScore] = useState('')
const [sentimentScore, setSentimentScore] = useState('')
```

Add `useEffect` population for editing mode, and reset in else branch.

Add a collapsible score section in the form (after sector tags):

```tsx
<div>
  <label className="text-xs text-slate-500 mb-1 block">스코어 (0-100, 선택)</label>
  <div className="grid grid-cols-3 gap-2">
    <div>
      <label className="text-[10px] text-slate-400 mb-0.5 block">종합</label>
      <Input value={compositeScore} onChange={(e) => setCompositeScore(e.target.value)} placeholder="—" />
    </div>
    <div>
      <label className="text-[10px] text-slate-400 mb-0.5 block">성장</label>
      <Input value={growthScore} onChange={(e) => setGrowthScore(e.target.value)} placeholder="—" />
    </div>
    <div>
      <label className="text-[10px] text-slate-400 mb-0.5 block">가치</label>
      <Input value={valueScore} onChange={(e) => setValueScore(e.target.value)} placeholder="—" />
    </div>
    <div>
      <label className="text-[10px] text-slate-400 mb-0.5 block">품질</label>
      <Input value={qualityScore} onChange={(e) => setQualityScore(e.target.value)} placeholder="—" />
    </div>
    <div>
      <label className="text-[10px] text-slate-400 mb-0.5 block">모멘텀</label>
      <Input value={momentumScore} onChange={(e) => setMomentumScore(e.target.value)} placeholder="—" />
    </div>
    <div>
      <label className="text-[10px] text-slate-400 mb-0.5 block">내부자</label>
      <Input value={insiderScore} onChange={(e) => setInsiderScore(e.target.value)} placeholder="—" />
    </div>
  </div>
</div>
```

- [ ] **Step 3: Update handleSave payload**

Add the new fields to the payload:

```typescript
source_type: sourceType,
composite_score: compositeScore ? parseFloat(compositeScore) : null,
growth_score: growthScore ? parseFloat(growthScore) : null,
value_score: valueScore ? parseFloat(valueScore) : null,
quality_score: qualityScore ? parseFloat(qualityScore) : null,
momentum_score: momentumScore ? parseFloat(momentumScore) : null,
insider_score: insiderScore ? parseFloat(insiderScore) : null,
sentiment_score: sentimentScore ? parseFloat(sentimentScore) : null,
```

- [ ] **Step 4: Update StockResearch interface in modal**

Add the new fields to the modal's `StockResearch` interface:

```typescript
source_type: 'valuechain' | 'smallcap'
composite_score: number | null
growth_score: number | null
value_score: number | null
quality_score: number | null
momentum_score: number | null
insider_score: number | null
sentiment_score: number | null
```

- [ ] **Step 5: Commit**

```bash
git add src/components/willow-mgmt/investment-research-modal.tsx
git commit -m "Add source_type selector and score inputs to research modal"
```

---

### Task 8: Script — Merge scan scripts

**Files:**
- Modify: `scripts/market-research-scan.ts`
- Delete: `scripts/stock-research-scan.ts`
- Delete: `scripts/run-stock-research-scan.sh`

- [ ] **Step 1: Add phase argument parsing**

At the top of `market-research-scan.ts`, after the imports, add:

```typescript
// Parse --phase argument
const phaseArg = process.argv.find(a => a.startsWith('--phase='))
const phase = phaseArg ? phaseArg.split('=')[1] : 'all' // 'valuechain' | 'smallcap' | 'all'
```

- [ ] **Step 2: Add valuechain scan function**

Add the `runValuechainScan` function (ported from `stock-research-scan.ts`). This function uses `askClaudePortfolioOnly` with portfolio-only tools:

```typescript
function askClaudePortfolioOnly(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env }
    delete (env as Record<string, string | undefined>).CLAUDECODE

    const args = ['-p', '--output-format', 'text', '--allowedTools', 'mcp__portfolio-monitor__*']

    const proc = spawn('claude', args, {
      cwd: process.cwd(),
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString() })

    proc.on('close', (code: number | null) => {
      if (code === 0) {
        resolve(stdout.trim())
      } else {
        log(`Claude CLI error: ${stderr}`)
        reject(new Error(`Claude exited with code ${code}: ${stderr}`))
      }
    })

    proc.on('error', (err: Error) => {
      reject(new Error(`Failed to spawn claude: ${err.message}`))
    })

    const timeout = setTimeout(() => {
      proc.kill('SIGTERM')
      reject(new Error('Claude CLI timeout (10min)'))
    }, 10 * 60 * 1000)

    proc.on('close', () => clearTimeout(timeout))

    proc.stdin.write(prompt)
    proc.stdin.end()
  })
}

async function runValuechainScan(): Promise<string> {
  const now = new Date()
  const dateStr = now.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
  const dayOfWeek = now.getDay()

  let prompt = `당신은 윌리(Willy)입니다. 윌로우인베스트먼트의 COO.
오늘은 ${dateStr}이고 매일 아침 종목 발굴 스캔 시간입니다.

아래 작업을 순서대로 수행하고, CEO에게 텔레그램으로 보낼 간결한 리포트를 작성하세요.

## 1단계: 포트폴리오 전체 스캔
portfolio_scan 도구를 사용해서 보유 종목 전체 스캔을 돌려주세요.
- 신고가 돌파/근접 종목
- 부진 종목 (12M 고점 대비 -20% 이상)
- 주요 시그널

## 2단계: 종목 발굴
portfolio_watchlist 도구로 현재 워치리스트를 확인하고,
portfolio_signals 도구로 시그널 현황을 확인하세요.

## 리포트 형식
텔레그램 메시지로 보낼 거라 간결하게 작성해주세요.
- 이모지 적절히 사용
- 핵심 수치 위주
- 신호 없으면 "특이사항 없음"으로 짧게
- "---SPLIT---"으로 메시지 분할 가능 (너무 길 때만)
- 리포트 상단에 "🔍 종목 리서치 데일리 스캔 (${dateStr})" 제목 포함

중요: 도구 호출 결과만 기반으로 사실만 보고. 추측이나 예측 금지.`

  if (dayOfWeek === 3) {
    prompt += `

## 3단계: 주간 테마 스캔 (수요일 추가)
이번 주 주목할 테마나 섹터 변화가 있는지 포트폴리오 데이터를 기반으로 분석해주세요.
- 섹터별 모멘텀 변화
- 워치리스트 중 진입 시그널 근접 종목
- 리포트에 "[주간 테마]" 섹션으로 추가`
  }

  return askClaudePortfolioOnly(prompt)
}
```

- [ ] **Step 3: Update upsertResearchEntries to include source_type**

In the existing `upsertResearchEntries` function, add `source_type` to both the insert and update operations. Change the function signature to accept source_type:

```typescript
async function upsertResearchEntries(entries: ResearchEntry[], sourceType: 'valuechain' | 'smallcap' = 'smallcap'): Promise<number> {
```

In the INSERT block, add:
```typescript
source_type: sourceType,
```

In the UPDATE block, add:
```typescript
source_type: sourceType,
```

- [ ] **Step 4: Update main() to dispatch by phase**

Replace the `main()` function:

```typescript
async function main() {
  log(`🔍 통합 리서치 스캔 시작 (phase: ${phase})`)

  const chatId = await getCeoChatId()
  if (!chatId) {
    log('❌ CEO chat_id를 찾을 수 없습니다.')
    process.exit(1)
  }

  try {
    // Phase: valuechain (morning scan)
    if (phase === 'valuechain' || phase === 'all') {
      log('📡 Phase: 밸류체인 스캔')
      const report = await runValuechainScan()

      if (report && report.length >= 10) {
        const parts = report.split(/\n---SPLIT---\n/)
        for (const part of parts) {
          const trimmed = part.trim()
          if (trimmed) {
            await sendTelegramMessage(chatId, trimmed)
            if (parts.length > 1) await new Promise(r => setTimeout(r, 1000))
          }
        }
        log(`✅ 밸류체인 리포트 전송 완료`)
      } else {
        log('⚠️ 밸류체인 리포트가 비어있거나 너무 짧습니다')
        await sendTelegramMessage(chatId, '🔍 밸류체인 스캔: 데이터 조회에 실패했어요.')
      }
    }

    // Phase: smallcap (afternoon scan)
    if (phase === 'smallcap' || phase === 'all') {
      log('📡 Phase: 마켓 리서치 (소형주) 스캔')
      const report = await runMarketResearchScan()

      if (!report || report.length < 10) {
        log('⚠️ 마켓 리포트가 비어있거나 너무 짧습니다')
        await sendTelegramMessage(chatId, '🔍 마켓 리서치 스캔: 데이터 조회에 실패했어요.')
        if (phase === 'smallcap') process.exit(1)
        return
      }

      const parts = report.split(/\n---SPLIT---\n/)
      for (const part of parts) {
        const trimmed = part.trim()
        if (trimmed) {
          await sendTelegramMessage(chatId, trimmed)
          if (parts.length > 1) await new Promise(r => setTimeout(r, 1000))
        }
      }
      log(`✅ 마켓 리포트 전송 완료`)

      // Extract and upsert to DB
      log('📊 리포트에서 종목 데이터 추출 중...')
      const entries = await extractResearchEntries(report)

      if (entries.length > 0) {
        log(`  📋 ${entries.length}개 종목 추출: ${entries.map(e => e.ticker).join(', ')}`)
        const upserted = await upsertResearchEntries(entries, 'smallcap')
        log(`  ✅ stock_research 테이블 ${upserted}건 적재 완료`)

        const dbLines = entries.map(e => {
          const verdict = e.verdict === 'pass_tier1' ? '⭐' : e.verdict === 'pass_tier2' ? '✅' : '👀'
          return `${verdict} ${e.ticker} (${e.company_name})${e.gap_from_high_pct != null ? ` | 고점대비 ${e.gap_from_high_pct}%` : ''}`
        })
        await sendTelegramMessage(chatId, `📊 리서치 DB 업데이트 (${upserted}건)\n\n${dbLines.join('\n')}\n\n대시보드에서 확인: 투자리서치 탭`)
      } else {
        log('  ℹ️ 신규 후보 종목 없음 — DB 적재 스킵')
      }
    }

    log('🏁 통합 리서치 스캔 완료')
  } catch (err) {
    log(`❌ 스캔 실패: ${err}`)
    await sendTelegramMessage(chatId, '🔍 리서치 스캔에서 오류가 발생했어요. 로그를 확인해주세요.')
    process.exit(1)
  }
}
```

- [ ] **Step 5: Update the header comment**

Replace the file header:

```typescript
// ============================================================
// Unified Research Scanner — 통합 종목 리서치 스캔
// ============================================================
// --phase=valuechain (09:00): 포트폴리오 기반 밸류체인 발굴 → 텔레그램 전송
// --phase=smallcap   (16:15): 시장 데이터 + 레딧 버즈 → DB 적재 + 텔레그램 전송
// 플래그 없이 실행: 둘 다 순차 실행
// ============================================================
```

- [ ] **Step 6: Delete old files**

```bash
rm scripts/stock-research-scan.ts
rm scripts/run-stock-research-scan.sh
```

- [ ] **Step 7: Update run-market-research-scan.sh header comment**

Update the comment in the shell wrapper to reflect it's now the unified scanner:

```bash
# 통합 리서치 스캔 (launchd용 래퍼)
# 실행 인자에 따라 밸류체인/소형주 phase 분기
```

- [ ] **Step 8: Commit**

```bash
git add scripts/market-research-scan.ts scripts/run-market-research-scan.sh
git rm scripts/stock-research-scan.ts scripts/run-stock-research-scan.sh
git commit -m "Merge stock-research-scan into market-research-scan with --phase flag"
```

---

### Task 9: LaunchD — Configure valuechain phase

**Files:**
- Modify: `scripts/run-market-research-scan.sh`
- Create: launchd plist for 09:00 valuechain phase

- [ ] **Step 1: Update shell wrapper to accept phase argument**

Modify `scripts/run-market-research-scan.sh` to pass through any arguments:

Replace the npx line:
```bash
npx tsx scripts/market-research-scan.ts "$@" >> "$LOG_FILE" 2>&1
```

- [ ] **Step 2: Create valuechain launchd plist**

Create `/Users/dongwookkim/Library/LaunchAgents/com.willow.research-valuechain.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>com.willow.research-valuechain</string>
	<key>ProgramArguments</key>
	<array>
		<string>/bin/bash</string>
		<string>/Users/dongwookkim/scripts/drive-launcher.sh</string>
		<string>--cwd</string>
		<string>/Volumes/PRO-G40/app-dev/willow-invt</string>
		<string>/Volumes/PRO-G40/app-dev/willow-invt/scripts/run-market-research-scan.sh</string>
		<string>--phase=valuechain</string>
	</array>
	<key>WorkingDirectory</key>
	<string>/Users/dongwookkim</string>
	<key>StartCalendarInterval</key>
	<dict>
		<key>Hour</key>
		<integer>9</integer>
		<key>Minute</key>
		<integer>0</integer>
	</dict>
	<key>StandardOutPath</key>
	<string>/Users/dongwookkim/logs/research-valuechain/launchd.log</string>
	<key>StandardErrorPath</key>
	<string>/Users/dongwookkim/logs/research-valuechain/launchd.log</string>
	<key>EnvironmentVariables</key>
	<dict>
		<key>PATH</key>
		<string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
		<key>HOME</key>
		<string>/Users/dongwookkim</string>
	</dict>
</dict>
</plist>
```

- [ ] **Step 3: Update existing market-research plist to add phase**

Update `/Users/dongwookkim/Library/LaunchAgents/com.willow.market-research-scan.plist` — add `--phase=smallcap` argument:

Add `<string>--phase=smallcap</string>` after the script path in ProgramArguments.

- [ ] **Step 4: Create log directory and load plists**

```bash
mkdir -p ~/logs/research-valuechain

# Unload old stock-research plist if it exists
launchctl unload ~/Library/LaunchAgents/com.willow.stock-research-scan.plist 2>/dev/null

# Reload updated market-research plist
launchctl unload ~/Library/LaunchAgents/com.willow.market-research-scan.plist
launchctl load ~/Library/LaunchAgents/com.willow.market-research-scan.plist

# Load new valuechain plist
launchctl load ~/Library/LaunchAgents/com.willow.research-valuechain.plist
```

- [ ] **Step 5: Verify launchd jobs**

```bash
launchctl list | grep willow.research
launchctl list | grep willow.market-research
```

Expected: Both jobs loaded.

- [ ] **Step 6: Commit**

```bash
git add scripts/run-market-research-scan.sh
git commit -m "Configure launchd for unified research scanner: valuechain 09:00 + smallcap 16:15"
```

---

### Task 10: Verify end-to-end

- [ ] **Step 1: Verify DB data**

```sql
SELECT source_type, verdict, count(*) FROM stock_research GROUP BY source_type, verdict ORDER BY 1, 2;
```

- [ ] **Step 2: Verify API**

```bash
# All research
curl -s localhost:3000/api/willow-mgmt/stock-research | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'items: {len(d[\"items\"])}, scanDates: {len(d[\"scanDates\"])}')"

# Filter by source_type
curl -s 'localhost:3000/api/willow-mgmt/stock-research?source_type=smallcap&verdict=pass_tier1' | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'smallcap T1: {len(d[\"items\"])}')"
```

- [ ] **Step 3: Verify frontend**

Start dev server, navigate to `/willow-investment/management`:
- Check 보유 탭: MRVL should appear in AI 인프라 group
- Check 분석 탭: AI 밸류체인 should include MRVL
- Check 칸반 리서치 열: unified cards with T1/T2 + 밸류체인/소형주 source tags
- Check source filter toggle works (전체/밸류체인/소형주)
- Check research modal: source_type selector + score inputs visible

- [ ] **Step 4: Verify old smallcap route is gone**

```bash
curl -s localhost:3000/api/willow-mgmt/smallcap-screening
```

Expected: 404

- [ ] **Step 5: Test scan script phases**

```bash
# Dry run — just check argument parsing works
npx tsx scripts/market-research-scan.ts --phase=valuechain 2>&1 | head -5
```

Expected: Log line showing `phase: valuechain`.
