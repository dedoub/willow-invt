'use client'

import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { FigureGrid, type FigureItem } from './figure-grid'
import type { FinanceTaxObligation } from '@/types/finance-tax'

const SOURCES: Record<string, string> = { hometax: '홈택스', wetax: '위택스', nhis: '4대보험' }
const STATUS_LABELS: Record<string, string> = { unpaid: '납부예정', paid: '납부완료', overdue: '연체', cancelled: '취소' }
const MATCH_LABELS: Record<string, string> = { exact: '은행 출금 자동 매칭', manual: '수기 매칭' }

// 수집기가 넣는 세목 키를 사람이 읽는 말로. 모르는 값은 그대로 보여준다.
const TYPE_LABELS: Record<string, string> = {
  vat: '부가가치세',
  national_tax: '국세',
  local_tax: '지방세',
  health_insurance: '건강보험',
  pension: '국민연금',
  employment_insurance: '고용보험',
  industrial_accident: '산재보험',
}

interface Props {
  obligation: FinanceTaxObligation | null
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
}

/**
 * 고지 상세 — 표의 열 순서대로 읽고, 행에 못 담은 기관·고지번호·과세기간을 아래에 잇는다.
 * 카드 문법 그대로다(2026-09-10).
 */
export function TaxDetailDialog({ obligation, onClose, onEdit, onDelete }: Props) {
  const mobile = useIsMobile()
  if (!obligation) return null

  const cols = 2
  const items: FigureItem[] = [
    { label: '상태', value: STATUS_LABELS[obligation.status] ?? obligation.status, tone: obligation.status === 'overdue' ? 'neg' : undefined },
    { label: '출처', value: SOURCES[obligation.source] ?? obligation.source },
    { label: '납부기한', value: obligation.due_date ?? '-', mono: true },
    { label: '금액', value: `${obligation.amount.toLocaleString()}원`, mono: true },
    { label: '고지내역', value: obligation.title, wrap: true, span: cols },
    { label: '기관', value: obligation.agency, wrap: true },
    { label: '세목', value: TYPE_LABELS[obligation.obligation_type] ?? obligation.obligation_type },
  ]
  if (obligation.period_label) items.push({ label: '과세기간', value: obligation.period_label, mono: true })
  if (obligation.issued_date) items.push({ label: '고지일', value: obligation.issued_date, mono: true })
  if (obligation.notice_number) items.push({ label: '전자납부번호', value: obligation.notice_number, mono: true, wrap: true })
  if (obligation.paid_at) items.push({ label: '납부일', value: obligation.paid_at.slice(0, 10), mono: true })
  if (obligation.match_confidence) items.push({ label: '매칭', value: MATCH_LABELS[obligation.match_confidence] ?? obligation.match_confidence })

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
          <FigureGrid items={items} cols={cols} />
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
