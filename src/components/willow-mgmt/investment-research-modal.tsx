'use client'

import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface StockResearch {
  id: string
  ticker: string
  company_name: string
  scan_date: string
  source: string
  market_cap_b: number | null
  current_price: number | null
  revenue_growth_yoy: string | null
  margin: string | null
  value_chain_position: string | null
  structural_thesis: string | null
  sector_tags: string[]
  high_12m: number | null
  gap_from_high_pct: number | null
  trend_verdict: string | null
  verdict: string | null
  fail_reason: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: StockResearch | null
  onSaved: () => void
}

export function InvestmentResearchModal({ open, onOpenChange, editing, onSaved }: Props) {
  const [ticker, setTicker] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [scanDate, setScanDate] = useState('')
  const [source, setSource] = useState('manual')
  const [marketCap, setMarketCap] = useState('')
  const [currentPrice, setCurrentPrice] = useState('')
  const [revenueGrowth, setRevenueGrowth] = useState('')
  const [margin, setMargin] = useState('')
  const [valueChain, setValueChain] = useState('')
  const [thesis, setThesis] = useState('')
  const [sectorTags, setSectorTags] = useState('')
  const [high12m, setHigh12m] = useState('')
  const [gapPct, setGapPct] = useState('')
  const [trendVerdict, setTrendVerdict] = useState('')
  const [verdict, setVerdict] = useState<'pass_tier1' | 'pass_tier2' | 'fail'>('pass_tier1')
  const [failReason, setFailReason] = useState('')
  const [notes, setNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (editing) {
      setTicker(editing.ticker)
      setCompanyName(editing.company_name)
      setScanDate(editing.scan_date)
      setSource(editing.source)
      setMarketCap(editing.market_cap_b?.toString() || '')
      setCurrentPrice(editing.current_price?.toString() || '')
      setRevenueGrowth(editing.revenue_growth_yoy || '')
      setMargin(editing.margin || '')
      setValueChain(editing.value_chain_position || '')
      setThesis(editing.structural_thesis || '')
      setSectorTags((editing.sector_tags || []).join(', '))
      setHigh12m(editing.high_12m?.toString() || '')
      setGapPct(editing.gap_from_high_pct?.toString() || '')
      setTrendVerdict(editing.trend_verdict || '')
      setVerdict((editing.verdict as 'pass_tier1' | 'pass_tier2' | 'fail') || 'pass_tier1')
      setFailReason(editing.fail_reason || '')
      setNotes(editing.notes || '')
    } else {
      setTicker(''); setCompanyName(''); setScanDate(''); setSource('manual')
      setMarketCap(''); setCurrentPrice(''); setRevenueGrowth(''); setMargin('')
      setValueChain(''); setThesis(''); setSectorTags(''); setHigh12m('')
      setGapPct(''); setTrendVerdict(''); setVerdict('pass_tier1')
      setFailReason(''); setNotes('')
    }
  }, [editing, open])

  const handleSave = async () => {
    if (!ticker.trim() || !companyName.trim()) {
      alert('종목코드와 종목명을 입력해주세요.')
      return
    }
    setIsSaving(true)
    try {
      const payload = {
        id: editing?.id,
        ticker: ticker.trim().toUpperCase(),
        company_name: companyName.trim(),
        scan_date: scanDate || new Date().toISOString().split('T')[0],
        source: source || 'manual',
        market_cap_b: marketCap ? parseFloat(marketCap) : null,
        current_price: currentPrice ? parseFloat(currentPrice) : null,
        revenue_growth_yoy: revenueGrowth || null,
        margin: margin || null,
        value_chain_position: valueChain || null,
        structural_thesis: thesis || null,
        sector_tags: sectorTags ? sectorTags.split(',').map(s => s.trim()).filter(Boolean) : [],
        high_12m: high12m ? parseFloat(high12m) : null,
        gap_from_high_pct: gapPct ? parseFloat(gapPct) : null,
        trend_verdict: trendVerdict || null,
        verdict,
        fail_reason: failReason || null,
        notes: notes || null,
      }
      const res = await fetch('/api/willow-mgmt/stock-research', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        onOpenChange(false)
        onSaved()
      } else {
        alert('저장에 실패했습니다.')
      }
    } catch (error) {
      console.error('Failed to save research:', error)
      alert('저장에 실패했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!editing) return
    try {
      const res = await fetch(`/api/willow-mgmt/stock-research?id=${editing.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      onOpenChange(false)
      onSaved()
    } catch (error) {
      console.error('Failed to delete research:', error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0 pb-4 border-b">
          <DialogTitle>{editing ? '리서치 수정' : '리서치 추가'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto flex-1 px-1 -mx-1 py-4">
          {/* Verdict */}
          <div>
            <label className="text-xs text-slate-500 mb-1 block">판정</label>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={() => setVerdict('pass_tier1')} className={cn('py-2 text-sm font-medium rounded-lg transition-colors', verdict === 'pass_tier1' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300')}>Tier 1</button>
              <button type="button" onClick={() => setVerdict('pass_tier2')} className={cn('py-2 text-sm font-medium rounded-lg transition-colors', verdict === 'pass_tier2' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300')}>Tier 2</button>
              <button type="button" onClick={() => setVerdict('fail')} className={cn('py-2 text-sm font-medium rounded-lg transition-colors', verdict === 'fail' ? 'bg-slate-300 text-slate-700 dark:bg-slate-600 dark:text-slate-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300')}>Fail</button>
            </div>
          </div>
          {/* Ticker & Company */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">종목코드 *</label>
              <Input value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="VRT" />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">종목명 *</label>
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="버티브홀딩스" />
            </div>
          </div>
          {/* Date & Source */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">스캔일</label>
              <Input type="date" value={scanDate} onChange={(e) => setScanDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">소스</label>
              <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="reddit" />
            </div>
          </div>
          {/* Value Chain & Thesis */}
          <div>
            <label className="text-xs text-slate-500 mb-1 block">밸류체인 포지션</label>
            <Input value={valueChain} onChange={(e) => setValueChain(e.target.value)} placeholder="AI 데이터센터 냉각/전력 인프라" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">투자논거</label>
            <Textarea value={thesis} onChange={(e) => setThesis(e.target.value)} rows={3} placeholder="구조적 성장 논거..." className="resize-none" />
          </div>
          {/* Sector Tags */}
          <div>
            <label className="text-xs text-slate-500 mb-1 block">섹터 태그 (콤마 구분)</label>
            <Input value={sectorTags} onChange={(e) => setSectorTags(e.target.value)} placeholder="AI인프라, 데이터저장" />
          </div>
          {/* Financials */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">현재가 ($)</label>
              <Input value={currentPrice} onChange={(e) => setCurrentPrice(e.target.value)} placeholder="266" />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">시총 ($B)</label>
              <Input value={marketCap} onChange={(e) => setMarketCap(e.target.value)} placeholder="85" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">매출성장률</label>
              <Input value={revenueGrowth} onChange={(e) => setRevenueGrowth(e.target.value)} placeholder="+25% YoY" />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">마진</label>
              <Input value={margin} onChange={(e) => setMargin(e.target.value)} placeholder="46.1%" />
            </div>
          </div>
          {/* Technical */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">52주고 ($)</label>
              <Input value={high12m} onChange={(e) => setHigh12m(e.target.value)} placeholder="309.75" />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">고점대비 (%)</label>
              <Input value={gapPct} onChange={(e) => setGapPct(e.target.value)} placeholder="-14.1" />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">추세</label>
              <Input value={trendVerdict} onChange={(e) => setTrendVerdict(e.target.value)} placeholder="watch" />
            </div>
          </div>
          {/* Fail Reason */}
          {verdict === 'fail' && (
            <div>
              <label className="text-xs text-slate-500 mb-1 block">탈락 사유</label>
              <Input value={failReason} onChange={(e) => setFailReason(e.target.value)} placeholder="성장률 미미" />
            </div>
          )}
          {/* Notes */}
          <div>
            <label className="text-xs text-slate-500 mb-1 block">메모</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="메모 (선택)" className="resize-none" />
          </div>
        </div>
        <div className="flex flex-row flex-nowrap justify-between flex-shrink-0 pt-4 border-t border-slate-200 dark:border-slate-700">
          {editing ? (
            <Button variant="destructive" size="sm" onClick={handleDelete}>삭제</Button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>취소</Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              저장
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
