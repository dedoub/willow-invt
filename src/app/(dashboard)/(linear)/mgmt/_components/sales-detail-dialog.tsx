'use client'

import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { FigureGrid, type FigureItem } from './figure-grid'

/** 표 행이 그대로 들어온다 — sales-block의 SalesRow가 이 모양을 만족한다 */
export interface SalesDetailRow {
  source: 'tax' | 'etc'
  sourceLabel: string
  date: string
  counterparty: string
  detail: string
  amount: number
  currency: string
  krw: number
  regNumber: string | null
  issuedAt: string | null
  extra: Array<{ label: string; value: string; mono?: boolean }>
}

interface Props {
  row: SalesDetailRow | null
  usdRate: number
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
}

/**
 * 매출 상세 — 거래 상세와 같은 문법. 카드를 그대로 띄우고 표의 열 순서로 읽힌다.
 * 행 안에서 펼치면 표가 밀려 흐름이 끊겨 모달로 뺐다(CEO 2026-09-10).
 */
export function SalesDetailDialog({ row, usdRate, onClose, onEdit, onDelete }: Props) {
  const mobile = useIsMobile()
  if (!row) return null

  const cols = 2
  const foreign = row.currency !== 'KRW'
  const amount = foreign
    ? `$${row.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : `${row.amount.toLocaleString()}원`

  const facts: FigureItem[] = [
    { label: '구분', value: row.sourceLabel },
    { label: '작성일', value: row.date, mono: true },
    { label: '거래처', value: row.counterparty, wrap: true },
    { label: '합계', value: amount, mono: true },
  ]
  if (row.detail) facts.push({ label: '품목', value: row.detail, prose: true, span: cols })

  const extras: FigureItem[] = []
  if (row.regNumber) extras.push({ label: '사업자번호', value: row.regNumber, mono: true })
  extras.push({ label: '발행일', value: row.issuedAt ?? '-', mono: true })
  if (foreign && usdRate > 0) extras.push({ label: '원화 환산', value: `${Math.round(row.krw).toLocaleString()}원`, mono: true })
  for (const item of row.extra) extras.push({ label: item.label, value: item.value, mono: item.mono })

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: t.density.pagePadX,
    }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,15,18,0.18)', backdropFilter: 'blur(3px)' }} />

      <LCard pad={0} style={{
        position: 'relative', width: mobile ? '100%' : 460, maxWidth: '100%',
        maxHeight: '85vh', overflowY: 'auto',
      }}>
        {/* 제목 없이 닫기만 — 거래처가 아래 항목에 있다 */}
        <div style={{
          padding: `${t.density.gapSm}px ${t.density.gapSm}px 0`,
          display: 'flex', justifyContent: 'flex-end',
        }}>
          <button onClick={onClose} title="닫기" style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: t.density.gapXs, borderRadius: t.radius.sm, color: t.neutrals.muted,
            display: 'flex', alignItems: 'center',
          }}>
            <LIcon name="x" size={14} stroke={2} />
          </button>
        </div>

        <div style={{ padding: `0 ${t.density.cardPad}px` }}>
          <FigureGrid items={[...facts, ...extras]} cols={cols} />
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: t.density.gapSm,
          margin: `${t.density.gapMd}px ${t.density.cardPad}px 0`, paddingBottom: t.density.cardPad,
        }}>
          <span data-danger-action=""><LBtn variant="ghost" size="sm" onClick={onDelete}>삭제</LBtn></span>
          <LBtn variant="secondary" size="sm" onClick={onEdit}>수정</LBtn>
        </div>

      </LCard>
    </div>
  )
}
