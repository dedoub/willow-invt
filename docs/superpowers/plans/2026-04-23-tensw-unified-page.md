# Tensoftworks Unified Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified Tensoftworks page at `/willow-investment/tensw` combining the legacy project page and management page into a single Linear-style interface.

**Architecture:** The page follows the same pattern as Akros/ETC pages — a `page.tsx` orchestrator loads all data and passes it to independent block components via props. Each block is a self-contained `LCard` using Linear design tokens (`t.*`). Dialogs are triggered by callbacks from blocks. Shared components (EmailBlock, WikiList, ComposeEmailDialog, EmailDetailDialog) are imported from existing locations.

**Tech Stack:** Next.js App Router, React client components, Linear design tokens, Supabase (via existing API routes), Gmail API integration

---

## File Structure

```
src/app/willow-investment/(linear)/tensw/
├── page.tsx                          # Main page — data loading, block wiring, dialog state
└── _components/
    ├── project-block.tsx             # Dev project list (simple table)
    ├── schedule-block.tsx            # Week/month calendar (adapted from mgmt ScheduleBlock)
    ├── schedule-add-dialog.tsx       # Schedule create/edit dialog
    ├── schedule-detail-dialog.tsx    # Schedule read-only detail dialog
    ├── cash-block.tsx                # Cash management block (adapted from mgmt CashBlock)
    ├── cash-dialog.tsx               # Cash create/edit dialog
    ├── sales-block.tsx               # Tax invoice / sales management block
    ├── sales-dialog.tsx              # Tax invoice create/edit dialog
    ├── loan-block.tsx                # Loan management block
    ├── loan-dialog.tsx               # Loan create/edit dialog
    └── wiki-block.tsx                # Wiki wrapper (filters for section='tensw-mgmt')

Modified files:
├── src/app/willow-investment/_components/linear-sidebar.tsx   # Add tensw href
├── src/app/willow-investment/_components/linear-skeleton.tsx  # Add TenswSkeleton
└── src/types/tensw-mgmt.ts                                    # Add TenswCashItem, TenswTaxInvoice, TenswLoan types
```

---

### Task 1: Route scaffolding — sidebar link, types, skeleton, empty page

**Files:**
- Modify: `src/app/willow-investment/_components/linear-sidebar.tsx`
- Modify: `src/types/tensw-mgmt.ts`
- Modify: `src/app/willow-investment/_components/linear-skeleton.tsx`
- Create: `src/app/willow-investment/(linear)/tensw/page.tsx`

- [ ] **Step 1: Add tensw href to sidebar**

In `src/app/willow-investment/_components/linear-sidebar.tsx`, change the href logic (around line 89) to include tensw:

```tsx
const href = c.id === 'akros' ? '/willow-investment/akros'
  : c.id === 'etc' ? '/willow-investment/etc'
  : c.id === 'tensw' ? '/willow-investment/tensw'
  : undefined
```

- [ ] **Step 2: Add types to tensw-mgmt.ts**

Append to `src/types/tensw-mgmt.ts`:

```typescript
export interface TenswCashItem {
  id: string
  type: 'revenue' | 'expense' | 'asset' | 'liability'
  counterparty: string
  description: string | null
  amount: number
  issue_date: string | null
  payment_date: string | null
  status: string
  notes: string | null
  account_number: string | null
  created_at: string
  updated_at: string
}

export interface TenswTaxInvoice {
  id: string
  invoice_date: string
  company: string
  description: string | null
  supply_amount: number
  tax_amount: number
  total_amount: number
  status: string
  items: Array<{ description: string; quantity: number; unit_price: number; supply_amount: number; tax_amount: number }>
  notes: string | null
  created_at: string
  updated_at: string
}

export interface TenswLoan {
  id: string
  lender: string
  loan_type: string
  principal: number
  interest_rate: number
  start_date: string
  end_date: string | null
  repayment_type: string
  interest_payment_day: number | null
  status: string
  notes: string | null
  created_at: string
  updated_at: string
}
```

- [ ] **Step 3: Add TenswSkeleton to linear-skeleton.tsx**

Add to `src/app/willow-investment/_components/linear-skeleton.tsx`, following the same pattern as `AkrosSkeleton` / `EtcSkeleton`:

```tsx
export function TenswSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Projects */}
      <LCard><div style={{ padding: t.density.cardPad }}><Bone w={90} h={10} /><Vgap h={10} /><Bone w="60%" h={8} />{Array.from({ length: 5 }).map((_, i) => <div key={i}><Vgap h={8} /><Bone h={28} /></div>)}</div></LCard>
      {/* Schedule */}
      <LCard><div style={{ padding: t.density.cardPad }}><Bone w={100} h={10} /><Vgap h={10} /><div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>{Array.from({ length: 14 }).map((_, i) => <Bone key={i} h={60} />)}</div></div></LCard>
      {/* Cash + Loans */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <LCard><div style={{ padding: t.density.cardPad }}><Bone w={80} h={10} /><Vgap h={10} /><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>{Array.from({ length: 6 }).map((_, i) => <Bone key={i} h={44} />)}</div><Vgap h={12} />{Array.from({ length: 3 }).map((_, i) => <div key={i}><Vgap h={6} /><Bone h={32} /></div>)}</div></LCard>
          <LCard><div style={{ padding: t.density.cardPad }}><Bone w={80} h={10} /><Vgap h={10} />{Array.from({ length: 4 }).map((_, i) => <div key={i}><Vgap h={6} /><Bone h={36} /></div>)}</div></LCard>
        </div>
        <LCard><div style={{ padding: t.density.cardPad }}><Bone w={70} h={10} /><Vgap h={10} />{Array.from({ length: 4 }).map((_, i) => <div key={i}><Vgap h={6} /><Bone h={36} /></div>)}</div></LCard>
      </div>
      {/* Wiki + Email */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
        <LCard><div style={{ padding: t.density.cardPad }}><Bone w={80} h={10} /><Vgap h={10} />{Array.from({ length: 3 }).map((_, i) => <div key={i}><Vgap h={6} /><Bone h={40} /></div>)}</div></LCard>
        <LCard><div style={{ padding: t.density.cardPad }}><Bone w={60} h={10} /><Vgap h={10} />{Array.from({ length: 4 }).map((_, i) => <div key={i}><Vgap h={6} /><Bone h={28} /></div>)}</div></LCard>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create empty page.tsx**

Create `src/app/willow-investment/(linear)/tensw/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { t } from '@/app/willow-investment/_components/linear-tokens'
import { TenswSkeleton } from '@/app/willow-investment/_components/linear-skeleton'

export default function TenswPage() {
  const [loading] = useState(true)

  return (
    <>
      <div style={{ padding: '20px 0 0' }}>
        <h1 style={{
          margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: -0.3,
          fontFamily: t.font.sans, color: t.neutrals.text,
        }}>텐소프트웍스</h1>
        <p style={{
          margin: '4px 0 16px', fontSize: 12, color: t.neutrals.muted,
          fontFamily: t.font.sans,
        }}>프로젝트 · 일정 · 경영관리 · 위키 · 이메일</p>
      </div>
      {loading && <TenswSkeleton />}
    </>
  )
}
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Then open `http://localhost:3000/willow-investment/tensw` and confirm the sidebar link works and skeleton renders.

- [ ] **Step 6: Commit**

```bash
git add src/app/willow-investment/_components/linear-sidebar.tsx \
  src/types/tensw-mgmt.ts \
  src/app/willow-investment/_components/linear-skeleton.tsx \
  src/app/willow-investment/\(linear\)/tensw/page.tsx
git commit -m "feat(tensw): scaffold route, sidebar link, skeleton, types"
```

---

### Task 2: Project Block — dev project list

**Files:**
- Create: `src/app/willow-investment/(linear)/tensw/_components/project-block.tsx`

**Context:** The existing legacy `/api/tensoftworks` API returns projects with stats, schedules, activity, AI scores. We show a simplified table/list. Each row links to `https://tensw-todo.vercel.app/projects/{slug}`. Status filter badges at the top.

**Reference:** Read `src/app/willow-investment/(linear)/etc/_components/product-block.tsx` for table + pagination pattern. Read `src/app/tensoftworks/projects/page.tsx` for the `ProjectWithStats` interface shape and status colors.

- [ ] **Step 1: Create project-block.tsx**

Create `src/app/willow-investment/(linear)/tensw/_components/project-block.tsx`. The component receives a `projects` array prop. Shows a table with columns: icon, name, status badge, progress bar, AI score. Status filter badges at the top. Paginated (default 10). Clicking a row opens tensw-todo in new tab.

The `ProjectWithStats` interface (defined inline since it comes from the API):

```typescript
interface ProjectStats {
  total: number; pending: number; assigned: number; in_progress: number;
  pending_approval: number; completed: number; discarded: number
}

interface ProjectWithStats {
  id: string; name: string; slug: string; description: string | null
  status: string; icon: string | null; is_poc: boolean
  stats: ProjectStats; aiProgressScore?: number | null
}
```

Key implementation details:
- Status filter badges: 전체 / 진행 / 관리 / 종료 / POC
- Status badge colors: active=#16A34A, managed=#3B82F6, closed=#9CA3AF, poc=#F59E0B
- Progress: `completed / (total - discarded) * 100`
- Pagination: same localStorage pattern as other blocks with `tensw-project-page-size` key
- Table columns: Icon (40px) | Name (flex) | Status (60px) | Progress (80px) | AI Score (60px)
- Icon mapping: use LIcon with a simple mapping for common project icons, fallback to 'folder' icon

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/app/willow-investment/\(linear\)/tensw/_components/project-block.tsx
git commit -m "feat(tensw): add project list block"
```

---

### Task 3: Schedule Block — week/month calendar

**Files:**
- Create: `src/app/willow-investment/(linear)/tensw/_components/schedule-block.tsx`

**Context:** Adapt the Willow mgmt `ScheduleBlock` (`src/app/willow-investment/(linear)/mgmt/_components/schedule-block.tsx`) for Tensoftworks data.

**Key differences from Willow mgmt ScheduleBlock:**
- Uses `TenswMgmtSchedule` (from `@/types/tensw-mgmt`) instead of `WillowMgmtSchedule`
- Color comes from `schedule.client?.color` (client color) instead of category-based tones
- Falls back to type-based colors if no client: task=neutral, meeting=info, deadline=warn
- Filter by client (from `TenswMgmtClient[]` prop) instead of category
- No category chips — instead show client filter chips

- [ ] **Step 1: Create schedule-block.tsx**

Create `src/app/willow-investment/(linear)/tensw/_components/schedule-block.tsx`.

Props:
```typescript
interface ScheduleBlockProps {
  schedules: TenswMgmtSchedule[]
  clients: TenswMgmtClient[]
  onAddSchedule: (date: string) => void
  onToggleComplete: (id: string, completed: boolean) => void
  onSelectSchedule: (schedule: TenswMgmtSchedule) => void
}
```

The structure mirrors `mgmt/schedule-block.tsx` exactly:
- `LCard` wrapper
- `LSectionHead` with eyebrow="SCHEDULE · 주간|월간" and week/month toggle
- Navigation arrows with period label
- Client filter chips (전체 + one chip per client, using `client.color`)
- 7-column day headers (월~일)
- Week view: 7 DayCell components, minHeight 128
- Month view: grid of weeks, compact DayCells, minHeight 72
- Each `EventChip` shows schedule title with check circle toggle

Use the same helper functions: `formatDateLocal`, `getWeekDays`, `getMonthGrid`, `matchesDate`.

For event chip colors, derive from `schedule.client?.color` → convert to bg/fg pair using a simple helper:
```typescript
function getClientTone(s: TenswMgmtSchedule): { bg: string; fg: string } {
  const color = s.client?.color
  if (color) return { bg: color + '20', fg: color }
  // fallback by type
  if (s.type === 'deadline') return tonePalettes.warn
  if (s.type === 'meeting') return tonePalettes.info
  return tonePalettes.neutral
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/app/willow-investment/\(linear\)/tensw/_components/schedule-block.tsx
git commit -m "feat(tensw): add schedule calendar block"
```

---

### Task 4: Schedule Dialogs — add/edit + detail

**Files:**
- Create: `src/app/willow-investment/(linear)/tensw/_components/schedule-add-dialog.tsx`
- Create: `src/app/willow-investment/(linear)/tensw/_components/schedule-detail-dialog.tsx`

**Context:** Adapt from `mgmt/_components/add-schedule-dialog.tsx` and `mgmt/_components/schedule-detail-dialog.tsx`. Key difference: use `TenswMgmtSchedule` and `TenswMgmtClient` types; instead of category chips show client selection dropdown/chips.

- [ ] **Step 1: Create schedule-add-dialog.tsx**

Adapt from `mgmt/add-schedule-dialog.tsx`. Changes:
- Props receive `clients: TenswMgmtClient[]` for client selection
- Form includes `client_id` instead of `category`
- Type chips for task/meeting/deadline (instead of category)
- Client chips (colored by `client.color`) for selecting the client

```typescript
export interface TenswScheduleFormData {
  id?: string
  title: string
  schedule_date: string
  end_date: string
  start_time: string
  end_time: string
  type: 'task' | 'meeting' | 'deadline'
  client_id: string
  description: string
}
```

Same dialog structure: fixed overlay, `t.neutrals.card` panel 440px wide, header/body/footer.

- [ ] **Step 2: Create schedule-detail-dialog.tsx**

Adapt from `mgmt/schedule-detail-dialog.tsx`. Changes:
- Uses `TenswMgmtSchedule` type
- Shows client name + color instead of category
- Shows connected tasks (`schedule.tasks`) with check marks
- Footer: 삭제 | 완료 처리 / 수정

- [ ] **Step 3: Verify TypeScript**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/app/willow-investment/\(linear\)/tensw/_components/schedule-add-dialog.tsx \
  src/app/willow-investment/\(linear\)/tensw/_components/schedule-detail-dialog.tsx
git commit -m "feat(tensw): add schedule add/detail dialogs"
```

---

### Task 5: Cash Block + Dialog

**Files:**
- Create: `src/app/willow-investment/(linear)/tensw/_components/cash-block.tsx`
- Create: `src/app/willow-investment/(linear)/tensw/_components/cash-dialog.tsx`

**Context:** Adapt from `mgmt/_components/cash-block.tsx` and `mgmt/_components/add-invoice-dialog.tsx`. Nearly identical — just uses `TenswCashItem` type and hits tensw-mgmt API.

- [ ] **Step 1: Create cash-block.tsx**

Adapt `mgmt/cash-block.tsx` for tensw. Same exact UI:
- `LSectionHead` with period mode toggle (월간/분기/연간)
- Navigation with period label
- 6 KPI stats grid (매출/비용/영업이익/자산/부채/현금흐름)
- Type filter chips + add button
- Transaction list (date | type badge | counterparty | description | amount)

Props:
```typescript
interface CashBlockProps {
  items: TenswCashItem[]
  onAdd: () => void
  onSelect: (item: TenswCashItem) => void
}
```

Note: Remove the file upload / drag-drop zone from the Willow version — the tensw version doesn't need bank statement parsing.

- [ ] **Step 2: Create cash-dialog.tsx**

Adapt `mgmt/add-invoice-dialog.tsx`. Same form fields: type chips, counterparty, amount, issue_date, payment_date, description. Add delete button when editing.

Props:
```typescript
interface CashDialogProps {
  open: boolean
  editItem: TenswCashItem | null
  onClose: () => void
  onSave: (data: TenswCashFormData) => Promise<void>
  onDelete?: (id: string) => Promise<void>
}

export interface TenswCashFormData {
  id?: string
  type: 'revenue' | 'expense' | 'asset' | 'liability'
  counterparty: string
  description: string
  amount: string
  issue_date: string
  payment_date: string
}
```

Footer: Edit mode shows 삭제 button on left, 취소/저장 on right. Create mode shows only 취소/저장.

- [ ] **Step 3: Verify TypeScript**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/app/willow-investment/\(linear\)/tensw/_components/cash-block.tsx \
  src/app/willow-investment/\(linear\)/tensw/_components/cash-dialog.tsx
git commit -m "feat(tensw): add cash management block and dialog"
```

---

### Task 6: Sales Block + Dialog (세금계산서/매출관리)

**Files:**
- Create: `src/app/willow-investment/(linear)/tensw/_components/sales-block.tsx`
- Create: `src/app/willow-investment/(linear)/tensw/_components/sales-dialog.tsx`

**Context:** Similar to the Akros tax-invoice-block but for tensw_mgmt_sales table. Shows tax invoices with supply_amount, tax_amount, total_amount.

- [ ] **Step 1: Create sales-block.tsx**

Pattern similar to Akros `tax-invoice-block.tsx` but adapted for tensw sales data.

Props:
```typescript
interface SalesBlockProps {
  invoices: TenswTaxInvoice[]
  onAdd: () => void
  onEdit: (inv: TenswTaxInvoice) => void
  onDelete: (id: string) => Promise<void>
  onRefresh: () => void
  style?: React.CSSProperties
}
```

Features:
- `LSectionHead` eyebrow="TAX INVOICES" title="매출관리"
- Status filter: 전체/대기/발행/완료
- Year filter (chevron navigation)
- Summary stats: total supply, total tax, total amount
- Invoice rows: status badge | date | company | total_amount
- Status colors: pending=neutral, issued=info, completed=done (using `tonePalettes`)
- Pagination (PAGE_SIZE = 8)

- [ ] **Step 2: Create sales-dialog.tsx**

Dialog for creating/editing tax invoices.

Props:
```typescript
interface SalesDialogProps {
  open: boolean
  editInvoice: TenswTaxInvoice | null
  onClose: () => void
  onSave: (data: TenswSalesFormData) => Promise<void>
  onDelete?: (id: string) => Promise<void>
}

export interface TenswSalesFormData {
  id?: string
  invoice_date: string
  company: string
  description: string
  supply_amount: string
  tax_amount: string
  notes: string
}
```

Form fields: 발행일, 거래처, 내용, 공급가액, 세액 (auto-calculated as 10% of supply), 비고.
Footer: Delete (edit mode) | Cancel / Save.

- [ ] **Step 3: Verify TypeScript**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/app/willow-investment/\(linear\)/tensw/_components/sales-block.tsx \
  src/app/willow-investment/\(linear\)/tensw/_components/sales-dialog.tsx
git commit -m "feat(tensw): add sales/tax-invoice block and dialog"
```

---

### Task 7: Loan Block + Dialog (차입금관리)

**Files:**
- Create: `src/app/willow-investment/(linear)/tensw/_components/loan-block.tsx`
- Create: `src/app/willow-investment/(linear)/tensw/_components/loan-dialog.tsx`

- [ ] **Step 1: Create loan-block.tsx**

Props:
```typescript
interface LoanBlockProps {
  loans: TenswLoan[]
  onAdd: () => void
  onEdit: (loan: TenswLoan) => void
  onDelete: (id: string) => Promise<void>
  style?: React.CSSProperties
}
```

Features:
- `LCard` with `pad={0}`, receives `style` prop for height control
- `LSectionHead` eyebrow="LOANS" title="차입금관리" with add button
- Summary: total principal (active loans only)
- Status filter: 전체/진행/완료
- Loan rows:
  - Line 1: lender + loan_type badge
  - Line 2: principal (formatted) + interest_rate% + maturity date
- Pagination (PAGE_SIZE = 8)

- [ ] **Step 2: Create loan-dialog.tsx**

Props:
```typescript
interface LoanDialogProps {
  open: boolean
  editLoan: TenswLoan | null
  onClose: () => void
  onSave: (data: TenswLoanFormData) => Promise<void>
  onDelete?: (id: string) => Promise<void>
}

export interface TenswLoanFormData {
  id?: string
  lender: string
  loan_type: string
  principal: string
  interest_rate: string
  start_date: string
  end_date: string
  repayment_type: string
  interest_payment_day: string
  notes: string
}
```

Form fields: 대출기관, 대출유형 (chips: 신용대출/담보대출/정책자금/기타), 원금, 이율, 시작일, 만기일, 상환방식, 이자납부일, 비고.
Footer: Delete (edit mode) | Cancel / Save.

- [ ] **Step 3: Verify TypeScript**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/app/willow-investment/\(linear\)/tensw/_components/loan-block.tsx \
  src/app/willow-investment/\(linear\)/tensw/_components/loan-dialog.tsx
git commit -m "feat(tensw): add loan management block and dialog"
```

---

### Task 8: Wiki Block wrapper

**Files:**
- Create: `src/app/willow-investment/(linear)/tensw/_components/wiki-block.tsx`

- [ ] **Step 1: Create wiki-block.tsx**

Identical pattern to `akros/_components/wiki-block.tsx`:

```tsx
'use client'

import { WikiList } from '@/app/willow-investment/(linear)/wiki/_components/wiki-list'
import { WikiNote } from '@/app/willow-investment/(linear)/wiki/_components/wiki-note-row'

type WikiSection = 'akros' | 'etf-etc' | 'willow-mgmt' | 'tensw-mgmt'

interface TenswWikiBlockProps {
  notes: WikiNote[]
  loading: boolean
  onCreate: (data: { section: 'tensw-mgmt'; title: string; content: string; attachments?: unknown }) => Promise<void>
  onUpdate: (id: string, data: Partial<{ title: string; content: string; section: string; is_pinned: boolean; attachments: unknown }>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function TenswWikiBlock({ notes, loading, onCreate, onUpdate, onDelete }: TenswWikiBlockProps) {
  const tenswNotes = notes.filter(n => n.section === 'tensw-mgmt')

  const handleCreate = async (data: { section: WikiSection; title: string; content: string; attachments?: unknown }) => {
    await onCreate({ ...data, section: 'tensw-mgmt' })
  }

  return (
    <WikiList
      notes={tenswNotes}
      loading={loading}
      onCreate={handleCreate}
      onUpdate={onUpdate}
      onDelete={onDelete}
      hideFilter
    />
  )
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/app/willow-investment/\(linear\)/tensw/_components/wiki-block.tsx
git commit -m "feat(tensw): add wiki block wrapper"
```

---

### Task 9: Page Assembly — wire all blocks, data loading, dialog state, email

**Files:**
- Modify: `src/app/willow-investment/(linear)/tensw/page.tsx`

**Context:** This is the orchestrator. Pattern follows `akros/page.tsx` and `etc/page.tsx`. Loads all data in parallel on mount, manages dialog state, passes callbacks to blocks.

- [ ] **Step 1: Implement full page.tsx**

Replace the placeholder page with the full implementation. The page:

1. **Data state:**
   - `projects: ProjectWithStats[]` — from `/api/tensoftworks`
   - `schedules: TenswMgmtSchedule[]` — from `/api/tensw-mgmt/schedules`
   - `clients: TenswMgmtClient[]` — from `/api/tensw-mgmt/clients`
   - `cashItems: TenswCashItem[]` — from `/api/tensw-mgmt/invoices`
   - `salesInvoices: TenswTaxInvoice[]` — from `/api/tensw-mgmt/tax-invoices`
   - `loans: TenswLoan[]` — from `/api/tensw-mgmt/loans`
   - `wikiNotes: WikiNote[]` — from `/api/wiki`
   - `emails: FullEmail[]` — from Gmail API (context=tensoftworks, label=TENSW)

2. **Dialog state:**
   - Schedule: `scheduleDialogOpen`, `editingSchedule`, `scheduleDialogDate`, `selectedSchedule`
   - Cash: `cashDialogOpen`, `editCashItem`
   - Sales: `salesDialogOpen`, `editSalesInvoice`
   - Loan: `loanDialogOpen`, `editLoan`
   - Email: `selectedEmail`, `composeOpen`, `composeMode`, `composeOriginal`

3. **Data loading:** `useEffect` on mount calls all fetch functions in parallel via `Promise.all`.

4. **Layout:**
```tsx
<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
  {/* Projects (full width) */}
  <ProjectBlock projects={projects} />

  {/* Schedule (full width) */}
  <ScheduleBlock schedules={schedules} clients={clients}
    onAddSchedule={...} onToggleComplete={...} onSelectSchedule={...} />

  {/* Cash+Sales (2fr) + Loans (1fr) */}
  <div style={{
    display: 'grid',
    gridTemplateColumns: mobile ? '1fr' : '2fr 1fr',
    gap: 14,
  }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <CashBlock items={cashItems} onAdd={...} onSelect={...} />
      <SalesBlock invoices={salesInvoices} onAdd={...} onEdit={...} onDelete={...} onRefresh={...} />
    </div>
    <LoanBlock loans={loans} onAdd={...} onEdit={...} onDelete={...} style={{ height: 'fit-content' }} />
  </div>

  {/* Wiki (2fr) + Email (1fr) */}
  <div style={{
    display: 'grid',
    gridTemplateColumns: mobile ? '1fr' : '2fr 1fr',
    gap: 14,
  }}>
    <TenswWikiBlock notes={wikiNotes} loading={wikiLoading}
      onCreate={...} onUpdate={...} onDelete={...} />
    <EmailBlock emails={emails} connected={emailConnected}
      onSelectEmail={...} onSync={...} onCompose={...} isSyncing={...} />
  </div>
</div>
```

5. **Handlers:** Follow the same pattern as `akros/page.tsx` for CRUD operations:
   - Schedule: POST/PUT/DELETE to `/api/tensw-mgmt/schedules`, toggle via PUT with `is_completed`
   - Cash: POST/PUT/DELETE to `/api/tensw-mgmt/invoices`
   - Sales: POST/PUT/DELETE to `/api/tensw-mgmt/tax-invoices`
   - Loans: POST/PUT/DELETE to `/api/tensw-mgmt/loans`
   - Wiki: POST/PUT/DELETE to `/api/wiki` with section='tensw-mgmt'
   - Email: same Gmail pattern as other pages (context=tensoftworks, label=TENSW)

6. **Dialogs rendered at bottom:**
   - `ScheduleAddDialog`, `ScheduleDetailDialog`
   - `CashDialog`
   - `SalesDialog`
   - `LoanDialog`
   - `EmailDetailDialog`, `ComposeEmailDialog`

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Browser verification**

Open `http://localhost:3000/willow-investment/tensw` and verify:
- Page loads without errors
- All blocks render
- Schedule calendar shows/navigates
- Cash block shows KPI and transaction list
- Sales block shows tax invoices
- Loan block shows loans
- Wiki block shows notes
- Email block shows emails
- All dialogs open/close properly
- CRUD operations work (add, edit, delete)
- Mobile layout stacks correctly

- [ ] **Step 4: Commit**

```bash
git add src/app/willow-investment/\(linear\)/tensw/page.tsx
git commit -m "feat(tensw): assemble page with all blocks and data loading"
```
