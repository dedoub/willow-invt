'use client'

import { cn } from '@/lib/utils'
import { ArrowRight, Pencil } from 'lucide-react'

export interface ResearchCardData {
  id: string
  sourceType: 'valuechain' | 'smallcap'
  ticker: string
  companyName: string
  verdict?: 'pass_tier1' | 'pass_tier2' | 'fail'
  sectorTags?: string[]
  marketCapB?: number | null
  currentPrice?: number | null
  thesis?: string | null
  valueChain?: string | null
  scanDate?: string
  source?: string
  gapFromHighPct?: number | null
  failReason?: string | null
  notes?: string | null
  track?: 'profitable' | 'hypergrowth' | null
  compositeScore?: number | null
  marketCapM?: number | null
  changePct?: number | null
  growthScore?: number | null
  valueScore?: number | null
  qualityScore?: number | null
  momentumScore?: number | null
  insiderScore?: number | null
  sentimentScore?: number | null
  sector?: string | null
  failReasons?: string[] | null
}

interface Props {
  data: ResearchCardData
  onAddToWatchlist?: () => void
  onEdit?: () => void
}

const verdictBadge: Record<string, { label: string; bg: string; text: string }> = {
  pass_tier1: { label: 'T1', bg: 'bg-emerald-100 dark:bg-emerald-900/50', text: 'text-emerald-700 dark:text-emerald-400' },
  pass_tier2: { label: 'T2', bg: 'bg-blue-100 dark:bg-blue-900/50', text: 'text-blue-700 dark:text-blue-400' },
}

const sourceLabel: Record<string, string> = {
  valuechain: '밸류체인',
  smallcap: '소형주',
}

function ScoreBar({ label, value }: { label: string; value: number | null | undefined }) {
  if (value == null) return null
  const color = value >= 70 ? 'bg-emerald-500' : value >= 40 ? 'bg-blue-500' : 'bg-slate-400'
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-[8px] text-slate-400">{label}</span>
        <span className="text-[8px] font-medium text-slate-600 dark:text-slate-300">{value}</span>
      </div>
      <div className="h-1 rounded-full bg-slate-200 dark:bg-slate-600 mt-0.5">
        <div className={cn('h-1 rounded-full', color)} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  )
}

function formatMarketCap(capB?: number | null, capM?: number | null): string {
  if (capB != null) return `$${capB}B`
  if (capM != null) return capM >= 1000 ? `$${(capM / 1000).toFixed(1)}B` : `$${capM.toFixed(0)}M`
  return ''
}

export function InvestmentCardResearch({ data, onAddToWatchlist, onEdit }: Props) {
  const badge = data.verdict ? verdictBadge[data.verdict] : null
  const srcLabel = sourceLabel[data.sourceType] || ''

  const mcap = formatMarketCap(data.marketCapB, data.marketCapM)
  const sectors = data.sectorTags?.length ? data.sectorTags : (data.sector ? [data.sector] : [])
  const hasScores = data.growthScore != null || data.valueScore != null
  const hasThesis = data.thesis || data.valueChain

  return (
    <div className="group rounded-lg p-2.5 bg-white dark:bg-slate-700">
      {/* Row 1: source badge + ticker + company + edit */}
      <div className="flex items-center gap-1.5">
        {badge && (
          <span className={cn('px-1.5 py-0.5 text-[10px] font-bold rounded', badge.bg, badge.text)}>
            {badge.label}
          </span>
        )}
        {srcLabel && <span className="text-[9px] text-slate-400 dark:text-slate-500">{srcLabel}</span>}
        {data.track === 'hypergrowth' && (
          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-400">HG</span>
        )}
        <span className="text-xs font-bold text-slate-900 dark:text-white">{data.ticker}</span>
        <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate flex-1">{data.companyName}</span>
        {onEdit && (
          <button onClick={onEdit} className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-600">
            <Pencil className="h-3 w-3 text-slate-400" />
          </button>
        )}
      </div>

      {/* Row 2: sector tags + market cap + composite score */}
      <div className="flex items-center gap-1 mt-1 flex-wrap">
        {sectors.map((tag, i) => (
          <span key={i} className="px-1.5 py-0.5 text-[10px] rounded bg-slate-100 dark:bg-slate-600 text-slate-500 dark:text-slate-400">{tag}</span>
        ))}
        {mcap && (
          <span className="px-1.5 py-0.5 text-[10px] rounded bg-slate-100 dark:bg-slate-600 text-slate-500 dark:text-slate-400">{mcap}</span>
        )}
        {data.compositeScore != null && (
          <span className={cn('px-1.5 py-0.5 text-[10px] font-bold rounded',
            data.compositeScore >= 70 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
              : data.compositeScore >= 50 ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'
                : 'bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-300'
          )}>{data.compositeScore.toFixed(0)}점</span>
        )}
      </div>

      {/* Row 3: thesis (if available) */}
      {hasThesis && (
        <div className="mt-1.5 space-y-0.5">
          {data.valueChain && <p className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-1"><span className="text-slate-400">밸류체인:</span> {data.valueChain}</p>}
          {data.thesis && <p className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-2"><span className="text-slate-400">논거:</span> {data.thesis}</p>}
        </div>
      )}

      {/* Row 4: score bars (if available) */}
      {hasScores && (
        <div className="grid grid-cols-3 gap-x-2 gap-y-1 mt-1.5">
          <ScoreBar label="성장" value={data.growthScore} />
          <ScoreBar label="가치" value={data.valueScore} />
          <ScoreBar label="품질" value={data.qualityScore} />
          <ScoreBar label="모멘텀" value={data.momentumScore} />
          <ScoreBar label="내부자" value={data.insiderScore} />
          <ScoreBar label="센티먼트" value={data.sentimentScore} />
        </div>
      )}

      {/* Row 5: footer — date/source + action */}
      <div className="flex items-center justify-between mt-2 pt-1.5">
        <span className="text-[10px] text-slate-400">
          {data.scanDate?.slice(5).replace('-', '/')}
          {data.source && data.source !== 'manual' && ` · ${data.source}`}
        </span>
        {onAddToWatchlist && (
          <button
            onClick={onAddToWatchlist}
            className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 text-[10px] text-slate-400 hover:text-emerald-600 px-1 py-0.5 rounded"
          >
            <span>워치리스트 추가</span>
            <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  )
}
