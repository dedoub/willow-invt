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
  // PostgREST의 기본 1000-row cap을 우회하려면 페이지네이션 필요.
  // 1y 비교에 필요한 만큼만 cutoff date로 좁히고, 페이지로 모두 가져옴.
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 380)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const etfsRes = await supabase
    .from('sector_index_etfs')
    .select('ticker, name, group_label, display_order')
    .eq('active', true)
    .order('display_order')
  if (etfsRes.error) return NextResponse.json({ error: etfsRes.error.message }, { status: 500 })

  const PAGE = 1000
  const allQuotes: Array<{ ticker: string; date: string; close: number }> = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('sector_index_quotes')
      .select('ticker, date, close')
      .gte('date', cutoffStr)
      .order('date', { ascending: false })
      .range(offset, offset + PAGE - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    allQuotes.push(...data)
    if (data.length < PAGE) break
  }

  const byTicker = new Map<string, Array<{ date: string; close: number }>>()
  for (const q of allQuotes) {
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
