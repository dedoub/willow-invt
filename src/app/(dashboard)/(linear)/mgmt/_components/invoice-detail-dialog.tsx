'use client'

import { t } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { FigureGrid, type FigureItem } from './figure-grid'

interface Invoice {
  id: string
  type: 'revenue' | 'expense' | 'asset' | 'liability' | 'transfer' | 'exchange'
  counterparty: string
  description: string | null
  amount: number
  issue_date: string | null
  payment_date: string | null
  status: string
}

interface Props {
  invoice: Invoice | null
  onClose: () => void
  onDelete: (id: string) => void
  onEdit: (invoice: Invoice) => void
}

const TYPE_LABELS: Record<string, string> = {
  revenue: '매출', expense: '비용', asset: '자산', liability: '부채', transfer: '대체', exchange: '환전',
}

/**
 * 거래 상세 — 별도 모달 문법을 두지 않고 섹션 카드를 그대로 띄운다.
 * 껍데기는 LCard, 제목줄은 LSectionHead, 본문은 카드 지표와 같은 라벨/값 격자,
 * 하단은 카드 푸터. 회색 판·상자선 같은 모달 전용 장식은 쓰지 않는다(CEO 2026-09-10).
 */
export function InvoiceDetailDialog({ invoice, onClose, onDelete, onEdit }: Props) {
  if (!invoice) return null

  const isIncome = invoice.type === 'revenue' || invoice.type === 'asset'
  const cols = 2

  // 표의 열 순서를 그대로 따른다 — 행에서 본 것을 같은 순서로 다시 읽게(CEO 2026-09-10)
  const facts: FigureItem[] = [
    { label: '구분', value: TYPE_LABELS[invoice.type] ?? invoice.type },
    { label: '날짜', value: invoice.payment_date || invoice.issue_date || '-', mono: true },
    { label: '거래처', value: invoice.counterparty, wrap: true },
    {
      label: '금액',
      value: `${isIncome ? '+' : '-'}${Math.abs(invoice.amount).toLocaleString()}원`,
      tone: isIncome ? 'pos' : 'neg',
      mono: true,
    },
  ]
  if (invoice.description) facts.push({ label: '적요', value: invoice.description, prose: true, span: cols })

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: t.density.pagePadX,
    }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,15,18,0.18)', backdropFilter: 'blur(3px)' }} />

      <LCard pad={0} style={{ position: 'relative', width: 420, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
        {/* 제목 없이 닫기만 — 거래처가 아래 항목에 있어 제목이 같은 말을 반복했다(CEO 2026-09-10) */}
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
          <FigureGrid items={facts} cols={cols} />
        </div>

        <div data-card-foot="" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: t.density.gapSm,
          margin: `${t.density.gapMd}px ${t.density.cardPad}px 0`, paddingTop: t.density.panelPadY,
          paddingBottom: t.density.cardPad,
        }}>
          <span data-danger-action=""><LBtn variant="ghost" size="sm" onClick={() => { onDelete(invoice.id); onClose() }}>삭제</LBtn></span>
          <LBtn variant="secondary" size="sm" onClick={() => { onEdit(invoice); onClose() }}>수정</LBtn>
        </div>
      </LCard>
    </div>
  )
}
