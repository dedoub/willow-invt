'use client'

import { useState, useMemo } from 'react'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead, LHeadBtn } from '@/app/(dashboard)/_components/linear-section-head'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { LTableScroll } from '@/app/(dashboard)/_components/linear-table'
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
        height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: t.neutrals.subtle, fontSize: 'calc(12px * var(--fz, 1))',
      }}>데이터가 부족합니다 (2개 이상 필요)</div>
    )
  }

  const W = 520, H = 280, PX = 40, PY = 16
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
    // viewBox 비율대로 높이가 정해지게 둔다(height:auto). 고정 높이를 주면 비율이 안 맞는
    // 만큼 좌우가 레터박스로 비어 카드 안에 흰 띠가 생긴다 — 예전 300x140 을 160px 높이에
    // 넣어서 그랬다. display:block 은 인라인 요소의 baseline 여백을 없앤다.
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map(pct => (
        <line key={pct} x1={PX} x2={W - PX} y1={PY + chartH * (1 - pct)} y2={PY + chartH * (1 - pct)}
          stroke={t.neutrals.line} strokeWidth={1} />
      ))}
      {/* Height line */}
      {hPoints && <polyline points={hPoints} fill="none" stroke="#6366F1" strokeWidth={2.5} />}
      {/* Weight line */}
      {wPoints && <polyline points={wPoints} fill="none" stroke="#F97316" strokeWidth={2.5} />}
      {/* Dots */}
      {sorted.map((r, i) => {
        const x = PX + i * xStep
        return (
          <g key={i}>
            {r.height_cm !== null && (
              <circle cx={x} cy={PY + chartH - ((r.height_cm - hMin) / (hMax - hMin)) * chartH}
                r={4} fill="#6366F1" />
            )}
            {r.weight_kg !== null && (
              <circle cx={x} cy={PY + chartH - ((r.weight_kg - wMin) / (wMax - wMin)) * chartH}
                r={4} fill="#F97316" />
            )}
            <text x={x} y={H - 5} textAnchor="middle" fontSize={11} fill={t.neutrals.subtle}
              fontFamily={t.font.mono}>
              {r.record_date.slice(5)}
            </text>
          </g>
        )
      })}
      {/* Y axis labels */}
      <text x={PX - 6} y={PY + 5} textAnchor="end" fontSize={11} fill="#6366F1">{Math.round(hMax)}</text>
      <text x={PX - 6} y={PY + chartH + 5} textAnchor="end" fontSize={11} fill="#6366F1">{Math.round(hMin)}</text>
      <text x={W - PX + 6} y={PY + 5} textAnchor="start" fontSize={11} fill="#F97316">{Math.round(wMax)}</text>
      <text x={W - PX + 6} y={PY + chartH + 5} textAnchor="start" fontSize={11} fill="#F97316">{Math.round(wMin)}</text>
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
  // 범례 칩에 붙일 최신 측정치 (sorted 는 최신순)
  const latest = sorted[0] ?? null

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
    fontSize: 'calc(11px * var(--fz, 1))', color: t.neutrals.subtle, marginBottom: 4, display: 'block',
  }
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 8px', borderRadius: t.radius.sm,
    border: 'none', background: t.neutrals.inner,
    fontSize: 'calc(12px * var(--fz, 1))', fontFamily: t.font.sans, color: t.neutrals.text, outline: 'none',
  }

  return (
    <>
      {/*
        성장기록과 측정 기록은 같은 걸 두 방식으로 보는 것이라 한 카드에 둔다(2026-08-31, CEO).
        구조는 보이스카드 페이지와 같은 축이다 — LCard(pad 0) > 섹션 헤드 > inner 패널들.
        PC 는 좌 차트 / 우 표, 모바일은 세로로 쌓는다.
      */}
      <LCard pad={0}>
        <div style={{ padding: `12px ${t.density.cardPad}px 12px` }}>
          <LSectionHead
            eyebrow="GROWTH"
            title="성장기록"
            mb={10}
            action={<LHeadBtn icon="plus" label="기록" title="측정 기록 추가" onClick={() => openDialog()} />}
          />

          <div style={{
            display: 'grid',
            gridTemplateColumns: mobile ? 'minmax(0,1fr)' : 'minmax(0,1fr) minmax(0,1fr)',
            gap: 8, alignItems: 'stretch',
          }}>
            {/* 좌: 추이 */}
            <div style={{
              background: t.neutrals.inner, borderRadius: t.radius.sm, padding: '8px 10px',
              height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 4, marginBottom: 6, flexWrap: 'wrap' as const, rowGap: 3,
              }}>
                <div style={{
                  fontSize: 'calc(9.5px * var(--fz, 1))', fontFamily: t.font.mono, letterSpacing: 0.8,
                  textTransform: 'uppercase' as const, color: t.neutrals.subtle, whiteSpace: 'nowrap' as const,
                }}>
                  성장 추이
                </div>
                {/* 범례는 SVG 밖 칩으로 — 최신값을 같이 읽고, 차트는 그만큼 넓게 쓴다 */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  flexWrap: 'wrap' as const, justifyContent: 'flex-end', rowGap: 3, minWidth: 0,
                  fontSize: 'calc(9px * var(--fz, 1))', fontFamily: t.font.mono,
                }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: t.neutrals.muted, whiteSpace: 'nowrap' as const }}>
                    <span style={{ width: 10, height: 2, borderRadius: 1, background: '#6366F1' }} />
                    키 {latest?.height_cm ?? '-'}cm
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: t.neutrals.muted, whiteSpace: 'nowrap' as const }}>
                    <span style={{ width: 10, height: 2, borderRadius: 1, background: '#F97316' }} />
                    몸무게 {latest?.weight_kg ?? '-'}kg
                  </span>
                </div>
              </div>
              <SvgLineChart records={records} />
            </div>

            {/* 우: 측정 기록 */}
            <div style={{
              background: t.neutrals.inner, borderRadius: t.radius.sm, padding: '8px 0 0',
              height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 4, marginBottom: 6, padding: '0 10px',
              }}>
                <div style={{
                  fontSize: 'calc(9.5px * var(--fz, 1))', fontFamily: t.font.mono, letterSpacing: 0.8,
                  textTransform: 'uppercase' as const, color: t.neutrals.subtle, whiteSpace: 'nowrap' as const,
                }}>
                  측정 기록
                </div>
                <span style={{ fontSize: 'calc(9px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted }}>
                  {records.length}건
                </span>
              </div>

              {/* 헤더는 본문과 함께 가로 스크롤시켜야 좁은 화면에서 열이 어긋나지 않는다 */}
              <LTableScroll minWidth={360}>
                <div style={{
                  display: 'grid', gridTemplateColumns: '72px 56px 56px 1fr',
                  gap: 8, padding: '0 10px 5px', fontSize: 'calc(9px * var(--fz, 1))', fontWeight: t.weight.semibold,
                  color: t.neutrals.subtle, fontFamily: t.font.mono, textTransform: 'uppercase' as const,
                }}>
                  <span>날짜</span><span>키</span><span>몸무게</span><span>메모</span>
                </div>
                <div style={{ maxHeight: mobile ? 200 : 232, overflowY: 'auto' }}>
                  {sorted.slice(0, 20).map(r => (
                    <div key={r.id} onClick={() => openDialog(r)} style={{
                      display: 'grid', gridTemplateColumns: '72px 56px 56px 1fr',
                      gap: 8, padding: '6px 10px', alignItems: 'center',
                      borderTop: `1px solid ${t.neutrals.line}`,
                      fontSize: 'calc(11.5px * var(--fz, 1))', cursor: 'pointer',
                    }}>
                      <span style={{ fontFamily: t.font.mono, fontSize: 'calc(10.5px * var(--fz, 1))', color: t.neutrals.muted }}>
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
              </LTableScroll>
            </div>
          </div>
        </div>
      </LCard>

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
              <span style={{ fontSize: 'calc(15px * var(--fz, 1))', fontWeight: t.weight.semibold }}>
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
                  background: '#FEE2E2', border: 'none', fontSize: 'calc(12px * var(--fz, 1))',
                  color: t.accent.neg, cursor: 'pointer', fontWeight: t.weight.medium,
                }}>삭제</button>
              ) : <div />}
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setDialogOpen(false)} style={{
                  padding: '6px 14px', borderRadius: t.radius.sm,
                  background: t.neutrals.inner, border: 'none', fontSize: 'calc(12px * var(--fz, 1))',
                  color: t.neutrals.muted, cursor: 'pointer',
                }}>취소</button>
                <button onClick={handleSave} disabled={saving} style={{
                  padding: '6px 14px', borderRadius: t.radius.sm,
                  background: t.brand[600], border: 'none', fontSize: 'calc(12px * var(--fz, 1))',
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
