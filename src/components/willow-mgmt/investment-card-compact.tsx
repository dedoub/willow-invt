'use client'

import { memo } from 'react'
import { cn } from '@/lib/utils'
import { ArrowRight, ArrowLeft, TrendingUp, TrendingDown, Minus, Pin } from 'lucide-react'

export interface CompactCardData {
  name: string
  ticker: string
  sector: string
  axis?: string
  group: 'portfolio' | 'watchlist'
  price?: number
  changePercent?: number
  currency?: string
  signal?: 'new_high' | 'near' | 'weak' | null
  gapFromHighPct?: number | null
  holdingQty?: number
  avgPrice?: number
  momentumScore?: number | null
  weightPct?: number
  pinned?: boolean
  pyramiding?: {
    tranche: number
    avgReturnPct: number
    status: 'BUY' | 'HOLD' | 'FREEZE' | 'HOUSE_MONEY' | 'FULL'
    nextTriggerPct: number | null
    nextTriggerPrice: number | null
  }
  monitor?: {
    stage: number
    changePct: number
    days: number
    nextThresholdPct: number | null
    nextThresholdPrice: number | null
    startDate: string
    startPrice: number
  }
}

interface Props {
  data: CompactCardData
  onMove?: (direction: 'promote' | 'demote') => void
  onPin?: () => void
}

const signalConfig = {
  new_high: { label: '신고가', bg: 'bg-emerald-100 dark:bg-emerald-900/50', text: 'text-emerald-700 dark:text-emerald-400' },
  near: { label: '근접', bg: 'bg-amber-100 dark:bg-amber-900/50', text: 'text-amber-700 dark:text-amber-400' },
  weak: { label: '부진', bg: 'bg-blue-100 dark:bg-blue-900/50', text: 'text-blue-700 dark:text-blue-400' },
}

const momentumColor = (score: number | null | undefined) => {
  if (score == null) return 'text-slate-400'
  if (score >= 60) return 'text-emerald-600 dark:text-emerald-400'
  if (score >= 35) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

const pyramidingStatus: Record<string, { label: string; style: string }> = {
  BUY: { label: '추매', style: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400' },
  HOLD: { label: '대기', style: 'bg-slate-100 dark:bg-slate-600 text-slate-500 dark:text-slate-400' },
  FREEZE: { label: '동결', style: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400' },
  HOUSE_MONEY: { label: '원금회수', style: 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-400' },
  FULL: { label: '풀', style: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400' },
}

const trancheBg = (t: number) => {
  if (t >= 8) return 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400'
  if (t >= 5) return 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400'
  return 'bg-slate-100 dark:bg-slate-600 text-slate-500 dark:text-slate-400'
}

const momentumBg = (score: number | null | undefined) => {
  if (score == null) return 'bg-slate-100 dark:bg-slate-600'
  if (score >= 60) return 'bg-emerald-100 dark:bg-emerald-900/50'
  if (score >= 35) return 'bg-amber-100 dark:bg-amber-900/50'
  return 'bg-red-100 dark:bg-red-900/50'
}

export const InvestmentCardCompact = memo(function InvestmentCardCompact({ data, onMove, onPin }: Props) {
  const changeColor = (data.changePercent ?? 0) > 0
    ? 'text-red-600 dark:text-red-400'
    : (data.changePercent ?? 0) < 0
      ? 'text-blue-600 dark:text-blue-400'
      : 'text-slate-500'

  const ChangeIcon = (data.changePercent ?? 0) > 0 ? TrendingUp : (data.changePercent ?? 0) < 0 ? TrendingDown : Minus

  return (
    <div className={cn('group rounded-lg p-2.5 transition-colors', data.pinned ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-white dark:bg-slate-700')}>
      {/* Row 1: pin + sell rank + ticker + name + price */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {data.pinned && (
            <Pin className="h-3 w-3 text-amber-500 flex-shrink-0 fill-amber-500" />
          )}
          <span className="text-xs font-bold text-slate-900 dark:text-white">{data.ticker.replace('.KS', '')}</span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{data.name}</span>
        </div>
        {data.price != null && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-xs font-medium">{data.currency === 'KRW' ? `₩${data.price.toLocaleString()}` : `$${data.price.toFixed(2)}`}</span>
          </div>
        )}
      </div>

      {/* Row 2: sector/axis + change% */}
      <div className="flex items-center justify-between mt-1">
        <div className="flex items-center gap-1">
          {data.axis && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-300">{data.axis}</span>
          )}
          <span className="text-[10px] text-slate-400">{data.sector}</span>
        </div>
        {data.changePercent != null && (
          <span className={cn('text-xs font-medium flex items-center gap-0.5', changeColor)}>
            <ChangeIcon className="h-3 w-3" />
            {data.changePercent > 0 ? '+' : ''}{data.changePercent.toFixed(1)}% <span className="text-[9px] text-slate-400 font-normal">3M</span>
          </span>
        )}
      </div>

      {/* Row 3: signal + momentum + holdings/weight */}
      <div className="flex items-center justify-between mt-1.5">
        <div className="flex items-center gap-1">
          {data.signal && signalConfig[data.signal] && (
            <span className={cn('px-1.5 py-0.5 text-[10px] font-medium rounded-full', signalConfig[data.signal].bg, signalConfig[data.signal].text)}>
              {signalConfig[data.signal].label}
              {data.gapFromHighPct != null && ` ${data.gapFromHighPct > 0 ? '+' : ''}${data.gapFromHighPct.toFixed(1)}%`}
            </span>
          )}
          {data.momentumScore != null && (
            <span className={cn('px-1.5 py-0.5 text-[10px] font-medium rounded-full', momentumBg(data.momentumScore), momentumColor(data.momentumScore))}>
              M {data.momentumScore}
            </span>
          )}
          {data.group === 'portfolio' && data.holdingQty != null && (
            <span className="text-[10px] text-slate-400">
              {data.holdingQty}주{data.weightPct != null && ` · ${data.weightPct}%`}
            </span>
          )}
        </div>

        {/* Actions - visible on hover */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
          {onPin && data.group === 'watchlist' && (
            <button onClick={onPin} className={cn('flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded', data.pinned ? 'text-amber-500 hover:text-amber-600' : 'text-slate-400 hover:text-amber-500')}>
              <Pin className={cn('h-3 w-3', data.pinned && 'fill-amber-500')} />
            </button>
          )}
          {onMove && data.group === 'portfolio' && (
            <button onClick={() => onMove('demote')} className="flex items-center gap-0.5 text-[10px] text-slate-400 hover:text-amber-600 px-1 py-0.5 rounded">
              <ArrowRight className="h-3 w-3" />
              <span>워치리스트로</span>
            </button>
          )}
          {onMove && data.group === 'watchlist' && (
            <button onClick={() => onMove('demote')} className="flex items-center gap-0.5 text-[10px] text-slate-400 hover:text-slate-600 px-1 py-0.5 rounded">
              <ArrowLeft className="h-3 w-3" />
              <span>리서치로</span>
            </button>
          )}
        </div>
      </div>

      {/* Row 4: Monitoring stage (pinned watchlist) */}
      {data.monitor && (
        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-1">
            <span className={cn(
              'px-1 py-0.5 text-[9px] font-bold rounded',
              data.monitor.stage >= 7 ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-400'
                : data.monitor.stage >= 4 ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400'
                : 'bg-slate-100 dark:bg-slate-600 text-slate-500 dark:text-slate-400'
            )}>
              M{data.monitor.stage}
            </span>
            <span className={cn(
              'text-[10px] font-medium',
              data.monitor.changePct > 0 ? 'text-red-600 dark:text-red-400'
                : data.monitor.changePct < 0 ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-500'
            )}>
              {data.monitor.changePct > 0 ? '+' : ''}{data.monitor.changePct.toFixed(1)}%
            </span>
            {data.monitor.nextThresholdPct != null && (
              <span className="text-[10px] text-slate-400">
                → +{data.monitor.nextThresholdPct.toFixed(0)}%
                {data.monitor.nextThresholdPrice != null && (
                  <span className="text-slate-300 dark:text-slate-500 ml-0.5">
                    {data.currency === 'KRW'
                      ? `₩${Math.round(data.monitor.nextThresholdPrice / 10000).toLocaleString()}만`
                      : `$${data.monitor.nextThresholdPrice.toFixed(0)}`}
                  </span>
                )}
              </span>
            )}
            <span className="text-[10px] text-slate-300 dark:text-slate-500">{data.monitor.days}일</span>
          </div>
        </div>
      )}

      {/* Row 5: Pyramiding status (portfolio only) */}
      {data.pyramiding && (
        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-1">
            <span className={cn('px-1 py-0.5 text-[9px] font-bold rounded', trancheBg(data.pyramiding.tranche))}>
              T{data.pyramiding.tranche}
            </span>
            <span className={cn(
              'text-[10px] font-medium',
              data.pyramiding.avgReturnPct > 0 ? 'text-red-600 dark:text-red-400'
                : data.pyramiding.avgReturnPct < 0 ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-500'
            )}>
              {data.pyramiding.avgReturnPct > 0 ? '+' : ''}{data.pyramiding.avgReturnPct.toFixed(1)}%
            </span>
            {data.pyramiding.nextTriggerPct != null && (
              <span className="text-[10px] text-slate-400">
                → +{data.pyramiding.nextTriggerPct.toFixed(0)}%
                {data.pyramiding.nextTriggerPrice != null && (
                  <span className="text-slate-300 dark:text-slate-500 ml-0.5">
                    {data.currency === 'KRW'
                      ? `₩${Math.round(data.pyramiding.nextTriggerPrice / 10000).toLocaleString()}만`
                      : `$${data.pyramiding.nextTriggerPrice.toFixed(0)}`}
                  </span>
                )}
              </span>
            )}
          </div>
          <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full', pyramidingStatus[data.pyramiding.status]?.style)}>
            {pyramidingStatus[data.pyramiding.status]?.label}
          </span>
        </div>
      )}
    </div>
  )
})
