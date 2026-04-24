# Akros Project Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/willow-investment/akros` — a Linear-style project page for Akros ETF operations with AUM dashboard, product table, tax invoices, wiki, and email.

**Architecture:** Five independent blocks assembled in a single page. AUM block uses `fetchAllTimeSeriesData()` + `fetchAkrosProducts()` from `src/lib/supabase-etf.ts`. Tax invoices use `/api/akros/tax-invoices`. Wiki reuses WikiList with Akros-only notes. Email reuses EmailBlock with Akros context. All blocks follow existing Linear design system (LCard, LSectionHead, LStat, t tokens).

**Tech Stack:** Next.js App Router, React, Supabase (Supernova DB for products, main DB for invoices/wiki), Gmail API, Linear design tokens.

---

### Task 1: Route scaffolding + sidebar link

**Files:**
- Create: `src/app/willow-investment/(linear)/akros/page.tsx`
- Modify: `src/app/willow-investment/_components/linear-sidebar.tsx`
- Modify: `src/components/layout/layout-wrapper.tsx`
- Modify: `src/app/willow-investment/_components/linear-skeleton.tsx`

- [ ] **Step 1: Add akros to LINEAR_ROUTES in layout-wrapper.tsx**

In `src/components/layout/layout-wrapper.tsx`, find the `LINEAR_ROUTES` array and add the new route:

```typescript
const LINEAR_ROUTES = ['/willow-investment/mgmt', '/willow-investment/invest', '/willow-investment/wiki', '/willow-investment/ryuha', '/willow-investment/akros']
```

- [ ] **Step 2: Make sidebar "아크로스" item a link**

In `src/app/willow-investment/_components/linear-sidebar.tsx`, the CLIENTS array items currently render as plain `<div>`. Make the "아크로스" item clickable by wrapping it in a `Link`. Change the CLIENTS rendering block:

```tsx
{CLIENTS.map(c => {
  const href = c.id === 'akros' ? '/willow-investment/akros' : undefined
  const Wrapper = href ? Link : 'div'
  return (
    <Wrapper key={c.id} href={href as string} style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px',
      fontSize: 12.5, color: t.neutrals.muted, borderRadius: 6, cursor: href ? 'pointer' : 'default',
      textDecoration: 'none',
    }}>
      <span style={{ width: 7, height: 7, borderRadius: 2, background: c.dot, flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{c.name}</span>
      <span style={{ fontFamily: t.font.mono, fontSize: 10, color: t.neutrals.subtle }}>{c.tag}</span>
    </Wrapper>
  )
})}
```

Add `import Link from 'next/link'` at the top if not already imported.

- [ ] **Step 3: Add AkrosSkeleton to linear-skeleton.tsx**

In `src/app/willow-investment/_components/linear-skeleton.tsx`, add:

```tsx
export function AkrosSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SkeletonBlock h={120} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <SkeletonBlock h={340} />
        <SkeletonBlock h={340} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <SkeletonBlock h={400} />
        <SkeletonBlock h={400} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create empty akros page.tsx**

Create `src/app/willow-investment/(linear)/akros/page.tsx`:

```tsx
'use client'

import { t, useIsMobile } from '@/app/willow-investment/_components/linear-tokens'
import { AkrosSkeleton } from '@/app/willow-investment/_components/linear-skeleton'

export default function AkrosPage() {
  const mobile = useIsMobile()

  return (
    <>
      <div style={{ padding: '20px 0 0' }}>
        <h1 style={{
          margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: -0.3,
          fontFamily: t.font.sans, color: t.neutrals.text,
        }}>아크로스</h1>
        <p style={{
          margin: '4px 0 16px', fontSize: 12, color: t.neutrals.muted,
          fontFamily: t.font.sans,
        }}>ETF 운용 · 세금계산서 · 위키 · 이메일</p>
      </div>
      <AkrosSkeleton />
    </>
  )
}
```

- [ ] **Step 5: Verify and commit**

Run: `npx tsc --noEmit`
Expected: no errors

```bash
git add src/app/willow-investment/\(linear\)/akros/page.tsx \
  src/app/willow-investment/_components/linear-sidebar.tsx \
  src/app/willow-investment/_components/linear-skeleton.tsx \
  src/components/layout/layout-wrapper.tsx
git commit -m "feat: scaffold akros page route with sidebar link and skeleton"
```

---

### Task 2: AUM Dashboard Block (`aum-block.tsx`)

**Files:**
- Create: `src/app/willow-investment/(linear)/akros/_components/aum-block.tsx`

**Context:** The legacy page uses `fetchAllTimeSeriesData()` and `fetchAkrosProducts()` from `src/lib/supabase-etf.ts`. `TimeSeriesData` has fields: `total_aum_krw`, `total_aum_usd`, `total_products`, `total_arr_krw`, `total_arr_usd`, `date`. The `allTimeSeriesData` array is sorted chronologically. The latest entry is the current snapshot.

- [ ] **Step 1: Create aum-block.tsx**

```tsx
'use client'

import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'
import { LStat } from '@/app/willow-investment/_components/linear-stat'
import { TimeSeriesData } from '@/lib/supabase-etf'

interface AumBlockProps {
  timeSeries: TimeSeriesData[]
  productCount: number
}

function Sparkline({ data }: { data: { date: string; value: number }[] }) {
  if (data.length < 2) return null
  const values = data.map(d => d.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const w = 120, h = 36
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((d.value - min) / range) * h
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={points} fill="none" stroke={t.brand[500]} strokeWidth={1.5} />
    </svg>
  )
}

function fmtEok(v: number | null | undefined): string {
  if (v == null) return '-'
  return `${(v / 100000000).toFixed(1)}억`
}

export function AumBlock({ timeSeries, productCount }: AumBlockProps) {
  const latest = timeSeries.length > 0 ? timeSeries[timeSeries.length - 1] : null
  const sparkData = timeSeries.map(d => ({ date: d.date, value: d.total_aum_krw || 0 }))

  return (
    <LCard>
      <LSectionHead eyebrow="AUM DASHBOARD" title="운용 현황" />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <LStat label="총 AUM" value={fmtEok(latest?.total_aum_krw)} unit="원" />
        <LStat label="상품 수" value={String(productCount)} unit="개" />
        <div style={{
          background: t.neutrals.inner, borderRadius: t.radius.sm,
          padding: '8px 12px',
        }}>
          <div style={{ fontSize: 9, fontFamily: t.font.mono, color: t.neutrals.subtle, marginBottom: 4, letterSpacing: 0.5 }}>
            AUM TREND
          </div>
          <Sparkline data={sparkData} />
        </div>
      </div>
    </LCard>
  )
}
```

- [ ] **Step 2: Verify and commit**

Run: `npx tsc --noEmit`

```bash
git add src/app/willow-investment/\(linear\)/akros/_components/aum-block.tsx
git commit -m "feat: add AUM dashboard block for akros page"
```

---

### Task 3: Product Table Block (`product-block.tsx`)

**Files:**
- Create: `src/app/willow-investment/(linear)/akros/_components/product-block.tsx`

**Context:** `AkrosProduct` type from `src/lib/supabase-etf.ts` has: `symbol`, `product_name`, `product_name_local`, `country`, `currency`, `listing_date`, `market_cap`, `product_flow`, `arr`, `index_fee`. The table is read-only from `/api/akros-products` — no CRUD from this page.

- [ ] **Step 1: Create product-block.tsx**

```tsx
'use client'

import { useState } from 'react'
import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import { AkrosProduct } from '@/lib/supabase-etf'

interface ProductBlockProps {
  products: AkrosProduct[]
}

const PAGE_SIZE = 10

function fmtAum(v: number | null, currency: string): string {
  if (v == null) return '-'
  if (currency === 'KRW') return `₩${(v / 100000000).toFixed(1)}억`
  return `$${(v / 1000000).toFixed(1)}M`
}

function fmtFlow(v: number | null): string {
  if (v == null) return '-'
  const prefix = v >= 0 ? '+' : ''
  return `${prefix}$${(v / 1000000).toFixed(1)}M`
}

function fmtDate(d: string | null): string {
  if (!d) return '-'
  return d.slice(0, 10)
}

export function ProductBlock({ products }: ProductBlockProps) {
  const [page, setPage] = useState(0)
  const totalPages = Math.max(1, Math.ceil(products.length / PAGE_SIZE))
  const paged = products.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const thStyle: React.CSSProperties = {
    padding: '6px 10px', fontSize: 10, fontFamily: t.font.mono,
    fontWeight: 600, color: t.neutrals.subtle, textAlign: 'left',
    letterSpacing: 0.3, whiteSpace: 'nowrap',
  }
  const tdStyle: React.CSSProperties = {
    padding: '7px 10px', fontSize: 11.5, fontFamily: t.font.sans,
    color: t.neutrals.text, whiteSpace: 'nowrap',
  }

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 10 }}>
        <LSectionHead eyebrow="PRODUCTS" title="상품 관리" action={
          <span style={{ fontSize: 11, color: t.neutrals.muted, fontFamily: t.font.mono }}>
            {products.length}개
          </span>
        } />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: t.neutrals.inner, borderBottom: `1px solid ${t.neutrals.line}` }}>
              <th style={thStyle}>TICKER</th>
              <th style={thStyle}>상품명</th>
              <th style={thStyle}>COUNTRY</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>AUM</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>FLOW</th>
              <th style={thStyle}>설정일</th>
            </tr>
          </thead>
          <tbody>
            {paged.map(p => (
              <tr key={p.symbol} style={{ borderBottom: `1px solid ${t.neutrals.line}` }}>
                <td style={{ ...tdStyle, fontFamily: t.font.mono, fontWeight: 500 }}>{p.symbol}</td>
                <td style={{ ...tdStyle, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.product_name_local || p.product_name}
                </td>
                <td style={tdStyle}>{p.country}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontFamily: t.font.mono }}>
                  {fmtAum(p.market_cap, p.currency)}
                </td>
                <td style={{
                  ...tdStyle, textAlign: 'right', fontFamily: t.font.mono,
                  color: (p.product_flow ?? 0) >= 0 ? '#16A34A' : '#DC2626',
                }}>
                  {fmtFlow(p.product_flow)}
                </td>
                <td style={{ ...tdStyle, fontFamily: t.font.mono, fontSize: 10 }}>
                  {fmtDate(p.listing_date)}
                </td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: t.neutrals.subtle, padding: 30 }}>
                  상품 데이터가 없습니다
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          padding: '8px 14px', gap: 6,
          borderTop: `1px solid ${t.neutrals.line}`,
        }}>
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
            style={{
              background: 'transparent', border: 'none', padding: 4, borderRadius: 4,
              cursor: page === 0 ? 'default' : 'pointer',
              color: page === 0 ? t.neutrals.line : t.neutrals.muted,
            }}>
            <LIcon name="chevronLeft" size={13} stroke={2} />
          </button>
          <span style={{ fontSize: 10, fontFamily: t.font.mono, color: t.neutrals.muted }}>
            {page + 1} / {totalPages}
          </span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
            style={{
              background: 'transparent', border: 'none', padding: 4, borderRadius: 4,
              cursor: page >= totalPages - 1 ? 'default' : 'pointer',
              color: page >= totalPages - 1 ? t.neutrals.line : t.neutrals.muted,
            }}>
            <LIcon name="chevronRight" size={13} stroke={2} />
          </button>
        </div>
      )}
    </LCard>
  )
}
```

- [ ] **Step 2: Verify and commit**

Run: `npx tsc --noEmit`

```bash
git add src/app/willow-investment/\(linear\)/akros/_components/product-block.tsx
git commit -m "feat: add product table block for akros page"
```

---

### Task 4: Tax Invoice Block (`tax-invoice-block.tsx`)

**Files:**
- Create: `src/app/willow-investment/(linear)/akros/_components/tax-invoice-block.tsx`

**Context:** Tax invoices come from `/api/akros/tax-invoices`. Shape: `{ id, invoice_date, amount, notes, file_url, issued_at, paid_at, created_at, updated_at }`. Status: paid_at → paid, issued_at → issued, else draft.

- [ ] **Step 1: Create tax-invoice-block.tsx**

```tsx
'use client'

import { useState } from 'react'
import { t, tonePalettes } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'
import { LBtn } from '@/app/willow-investment/_components/linear-btn'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'

export interface AkrosTaxInvoice {
  id: string
  invoice_date: string
  amount: number
  notes: string | null
  file_url: string | null
  issued_at: string | null
  paid_at: string | null
  created_at: string
  updated_at: string
}

type InvoiceStatus = 'draft' | 'issued' | 'paid'

function getStatus(inv: AkrosTaxInvoice): InvoiceStatus {
  if (inv.paid_at) return 'paid'
  if (inv.issued_at) return 'issued'
  return 'draft'
}

const STATUS_STYLES: Record<InvoiceStatus, { label: string; bg: string; fg: string }> = {
  draft:  { label: '초안', ...tonePalettes.neutral },
  issued: { label: '발행', ...tonePalettes.info },
  paid:   { label: '입금', ...tonePalettes.done },
}

interface TaxInvoiceBlockProps {
  invoices: AkrosTaxInvoice[]
  onRefresh: () => void
}

const PAGE_SIZE = 8

export function TaxInvoiceBlock({ invoices, onRefresh }: TaxInvoiceBlockProps) {
  const [page, setPage] = useState(0)
  const [addOpen, setAddOpen] = useState(false)
  const [editInv, setEditInv] = useState<AkrosTaxInvoice | null>(null)
  const [saving, setSaving] = useState(false)

  // Add form
  const [addDate, setAddDate] = useState('')
  const [addAmount, setAddAmount] = useState('')
  const [addNotes, setAddNotes] = useState('')
  const [addFile, setAddFile] = useState<File | null>(null)

  // Edit form
  const [editDate, setEditDate] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [editNotes, setEditNotes] = useState('')

  const totalPages = Math.max(1, Math.ceil(invoices.length / PAGE_SIZE))
  const paged = invoices.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const resetAdd = () => { setAddDate(''); setAddAmount(''); setAddNotes(''); setAddFile(null); setAddOpen(false) }

  const handleCreate = async () => {
    if (!addDate || !addAmount) return
    setSaving(true)
    try {
      const res = await fetch('/api/akros/tax-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_date: addDate, amount: Number(addAmount), notes: addNotes || undefined }),
      })
      if (res.ok && addFile) {
        const data = await res.json()
        const fd = new FormData()
        fd.append('file', addFile)
        fd.append('invoiceId', data.invoice.id)
        await fetch('/api/akros/tax-invoices/upload', { method: 'POST', body: fd })
      }
      resetAdd()
      onRefresh()
    } finally { setSaving(false) }
  }

  const openEdit = (inv: AkrosTaxInvoice) => {
    setEditInv(inv)
    setEditDate(inv.invoice_date)
    setEditAmount(String(inv.amount))
    setEditNotes(inv.notes || '')
  }

  const handleUpdate = async () => {
    if (!editInv || !editDate || !editAmount) return
    setSaving(true)
    try {
      await fetch(`/api/akros/tax-invoices/${editInv.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_date: editDate, amount: Number(editAmount), notes: editNotes || undefined }),
      })
      setEditInv(null)
      onRefresh()
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!editInv) return
    setSaving(true)
    try {
      await fetch(`/api/akros/tax-invoices/${editInv.id}`, { method: 'DELETE' })
      setEditInv(null)
      onRefresh()
    } finally { setSaving(false) }
  }

  const toggleStatus = async (inv: AkrosTaxInvoice, field: 'issued_at' | 'paid_at') => {
    await fetch(`/api/akros/tax-invoices/${inv.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: inv[field] ? null : new Date().toISOString() }),
    })
    onRefresh()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 8px', borderRadius: t.radius.sm,
    border: 'none', background: t.neutrals.inner,
    fontSize: 12, fontFamily: t.font.sans, color: t.neutrals.text, outline: 'none',
  }

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 10 }}>
        <LSectionHead eyebrow="TAX INVOICES" title="세금계산서" action={
          <LBtn size="sm" icon={<LIcon name="plus" size={14} color="#fff" />}
            onClick={() => setAddOpen(true)}>추가</LBtn>
        } />
      </div>

      {/* Invoice rows */}
      <div style={{ padding: '0 4px 4px' }}>
        {paged.map(inv => {
          const status = getStatus(inv)
          const sty = STATUS_STYLES[status]
          const isEditing = editInv?.id === inv.id
          return (
            <div key={inv.id} style={{
              padding: '8px 10px', borderRadius: t.radius.sm,
              marginBottom: 2, background: isEditing ? t.neutrals.inner : 'transparent',
            }}>
              {isEditing ? (
                /* Edit form */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} style={inputStyle} />
                  <input type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)} placeholder="금액" style={inputStyle} />
                  <input value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="비고" style={inputStyle} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <LBtn variant="danger" size="sm" onClick={handleDelete} disabled={saving}>삭제</LBtn>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <LBtn variant="secondary" size="sm" onClick={() => setEditInv(null)}>취소</LBtn>
                      <LBtn size="sm" onClick={handleUpdate} disabled={saving}>{saving ? '저장중...' : '저장'}</LBtn>
                    </div>
                  </div>
                </div>
              ) : (
                /* Read row */
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontSize: 9, fontFamily: t.font.mono, padding: '2px 6px',
                    borderRadius: t.radius.sm, background: sty.bg, color: sty.fg, fontWeight: 500,
                  }}>{sty.label}</span>
                  <span style={{ fontSize: 11, fontFamily: t.font.mono, color: t.neutrals.subtle, minWidth: 72 }}>
                    {inv.invoice_date}
                  </span>
                  <span style={{ flex: 1, fontSize: 12, fontFamily: t.font.mono, fontWeight: 500, color: t.neutrals.text }}>
                    {inv.amount.toLocaleString()}원
                  </span>
                  {inv.notes && (
                    <span style={{ fontSize: 10, color: t.neutrals.subtle, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {inv.notes}
                    </span>
                  )}
                  <div style={{ display: 'flex', gap: 2 }}>
                    {inv.file_url && (
                      <a href={inv.file_url} target="_blank" rel="noopener noreferrer" style={{ padding: 4, color: t.neutrals.subtle }}>
                        <LIcon name="file" size={12} />
                      </a>
                    )}
                    <button onClick={() => toggleStatus(inv, 'issued_at')} title="발행 토글" style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                      color: inv.issued_at ? tonePalettes.info.fg : t.neutrals.line,
                    }}>
                      <LIcon name="check" size={12} />
                    </button>
                    <button onClick={() => toggleStatus(inv, 'paid_at')} title="입금 토글" style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                      color: inv.paid_at ? tonePalettes.done.fg : t.neutrals.line,
                    }}>
                      <LIcon name="check" size={12} stroke={2.5} />
                    </button>
                    <button onClick={() => openEdit(inv)} style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                      color: t.neutrals.subtle,
                    }}>
                      <LIcon name="pencil" size={12} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {paged.length === 0 && (
          <div style={{ padding: 30, textAlign: 'center', fontSize: 12, color: t.neutrals.subtle }}>
            세금계산서가 없습니다
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          padding: '8px 14px', gap: 6,
          borderTop: `1px solid ${t.neutrals.line}`,
        }}>
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={{
            background: 'transparent', border: 'none', padding: 4, borderRadius: 4,
            cursor: page === 0 ? 'default' : 'pointer',
            color: page === 0 ? t.neutrals.line : t.neutrals.muted,
          }}>
            <LIcon name="chevronLeft" size={13} stroke={2} />
          </button>
          <span style={{ fontSize: 10, fontFamily: t.font.mono, color: t.neutrals.muted }}>
            {page + 1} / {totalPages}
          </span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} style={{
            background: 'transparent', border: 'none', padding: 4, borderRadius: 4,
            cursor: page >= totalPages - 1 ? 'default' : 'pointer',
            color: page >= totalPages - 1 ? t.neutrals.line : t.neutrals.muted,
          }}>
            <LIcon name="chevronRight" size={13} stroke={2} />
          </button>
        </div>
      )}

      {/* Add Modal */}
      {addOpen && (
        <div onClick={() => resetAdd()} style={{
          position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: t.neutrals.card, borderRadius: t.radius.lg,
            width: '100%', maxWidth: 400, padding: 20,
          }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600, color: t.neutrals.text, fontFamily: t.font.sans }}>
              세금계산서 추가
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <label style={{ fontSize: 11, color: t.neutrals.subtle, marginBottom: 4, display: 'block' }}>발행일 *</label>
                <input type="date" value={addDate} onChange={e => setAddDate(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: t.neutrals.subtle, marginBottom: 4, display: 'block' }}>금액 (원) *</label>
                <input type="number" value={addAmount} onChange={e => setAddAmount(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: t.neutrals.subtle, marginBottom: 4, display: 'block' }}>비고</label>
                <input value={addNotes} onChange={e => setAddNotes(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: t.neutrals.subtle, marginBottom: 4, display: 'block' }}>PDF 파일</label>
                <input type="file" accept=".pdf" onChange={e => setAddFile(e.target.files?.[0] || null)}
                  style={{ fontSize: 11, color: t.neutrals.muted }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 14 }}>
              <LBtn variant="secondary" size="sm" onClick={resetAdd}>취소</LBtn>
              <LBtn size="sm" onClick={handleCreate} disabled={saving || !addDate || !addAmount}>
                {saving ? '저장중...' : '저장'}
              </LBtn>
            </div>
          </div>
        </div>
      )}
    </LCard>
  )
}
```

- [ ] **Step 2: Verify and commit**

Run: `npx tsc --noEmit`

```bash
git add src/app/willow-investment/\(linear\)/akros/_components/tax-invoice-block.tsx
git commit -m "feat: add tax invoice block for akros page"
```

---

### Task 5: Wiki Block (`wiki-block.tsx`) — Akros-filtered WikiList wrapper

**Files:**
- Create: `src/app/willow-investment/(linear)/akros/_components/wiki-block.tsx`

**Context:** WikiList from `src/app/willow-investment/(linear)/wiki/_components/wiki-list.tsx` takes `{ notes, loading, onCreate, onUpdate, onDelete }`. It has internal section filter tabs. For the akros page, we pass only akros-section notes so the filter becomes irrelevant. We also wrap it with an Akros-scoped LSectionHead.

- [ ] **Step 1: Create wiki-block.tsx**

```tsx
'use client'

import { WikiList } from '@/app/willow-investment/(linear)/wiki/_components/wiki-list'
import { WikiNote } from '@/app/willow-investment/(linear)/wiki/_components/wiki-note-row'

interface AkrosWikiBlockProps {
  notes: WikiNote[]
  loading: boolean
  onCreate: (data: { section: 'akros'; title: string; content: string; attachments?: unknown }) => Promise<void>
  onUpdate: (id: string, data: Partial<{ title: string; content: string; section: string; is_pinned: boolean; attachments: unknown }>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function AkrosWikiBlock({ notes, loading, onCreate, onUpdate, onDelete }: AkrosWikiBlockProps) {
  const akrosNotes = notes.filter(n => n.section === 'akros')

  const handleCreate = async (data: { section: string; title: string; content: string; attachments?: unknown }) => {
    await onCreate({ ...data, section: 'akros' })
  }

  return (
    <WikiList
      notes={akrosNotes}
      loading={loading}
      onCreate={handleCreate}
      onUpdate={onUpdate}
      onDelete={onDelete}
    />
  )
}
```

- [ ] **Step 2: Verify and commit**

Run: `npx tsc --noEmit`

```bash
git add src/app/willow-investment/\(linear\)/akros/_components/wiki-block.tsx
git commit -m "feat: add akros wiki block wrapping WikiList with section filter"
```

---

### Task 6: Email Block wrapper (`akros-email-block.tsx`)

**Files:**
- Create: `src/app/willow-investment/(linear)/akros/_components/akros-email-block.tsx`

**Context:** The mgmt EmailBlock from `src/app/willow-investment/(linear)/mgmt/_components/email-block.tsx` takes `{ emails, connected, onSelectEmail, onSync, onCompose, isSyncing }`. Each email object has a `sourceLabel` field. For Akros, we pass emails filtered to `sourceLabel === 'Akros'` or emails from the `default` Gmail context with Akros label.

- [ ] **Step 1: Create akros-email-block.tsx**

```tsx
'use client'

import { EmailBlock, FullEmail } from '@/app/willow-investment/(linear)/mgmt/_components/email-block'

interface AkrosEmailBlockProps {
  emails: FullEmail[]
  connected: boolean
  onSelectEmail: (email: FullEmail) => void
  onSync: () => void
  onCompose: () => void
  isSyncing?: boolean
}

export function AkrosEmailBlock({ emails, connected, onSelectEmail, onSync, onCompose, isSyncing }: AkrosEmailBlockProps) {
  return (
    <EmailBlock
      emails={emails}
      connected={connected}
      onSelectEmail={onSelectEmail}
      onSync={onSync}
      onCompose={onCompose}
      isSyncing={isSyncing}
    />
  )
}
```

- [ ] **Step 2: Verify and commit**

Run: `npx tsc --noEmit`

```bash
git add src/app/willow-investment/\(linear\)/akros/_components/akros-email-block.tsx
git commit -m "feat: add akros email block wrapper"
```

---

### Task 7: Assemble page.tsx — all blocks + data fetching

**Files:**
- Modify: `src/app/willow-investment/(linear)/akros/page.tsx`

**Context:** This is the main page that fetches all data and renders all 5 blocks. Data sources:
- AUM/Products: `fetchAllTimeSeriesData()` + `fetchAkrosProducts()` from `src/lib/supabase-etf.ts`
- Tax invoices: `GET /api/akros/tax-invoices`
- Wiki: `GET /api/wiki?section=akros`
- Email: `GET /api/gmail/status?context=default` + `GET /api/gmail/emails?context=default&label=Akros&maxResults=50&daysBack=30`

- [ ] **Step 1: Rewrite page.tsx with all blocks and data fetching**

```tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { t, useIsMobile } from '@/app/willow-investment/_components/linear-tokens'
import { AkrosSkeleton } from '@/app/willow-investment/_components/linear-skeleton'
import { fetchAllTimeSeriesData, fetchAkrosProducts, AkrosProduct, TimeSeriesData } from '@/lib/supabase-etf'
import { AumBlock } from './_components/aum-block'
import { ProductBlock } from './_components/product-block'
import { TaxInvoiceBlock, AkrosTaxInvoice } from './_components/tax-invoice-block'
import { AkrosWikiBlock } from './_components/wiki-block'
import { AkrosEmailBlock } from './_components/akros-email-block'
import { WikiNote } from '@/app/willow-investment/(linear)/wiki/_components/wiki-note-row'
import { FullEmail } from '@/app/willow-investment/(linear)/mgmt/_components/email-block'

export default function AkrosPage() {
  const mobile = useIsMobile()
  const [loading, setLoading] = useState(true)

  // AUM + Products
  const [timeSeries, setTimeSeries] = useState<TimeSeriesData[]>([])
  const [products, setProducts] = useState<AkrosProduct[]>([])

  // Tax invoices
  const [invoices, setInvoices] = useState<AkrosTaxInvoice[]>([])

  // Wiki
  const [wikiNotes, setWikiNotes] = useState<WikiNote[]>([])
  const [wikiLoading, setWikiLoading] = useState(true)

  // Email
  const [emails, setEmails] = useState<FullEmail[]>([])
  const [emailConnected, setEmailConnected] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)

  const loadProducts = useCallback(async () => {
    const [ts, prods] = await Promise.all([
      fetchAllTimeSeriesData(),
      fetchAkrosProducts(),
    ])
    setTimeSeries(ts)
    setProducts(prods)
  }, [])

  const loadInvoices = useCallback(async () => {
    const res = await fetch('/api/akros/tax-invoices')
    if (res.ok) {
      const data = await res.json()
      setInvoices(data.invoices || [])
    }
  }, [])

  const loadWiki = useCallback(async () => {
    setWikiLoading(true)
    const res = await fetch('/api/wiki?section=akros')
    if (res.ok) {
      const data = await res.json()
      setWikiNotes(data.notes || [])
    }
    setWikiLoading(false)
  }, [])

  const loadEmails = useCallback(async () => {
    try {
      const statusRes = await fetch('/api/gmail/status?context=default')
      if (statusRes.ok) {
        const statusData = await statusRes.json()
        setEmailConnected(statusData.connected)
        if (statusData.connected) {
          const emailRes = await fetch('/api/gmail/emails?context=default&label=Akros&maxResults=50&daysBack=30&autoAnalyze=false')
          if (emailRes.ok) {
            const emailData = await emailRes.json()
            setEmails((emailData.emails || []).map((e: FullEmail) => ({ ...e, sourceLabel: 'Akros', gmailContext: 'default' })))
          }
        }
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    Promise.all([loadProducts(), loadInvoices(), loadWiki(), loadEmails()])
      .finally(() => setLoading(false))
  }, [loadProducts, loadInvoices, loadWiki, loadEmails])

  const handleSyncEmail = async () => {
    setIsSyncing(true)
    await loadEmails()
    setIsSyncing(false)
  }

  // Wiki CRUD handlers
  const handleCreateWiki = async (data: { section: string; title: string; content: string; attachments?: unknown }) => {
    await fetch('/api/wiki', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    loadWiki()
  }

  const handleUpdateWiki = async (id: string, data: Partial<{ title: string; content: string; section: string; is_pinned: boolean; attachments: unknown }>) => {
    await fetch(`/api/wiki/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    loadWiki()
  }

  const handleDeleteWiki = async (id: string) => {
    await fetch(`/api/wiki/${id}`, { method: 'DELETE' })
    loadWiki()
  }

  return (
    <>
      <div style={{ padding: '20px 0 0' }}>
        <h1 style={{
          margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: -0.3,
          fontFamily: t.font.sans, color: t.neutrals.text,
        }}>아크로스</h1>
        <p style={{
          margin: '4px 0 16px', fontSize: 12, color: t.neutrals.muted,
          fontFamily: t.font.sans,
        }}>ETF 운용 · 세금계산서 · 위키 · 이메일</p>
      </div>

      {loading ? <AkrosSkeleton /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* AUM Dashboard */}
          <AumBlock timeSeries={timeSeries} productCount={products.length} />

          {/* Products + Tax Invoices */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: mobile ? '1fr' : '1fr 1fr',
            gap: 14,
          }}>
            <ProductBlock products={products} />
            <TaxInvoiceBlock invoices={invoices} onRefresh={loadInvoices} />
          </div>

          {/* Wiki + Email */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: mobile ? '1fr' : '1fr 1fr',
            gap: 14,
          }}>
            <AkrosWikiBlock
              notes={wikiNotes}
              loading={wikiLoading}
              onCreate={handleCreateWiki}
              onUpdate={handleUpdateWiki}
              onDelete={handleDeleteWiki}
            />
            <AkrosEmailBlock
              emails={emails}
              connected={emailConnected}
              onSelectEmail={() => {}}
              onSync={handleSyncEmail}
              onCompose={() => {}}
              isSyncing={isSyncing}
            />
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Fix any type issues.

- [ ] **Step 3: Commit**

```bash
git add src/app/willow-investment/\(linear\)/akros/page.tsx
git commit -m "feat: assemble akros page with all blocks and data fetching"
```

---

### Task 8: Browser verification + type fixes

- [ ] **Step 1: Start dev server and navigate to `/willow-investment/akros`**

Run: `npm run dev`
Open: `http://localhost:3000/willow-investment/akros`

- [ ] **Step 2: Verify each block renders**

Check:
- AUM dashboard shows 3 stats + sparkline
- Product table loads with correct data
- Tax invoice list renders with status badges
- Wiki block shows akros-filtered notes
- Email block loads (or shows connect prompt)

- [ ] **Step 3: Fix any runtime issues**

Address any console errors, missing imports, or type mismatches.

- [ ] **Step 4: Commit fixes**

```bash
git add -A
git commit -m "fix: resolve runtime issues in akros page"
```
