'use client'

import { useState, useEffect } from 'react'
import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LBtn } from '@/app/willow-investment/_components/linear-btn'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import { Invoice } from '@/lib/invoice/types'

// ============ Props ============

export interface InvoiceSendDialogProps {
  invoice: Invoice | null  // null = closed
  target: 'etc' | 'bank'
  onClose: () => void
  onSent: () => void
}

// ============ Styles ============

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

// ============ InvoiceSendDialog ============

export function InvoiceSendDialog({ invoice, target, onClose, onSent }: InvoiceSendDialogProps) {
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [scheduled, setScheduled] = useState(false)
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [sending, setSending] = useState(false)

  // Fetch PDF on open
  useEffect(() => {
    if (!invoice) return
    setPdfLoading(true)
    setPdfBlob(null)
    fetch(`/api/invoices/${invoice.id}/pdf`)
      .then(res => res.blob())
      .then(blob => setPdfBlob(blob))
      .catch(() => setPdfBlob(null))
      .finally(() => setPdfLoading(false))
  }, [invoice])

  // Reset form fields on open
  useEffect(() => {
    if (!invoice) return
    const firstItemDesc = invoice.line_items[0]?.description || 'Invoice'

    const etcDefaults = {
      to: 'gstevens@exchangetradedconcepts.com',
      cc: 'accounting@exchangetradedconcepts.com',
      subject: `Willow Investments - ${firstItemDesc}`,
      body: `Hi Garrett,\n\nAttached is my invoice for the ${firstItemDesc}.\n\nPlease let me know if you have any questions.\n\nBest regards,\nDong-Wook Kim\nWillow Investments, Inc.`,
    }

    const bankDefaults = {
      to: 'ysjmto@shinhan.com',
      cc: '',
      subject: `윌로우인베스트먼트 외화인보이스 - ${invoice.invoice_no}`,
      body: `안녕하세요,\n\n첨부 외화인보이스에 대한 외화송금을 요청드립니다.\n\n감사합니다.\n\n윌로우인베스트먼트(주)\n김동욱`,
    }

    const defaults = target === 'etc' ? etcDefaults : bankDefaults
    setTo(defaults.to)
    setCc(defaults.cc)
    setSubject(defaults.subject)
    setBody(defaults.body)
    setScheduled(false)
    setScheduledDate('')
    setScheduledTime('')
  }, [invoice, target])

  if (!invoice) return null

  // ---- Validation ----

  const isScheduledValid = (): boolean => {
    if (!scheduled) return true
    if (!scheduledDate || !scheduledTime) return false
    const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`)
    return scheduledAt > new Date()
  }

  const canSend = !!pdfBlob && to.trim() !== '' && subject.trim() !== '' && isScheduledValid()

  // ---- Send handler ----

  const handleSend = async () => {
    if (!invoice || !pdfBlob) return
    setSending(true)
    try {
      const formData = new FormData()
      formData.append('to', to)
      if (cc.trim()) formData.append('cc', cc)
      formData.append('subject', subject)
      formData.append('body', body)
      formData.append('context', 'default')
      formData.append('attachments', pdfBlob, `${invoice.invoice_no}.pdf`)
      if (scheduled && scheduledDate && scheduledTime) {
        const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`).toISOString()
        formData.append('scheduledAt', scheduledAt)
      }

      const sendRes = await fetch('/api/gmail/send', { method: 'POST', body: formData })
      if (!sendRes.ok) throw new Error('Send failed')
      const sendData = await sendRes.json()

      // Update invoice status
      const patchBody: Record<string, unknown> = {}
      if (target === 'etc') {
        if (scheduled) {
          patchBody.scheduled_etc_email_id = sendData.messageId || sendData.id || 'scheduled'
        } else {
          patchBody.sent_to_etc_at = new Date().toISOString()
        }
      } else {
        if (scheduled) {
          patchBody.scheduled_bank_email_id = sendData.messageId || sendData.id || 'scheduled'
        } else {
          patchBody.sent_to_bank_at = new Date().toISOString()
        }
      }

      await fetch(`/api/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
      })

      onSent()
      onClose()
    } catch (err) {
      alert('발송 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'))
    } finally {
      setSending(false)
    }
  }

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
            인보이스 발송 — {target === 'etc' ? 'ETC' : '은행'}
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
          {/* PDF status */}
          <div style={{
            fontSize: 11,
            fontFamily: t.font.sans,
            color: pdfLoading ? t.neutrals.subtle : pdfBlob ? t.accent.pos : t.accent.neg,
            paddingBottom: 4,
          }}>
            {pdfLoading ? 'PDF 준비 중...' : pdfBlob ? 'PDF 준비 완료 ✓' : 'PDF 로딩 실패'}
          </div>

          {/* To */}
          <div>
            <label style={labelStyle}>To *</label>
            <input
              style={inputStyle}
              type="email"
              value={to}
              onChange={e => setTo(e.target.value)}
              placeholder="recipient@example.com"
            />
          </div>

          {/* CC */}
          <div>
            <label style={labelStyle}>CC</label>
            <input
              style={inputStyle}
              type="email"
              value={cc}
              onChange={e => setCc(e.target.value)}
              placeholder="cc@example.com"
            />
          </div>

          {/* Subject */}
          <div>
            <label style={labelStyle}>제목 *</label>
            <input
              style={inputStyle}
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="이메일 제목"
            />
          </div>

          {/* Body */}
          <div>
            <label style={labelStyle}>본문</label>
            <textarea
              style={{ ...inputStyle, resize: 'vertical' }}
              rows={6}
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="이메일 본문..."
            />
          </div>

          {/* Schedule section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Checkbox row */}
            <label style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 12, fontFamily: t.font.sans, color: t.neutrals.text,
              cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={scheduled}
                onChange={e => setScheduled(e.target.checked)}
                style={{ cursor: 'pointer', accentColor: t.neutrals.text }}
              />
              예약 발송
            </label>

            {/* Date + Time inputs (shown when scheduled) */}
            {scheduled && (
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>날짜 *</label>
                  <input
                    type="date"
                    style={inputStyle}
                    value={scheduledDate}
                    onChange={e => setScheduledDate(e.target.value)}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>시간 *</label>
                  <input
                    type="time"
                    style={inputStyle}
                    value={scheduledTime}
                    onChange={e => setScheduledTime(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Validation error for scheduled time */}
            {scheduled && scheduledDate && scheduledTime && !isScheduledValid() && (
              <div style={{
                fontSize: 11, fontFamily: t.font.sans, color: t.accent.neg,
              }}>
                예약 시간은 현재 시간 이후여야 합니다.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          paddingTop: 14, borderTop: `1px solid ${t.neutrals.line}`,
          marginTop: 10, gap: 6,
        }}>
          <LBtn variant="secondary" size="sm" onClick={onClose} disabled={sending}>
            취소
          </LBtn>
          <LBtn size="sm" onClick={handleSend} disabled={sending || !canSend}>
            {sending ? '발송 중...' : scheduled ? '예약 발송' : '발송'}
          </LBtn>
        </div>
      </div>
    </div>
  )
}
