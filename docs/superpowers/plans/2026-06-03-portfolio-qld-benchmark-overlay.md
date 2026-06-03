# Portfolio Return-Trend QLD Benchmark Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overlay QLD (2x Nasdaq) cumulative return as a benchmark line on the 수익률 추이 (return-trend) chart only, and show the vs-QLD alpha in that chart's header.

**Architecture:** QLD return is computed inside the existing `trendData` useMemo with a dollar-matched ("동액 적립") cashflow replica of the portfolio — every buy/sell in `stockTrades` is mirrored into a QLD position using QLD's daily close (USD → KRW via the existing `fxForDate`). Each trend entry gains a `qldPct` column. QLD's price series is fetched by adding `QLD` to the existing stock-history + stock-quotes API calls in `page.tsx` (the stock-history API is already DB-first, so QLD comes from `sector_index_quotes`). Only the `pct` chart renders the QLD line; its header shows `내 수익률 · vs QLD ±Xp`.

**Tech Stack:** Next.js (App Router), React (client component), recharts, TypeScript, Supabase (read-only via existing API).

---

## File Structure

- **Modify** `src/app/(dashboard)/(linear)/invest/page.tsx`
  - Add `QLD` (market `US`) to the stock-history ticker list and the stock-quotes ticker list so `stockHistory['QLD']` and `stockQuotes['QLD']` are populated.
- **Modify** `src/app/(dashboard)/(linear)/invest/_components/analysis-block.tsx`
  - `trendData` useMemo: compute a QLD dollar-matched return per date, add `qldPct` to each entry (and the today-append entry).
  - Render a QLD dashed line on the `pct` chart only.
  - Render the vs-QLD alpha in the `pct` chart header.

No new files, no new API routes, no DB/RLS changes.

---

## Background facts (verified, do not re-investigate)

- `trendData` useMemo lives in `analysis-block.tsx` starting at line ~166, depends on `[stockTrades, stockQuotes, stockThemes, stockHistory, fxHistory, usdKrwRate]`.
- Inside it, these locals already exist and are reusable:
  - `sortedDates: string[]` — all trading dates ascending.
  - `priceLookup: Map<ticker, Map<date, number>>` — forward-filled close per ticker. Built from `stockHistory`. (QLD will be in here once page.tsx adds it.)
  - `fxForDate: Map<date, number>` — forward-filled USD→KRW.
  - `tradesSorted` — `stockTrades` sorted by `trade_date` then `id`.
  - `firstDate` — earliest trade date.
  - `data: Record<string, number | string>[]` — the output array; each element has a `date` plus `전체value/전체pnl/전체pct`, etc.
- The per-date loop pushes one `entry` per qualifying date (after the `if (totalCost === 0 || !hasAll) continue` gate at line ~268).
- A separate "today append" block (line ~287-327) appends/overwrites the final entry using `stockQuotes`.
- `stockTrades` element shape (from `StockTradeFull`): `{ id, trade_date, ticker, company_name, market: 'KR'|'US', trade_type: 'buy'|'sell', quantity, price, total_amount, currency: 'KRW'|'USD' }`.
- `stockQuotes` is `Record<ticker, { price, change, changePercent, currency, marketCap? }>`. Tickers are stored WITHOUT `.KS` (page.tsx strips it at line 117).
- QLD is a USD ETF. `total_amount` for QLD-matched cashflow must be converted to KRW using the trade-date FX, exactly like US stocks in the existing timeline (`tradeFx`).
- The `pct` chart is `charts[2]` with `suffix: 'pct'`. Header values are rendered from `getLines(suffix)` × `last[line.key]` at lines ~507-520. `getLines` returns `전체pct` for `viewMode==='total'`.
- Color tokens: `t.accent.pos` = green (#107A52), `t.accent.neg` = red (#C23A3A). US-style: gain=green, loss=red.
- Benchmark line color convention elsewhere: QLD uses `#EC4899` (pink) in `sector-rotation-chart.tsx`. For this overlay use neutral gray `#94a3b8` dashed (spec).

---

## Task 1: Feed QLD price + quote into the page

**Files:**
- Modify: `src/app/(dashboard)/(linear)/invest/page.tsx`

QLD must appear in `stockHistory['QLD']` (daily series for the trend) and `stockQuotes['QLD']` (today point). Both come from existing API calls — we just add QLD to their ticker lists.

- [ ] **Step 1: Add QLD to the stock-history fetch**

In `loadStockHistory` (around lines 42-49), the ticker map is built from trades. After the loop that fills `tickerMap`, force-add QLD. Find:

```ts
    const tickerMap = new Map<string, string>()
    for (const tr of trades) {
      if (!tickerMap.has(tr.ticker)) tickerMap.set(tr.ticker, tr.market)
    }
    if (tickerMap.size === 0) return
```

Replace with:

```ts
    const tickerMap = new Map<string, string>()
    for (const tr of trades) {
      if (!tickerMap.has(tr.ticker)) tickerMap.set(tr.ticker, tr.market)
    }
    // Benchmark: QLD (2x Nasdaq) — always fetch its series for the return-trend overlay
    if (!tickerMap.has('QLD')) tickerMap.set('QLD', 'US')
    if (tickerMap.size === 0) return
```

Note: `tickerMap` keys here are raw trade tickers (KR codes keep no `.KS` because trades store KR as `066570` and market `KR`). QLD key is `QLD`, market `US`. The stock-history API maps US tickers 1:1, so `stockHistory['QLD']` will be set.

- [ ] **Step 2: Add QLD to the stock-quotes fetch**

Around lines 115-127, the quotes ticker map is built and `.KS` is stripped. Find:

```ts
        const tickerMap = new Map<string, string>()
        for (const tr of tradesFull) {
          const ticker = tr.ticker.replace('.KS', '')
          if (!tickerMap.has(ticker)) tickerMap.set(ticker, tr.market)
        }
```

Immediately after that block (before the researchFull loop) add:

```ts
        // Benchmark quote: QLD current price for the return-trend "today" point
        if (!tickerMap.has('QLD')) tickerMap.set('QLD', 'US')
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors (pre-existing errors unrelated to these files are acceptable).

- [ ] **Step 4: Verify QLD data arrives (manual, dev server)**

Run (dev server must be up on :3000):
`curl -s "http://localhost:3000/api/willow-mgmt/stock-history?tickers=QLD&markets=US" | jq '.history.QLD.dates | length'`
Expected: a number ≥ 200 (QLD series from DB).

`curl -s "http://localhost:3000/api/willow-mgmt/stock-quotes?tickers=QLD&markets=US" | jq '.prices.QLD.price'`
Expected: a positive number.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/(linear)/invest/page.tsx"
git commit -m "invest: fetch QLD series + quote for benchmark overlay"
```

---

## Task 2: Compute QLD dollar-matched return in trendData

**Files:**
- Modify: `src/app/(dashboard)/(linear)/invest/_components/analysis-block.tsx`

Add a `qldPct` value to every trend entry. QLD position is built by replaying every trade's KRW cashflow into QLD at that date's QLD close.

- [ ] **Step 1: Add a QLD helper before the per-date loop**

Locate the split-detection block that ends near line 213 (`if (ratio > 1.5) splitRatios.set(...)` ... closing `}`). Right AFTER the split block and BEFORE the `// 5. Build holdings timeline` comment (~line 215), insert:

```ts
    // ── QLD benchmark: dollar-matched ("동액 적립") replica of the portfolio cashflow ──
    // Mirror every trade into a QLD position using QLD's close on the trade date (USD→KRW).
    // qldState carries shares + KRW cost; qldPctForDate(date) returns cumulative return %.
    const qldPrices = priceLookup.get('QLD')  // Map<date, qldCloseUsd> (forward-filled)
    const qldState = { shares: 0, krwCost: 0 }
    let qldTradeIdx = 0
    const qldPriceOnOrAfter = (tradeDate: string): number | undefined => {
      if (!qldPrices) return undefined
      for (const d of sortedDates) {
        if (d >= tradeDate) { const p = qldPrices.get(d); if (p && p > 0) return p }
      }
      return undefined
    }
    // Advance qldState to include all trades with trade_date <= date.
    const advanceQld = (date: string) => {
      while (qldTradeIdx < tradesSorted.length && tradesSorted[qldTradeIdx].trade_date <= date) {
        const tr = tradesSorted[qldTradeIdx]
        const isUS = tr.market === 'US'
        const tradeFx = isUS ? (fxForDate.get(tr.trade_date) || usdKrwRate) : 1
        const krwAmount = tr.total_amount * tradeFx
        const qPrice = qldPriceOnOrAfter(tr.trade_date)
        if (qPrice && qPrice > 0) {
          const qFx = fxForDate.get(tr.trade_date) || usdKrwRate  // QLD is USD
          const qSharesPerKrw = 1 / (qPrice * qFx)
          if (tr.trade_type === 'buy') {
            qldState.shares += krwAmount * qSharesPerKrw
            qldState.krwCost += krwAmount
          } else {
            const avgCost = qldState.shares > 0 ? qldState.krwCost / qldState.shares : 0
            const soldShares = krwAmount * qSharesPerKrw
            qldState.shares -= soldShares
            qldState.krwCost -= avgCost * soldShares
            if (qldState.shares <= 0) { qldState.shares = 0; qldState.krwCost = 0 }
          }
        }
        qldTradeIdx++
      }
    }
    // qldPct at a given date using that date's QLD close.
    const qldPctForDate = (date: string): number | null => {
      if (!qldPrices || qldState.krwCost <= 0) return null
      const px = qldPrices.get(date)
      if (!px || px <= 0) return null
      const fx = fxForDate.get(date) || usdKrwRate
      const val = qldState.shares * px * fx
      return Math.round((val - qldState.krwCost) / qldState.krwCost * 1000) / 10
    }
```

- [ ] **Step 2: Populate `qldPct` in each per-date entry**

In the per-date loop, find where the entry is built and pushed (the block starting `const entry: Record<string, number | string> = {` near line 270, ending with `data.push(entry)` near line 284). Immediately BEFORE `data.push(entry)` insert:

```ts
      advanceQld(date)
      const qPct = qldPctForDate(date)
      if (qPct !== null) entry['qldPct'] = qPct
```

- [ ] **Step 3: Populate `qldPct` in the today-append entry**

In the today-append block, find where the final entry `e` is built (starts `const e: Record<string, number | string> = {` near line 310). After its `for (const k of THEME_KEYS) { ... }` loop and BEFORE the `if (data.length > 0 && data[data.length - 1].date === today)` line (~line 324), insert:

```ts
        advanceQld(today)
        // Prefer live QLD quote for the today point; fall back to last series close.
        const qldQuote = stockQuotes['QLD']?.price
        if (qldState.krwCost > 0) {
          let qVal: number | null = null
          if (qldQuote && qldQuote > 0) {
            qVal = qldState.shares * qldQuote * usdKrwRate
          } else {
            const lastPx = qldPrices?.get(today) ?? (sortedDates.length ? qldPrices?.get(sortedDates[sortedDates.length - 1]) : undefined)
            if (lastPx && lastPx > 0) qVal = qldState.shares * lastPx * usdKrwRate
          }
          if (qVal !== null) e['qldPct'] = Math.round((qVal - qldState.krwCost) / qldState.krwCost * 1000) / 10
        }
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/(linear)/invest/_components/analysis-block.tsx"
git commit -m "invest: compute QLD dollar-matched return in trendData"
```

---

## Task 3: Render the QLD line on the pct chart

**Files:**
- Modify: `src/app/(dashboard)/(linear)/invest/_components/analysis-block.tsx`

Add a dashed gray QLD line — only on the `pct` chart.

- [ ] **Step 1: Add a QLD constant near the other color constants**

Near the top, after `const STOCK_COLORS = [...]` (line ~46) add:

```ts
const QLD_BENCH_COLOR = '#94a3b8'  // 벤치마크(QLD) 라인 — 중립 회색 점선
```

- [ ] **Step 2: Render the QLD `<Line>` inside the pct chart only**

Find the `{lines.map(line => ( <Line ... /> ))}` block that draws the portfolio lines inside `<LineChart>` (near line ~566-571). It looks like:

```tsx
                  {lines.map(line => (
                    <Line
                      key={line.key} type="monotone" dataKey={line.key} name={line.name}
                      stroke={line.color} strokeWidth={1.5} dot={false} connectNulls
                    />
                  ))}
```

Immediately AFTER that block (still inside `<LineChart>`), add:

```tsx
                  {chart.suffix === 'pct' && (
                    <Line
                      type="monotone" dataKey="qldPct" name="QLD"
                      stroke={QLD_BENCH_COLOR} strokeWidth={1.5} strokeDasharray="4 3"
                      dot={false} connectNulls isAnimationActive={false}
                    />
                  )}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

- [ ] **Step 4: Visual check (dev server)**

Open the invest page → 포트폴리오 분석 → 수익률 추이. Expect a dashed gray line (QLD) alongside the portfolio line. Toggle 마켓/테마: portfolio lines change, the QLD dashed line stays the same single line.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/(linear)/invest/_components/analysis-block.tsx"
git commit -m "invest: draw QLD benchmark line on return-trend chart"
```

---

## Task 4: Show vs-QLD alpha in the pct chart header

**Files:**
- Modify: `src/app/(dashboard)/(linear)/invest/_components/analysis-block.tsx`

Append `· vs QLD ±Xp` to the 수익률 추이 header, colored US-style.

- [ ] **Step 1: Render the alpha chip after the portfolio header values**

Find the header values block — the `{last && lines.map(line => { ... })}` that ends at line ~520, immediately followed by `</div>` then the `{isValue && (...)}` scale toggle. Right AFTER the closing `})}` of that `lines.map` and BEFORE the `</div>` that closes the values row, insert:

```tsx
                  {chart.suffix === 'pct' && last && Number.isFinite(Number(last['qldPct'])) && (() => {
                    const mine = Number(last['전체pct'])
                    const qld = Number(last['qldPct'])
                    if (!Number.isFinite(mine)) return null
                    const alpha = Math.round((mine - qld) * 10) / 10
                    const alphaColor = alpha > 0 ? t.accent.pos : alpha < 0 ? t.accent.neg : t.neutrals.subtle
                    return (
                      <span style={{ fontSize: 11, fontWeight: t.weight.semibold, fontVariantNumeric: 'tabular-nums', color: alphaColor }}>
                        <span style={{ fontSize: 9, color: t.neutrals.muted, marginRight: 3, fontWeight: t.weight.regular }}>vs QLD</span>
                        {alpha > 0 ? '+' : ''}{alpha.toFixed(1)}%p
                      </span>
                    )
                  })()}
```

Note: `last['전체pct']` is always present on the last entry for the total portfolio. The alpha chip shows regardless of viewMode (it always compares total portfolio vs QLD), which matches the spec (QLD is a single total-portfolio benchmark).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

- [ ] **Step 3: Lint the changed file**

Run: `npx eslint "src/app/(dashboard)/(linear)/invest/_components/analysis-block.tsx"`
Expected: no NEW errors beyond the pre-existing `no-explicit-any` (3) and unused `STOCK_COLORS` (1) warnings.

- [ ] **Step 4: Visual check (dev server)**

수익률 추이 header reads e.g. `수익률 추이 +75.1% · vs QLD +12.3%p`. Alpha green when positive, red when negative.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/(linear)/invest/_components/analysis-block.tsx"
git commit -m "invest: show vs-QLD alpha in return-trend header"
```

---

## Task 5: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

- [ ] **Step 2: Sanity-check the numbers against a script**

Confirm the QLD overlay produces sane values: alpha should be a small-ish ±%p (portfolio and 2x-Nasdaq are correlated, not 10x apart). If alpha is wildly large (e.g. >300%p), the dollar-match math is wrong — re-check Task 2 FX handling. (No code change expected; this is a reasonableness gate.)

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Final commit (if any stray changes) + done**

```bash
git status
```
Expected: clean working tree (all changes already committed in Tasks 1-4).

---

## Self-Review notes

- **Spec coverage:** 수익률 차트 only (Task 3 guards `chart.suffix === 'pct'`); 동액 적립 (Task 2 cashflow replica with FX); DB-first source (Task 1 uses existing DB-first stock-history); header alpha green/red (Task 4); viewMode-independent single QLD line (Task 3 line not inside `lines.map`, Task 4 alpha always total). ✓
- **No placeholders:** every step has concrete code/commands. ✓
- **Type consistency:** `qldPct` is the single column name used in Tasks 2/3/4; `qldState.{shares,krwCost}`, `advanceQld`, `qldPctForDate`, `qldPriceOnOrAfter`, `QLD_BENCH_COLOR` consistent across tasks. ✓
- **Edge cases:** `qldPct` omitted (null) when no QLD price / zero cost → recharts `connectNulls` bridges; alpha chip guarded by `Number.isFinite`. ✓
