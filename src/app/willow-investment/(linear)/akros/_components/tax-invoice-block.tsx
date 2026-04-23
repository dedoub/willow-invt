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
  style?: React.CSSProperties
}

const PAGE_SIZE = 8

export function TaxInvoiceBlock({ invoices, onRefresh, style }: TaxInvoiceBlockProps) {
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
    <LCard pad={0} style={style}>
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
                /* Read row — 2-line layout for narrow containers */
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span style={{
                        fontSize: 9, fontFamily: t.font.mono, padding: '2px 6px',
                        borderRadius: t.radius.sm, background: sty.bg, color: sty.fg, fontWeight: 500,
                        flexShrink: 0,
                      }}>{sty.label}</span>
                      <span style={{ fontSize: 11, fontFamily: t.font.mono, color: t.neutrals.subtle, flexShrink: 0 }}>
                        {inv.invoice_date}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      {inv.file_url && (
                        <a href={inv.file_url} target="_blank" rel="noopener noreferrer" style={{ padding: 4, color: t.neutrals.subtle }}>
                          <LIcon name="file" size={12} />
                        </a>
                      )}
                      <button onClick={() => toggleStatus(inv, 'issued_at')} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '2px 5px', borderRadius: t.radius.sm,
                        fontSize: 9, fontFamily: t.font.mono, fontWeight: 500,
                        color: inv.issued_at ? tonePalettes.info.fg : t.neutrals.line,
                        backgroundColor: inv.issued_at ? tonePalettes.info.bg : 'transparent',
                      }}>발행</button>
                      <button onClick={() => toggleStatus(inv, 'paid_at')} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '2px 5px', borderRadius: t.radius.sm,
                        fontSize: 9, fontFamily: t.font.mono, fontWeight: 500,
                        color: inv.paid_at ? tonePalettes.done.fg : t.neutrals.line,
                        backgroundColor: inv.paid_at ? tonePalettes.done.bg : 'transparent',
                      }}>입금</button>
                      <button onClick={() => openEdit(inv)} style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                        color: t.neutrals.subtle,
                      }}>
                        <LIcon name="pencil" size={12} />
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, paddingLeft: 2, minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontFamily: t.font.mono, fontWeight: 500, color: t.neutrals.text, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {inv.amount.toLocaleString()}원
                    </span>
                    {inv.notes && (
                      <span style={{ flex: 1, fontSize: 10, color: t.neutrals.subtle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                        {inv.notes}
                      </span>
                    )}
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
