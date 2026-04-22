'use client'

import { useState, useMemo, useEffect } from 'react'
import { t, useIsMobile } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import { RyuhaBodyRecord } from '@/types/ryuha'

interface GrowthBlockProps {
  records: RyuhaBodyRecord[]
  onSave: (data: { id?: string; record_date: string; height_cm: string; weight_kg: string; notes: string }) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

function SvgLineChart({ records }: { records: RyuhaBodyRecord[] }) {
  const sorted = [...records].sort((a, b) => a.record_date.localeCompare(b.record_date)).slice(-12)
  if (sorted.length < 2) {
    return (
      <div style={{
        height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: t.neutrals.subtle, fontSize: 12,
      }}>데이터가 부족합니다 (2개 이상 필요)</div>
    )
  }

  const W = 300, H = 140, PX = 30, PY = 15
  const chartW = W - PX * 2, chartH = H - PY * 2

  const heights = sorted.map(r => r.height_cm).filter((v): v is number => v !== null)
  const weights = sorted.map(r => r.weight_kg).filter((v): v is number => v !== null)

  const hMin = heights.length > 0 ? Math.min(...heights) - 2 : 0
  const hMax = heights.length > 0 ? Math.max(...heights) + 2 : 1
  const wMin = weights.length > 0 ? Math.min(...weights) - 2 : 0
  const wMax = weights.length > 0 ? Math.max(...weights) + 2 : 1

  const xStep = chartW / (sorted.length - 1)

  const hPoints = sorted.map((r, i) => {
    if (r.height_cm === null) return null
    const x = PX + i * xStep
    const y = PY + chartH - ((r.height_cm - hMin) / (hMax - hMin)) * chartH
    return `${x},${y}`
  }).filter(Boolean).join(' ')

  const wPoints = sorted.map((r, i) => {
    if (r.weight_kg === null) return null
    const x = PX + i * xStep
    const y = PY + chartH - ((r.weight_kg - wMin) / (wMax - wMin)) * chartH
    return `${x},${y}`
  }).filter(Boolean).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 160 }}>
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map(pct => (
        <line key={pct} x1={PX} x2={W - PX} y1={PY + chartH * (1 - pct)} y2={PY + chartH * (1 - pct)}
          stroke={t.neutrals.line} strokeWidth={0.5} />
      ))}
      {/* Height line */}
      {hPoints && <polyline points={hPoints} fill="none" stroke="#6366F1" strokeWidth={1.5} />}
      {/* Weight line */}
      {wPoints && <polyline points={wPoints} fill="none" stroke="#F97316" strokeWidth={1.5} />}
      {/* Dots */}
      {sorted.map((r, i) => {
        const x = PX + i * xStep
        return (
          <g key={i}>
            {r.height_cm !== null && (
              <circle cx={x} cy={PY + chartH - ((r.height_cm - hMin) / (hMax - hMin)) * chartH}
                r={2.5} fill="#6366F1" />
            )}
            {r.weight_kg !== null && (
              <circle cx={x} cy={PY + chartH - ((r.weight_kg - wMin) / (wMax - wMin)) * chartH}
                r={2.5} fill="#F97316" />
            )}
            <text x={x} y={H - 2} textAnchor="middle" fontSize={7} fill={t.neutrals.subtle}
              fontFamily={t.font.mono}>
              {r.record_date.slice(5)}
            </text>
          </g>
        )
      })}
      {/* Y axis labels */}
      <text x={PX - 4} y={PY + 4} textAnchor="end" fontSize={7} fill="#6366F1">{Math.round(hMax)}</text>
      <text x={PX - 4} y={PY + chartH + 4} textAnchor="end" fontSize={7} fill="#6366F1">{Math.round(hMin)}</text>
      <text x={W - PX + 4} y={PY + 4} textAnchor="start" fontSize={7} fill="#F97316">{Math.round(wMax)}</text>
      <text x={W - PX + 4} y={PY + chartH + 4} textAnchor="start" fontSize={7} fill="#F97316">{Math.round(wMin)}</text>
      {/* Legend */}
      <circle cx={PX} cy={6} r={3} fill="#6366F1" />
      <text x={PX + 6} y={9} fontSize={7} fill={t.neutrals.muted}>키(cm)</text>
      <circle cx={PX + 45} cy={6} r={3} fill="#F97316" />
      <text x={PX + 51} y={9} fontSize={7} fill={t.neutrals.muted}>몸무게(kg)</text>
    </svg>
  )
}

export function GrowthBlock({ records, onSave, onDelete }: GrowthBlockProps) {
  const mobile = useIsMobile()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editRecord, setEditRecord] = useState<RyuhaBodyRecord | null>(null)
  const [form, setForm] = useState({ record_date: '', height_cm: '', weight_kg: '', notes: '' })
  const [saving, setSaving] = useState(false)

  const sorted = useMemo(() =>
    [...records].sort((a, b) => b.record_date.localeCompare(a.record_date)),
    [records])

  const openDialog = (record?: RyuhaBodyRecord) => {
    if (record) {
      setEditRecord(record)
      setForm({
        record_date: record.record_date,
        height_cm: record.height_cm?.toString() || '',
        weight_kg: record.weight_kg?.toString() || '',
        notes: record.notes || '',
      })
    } else {
      setEditRecord(null)
      const today = new Date()
      setForm({
        record_date: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
        height_cm: '', weight_kg: '', notes: '',
      })
    }
    setDialogOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({ id: editRecord?.id, ...form })
      setDialogOpen(false)
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!editRecord) return
    setSaving(true)
    try { await onDelete(editRecord.id); setDialogOpen(false) }
    finally { setSaving(false) }
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11, color: t.neutrals.subtle, marginBottom: 4, display: 'block',
  }
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 8px', borderRadius: t.radius.sm,
    border: 'none', background: t.neutrals.inner,
    fontSize: 12, fontFamily: t.font.sans, color: t.neutrals.text, outline: 'none',
  }

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: 14 }}>
        {/* Chart */}
        <LCard>
          <LSectionHead eyebrow="GROWTH" title="성장기록" action={
            <button onClick={() => openDialog()} style={{
              padding: '4px 10px', borderRadius: t.radius.sm,
              background: t.neutrals.inner, border: 'none',
              fontSize: 11, cursor: 'pointer', color: t.neutrals.muted,
              display: 'flex', alignItems: 'center', gap: 3,
            }}>
              <LIcon name="plus" size={11} stroke={2} /> 기록
            </button>
          } />
          <SvgLineChart records={records} />
        </LCard>

        {/* Table */}
        <LCard pad={0}>
          <div style={{ padding: t.density.cardPad, paddingBottom: 8 }}>
            <LSectionHead eyebrow="RECORDS" title="측정 기록" action={
              <span style={{ fontSize: 11, fontFamily: t.font.mono, color: t.neutrals.muted }}>
                {records.length}건
              </span>
            } />
          </div>
          {/* Header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '80px 60px 60px 1fr',
            gap: 8, padding: '6px 14px', fontSize: 10, fontWeight: t.weight.semibold,
            color: t.neutrals.subtle, fontFamily: t.font.mono, textTransform: 'uppercase' as const,
          }}>
            <span>날짜</span><span>키</span><span>몸무게</span><span>메모</span>
          </div>
          <div style={{ maxHeight: 200, overflow: 'auto' }}>
            {sorted.slice(0, 20).map(r => (
              <div key={r.id} onClick={() => openDialog(r)} style={{
                display: 'grid', gridTemplateColumns: '80px 60px 60px 1fr',
                gap: 8, padding: '7px 14px', alignItems: 'center',
                borderTop: `1px solid ${t.neutrals.line}`,
                fontSize: 12, cursor: 'pointer',
              }}>
                <span style={{ fontFamily: t.font.mono, fontSize: 11, color: t.neutrals.muted }}>
                  {r.record_date.slice(5)}
                </span>
                <span style={{ fontFamily: t.font.mono, fontVariantNumeric: 'tabular-nums' }}>
                  {r.height_cm ?? '-'}
                </span>
                <span style={{ fontFamily: t.font.mono, fontVariantNumeric: 'tabular-nums' }}>
                  {r.weight_kg ?? '-'}
                </span>
                <span style={{ color: t.neutrals.subtle, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.notes || ''}
                </span>
              </div>
            ))}
          </div>
        </LCard>
      </div>

      {/* Dialog */}
      {dialogOpen && (
        <div onClick={() => setDialogOpen(false)} style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: t.neutrals.card, borderRadius: t.radius.lg,
            width: '100%', maxWidth: 380, fontFamily: t.font.sans,
          }}>
            <div style={{
              padding: '14px 16px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', borderBottom: `1px solid ${t.neutrals.line}`,
            }}>
              <span style={{ fontSize: 15, fontWeight: t.weight.semibold }}>
                {editRecord ? '기록 수정' : '새 기록'}
              </span>
              <button onClick={() => setDialogOpen(false)} style={{
                background: 'none', border: 'none', cursor: 'pointer', color: t.neutrals.subtle, padding: 4,
              }}><LIcon name="x" size={16} /></button>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelStyle}>날짜 *</label>
                <input type="date" value={form.record_date}
                  onChange={e => setForm({ ...form, record_date: e.target.value })}
                  style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={labelStyle}>키 (cm)</label>
                  <input value={form.height_cm}
                    onChange={e => setForm({ ...form, height_cm: e.target.value })}
                    placeholder="예: 142.5" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>몸무게 (kg)</label>
                  <input value={form.weight_kg}
                    onChange={e => setForm({ ...form, weight_kg: e.target.value })}
                    placeholder="예: 38.2" style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>메모</label>
                <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  placeholder="메모" style={inputStyle} />
              </div>
            </div>
            <div style={{
              padding: '12px 16px', borderTop: `1px solid ${t.neutrals.line}`,
              display: 'flex', justifyContent: 'space-between',
            }}>
              {editRecord ? (
                <button onClick={handleDelete} disabled={saving} style={{
                  padding: '6px 12px', borderRadius: t.radius.sm,
                  background: '#FEE2E2', border: 'none', fontSize: 12,
                  color: t.accent.neg, cursor: 'pointer', fontWeight: t.weight.medium,
                }}>삭제</button>
              ) : <div />}
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setDialogOpen(false)} style={{
                  padding: '6px 14px', borderRadius: t.radius.sm,
                  background: t.neutrals.inner, border: 'none', fontSize: 12,
                  color: t.neutrals.muted, cursor: 'pointer',
                }}>취소</button>
                <button onClick={handleSave} disabled={saving} style={{
                  padding: '6px 14px', borderRadius: t.radius.sm,
                  background: t.brand[600], border: 'none', fontSize: 12,
                  color: '#fff', cursor: 'pointer', fontWeight: t.weight.medium,
                  opacity: saving ? 0.5 : 1,
                }}>{saving ? '저장중...' : '저장'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
