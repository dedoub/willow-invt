'use client'

import { useState } from 'react'
import { t, tonePalettes } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LCardFoot } from '@/app/(dashboard)/_components/linear-card-foot'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import {
  LPageSize, LTableScroll, LTableHead, LTableBody, LTableRow, LTableEmpty,
  LTableBadge, LTableDate, LTableNumber, type LColumn,
} from '@/app/(dashboard)/_components/linear-table'
import { LDialog, LDialogFoot } from '@/app/(dashboard)/_components/linear-dialog'
import { RowDetailDialog } from '@/app/(dashboard)/_components/linear-row-detail'
import type { FigureItem } from '@/app/(dashboard)/_components/linear-figure-grid'

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
  style?: React.CSSProperties
}

/** 카드가 3분의 1 폭이라 열은 넷까지다. 비고는 좁아지면 접힌다. */
const COLUMNS: LColumn<AkrosTaxInvoice>[] = [
  { key: 'status', label: '상태', width: '44px' },
  { key: 'date', label: '발행일', width: '76px' },
  { key: 'amount', label: '금액', width: 'minmax(84px,1fr)', align: 'right' },
  { key: 'notes', label: '비고', width: 'minmax(90px,1.4fr)', hideMobile: true },
]

const TAX_INVOICE_PAGE_SIZE_KEY = 'akros-tax-invoice-page-size'
const DEFAULT_TAX_INVOICE_PAGE_SIZE = 10

function getStoredTaxInvoicePageSize(): number {
  if (typeof window === 'undefined') return DEFAULT_TAX_INVOICE_PAGE_SIZE
  const v = localStorage.getItem(TAX_INVOICE_PAGE_SIZE_KEY)
  if (!v) return DEFAULT_TAX_INVOICE_PAGE_SIZE
  const n = Number(v)
  return n >= 1 && n <= 100 ? n : DEFAULT_TAX_INVOICE_PAGE_SIZE
}

export function TaxInvoiceBlock({ invoices, onRefresh, style }: TaxInvoiceBlockProps) {
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(getStoredTaxInvoicePageSize)
  const [addOpen, setAddOpen] = useState(false)
  // 행을 누르면 상세가 먼저다. 고치는 것은 거기서 한 걸음 더 간다(사업관리와 같은 길).
  const [selected, setSelected] = useState<AkrosTaxInvoice | null>(null)
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

  const totalPages = Math.max(1, Math.ceil(invoices.length / pageSize))
  const paged = invoices.slice(page * pageSize, (page + 1) * pageSize)

  const applyPageSize = (n: number) => {
    setPageSize(n)
    setPage(0)
    if (typeof window !== 'undefined') localStorage.setItem(TAX_INVOICE_PAGE_SIZE_KEY, String(n))
  }

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
    width: '100%', padding: `${t.density.gapSm}px ${t.density.panelPadY}px`, borderRadius: t.radius.sm,
    border: 'none', background: t.neutrals.inner,
    fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, fontFamily: t.font.sans, color: t.neutrals.text, outline: 'none',
  }

  return (
    <LCard pad={0} style={style}>
      {/* 머리·표의 간격은 사업관리 표 카드와 같다. 눈썹(TAX INVOICES)은 두지 않는다. */}
      <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadY }}>
        <LSectionHead title="세금계산서" mb={0} action={
          <LBtn size="sm" icon={<LIcon name="plus" size={14} color={t.neutrals.text} />}
            onClick={() => setAddOpen(true)}>추가</LBtn>
        } />
      </div>

      <div style={{ padding: `0 ${t.density.cardPad}px ${t.density.gapSm}px` }}>
        <LTableScroll columns={COLUMNS}>
          <LTableHead columns={COLUMNS} />
          {paged.length === 0 && <LTableEmpty>세금계산서가 없습니다</LTableEmpty>}
          <LTableBody columns={COLUMNS}>
            {paged.map(inv => {
              const sty = STATUS_STYLES[getStatus(inv)]
              return (
                <LTableRow key={inv.id} columns={COLUMNS} onClick={() => setSelected(inv)}>
                  <LTableBadge tone={{ bg: sty.bg, fg: sty.fg }}>{sty.label}</LTableBadge>
                  <LTableDate value={inv.invoice_date} />
                  <LTableNumber value={inv.amount} />
                  <span style={{ minWidth: 0, color: t.neutrals.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {inv.notes ?? ''}
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
        padding: `${t.density.gapSm}px ${t.density.cardPad}px`, borderTop: `1px solid ${t.neutrals.line}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapXs }}>
          <LPageSize value={pageSize} onChange={applyPageSize} />
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm }}>
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={{
              background: 'transparent', border: 'none', padding: t.density.gapXs, borderRadius: t.radius.sm,
              cursor: page === 0 ? 'default' : 'pointer',
              color: page === 0 ? t.neutrals.line : t.neutrals.muted,
              opacity: page === 0 ? 0.4 : 1,
            }}>
              <LIcon name="chevronLeft" size={13} stroke={2} />
            </button>
            <span style={{ fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, fontFamily: t.font.mono, color: t.neutrals.muted }}>
              {page * pageSize + 1}-{Math.min((page + 1) * pageSize, invoices.length)} / {invoices.length}
            </span>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} style={{
              background: 'transparent', border: 'none', padding: t.density.gapXs, borderRadius: t.radius.sm,
              cursor: page >= totalPages - 1 ? 'default' : 'pointer',
              color: page >= totalPages - 1 ? t.neutrals.line : t.neutrals.muted,
              opacity: page >= totalPages - 1 ? 0.4 : 1,
            }}>
              <LIcon name="chevronRight" size={13} stroke={2} />
            </button>
          </div>
        )}
      </div>

      {/* 상세 — 행을 누르면 여기로 온다. 발행·입금은 여기서 찍는다(사업관리 일정의 완료 처리와 같은 자리). */}
      {selected && (() => {
        const inv = selected
        const sty = STATUS_STYLES[getStatus(inv)]
        const facts: FigureItem[] = [
          { label: '상태', value: sty.label },
          { label: '발행일', value: inv.invoice_date, mono: true },
          { label: '금액', value: `${inv.amount.toLocaleString()}원`, mono: true },
          { label: '발행 처리', value: inv.issued_at ? inv.issued_at.slice(0, 10) : '-', mono: true },
          { label: '입금 확인', value: inv.paid_at ? inv.paid_at.slice(0, 10) : '-', mono: true },
        ]
        if (inv.notes) facts.push({ label: '비고', value: inv.notes, prose: true, span: 2 })
        return (
          <RowDetailDialog
            items={facts}
            extra={inv.file_url ? (
              <div style={{ paddingTop: t.density.panelPadY, borderTop: `1px solid ${t.neutrals.line}` }}>
                <a href={inv.file_url} target="_blank" rel="noopener noreferrer" style={{
                  display: 'flex', alignItems: 'center', gap: t.density.gapSm,
                  fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, color: t.brand[700], textDecoration: 'none',
                }}>
                  <LIcon name="file" size={11} stroke={1.8} />
                  세금계산서 PDF
                </a>
              </div>
            ) : undefined}
            foot={
              <LDialogFoot
                left={
                  <div style={{ display: 'flex', gap: t.density.gapSm }}>
                    <LBtn variant="ghost" size="sm" onClick={() => { toggleStatus(inv, 'issued_at'); setSelected(null) }}>
                      {inv.issued_at ? '발행 취소' : '발행 처리'}
                    </LBtn>
                    <LBtn variant="ghost" size="sm" onClick={() => { toggleStatus(inv, 'paid_at'); setSelected(null) }}>
                      {inv.paid_at ? '입금 취소' : '입금 확인'}
                    </LBtn>
                  </div>
                }
                right={<LBtn variant="secondary" size="sm" onClick={() => { setSelected(null); openEdit(inv) }}>수정</LBtn>}
              />
            }
            onClose={() => setSelected(null)}
          />
        )
      })()}

      {/* 수정 — 상세의 수정에서 온다. 삭제는 여기 안에 둔다(사업관리와 같다). */}
      {editInv && (
        <LDialog
          title="세금계산서 수정"
          width={440}
          z={1100}
          onClose={() => setEditInv(null)}
          foot={<LDialogFoot
            left={<span data-danger-action="">
              <LBtn variant="ghost" size="sm" onClick={handleDelete} disabled={saving}>삭제</LBtn>
            </span>}
            right={<>
              <LBtn variant="ghost" size="sm" onClick={() => setEditInv(null)}>취소</LBtn>
              <span data-primary-action="">
                <LBtn variant="brand" size="sm" onClick={handleUpdate} disabled={saving || !editDate || !editAmount}>
                  {saving ? '저장 중...' : '저장'}
                </LBtn>
              </span>
            </>}
          />}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.gapLg }}>
            <Field label="발행일" required>
              <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="금액 (원)" required>
              <input type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="비고">
              <input value={editNotes} onChange={e => setEditNotes(e.target.value)} style={inputStyle} />
            </Field>
          </div>
        </LDialog>
      )}

      {/* 추가 */}
      {addOpen && (
        <LDialog
          title="세금계산서 추가"
          width={440}
          onClose={resetAdd}
          foot={<LDialogFoot right={<>
            <LBtn variant="ghost" size="sm" onClick={resetAdd}>취소</LBtn>
            <span data-primary-action="">
              <LBtn variant="brand" size="sm" onClick={handleCreate} disabled={saving || !addDate || !addAmount}>
                {saving ? '저장 중...' : '저장'}
              </LBtn>
            </span>
          </>} />}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.gapLg }}>
            <Field label="발행일" required>
              <input type="date" value={addDate} onChange={e => setAddDate(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="금액 (원)" required>
              <input type="number" value={addAmount} onChange={e => setAddAmount(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="비고">
              <input value={addNotes} onChange={e => setAddNotes(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="PDF 파일">
              <input type="file" accept=".pdf" onChange={e => setAddFile(e.target.files?.[0] || null)}
                style={{ fontSize: `calc(${t.type.control}px * var(--fz, 1))`, color: t.neutrals.muted }} />
            </Field>
          </div>
        </LDialog>
      )}

      {/* 쪽넘김 줄과 따로 둔다 — 그 줄은 몇 개 중 몇 개인지만 말하고, 이 줄이 어디서 온
          숫자인지를 말한다(CEO 2026-09-15). */}
      <LCardFoot
        left="아크로스 자문료 세금계산서 · 발행·입금은 손으로 찍는다"
        right={`${invoices.length}건`}
        style={{ marginTop: 0, padding: `${t.density.panelPadY}px ${t.density.cardPad}px` }}
      />
    </LCard>
  )
}

/** 폼 한 칸 — 라벨 아래 입력. 사업관리 편집 창과 같은 리듬이다. */
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: `calc(${t.type.control}px * var(--fz, 1))`, fontWeight: t.weight.medium,
        color: t.neutrals.subtle, fontFamily: t.font.sans, marginBottom: t.density.gapSm,
      }}>
        {label}{required && <span style={{ color: t.accent.neg, marginLeft: t.density.tableRowGap }}>*</span>}
      </div>
      {children}
    </div>
  )
}
