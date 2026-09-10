'use client'

import { useState, useMemo } from 'react'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { LSegmented } from '@/app/(dashboard)/_components/linear-segmented'
import {
  LTableBadge, LTableBody, LTableDate, LTableEmpty, LTableHead, LTableNumber,
  LTableRow, LTableScroll, useTableSort, type LColumn, LPageSize } from '@/app/(dashboard)/_components/linear-table'
import type { WillowInvoice, WillowTaxInvoice } from '@/types/willow-mgmt'
import { FigureGrid, type FigureItem } from './figure-grid'
import { SalesDetailDialog } from './sales-detail-dialog'

// 윌로우 매출은 두 갈래다.
//   세금계산서 — 홈택스에서 수집한 국내 전자세금계산서(원화)
//   인보이스   — ETC(Exchange Traded Concepts)에 발행하는 해외 인보이스(USD)
// 해외 매출에는 세금계산서가 없으므로 홈택스만 보면 절반이 빠진다. 두 갈래를 한
// 목록에 합치고, 합계는 원화 환산으로 맞춘다.
//
// 텐소프트웍스 매출관리는 사람이 수금상태를 관리하는 테이블을 보지만, 윌로우는 그
// 화면이 없어 수집분과 발행분이 그대로 정본이다.

type Source = 'tax' | 'etc'

interface SalesRow {
  id: string
  source: Source
  date: string
  counterparty: string
  detail: string
  amount: number
  currency: string
  /** 원화 환산액. 합계·정렬은 이 값으로 한다. */
  krw: number
  regNumber: string | null
  issuedAt: string | null
  extra: Array<{ label: string; value: string; mono?: boolean }>
}

const DEFAULT_PAGE_SIZE = 8
const PAGE_SIZE_KEY = 'willow-sales-page-size'

type Mode = 'sales' | 'purchase'

const COLUMNS: LColumn<SalesRow>[] = [
  { key: 'source', label: '구분', width: '64px', sortValue: row => row.source },
  { key: 'date', label: '작성일', width: '70px', sortValue: row => row.date, sortFirst: 'desc' },
  { key: 'counterparty', label: '거래처', width: 'minmax(110px,1fr)', sortValue: row => row.counterparty },
  { key: 'detail', label: '품목', width: 'minmax(130px,1fr)', hideMobile: true, sortValue: row => row.detail },
  { key: 'amount', label: '합계', width: 'minmax(100px,120px)', align: 'right', sortValue: row => row.krw, sortFirst: 'desc' },
  { key: 'chevron', label: '', width: '14px' },
]

const SOURCE_LABEL: Record<Source, string> = { tax: '계산서', etc: '인보이스' }

// 구분 칩은 색조 대신 회색 명도로만 나눈다 — 국내 계산서가 대다수라 옅게 깔고,
// 해외 인보이스를 한 단계 진하게 둬서 눈에 먼저 걸리게 한다(2026-09-10 카드 문법).
const SOURCE_TONES: Record<Source, { bg: string; fg: string }> = {
  tax: { bg: '#EDEFF2', fg: '#3A4048' },
  etc: { bg: '#D3D7DD', fg: '#1F242B' },
}

function getStoredPageSize(): number {
  if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE
  const n = Number(localStorage.getItem(PAGE_SIZE_KEY))
  return n >= 1 && n <= 100 ? n : DEFAULT_PAGE_SIZE
}

interface SalesBlockProps {
  invoices: WillowTaxInvoice[]
  /** ETC 해외 인보이스. 매출에만 합쳐진다. */
  etcInvoices: WillowInvoice[]
  /** 원화 환산 환율. 0이면 환산하지 않고 USD 그대로 둔다. */
  usdRate: number
  style?: React.CSSProperties
}

export function SalesBlockNew({ invoices, etcInvoices, usdRate, style }: SalesBlockProps) {
  const mobile = useIsMobile()
  const [mode, setMode] = useState<Mode>('sales')
  const [year, setYear] = useState(new Date().getFullYear())
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(getStoredPageSize)
  const [selected, setSelected] = useState<SalesRow | null>(null)
  const { sort, toggle: toggleSort, apply: sortApply } = useTableSort<SalesRow>('willow-sales', COLUMNS)

  const yearFiltered = useMemo<SalesRow[]>(() => {
    const taxRows: SalesRow[] = invoices
      .filter(inv => (inv.transe_type === 'purchase' ? 'purchase' : 'sales') === mode)
      .filter(inv => inv.reporting_date?.startsWith(String(year)))
      .map(inv => ({
        id: inv.id,
        source: 'tax',
        date: inv.reporting_date,
        counterparty: inv.counterparty ?? '-',
        detail: inv.rep_items ?? '',
        amount: inv.total_amount,
        currency: 'KRW',
        krw: inv.total_amount,
        regNumber: inv.counterparty_reg_number,
        issuedAt: inv.issue_date,
        extra: [
          { label: '공급가액', value: `${inv.supply_amount.toLocaleString()}원`, mono: true },
          { label: '부가세', value: `${inv.tax_amount.toLocaleString()}원`, mono: true },
          { label: '계산서 종류', value: inv.invoice_kind ?? '-' },
          { label: '영수/청구', value: inv.receipt_or_charge ?? '-' },
          { label: '승인번호', value: inv.approval_no ?? '-', mono: true },
        ],
      }))

    // 해외 인보이스는 매입이 없다.
    if (mode === 'purchase') return taxRows

    const etcRows: SalesRow[] = etcInvoices
      .filter(inv => inv.invoice_date?.startsWith(String(year)))
      .map(inv => ({
        id: inv.id,
        source: 'etc',
        date: inv.invoice_date,
        counterparty: inv.bill_to_company,
        detail: (inv.line_items ?? []).map(item => item.description).filter(Boolean).join(', '),
        amount: inv.total_amount,
        currency: inv.currency,
        krw: usdRate > 0 && inv.currency === 'USD' ? inv.total_amount * usdRate : inv.total_amount,
        regNumber: null,
        issuedAt: inv.invoice_date,
        extra: [
          { label: '인보이스 번호', value: inv.invoice_no, mono: true },
          { label: '수신', value: inv.attention ?? '-' },
          { label: '상태', value: inv.status === 'paid' ? '수금완료' : inv.status },
          { label: '수금일', value: inv.paid_at ? inv.paid_at.slice(0, 10) : '-', mono: true },
        ],
      }))

    return [...taxRows, ...etcRows]
  }, [invoices, etcInvoices, mode, year, usdRate])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return yearFiltered
    return yearFiltered.filter(row =>
      `${row.counterparty} ${row.detail} ${row.regNumber ?? ''}`.toLowerCase().includes(q))
  }, [yearFiltered, search])

  const sorted = useMemo(() => {
    const base = [...filtered].sort((a, b) => b.date.localeCompare(a.date))
    return sortApply(base)
  }, [filtered, sortApply])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const paged = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize)

  const taxInvoiceTotal = yearFiltered.filter(row => row.source === 'tax').reduce((sum, row) => sum + row.krw, 0)
  const etcTotal = yearFiltered.filter(row => row.source === 'etc').reduce((sum, row) => sum + row.amount, 0)
  const grandTotal = yearFiltered.reduce((sum, row) => sum + row.krw, 0)

  const applyPageSize = (n: number) => {
    setPageSize(n)
    setPage(0)
    localStorage.setItem(PAGE_SIZE_KEY, String(n))
  }

  const handleModeChange = (next: Mode) => {
    setMode(next)
    setPage(0)
    setSelected(null)
  }

  return (
    <LCard pad={0} style={style}>
      <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadY }}>
        <div style={{ paddingBottom: t.density.panelPadY }}>
          <LSectionHead
            title={mode === 'purchase' ? '매입관리' : '매출관리'}
            tools={
              <LSegmented
                value={mode}
                onChange={handleModeChange}
                options={[
                  { value: 'sales', label: '매출' },
                  { value: 'purchase', label: '매입' },
                ]}
              />
            }
            toolsInline
            mb={0}
          />
        </div>

        {/* 연도 — 카드 전체에 걸리는 조건이라 지표 위 가운데에 둔다 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: t.density.gapMd, padding: `${t.density.panelPadX}px 0`,
        }}>
          <button onClick={() => { setYear(y => y - 1); setPage(0) }} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: t.density.gapXs, borderRadius: t.radius.sm, color: t.neutrals.muted,
          }}>
            <LIcon name="chevronLeft" size={14} stroke={2} />
          </button>
          <span style={{
            fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, fontWeight: t.weight.semibold,
            fontFamily: t.font.sans, minWidth: 104, textAlign: 'center', whiteSpace: 'nowrap',
          }}>
            {year}년
          </span>
          <button onClick={() => { setYear(y => y + 1); setPage(0) }} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: t.density.gapXs, borderRadius: t.radius.sm, color: t.neutrals.muted,
          }}>
            <LIcon name="chevronRight" size={14} stroke={2} />
          </button>
        </div>

        {/* 지표 — 배경 박스를 벗고 라벨 위·값 아래에 행 구분선만 */}
        {(() => {
          const figureCols = mode === 'sales' ? (mobile ? 2 : 3) : 1
          const figures: FigureItem[] = mode === 'sales'
            ? [
              { label: '세금계산서', value: `${Math.round(taxInvoiceTotal).toLocaleString()}원`, mono: true, title: '홈택스에서 수집한 국내 전자세금계산서' },
              { label: 'ETC 인보이스', value: `$${etcTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}`, mono: true, title: 'Exchange Traded Concepts 에 발행한 해외 인보이스' },
              {
                label: '합계', value: `${Math.round(grandTotal).toLocaleString()}원`, mono: true,
                title: usdRate > 0 ? `해외분은 ${usdRate.toLocaleString()}원/USD 로 환산` : '환율을 불러오지 못해 USD 를 그대로 더했어요',
              },
            ]
            : [{ label: '매입 합계', value: `${Math.round(grandTotal).toLocaleString()}원`, mono: true, title: '홈택스에서 수집한 매입 전자세금계산서' }]
          return <FigureGrid items={figures} cols={figureCols} />
        })()}

        {/* 검색 — 표 바로 위 한 줄 */}
        <div style={{ position: 'relative', marginTop: t.density.blockGap }}>
          <div style={{ position: 'absolute', left: t.density.panelPadX, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}>
            <LIcon name="search" size={13} stroke={2} color={t.neutrals.subtle} />
          </div>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
            placeholder="거래처 · 품목 · 사업자번호 검색"
            style={{
              width: '100%', boxSizing: 'border-box', minHeight: t.density.controlHSm,
              padding: `0 ${t.density.panelPadX}px 0 30px`, fontSize: `calc(${t.type.control}px * var(--fz, 1))`,
              fontFamily: t.font.sans, color: t.neutrals.text,
              background: t.neutrals.card, border: `1px solid ${t.neutrals.line}`,
              borderRadius: t.radius.sm, outline: 'none',
            }}
          />
          {search && (
            <button onClick={() => { setSearch(''); setPage(0) }} style={{
              position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: t.density.tableRowGap, color: t.neutrals.muted, display: 'flex', alignItems: 'center',
            }}>
              <LIcon name="x" size={12} stroke={2} />
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: `0 ${t.density.cardPad}px ${t.density.gapSm}px` }}>
        <LTableScroll columns={COLUMNS} mobile={mobile}>
        <LTableHead columns={COLUMNS} mobile={mobile} sort={sort} onSort={toggleSort} />
        {paged.length === 0 && <LTableEmpty>해당 연도 세금계산서가 없습니다</LTableEmpty>}
        <LTableBody columns={COLUMNS} mobile={mobile}>
        {paged.map(row => {
          const foreign = row.currency !== 'KRW'
          // 행을 감싸는 div를 두면 모든 행이 부모의 :last-child가 되어 행 구분선이 사라진다.
          // 인라인 펼침을 없앤 뒤로는 감쌀 이유도 없어 LTableRow를 바로 놓는다(CEO 2026-09-10).
          return (
              <LTableRow key={row.id} columns={COLUMNS} mobile={mobile} onClick={() => setSelected(row)}>
                <LTableBadge tone={SOURCE_TONES[row.source]}>
                  {SOURCE_LABEL[row.source]}
                </LTableBadge>
                <LTableDate value={row.date} format="ymd" />
                <span style={{ minWidth: 0, fontWeight: t.weight.medium, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row.counterparty}
                </span>
                {!mobile && (
                  <span style={{ minWidth: 0, color: t.neutrals.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {row.detail}
                  </span>
                )}
                {/* 해외분은 원화로 눌러 담지 않고 발행 통화 그대로 보여준다. */}
                {foreign ? (
                  <span style={{
                    textAlign: 'right', fontFamily: t.font.mono, fontSize: `calc(${t.type.control}px * var(--fz, 1))`,
                    fontWeight: t.weight.medium, color: t.neutrals.text, fontVariantNumeric: 'tabular-nums',
                  }}>
                    ${row.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>
                ) : (
                  <LTableNumber value={row.amount} />
                )}
                <span style={{ color: t.neutrals.subtle, display: 'flex' }}>
                  <LIcon name="chevronRight" size={12} stroke={2} />
                </span>
              </LTableRow>
          )
        })}
        </LTableBody>
        </LTableScroll>
      </div>

      {/* Pagination */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `0 ${t.density.cardPad}px ${t.density.cardPad}px`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapXs }}>
          <LPageSize value={pageSize} onChange={applyPageSize} />
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm }}>
            <button
              disabled={safePage === 0}
              onClick={() => setPage(p => Math.max(0, p - 1))}
              style={{
                background: 'transparent', border: 'none', padding: t.density.gapXs, borderRadius: t.radius.sm,
                cursor: safePage === 0 ? 'default' : 'pointer',
                color: safePage === 0 ? t.neutrals.line : t.neutrals.muted,
                opacity: safePage === 0 ? 0.4 : 1,
              }}
            >
              <LIcon name="chevronLeft" size={13} stroke={2} />
            </button>
            <span style={{ fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, fontFamily: t.font.mono, color: t.neutrals.muted }}>
              {safePage * pageSize + 1}-{Math.min((safePage + 1) * pageSize, sorted.length)} / {sorted.length}
            </span>
            <button
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              style={{
                background: 'transparent', border: 'none', padding: t.density.gapXs, borderRadius: t.radius.sm,
                cursor: safePage >= totalPages - 1 ? 'default' : 'pointer',
                color: safePage >= totalPages - 1 ? t.neutrals.line : t.neutrals.muted,
                opacity: safePage >= totalPages - 1 ? 0.4 : 1,
              }}
            >
              <LIcon name="chevronRight" size={13} stroke={2} />
            </button>
          </div>
        )}
      </div>

      <SalesDetailDialog
        row={selected ? { ...selected, sourceLabel: SOURCE_LABEL[selected.source] } : null}
        usdRate={usdRate}
        onClose={() => setSelected(null)}
      />
    </LCard>
  )
}
