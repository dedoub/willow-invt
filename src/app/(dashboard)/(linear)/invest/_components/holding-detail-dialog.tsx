'use client'

import { useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LDialog } from '@/app/(dashboard)/_components/linear-dialog'
import { FigureGrid, type FigureItem } from '@/app/(dashboard)/_components/linear-figure-grid'
import {
  type Holding, type Pyramiding, PYRAMIDING_LABEL,
  fmtAmount, fmtPrice, fmtSigned, fmtPct, subThemeOf, valKrwOf,
} from '../_lib/holdings'

/** 표 행이 그대로 들어온다 — holdings-table-block 의 HoldingRow 가 이 모양을 만족한다. */
export interface HoldingDetail {
  holding: Holding
  pyramiding: Pyramiding
  /** 포트 전체 평가액 대비 비중(%). */
  weightPct: number
  breakout?: { breakout: boolean; gapPct: number }
  qldTransition?: boolean
  /** DB 의 세부 sector 라벨(예: 'AI 메모리'). */
  sector?: string
}

/**
 * 보유 종목 상세 — 윌로우 매출 상세와 같은 문법. 제목 없이 닫기만, 표의 열 순서로 읽힌다.
 * 종목 카드 격자가 한 칸에 우겨 넣던 열두 가지 수치를 지표 격자에 펼친다(CEO 2026-09-23).
 */
export function HoldingDetailDialog({ detail, usdKrwRate, onClose }: {
  detail: HoldingDetail | null
  usdKrwRate: number
  onClose: () => void
}) {
  const mobile = useIsMobile()
  if (!detail) return null

  const { holding: h, pyramiding: p } = detail
  const cols = 2
  const usd = h.currency === 'USD'
  const quoted = h.currentPrice > 0
  const sub = subThemeOf(h)
  const tone = (v: number): 'pos' | 'neg' | undefined => v > 0 ? 'pos' : v < 0 ? 'neg' : undefined

  const facts: FigureItem[] = [
    { label: '종목', value: h.company_name, sub: h.ticker.replace('.KS', ''), wrap: true },
    { label: '분류', value: [h.parentTheme || '미분류', sub, detail.sector].filter(Boolean).join(' · '), wrap: true },
    { label: '수량', value: `${h.netQty.toLocaleString()}주`, mono: true },
    { label: '평단', value: fmtPrice(h.avgBuyPrice, h.currency), mono: true },
    {
      label: '현재가', value: quoted ? fmtPrice(h.currentPrice, h.currency) : '-', mono: true,
      sub: quoted && h.dailyChangePercent ? `일간 ${fmtPct(h.dailyChangePercent)}` : undefined,
    },
    {
      label: '투자', value: fmtAmount(h.totalInvested, h.currency), mono: true,
      sub: usd ? `${fmtAmount(h.krwInvested, 'KRW')} · 거래일 환율` : undefined,
    },
    {
      label: '평가액', value: quoted ? fmtAmount(h.currentValue, h.currency) : '-', mono: true,
      sub: quoted ? `${usd ? `${fmtAmount(valKrwOf(h, usdKrwRate), 'KRW')} · ` : ''}비중 ${detail.weightPct.toFixed(1)}%` : undefined,
    },
    {
      label: '누적 손익', value: quoted ? fmtSigned(h.pnl, h.currency) : '-', mono: true, tone: quoted ? tone(h.pnl) : undefined,
      sub: quoted ? fmtPct(h.pnlPercent) : undefined,
    },
    {
      label: '보유', value: `${h.holdingDays.toLocaleString()}일`, mono: true,
      sub: h.irr != null ? `IRR ${fmtPct(h.irr * 100)}` : undefined,
    },
    {
      label: '피라미딩', value: p.status === 'NONE' ? '-' : `T${p.tranche} · ${PYRAMIDING_LABEL[p.status]}`, mono: true,
      sub: p.nextTrigger != null && p.nextPrice != null
        ? `다음 트랜치 ${fmtPct(p.nextTrigger * 100, 0)} · ${fmtPrice(p.nextPrice, h.currency)}`
        : p.status === 'FULL' ? '원금 한도 — 추매 없음' : undefined,
    },
  ]

  // 매매 신호는 배지가 아니라 글자로 — 카드 문법이 배지를 회색으로 못 박아 색으로는 못 말한다.
  const signals: string[] = []
  if (detail.breakout?.breakout) signals.push(`돌파 ${fmtPct(detail.breakout.gapPct)}`)
  if (detail.qldTransition) signals.push('QLD 전환 후보')
  facts.push({ label: '신호', value: signals.length ? signals.join(' · ') : '-', span: cols })

  return (
    <LDialog onClose={onClose} width={460}>
      <FigureGrid items={facts} cols={mobile ? 2 : cols} />
    </LDialog>
  )
}
