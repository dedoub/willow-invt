'use client'

import { useState, useEffect } from 'react'
import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LBtn } from '@/app/willow-investment/_components/linear-btn'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import { Invoice, InvoiceItemType } from '@/lib/invoice/types'
import { DEFAULT_CLIENT, MONTH_NAMES, formatItemDescription, ITEM_TEMPLATES } from '@/lib/invoice/constants'

// ============ Types ============

interface LineItemState {
  type: InvoiceItemType
  month: number    // 0-11 index
  year: number     // e.g. 2026
  description: string
  amount: string   // string for input, parsed to number on save
}

export interface InvoiceDialogProps {
  open: boolean
  editInvoice: Invoice | null  // null = create mode
  onClose: () => void
  onSaved: () => void
}

// ============ Helpers ============

function detectItemType(description: string): InvoiceItemType {
  if (description.startsWith('Monthly Fee -')) return 'monthly_fee'
  if (description.startsWith('Referral Fee -')) return 'referral_fee'
  return 'custom'
}

function parseLineItemState(description: string, amount: number): LineItemState {
  const now = new Date()
  const type = detectItemType(description)

  if (type === 'custom') {
    return { type, month: now.getMonth(), year: now.getFullYear(), description, amount: String(amount) }
  }

  // Try to extract month/year from description suffix: "Monthly Fee - March 2026"
  const parts = description.split(' - ')
  const suffix = parts[1] ?? ''
  const tokens = suffix.trim().split(' ')
  const monthName = tokens[0]
  const year = parseInt(tokens[1], 10) || now.getFullYear()
  const monthIndex = MONTH_NAMES.indexOf(monthName as typeof MONTH_NAMES[number])
  const month = monthIndex >= 0 ? monthIndex : now.getMonth()

  return { type, month, year, description, amount: String(amount) }
}

function buildDefaultItem(): LineItemState {
  const now = new Date()
  const month = now.getMonth()
  const year = now.getFullYear()
  const template = ITEM_TEMPLATES[0]
  return {
    type: 'monthly_fee',
    month,
    year,
    description: formatItemDescription(template.descriptionTemplate, month, year),
    amount: '',
  }
}

// ============ InvoiceDialog ============

export function InvoiceDialog({ open, editInvoice, onClose, onSaved }: InvoiceDialogProps) {
  const [invoiceDate, setInvoiceDate] = useState('')
  const [attention, setAttention] = useState<string>(DEFAULT_CLIENT.attention)
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<LineItemState[]>([buildDefaultItem()])
  const [saving, setSaving] = useState(false)

  // Populate form on open
  useEffect(() => {
    if (!open) return
    if (editInvoice) {
      setInvoiceDate(editInvoice.invoice_date)
      setAttention(editInvoice.attention)
      setNotes(editInvoice.notes ?? '')
      const parsed = editInvoice.line_items.map(li => parseLineItemState(li.description, li.amount))
      setItems(parsed.length > 0 ? parsed : [buildDefaultItem()])
    } else {
      const today = new Date().toISOString().slice(0, 10)
      setInvoiceDate(today)
      setAttention(DEFAULT_CLIENT.attention)
      setNotes('')
      setItems([buildDefaultItem()])
    }
  }, [open, editInvoice])

  if (!open) return null

  // ---- Styles ----

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 8px',
    borderRadius: t.radius.sm,
    border: 'none',
    background: t.neutrals.inner,
    fontSize: 12,
    fontFamily: t.font.sans,
    color: t.neutrals.text,
    outline: 'none',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 11,
    color: t.neutrals.subtle,
    fontFamily: t.font.sans,
    marginBottom: 4,
  }

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 8px center',
    paddingRight: 24,
  }

  // ---- Line item handlers ----

  const updateItem = (idx: number, patch: Partial<LineItemState>) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item
      const next = { ...item, ...patch }
      // Auto-regenerate description when type/month/year changes
      if ('type' in patch || 'month' in patch || 'year' in patch) {
        const template = ITEM_TEMPLATES.find(t => t.type === next.type)
        if (template && next.type !== 'custom') {
          next.description = formatItemDescription(template.descriptionTemplate, next.month, next.year)
        }
      }
      return next
    }))
  }

  const addItem = () => {
    setItems(prev => [...prev, buildDefaultItem()])
  }

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  // ---- Computed total ----

  const total = items.reduce((sum, item) => {
    const v = parseFloat(item.amount)
    return sum + (isNaN(v) ? 0 : v)
  }, 0)

  // ---- Save / Delete ----

  const handleSave = async () => {
    if (!invoiceDate || items.length === 0) return
    setSaving(true)
    try {
      const lineItems = items.map(item => ({
        description: item.description,
        amount: parseFloat(item.amount) || 0,
      }))

      const body = {
        invoice_date: invoiceDate,
        bill_to_company: DEFAULT_CLIENT.company,
        attention: attention.trim(),
        line_items: lineItems,
        notes: notes.trim() || undefined,
      }

      if (editInvoice) {
        await fetch(`/api/invoices/${editInvoice.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      } else {
        await fetch('/api/invoices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }

      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!editInvoice) return
    if (!confirm(`${editInvoice.invoice_no} 인보이스를 삭제하시겠습니까?`)) return
    setSaving(true)
    try {
      await fetch(`/api/invoices/${editInvoice.id}`, { method: 'DELETE' })
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const canSave = invoiceDate && attention.trim() && items.length > 0 &&
    items.every(item => item.description.trim() && item.amount !== '')

  // ---- Render ----

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.35)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: t.neutrals.card,
          borderRadius: t.radius.lg,
          width: '100%',
          maxWidth: 520,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingBottom: 14,
          borderBottom: `1px solid ${t.neutrals.line}`,
        }}>
          <span style={{
            fontSize: 14, fontWeight: t.weight.semibold,
            fontFamily: t.font.sans, color: t.neutrals.text,
          }}>
            {editInvoice ? '인보이스 수정' : '인보이스 추가'}
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 4, color: t.neutrals.subtle, display: 'flex', alignItems: 'center',
              borderRadius: t.radius.sm,
            }}
          >
            <LIcon name="x" size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{
          flex: 1, overflowY: 'auto', maxHeight: '70vh',
          paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {/* Invoice Date */}
          <div>
            <label style={labelStyle}>Invoice Date *</label>
            <input
              type="date"
              style={inputStyle}
              value={invoiceDate}
              onChange={e => setInvoiceDate(e.target.value)}
            />
          </div>

          {/* Attention */}
          <div>
            <label style={labelStyle}>Attention *</label>
            <input
              style={inputStyle}
              value={attention}
              onChange={e => setAttention(e.target.value)}
              placeholder="Garrett Stevens"
            />
          </div>

          {/* Notes */}
          <div>
            <label style={labelStyle}>Notes</label>
            <textarea
              style={{ ...inputStyle, resize: 'vertical' }}
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="메모..."
            />
          </div>

          {/* Line Items */}
          <div>
            <label style={labelStyle}>항목 *</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    background: t.neutrals.inner,
                    borderRadius: t.radius.sm,
                    padding: '10px 10px 8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  {/* Row 1: type | month | year | amount | remove */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {/* Type select */}
                    <div style={{ flex: '0 0 110px' }}>
                      <select
                        style={{ ...selectStyle, width: '100%', background: t.neutrals.card }}
                        value={item.type}
                        onChange={e => updateItem(idx, { type: e.target.value as InvoiceItemType })}
                      >
                        {ITEM_TEMPLATES.map(tmpl => (
                          <option key={tmpl.type} value={tmpl.type}>{tmpl.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Month select (hidden for custom) */}
                    {item.type !== 'custom' && (
                      <div style={{ flex: '0 0 90px' }}>
                        <select
                          style={{ ...selectStyle, width: '100%', background: t.neutrals.card }}
                          value={item.month}
                          onChange={e => updateItem(idx, { month: parseInt(e.target.value, 10) })}
                        >
                          {MONTH_NAMES.map((name, mi) => (
                            <option key={mi} value={mi}>{name.slice(0, 3)}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Year input (hidden for custom) */}
                    {item.type !== 'custom' && (
                      <div style={{ flex: '0 0 60px' }}>
                        <input
                          type="number"
                          style={{ ...inputStyle, width: '100%', background: t.neutrals.card, fontFamily: t.font.mono }}
                          value={item.year}
                          onChange={e => updateItem(idx, { year: parseInt(e.target.value, 10) || new Date().getFullYear() })}
                          min={2020}
                          max={2099}
                        />
                      </div>
                    )}

                    {/* Amount input */}
                    <div style={{ flex: 1 }}>
                      <input
                        type="number"
                        style={{ ...inputStyle, width: '100%', background: t.neutrals.card, fontFamily: t.font.mono, textAlign: 'right' }}
                        value={item.amount}
                        onChange={e => updateItem(idx, { amount: e.target.value })}
                        placeholder="0.00"
                        min={0}
                        step={0.01}
                      />
                    </div>

                    {/* Remove button */}
                    <button
                      onClick={() => removeItem(idx)}
                      disabled={items.length === 1}
                      style={{
                        background: 'none', border: 'none',
                        cursor: items.length === 1 ? 'default' : 'pointer',
                        padding: 4,
                        color: items.length === 1 ? t.neutrals.line : t.neutrals.subtle,
                        display: 'flex', alignItems: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <LIcon name="x" size={13} />
                    </button>
                  </div>

                  {/* Row 2: description (auto or free text) */}
                  <div>
                    {item.type === 'custom' ? (
                      <input
                        style={{ ...inputStyle, background: t.neutrals.card, fontSize: 11 }}
                        value={item.description}
                        onChange={e => updateItem(idx, { description: e.target.value })}
                        placeholder="항목 설명을 입력하세요"
                      />
                    ) : (
                      <span style={{
                        fontSize: 11,
                        color: t.neutrals.muted,
                        fontFamily: t.font.sans,
                        paddingLeft: 2,
                      }}>
                        {item.description}
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {/* Add item button */}
              <button
                onClick={addItem}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 11, fontFamily: t.font.sans, color: t.brand[500],
                  padding: '4px 0', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <LIcon name="plus" size={12} color={t.brand[500]} />
                항목 추가
              </button>
            </div>
          </div>
        </div>

        {/* Total */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end',
          paddingTop: 12,
          fontSize: 13,
          fontFamily: t.font.mono,
          fontWeight: t.weight.semibold,
          color: t.neutrals.text,
        }}>
          합계: ${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: 14, borderTop: `1px solid ${t.neutrals.line}`,
          marginTop: 10,
        }}>
          {editInvoice ? (
            <LBtn variant="danger" size="sm" onClick={handleDelete} disabled={saving}>
              삭제
            </LBtn>
          ) : (
            <div />
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <LBtn variant="secondary" size="sm" onClick={onClose} disabled={saving}>
              취소
            </LBtn>
            <LBtn size="sm" onClick={handleSave} disabled={saving || !canSave}>
              {saving ? '저장 중...' : '저장'}
            </LBtn>
          </div>
        </div>
      </div>
    </div>
  )
}
