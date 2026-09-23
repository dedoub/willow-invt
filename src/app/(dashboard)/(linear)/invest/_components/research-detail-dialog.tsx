'use client'

import { useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LDialog, LDialogFoot } from '@/app/(dashboard)/_components/linear-dialog'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { FigureGrid, type FigureItem } from '@/app/(dashboard)/_components/linear-figure-grid'
import { type ResearchItem, SIGNAL_LABEL, fmtQuote, tierLabel } from '../_lib/research'
import { fmtPct } from '../_lib/holdings'

/**
 * 종목 상세 — 윌로우 매출 상세와 같은 문법. 제목 없이 닫기만, 표의 열 순서로 읽힌다.
 * 칸반 카드가 배지·툴팁에 나눠 담던 논지와 모니터를 지표 격자에 펼친다(CEO 2026-09-23).
 * 발 줄의 단추가 칸반의 드래그·핀·삭제를 대신한다.
 */
export function ResearchDetailDialog({ item, busy, onClose, onRemove, onTogglePin, onAddToWatchlist, onDropResearch }: {
  item: ResearchItem | null
  busy?: boolean
  onClose: () => void
  onRemove: (item: ResearchItem) => void
  onTogglePin: (item: ResearchItem) => void
  onAddToWatchlist: (item: ResearchItem) => void
  onDropResearch: (item: ResearchItem) => void
}) {
  const mobile = useIsMobile()
  if (!item) return null

  const cols = 2
  const tone = (v: number | null | undefined): 'pos' | 'neg' | undefined => v == null ? undefined : v > 0 ? 'pos' : v < 0 ? 'neg' : undefined
  const signals: string[] = []
  if (item.breakout) signals.push(`돌파${item.breakoutGap != null ? ` ${fmtPct(item.breakoutGap)}` : ''}`)
  if (item.signal) signals.push(`${SIGNAL_LABEL[item.signal]}${item.gapFromHighPct != null ? ` ${fmtPct(item.gapFromHighPct)}` : ''}`)

  const facts: FigureItem[] = [
    { label: '종목', value: item.name, sub: item.ticker.replace('.KS', ''), wrap: true },
    { label: '분류', value: [item.parent, item.sub, item.sector].filter(Boolean).join(' · '), wrap: true },
    { label: '시총', value: item.marketCapLabel ?? '-', mono: true },
    {
      label: '현재가', value: fmtQuote(item.price, item.currency), mono: true,
      sub: item.changePercent != null ? `일간 ${fmtPct(item.changePercent)}` : undefined,
    },
    { label: '1M 수익률', value: item.return1m != null ? fmtPct(item.return1m) : '-', mono: true, tone: tone(item.return1m) },
    { label: '모멘텀', value: item.momentumScore != null ? `M ${item.momentumScore}` : '-', mono: true },
    { label: '신호', value: signals.length ? signals.join(' · ') : '-' },
  ]

  if (item.group === 'watchlist') {
    const m = item.monitor
    facts.push({
      label: '모니터', value: item.pinned ? (m ? `M${m.stage} · ${fmtPct(m.changePct)}` : '핀') : '-', mono: true,
      sub: m
        ? `${m.startDate} ${fmtQuote(m.startPrice, item.currency)} 부터 ${m.days}일${m.nextThresholdPct != null && m.nextThresholdPrice != null ? ` · 다음 ${fmtPct(m.nextThresholdPct, 0)} ${fmtQuote(m.nextThresholdPrice, item.currency)}` : ''}`
        : undefined,
    })
  } else {
    facts.push({
      label: '등급', value: tierLabel(item.verdict), mono: true,
      sub: item.compositeScore != null ? `종합 ${item.compositeScore}점` : undefined,
    })
    facts.push({
      label: '출처', value: item.sourceType === 'smallcap' ? '스몰캡 스캔' : '밸류체인', mono: true,
      sub: item.scanDate ? `스캔 ${item.scanDate}` : undefined,
    })
  }
  if (item.valueChainPosition) facts.push({ label: '밸류체인 위치', value: item.valueChainPosition, prose: true, span: cols })
  if (item.structuralThesis) facts.push({ label: '논지', value: item.structuralThesis, prose: true, span: cols })

  const foot = item.group === 'watchlist' ? (
    <LDialogFoot
      left={<span data-danger-action=""><LBtn variant="ghost" size="sm" disabled={busy} onClick={() => onRemove(item)}>워치리스트에서 제외</LBtn></span>}
      right={<LBtn variant="secondary" size="sm" disabled={busy} onClick={() => onTogglePin(item)}>{item.pinned ? '핀 해제' : '핀 · 모니터 시작'}</LBtn>}
    />
  ) : (
    <LDialogFoot
      left={<span data-danger-action=""><LBtn variant="ghost" size="sm" disabled={busy} onClick={() => onDropResearch(item)}>리서치에서 제외</LBtn></span>}
      right={<LBtn variant="secondary" size="sm" disabled={busy} onClick={() => onAddToWatchlist(item)}>워치리스트에 담기</LBtn>}
    />
  )

  return (
    <LDialog onClose={onClose} width={480} foot={foot}>
      <FigureGrid items={facts} cols={mobile ? 2 : cols} />
    </LDialog>
  )
}
