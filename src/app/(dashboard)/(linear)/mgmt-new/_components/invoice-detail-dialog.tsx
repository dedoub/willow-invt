'use client'

import { t } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'

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

type Field = {
  label: string
  value: string
  tone?: 'pos' | 'neg'
  mono?: boolean
  prose?: boolean
  span?: number
}

/**
 * 거래 상세 — 별도 모달 문법을 두지 않고 섹션 카드를 그대로 띄운다.
 * 껍데기는 LCard, 제목줄은 LSectionHead, 본문은 카드 지표와 같은 라벨/값 격자,
 * 하단은 카드 푸터. 회색 판·상자선 같은 모달 전용 장식은 쓰지 않는다(CEO 2026-09-10).
 */
export function InvoiceDetailDialogNew({ invoice, onClose, onDelete, onEdit }: Props) {
  if (!invoice) return null

  const isIncome = invoice.type === 'revenue' || invoice.type === 'asset'
  const cols = 2

  // 표의 열 순서를 그대로 따른다 — 행에서 본 것을 같은 순서로 다시 읽게(CEO 2026-09-10)
  const facts: Field[] = [
    { label: '구분', value: TYPE_LABELS[invoice.type] ?? invoice.type },
    {
      label: '금액',
      value: `${isIncome ? '+' : '-'}${Math.abs(invoice.amount).toLocaleString()}원`,
      tone: isIncome ? 'pos' : 'neg',
      mono: true,
    },
    { label: '날짜', value: invoice.payment_date || invoice.issue_date || '-', mono: true },
    { label: '거래처', value: invoice.counterparty },
  ]
  // 마지막 줄이 덜 찼으면 남은 칸까지 늘린다 — 안 그러면 그 위 구분선이 반만 그어진다
  if (facts.length % cols !== 0) facts[facts.length - 1].span = cols
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

        <div style={{ padding: `0 ${t.density.cardPad}px`, display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
          {facts.map((f, i) => (
            <div key={f.label} style={{
              padding: `${t.density.panelPadY}px ${t.density.panelPadX}px`,
              minWidth: 0, display: 'flex', flexDirection: 'column', gap: t.density.tableRowGap,
              borderTop: i >= cols ? `1px solid ${t.neutrals.line}` : undefined,
              gridColumn: f.span && f.span > 1 ? '1 / -1' : undefined,
            }}>
              <span style={{ fontSize: `calc(${t.type.label}px * var(--fz, 1))`, color: t.neutrals.subtle, whiteSpace: 'nowrap' }}>
                {f.label}
              </span>
              <span style={{
                fontSize: `calc(${t.type.body}px * var(--fz, 1))`,
                fontWeight: f.prose ? t.weight.regular : t.weight.semibold,
                fontFamily: f.mono ? t.font.mono : t.font.sans,
                fontVariantNumeric: f.mono ? 'tabular-nums' : undefined,
                color: f.tone === 'pos' ? t.accent.pos : f.tone === 'neg' ? t.accent.neg : t.neutrals.text,
                lineHeight: f.prose ? 1.6 : 1.3,
                whiteSpace: f.prose ? 'pre-wrap' : 'nowrap',
                overflow: f.prose ? undefined : 'hidden', textOverflow: f.prose ? undefined : 'ellipsis',
              }}>
                {f.value}
              </span>
            </div>
          ))}
        </div>

        <div data-card-foot="" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: t.density.gapSm,
          margin: `${t.density.gapMd}px ${t.density.cardPad}px 0`, paddingTop: t.density.panelPadY,
          paddingBottom: t.density.cardPad,
        }}>
          <LBtn variant="ghost" size="sm" onClick={() => { onDelete(invoice.id); onClose() }}>삭제</LBtn>
          <LBtn variant="secondary" size="sm" onClick={() => { onEdit(invoice); onClose() }}>수정</LBtn>
        </div>
      </LCard>
    </div>
  )
}
