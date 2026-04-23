# ETC Linear Page Design Spec

## Goal

기존 ETC 레거시 페이지(`/etf/etc`)의 모든 데이터 항목과 기능을 아크로스 Linear 페이지와 동일한 디자인 시스템으로 재구현한다.

## Architecture

아크로스 페이지 패턴을 따르되, ETC 고유 기능(인보이스 PDF/발송/예약, 수수료 티어, 문서 관리)을 수용한다. Linear 디자인 토큰(`t.*`), 프리미티브(`LCard`, `LSectionHead`, `LBtn`, `LIcon`) 사용. 위키와 이메일은 기존 공통 컴포넌트 재사용.

## Layout

```
┌─────────────────────────┬──────────────┐
│  운용 현황 (2/3)         │  인보이스    │
│  [AUM][Monthly Fee]     │  (1/3)       │
│  [Remaining Fee]        │  전체 높이   │
├─────────────────────────┤  차지        │
│  상품 관리 테이블 (2/3)   │              │
└─────────────────────────┴──────────────┘
┌─────────────────────────┬──────────────┐
│  업무위키 (2/3)          │  이메일(1/3) │
└─────────────────────────┴──────────────┘
```

- Desktop: `2fr 1fr` 그리드, 인보이스는 `gridRow: 1 / -1`
- Mobile: `1fr` 스택

## Route & Sidebar

- Route: `/willow-investment/etc`
- 사이드바 CLIENTS 그룹에 "ETC" 항목 추가 (아크로스 아래)
- `LINEAR_ROUTES`에 `/willow-investment/etc` 추가

## File Structure

```
src/app/willow-investment/(linear)/etc/
  page.tsx                    — 메인 페이지 (데이터 로딩 + 블록 조립)
  _components/
    stats-block.tsx           — 3개 통계 카드 (AUM, Monthly Fee, Remaining Fee)
    product-block.tsx         — 상품 테이블 + 페이지네이션
    product-dialog.tsx        — 상품 추가/수정 모달 (수수료 티어 편집)
    document-panel.tsx        — 상품별 문서 관리 (업로드/다운로드/삭제)
    invoice-block.tsx         — 인보이스 목록 + 상태 관리
    invoice-dialog.tsx        — 인보이스 생성/수정 모달
    invoice-send-dialog.tsx   — 발송 모달 (ETC/Bank 이중 수신자 + 예약)
    wiki-block.tsx            — 위키 래퍼 (etf-etc 섹션)
```

---

## 1. Stats Block (`stats-block.tsx`)

아크로스 `aum-block.tsx`와 동일한 패턴. 3개 `StatCard` 가로 배치.

### 카드 항목

| 카드 | label | value | sub | sparkData |
|------|-------|-------|-----|-----------|
| Total AUM | "총 AUM" | `formatAUM(totalAUM, 'USD')` | ETF 수 (`{n}개 상품`) | `historicalData.map(d => d.totalAum)` |
| Monthly Fee | "월 수수료" | `formatAUM(totalMonthlyFee, 'USD')` | "Platform + PM Fee" | `historicalData.map(d => d.totalMonthlyFee)` |
| Remaining Fee | "잔여 수수료" | `formatAUM(totalRemainingFee, 'USD')` | "36개월 프로라타" | `historicalData.map(d => d.totalRemainingFee)` |

### Props

```typescript
interface StatsBlockProps {
  etfs: ETFDisplayData[]
  historicalData: HistoricalDataPoint[]
}
```

### 포맷 함수

USD 기반: `formatAUM(value, 'USD')` — 기존 `supabase-etf.ts`의 함수 재사용.
- `>= 1M` → `$1.23M`
- `>= 1K` → `$1.2K`
- 나머지 → `$123`

### 메트릭 계산

Stats block 내부에서 계산:
- `totalAUM = etfs.reduce((sum, e) => sum + (e.aum || 0), 0)`
- `totalMonthlyFee = etfs.reduce((sum, e) => sum + e.totalMonthlyFee, 0) + 2083.33` (고정 오버헤드)
- `totalRemainingFee = etfs.reduce((sum, e) => sum + (e.remainingFee || 0), 0)`

---

## 2. Product Block (`product-block.tsx`)

### 테이블 열

| 열 | 필드 | 정렬 | 비고 |
|----|------|------|------|
| SYMBOL | `symbol` | left | mono, 링크(fundUrl) |
| FUND NAME | `fundName` | left | 줄임표시 |
| LISTING | `listingDate` | left | mono, muted |
| AUM | `aum` | right | `formatAUM(aum, 'USD')` |
| FLOW | `flow` | right | 초록/빨강 색상 |
| FEE/MO | `totalMonthlyFee` | right | `formatAUM` |
| REMAINING | `remainingFee` | right | `formatAUM` |
| | actions | center | 수정/문서/삭제 아이콘 |

### 레이아웃

- `table-layout: fixed` + `colgroup` (아크로스 패턴)
- Fund Name 열이 나머지 공간 차지, 줄임표시
- 페이지네이션: 이메일 스타일 (페이지 크기 input + range + 쉐브론)
- 기본 페이지 크기: 5

### 액션 버튼

- 수정 (`pencil`): `product-dialog.tsx` 열기
- 문서 (`file`): `document-panel.tsx` 열기
- 삭제: confirm 후 `deleteETFProduct(id)` 호출

### 헤더 액션

- 추가 버튼: `product-dialog.tsx` 열기 (빈 폼)
- 새로고침 버튼: `onRefresh` 콜백

---

## 3. Product Dialog (`product-dialog.tsx`)

### 폼 필드

| 필드 | 타입 | 필수 | 비고 |
|------|------|------|------|
| Symbol | text | Y | uppercase |
| Fund Name | text | Y | |
| Fund URL | text | N | |
| Listing Date | date | N | |
| Bank | text | N | 기본값 "ETC" |
| Currency | text | N | 기본값 "USD" |
| Notes | textarea | N | |
| Platform Fee Tiers | 커스텀 | N | 티어 편집 UI |
| PM Fee Tiers | 커스텀 | N | 티어 편집 UI |

### 수수료 티어 편집

각 티어는 `{ upTo: number, bps: number }`.
- "Add Tier" 버튼으로 티어 추가
- 각 티어: threshold input (`500M` 포맷 지원) + bps input
- 마지막 티어의 upTo는 0 (무제한)
- Min Fee input (연간 최소 수수료)

### API 호출

- 생성: `createETFProduct(data)` → POST
- 수정: `updateETFProduct(id, data)` → PATCH
- 삭제: `deleteETFProduct(id)` → DELETE (수정 모달 내 삭제 버튼)

---

## 4. Document Panel (`document-panel.tsx`)

상품별 문서 관리 패널. 상품 수정 모달 하단 또는 별도 패널로 표시.

### 기능

- **목록**: `fetchETFDocuments(symbol)` → 파일명, 크기, 날짜 표시
- **업로드**: `uploadETFDocument(symbol, file)` → `etf-documents/{symbol}/{filename}`
- **다운로드**: `getDocumentDownloadUrl(symbol, fileName)` → 1시간 서명 URL
- **삭제**: `deleteETFDocument(symbol, fileName)` → confirm 후 삭제

### UI

- 파일 목록: 파일명 + 크기 + 다운로드/삭제 버튼
- 업로드: 파일 input + 드래그앤드롭 영역

---

## 5. Invoice Block (`invoice-block.tsx`)

아크로스 세금계산서와 유사한 2줄 레이아웃, 우측 1/3 세로 스패닝.

### 행 레이아웃

```
[상태배지] [인보이스 날짜]              [액션버튼들]
[총금액] [첫번째 항목 설명 줄임표시]
```

### 상태 배지

| 상태 | 라벨 | 색상 |
|------|------|------|
| draft | 초안 | neutral |
| scheduled_etc/bank/both | 예약 | purple (tonePalettes) |
| sent_etc | ETC발송 | info |
| sent_bank | 은행발송 | warn |
| sent (both) | 발송완료 | info |
| paid | 입금 | done |
| overdue | 연체 | danger |
| cancelled | 취소 | neutral |

### 상태 결정 로직

`getEffectiveInvoiceStatus(invoice)`:
1. paid/cancelled/overdue → 그대로
2. scheduled_etc && scheduled_bank → `scheduled_both`
3. scheduled_etc/bank → 해당 값
4. sent_to_etc_at && sent_to_bank_at → `sent`
5. sent_to_etc_at → `sent_etc`
6. sent_to_bank_at → `sent_bank`
7. → `draft`

### 액션 버튼

- 수정 (`pencil`): `invoice-dialog.tsx` 열기
- ETC 발송 (`send`): `invoice-send-dialog.tsx` 열기 (target: 'etc')
- 은행 발송 (`send`): `invoice-send-dialog.tsx` 열기 (target: 'bank')
- PDF (`file`): `/api/invoices/{id}/pdf` 다운로드
- 입금 토글: status를 `paid`로 변경

### 페이지네이션

이메일 스타일 (페이지 크기 input + range + 쉐브론). 기본 8개.

### 헤더

- eyebrow: "INVOICES"
- title: "인보이스"
- action: 추가 버튼 → `invoice-dialog.tsx`

---

## 6. Invoice Dialog (`invoice-dialog.tsx`)

### 폼 필드

| 필드 | 타입 | 필수 | 기본값 |
|------|------|------|--------|
| Invoice Date | date | Y | 오늘 |
| Attention | text | Y | "Garrett Stevens" |
| Notes | textarea | N | |
| Line Items | 동적 리스트 | Y (1개 이상) | |

### Line Item

| 필드 | 타입 | 비고 |
|------|------|------|
| Type | select | monthly_fee / referral_fee / custom |
| Month | select | 1-12 (monthly_fee/referral_fee만) |
| Year | number | (monthly_fee/referral_fee만) |
| Description | text | custom 타입일 때 직접 입력 |
| Amount | number | USD |

- 타입이 monthly_fee/referral_fee일 때 description은 자동 생성: `"Monthly Fee - April 2026"`
- "Add Item" 버튼으로 라인 아이템 추가
- 각 아이템 삭제 가능

### API

- 생성: `POST /api/invoices` (invoice_no 자동 생성: `#YY-ETC-NNN`)
- 수정: `PATCH /api/invoices/{id}`
- 삭제: `DELETE /api/invoices/{id}` (수정 모달 내 삭제 버튼)

---

## 7. Invoice Send Dialog (`invoice-send-dialog.tsx`)

### Props

```typescript
interface InvoiceSendDialogProps {
  invoice: Invoice | null
  target: 'etc' | 'bank'
  onClose: () => void
  onSent: () => void
}
```

### 동작

1. 열릴 때 PDF 생성: `GET /api/invoices/{id}/pdf` → Blob
2. 수신자 정보 자동 세팅:
   - **ETC**: to=`gstevens@exchangetradedconcepts.com`, cc=`accounting@exchangetradedconcepts.com`
   - **Bank**: to=`ysjmto@shinhan.com`
3. 제목/본문 자동 생성 (레거시 페이지의 템플릿 그대로)
4. 사용자가 내용 편집 가능
5. 즉시 발송 또는 예약 발송 선택
6. 발송 후 인보이스 상태 업데이트:
   - 즉시: `sent_to_etc_at` / `sent_to_bank_at` = now
   - 예약: `scheduled_etc_email_id` / `scheduled_bank_email_id` = emailId

### 예약 발송

- 날짜 + 시간 input
- 미래 시간 검증
- `POST /api/gmail/send` with `scheduledAt` 파라미터
- 발송 후 `PATCH /api/invoices/{id}`로 scheduled ID 저장

---

## 8. Wiki Block (`wiki-block.tsx`)

아크로스 `wiki-block.tsx`와 동일한 패턴.

```typescript
function EtcWikiBlock({ notes, loading, onCreate, onUpdate, onDelete }) {
  const etcNotes = notes.filter(n => n.section === 'etf-etc')
  return <WikiList notes={etcNotes} ... hideFilter />
}
```

---

## 9. Email Integration

아크로스와 동일한 패턴. `EmailBlock` + `EmailDetailDialog` + `ComposeEmailDialog` 재사용.

- Gmail context: `'default'`
- Label: `'ETC'`
- `maxResults: 50`, `daysBack: 30`

---

## 10. Page Assembly (`page.tsx`)

### 데이터 로딩

```typescript
const loadData = useCallback(async () => {
  const [etfs, historical] = await Promise.all([
    fetchETFDisplayData(),
    fetchHistoricalData(products, 180),
  ])
  setEtfs(etfs)
  setHistoricalData(historical)
}, [])

const loadInvoices = useCallback(async () => {
  const res = await fetch('/api/invoices')
  // ...
}, [])

const loadWiki = useCallback(async () => {
  const res = await fetch('/api/wiki', { cache: 'no-store' })
  // ...
}, [])

const fetchEmails = useCallback(async () => {
  // Gmail status + emails with label=ETC
}, [])
```

### 그리드 구조

```tsx
{/* Stats + Products (left 2/3) + Invoices (right 1/3, full height) */}
<div style={{
  display: 'grid',
  gridTemplateColumns: mobile ? '1fr' : '2fr 1fr',
  gridTemplateRows: mobile ? 'auto auto auto' : 'auto 1fr',
  gap: 14,
}}>
  <div style={mobile ? {} : { gridColumn: 1, gridRow: 1 }}>
    <StatsBlock etfs={etfs} historicalData={historicalData} />
  </div>
  <div style={mobile ? {} : { gridColumn: 2, gridRow: '1 / -1' }}>
    <InvoiceBlock invoices={invoices} onRefresh={loadInvoices} ... />
  </div>
  <div style={mobile ? {} : { gridColumn: 1, gridRow: 2 }}>
    <ProductBlock etfs={etfs} onRefresh={loadData} ... />
  </div>
</div>

{/* Wiki + Email */}
<div style={{
  display: 'grid',
  gridTemplateColumns: mobile ? '1fr' : '2fr 1fr',
  gap: 14,
}}>
  <EtcWikiBlock ... />
  <EmailBlock ... />
</div>
```

---

## Reused Components

| 컴포넌트 | 출처 | 용도 |
|----------|------|------|
| `LCard` | linear-card.tsx | 카드 컨테이너 |
| `LSectionHead` | linear-section-head.tsx | 섹션 제목 |
| `LBtn` | linear-btn.tsx | 버튼 |
| `LIcon` | linear-icons.tsx | 아이콘 |
| `WikiList` | wiki/_components/wiki-list.tsx | 위키 목록 |
| `EmailBlock` | mgmt/_components/email-block.tsx | 이메일 목록 |
| `EmailDetailDialog` | mgmt/_components/email-detail-dialog.tsx | 이메일 상세 |
| `ComposeEmailDialog` | mgmt/_components/compose-email-dialog.tsx | 이메일 작성 |

## Reused Lib Functions

| 함수 | 파일 | 용도 |
|------|------|------|
| `fetchETFDisplayData()` | supabase-etf.ts | 상품 데이터 로드 |
| `fetchHistoricalData()` | supabase-etf.ts | 히스토리컬 데이터 |
| `createETFProduct()` | supabase-etf.ts | 상품 생성 |
| `updateETFProduct()` | supabase-etf.ts | 상품 수정 |
| `deleteETFProduct()` | supabase-etf.ts | 상품 삭제 |
| `calculateTieredFee()` | supabase-etf.ts | 수수료 계산 |
| `fetchETFDocuments()` | supabase-etf.ts | 문서 목록 |
| `uploadETFDocument()` | supabase-etf.ts | 문서 업로드 |
| `getDocumentDownloadUrl()` | supabase-etf.ts | 문서 다운로드 URL |
| `deleteETFDocument()` | supabase-etf.ts | 문서 삭제 |
| `generateInvoicePdf()` | invoice/pdf-generator.ts | PDF 생성 |
| `COMPANY_INFO`, `WIRE_INFO`, `DEFAULT_CLIENT` | invoice/constants.ts | 인보이스 상수 |
| `ITEM_TEMPLATES` | invoice/constants.ts | 라인 아이템 템플릿 |

## Existing API Routes (변경 없음)

- `GET/POST /api/invoices` — 인보이스 CRUD
- `GET/PATCH/DELETE /api/invoices/[id]` — 개별 인보이스
- `GET /api/invoices/[id]/pdf` — PDF 다운로드
- `POST /api/invoices/[id]/send` — 인보이스 발송
- `GET/POST/PUT/DELETE /api/wiki`, `/api/wiki/[id]` — 위키
- `GET/POST /api/gmail/*` — Gmail
