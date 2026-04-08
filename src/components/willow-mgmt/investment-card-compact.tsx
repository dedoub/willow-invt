'use client'

import { memo } from 'react'
import { cn } from '@/lib/utils'
import { ArrowRight, ArrowLeft, TrendingUp, TrendingDown, Minus } from 'lucide-react'

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
}

interface Props {
  data: CompactCardData
  onMove?: (direction: 'promote' | 'demote') => void
}

const signalConfig = {
  new_high: { label: '신고가', bg: 'bg-emerald-100 dark:bg-emerald-900/50', text: 'text-emerald-700 dark:text-emerald-400' },
  near: { label: '근접', bg: 'bg-amber-100 dark:bg-amber-900/50', text: 'text-amber-700 dark:text-amber-400' },
  weak: { label: '부진', bg: 'bg-blue-100 dark:bg-blue-900/50', text: 'text-blue-700 dark:text-blue-400' },
}

export const InvestmentCardCompact = memo(function InvestmentCardCompact({ data, onMove }: Props) {
  const changeColor = (data.changePercent ?? 0) > 0
    ? 'text-red-600 dark:text-red-400'
    : (data.changePercent ?? 0) < 0
      ? 'text-blue-600 dark:text-blue-400'
      : 'text-slate-500'

  const ChangeIcon = (data.changePercent ?? 0) > 0 ? TrendingUp : (data.changePercent ?? 0) < 0 ? TrendingDown : Minus

  return (
    <div className="group rounded-lg p-2.5 bg-white dark:bg-slate-700 transition-colors">
      {/* Row 1: ticker + name + price */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
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

      {/* Row 3: signal + holdings (portfolio only) */}
      <div className="flex items-center justify-between mt-1.5">
        <div className="flex items-center gap-1">
          {data.signal && signalConfig[data.signal] && (
            <span className={cn('px-1.5 py-0.5 text-[10px] font-medium rounded-full', signalConfig[data.signal].bg, signalConfig[data.signal].text)}>
              {signalConfig[data.signal].label}
              {data.gapFromHighPct != null && ` ${data.gapFromHighPct > 0 ? '+' : ''}${data.gapFromHighPct.toFixed(1)}%`}
            </span>
          )}
          {data.group === 'portfolio' && data.holdingQty != null && (
            <span className="text-[10px] text-slate-400">{data.holdingQty}주</span>
          )}
        </div>

        {/* Move action - visible on hover */}
        {onMove && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
            {data.group === 'portfolio' && (
              <button onClick={() => onMove('demote')} className="flex items-center gap-0.5 text-[10px] text-slate-400 hover:text-amber-600 px-1 py-0.5 rounded">
                <ArrowRight className="h-3 w-3" />
                <span>워치리스트로</span>
              </button>
            )}
            {data.group === 'watchlist' && (
              <button onClick={() => onMove('demote')} className="flex items-center gap-0.5 text-[10px] text-slate-400 hover:text-slate-600 px-1 py-0.5 rounded">
                <ArrowLeft className="h-3 w-3" />
                <span>리서치로</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
})
