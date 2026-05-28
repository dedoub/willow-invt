import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export const maxDuration = 60

const PERIODS = [
  { key: '1m', days: 21 },
  { key: '3m', days: 63 },
  { key: '6m', days: 126 },
  { key: '1y', days: 252 },
] as const

export interface SectorRotationEtf {
  ticker: string
  name: string
  group: 'GICS' | 'Theme' | string
  latestClose: number
  latestDate: string
  returns: Record<'1m' | '3m' | '6m' | '1y', number | null>
}

export async function GET() {
  const supabase = getServiceSupabase()
  const [etfsRes, quotesRes] = await Promise.all([
    supabase.from('sector_index_etfs').select('ticker, name, group_label, display_order').eq('active', true).order('display_order'),
    supabase.from('sector_index_quotes').select('ticker, date, close').order('date', { ascending: false }),
  ])
  if (etfsRes.error) return NextResponse.json({ error: etfsRes.error.message }, { status: 500 })
  if (quotesRes.error) return NextResponse.json({ error: quotesRes.error.message }, { status: 500 })

  const byTicker = new Map<string, Array<{ date: string; close: number }>>()
  for (const q of quotesRes.data || []) {
    const arr = byTicker.get(q.ticker) || []
    arr.push({ date: q.date, close: Number(q.close) })
    byTicker.set(q.ticker, arr)
  }
  // series는 date desc 정렬 (latest = index 0)

  const result: SectorRotationEtf[] = []
  for (const etf of etfsRes.data || []) {
    const series = byTicker.get(etf.ticker) || []
    if (series.length === 0) continue
    const latest = series[0]
    const returns: SectorRotationEtf['returns'] = { '1m': null, '3m': null, '6m': null, '1y': null }
    for (const p of PERIODS) {
      const past = series[p.days]
      returns[p.key] = past && past.close > 0 ? (latest.close - past.close) / past.close : null
    }
    result.push({
      ticker: etf.ticker,
      name: etf.name,
      group: etf.group_label,
      latestClose: latest.close,
      latestDate: latest.date,
      returns,
    })
  }

  return NextResponse.json({ etfs: result })
}
