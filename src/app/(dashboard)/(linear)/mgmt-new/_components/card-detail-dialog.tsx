'use client'

import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { FigureGrid, type FigureItem } from './figure-grid'
import type { CardApproval } from '@/types/finance-card'

interface Props {
  approval: CardApproval | null
  /** 표에서 쓰는 분류 라벨 — 분류 규칙은 카드 블록이 갖고 있다 */
  category: string
  onClose: () => void
}

/** 마스킹된 카드번호에서 끝 네 자리 */
function cardTail(cardNo: string | null | undefined): string {
  return (cardNo ?? '').replace(/\D/g, '').slice(-4)
}

/**
 * 승인 상세 — 표의 열 순서대로 읽고, 행에 못 담은 업종·할부·부가세를 아래에 잇는다.
 * 카드 문법 그대로다(2026-09-10).
 */
export function CardDetailDialog({ approval, category, onClose }: Props) {
  const mobile = useIsMobile()
  if (!approval) return null

  const cols = 2
  const cancelled = approval.cancel_yn === '1' || approval.cancel_yn === '2'
  const foreign = approval.home_foreign_type === '2'
  const installment = approval.payment_type === '2' && approval.installment_month

  const items: FigureItem[] = [
    { label: '구분', value: category || '기타' },
    { label: '날짜', value: approval.used_time ? `${approval.used_date} ${approval.used_time.slice(0, 5)}` : approval.used_date, mono: true },
    { label: '카드', value: cardTail(approval.card_no) || '-', mono: true },
    { label: '금액', value: `${Math.abs(approval.krw).toLocaleString()}원`, mono: true, tone: cancelled ? 'neg' : undefined },
    { label: '가맹점', value: approval.store_name || '미상', wrap: true, span: cols },
  ]
  // 카드사가 업종을 '()'처럼 빈 껍데기로 보내는 건이 있어 글자·숫자가 있을 때만 싣는다
  const storeType = (approval.store_type ?? '').trim()
  if (/[\p{L}\p{N}]/u.test(storeType)) items.push({ label: '업종', value: storeType, wrap: true })
  if (foreign) items.push({
    label: '해외 승인액', value: approval.amount.toLocaleString(), mono: true,
    sub: `원화 환산 ${Math.abs(approval.krw).toLocaleString()}원`,
  })
  if (installment) items.push({ label: '할부', value: `${approval.installment_month}개월`, mono: true })
  if (approval.vat != null) items.push({ label: '부가세', value: `${approval.vat.toLocaleString()}원`, mono: true })
  if (approval.store_corp_no) items.push({ label: '사업자번호', value: approval.store_corp_no, mono: true })
  if (cancelled) items.push({ label: '취소', value: approval.cancel_amount != null ? `${Math.abs(approval.cancel_amount).toLocaleString()}원` : '취소분', mono: true })

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

        {/* 수집 원장이라 화면에서 고치지 않는다 — 버튼 자리에 출처를 남겨 다른 상세와 같은 끝단을 만든다 */}
        <div style={{
          margin: `0 ${t.density.cardPad}px`, paddingBottom: t.density.cardPad,
          fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, color: t.neutrals.subtle, lineHeight: 1.4,
        }}>
          카드사에서 수집한 승인내역입니다. 이 화면에서는 고치지 않습니다.
        </div>

      </LCard>
    </div>
  )
}
