import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export const maxDuration = 60

const WINDOW_MAP: Record<string, number> = { '1m': 21, '3m': 63, '6m': 126, '1y': 252 }

async function fetchHistory(
  supabase: ReturnType<typeof getServiceSupabase>,
  ticker: string,
  cutoffStr: string,
): Promise<Array<{ date: string; close: number }>> {
  const all: Array<{ date: string; close: number }> = []
  const PAGE = 1000
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('sector_index_quotes')
      .select('date, close')
      .eq('ticker', ticker)
      .gte('date', cutoffStr)
      .order('date', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data.map(d => ({ date: d.date as string, close: Number(d.close) })))
    if (data.length < PAGE) break
  }
  return all
}

function computeTrailing(
  series: Array<{ date: string; close: number }>,
  windowDays: number,
): Map<string, number> {
  const result = new Map<string, number>()
  for (let i = windowDays; i < series.length; i++) {
    const cur = series[i]
    const past = series[i - windowDays]
    if (past && past.close > 0) {
      result.set(cur.date, (cur.close - past.close) / past.close)
    }
  }
  return result
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const ticker = searchParams.get('ticker')
  const period = (searchParams.get('period') || '').toLowerCase()
  if (!ticker || !WINDOW_MAP[period]) {
    return NextResponse.json({ error: 'ticker and period (1m/3m/6m/1y) are required' }, { status: 400 })
  }
  const windowDays = WINDOW_MAP[period]

  // 지난 1년 trailing return을 그리려면 windowDays 만큼 더 거슬러 가야 함 (여유 30일)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - (252 + windowDays + 60))
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const supabase = getServiceSupabase()
  const benchmarks = ['SPY', 'QQQ', 'QLD']
  const targets = [ticker, ...benchmarks.filter(b => b !== ticker)]

  let seriesByTicker: Record<string, Array<{ date: string; close: number }>>
  try {
    const results = await Promise.all(targets.map(tk => fetchHistory(supabase, tk, cutoffStr)))
    seriesByTicker = Object.fromEntries(targets.map((tk, i) => [tk, results[i]]))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'fetch failed' }, { status: 500 })
  }

  const etfRet = computeTrailing(seriesByTicker[ticker] || [], windowDays)
  const spyRet = computeTrailing(seriesByTicker['SPY'] || [], windowDays)
  const qqqRet = computeTrailing(seriesByTicker['QQQ'] || [], windowDays)
  const qldRet = computeTrailing(seriesByTicker['QLD'] || [], windowDays)

  // ETF 시리즈 기준으로 통합. 최근 252 영업일만.
  const merged: Array<{ date: string; etf: number; spy: number | null; qqq: number | null; qld: number | null }> = []
  for (const [date, etf] of etfRet) {
    merged.push({
      date,
      etf,
      spy: spyRet.get(date) ?? null,
      qqq: qqqRet.get(date) ?? null,
      qld: qldRet.get(date) ?? null,
    })
  }
  merged.sort((a, b) => a.date.localeCompare(b.date))
  const last252 = merged.slice(-252)

  return NextResponse.json({ ticker, period, windowDays, series: last252 })
}
