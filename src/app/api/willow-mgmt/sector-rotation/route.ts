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
  // 1y trailing return은 series[252]가 필요. 한국 시장 ~252 영업일/년이라 380일이면 인덱스 252가 비어 1y가 null로 떨어진다.
  cutoff.setDate(cutoff.getDate() - 420)
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
  // ticker별 trailing return — 그룹 평균 계산 시 재사용
  const tickerReturns = new Map<string, Record<'1m' | '3m' | '6m' | '1y', number | null>>()
  const tickerLatest = new Map<string, { date: string; close: number }>()
  for (const etf of etfsRes.data || []) {
    const series = byTicker.get(etf.ticker) || []
    if (series.length === 0) continue
    const latest = series[0]
    const returns: SectorRotationEtf['returns'] = { '1m': null, '3m': null, '6m': null, '1y': null }
    for (const p of PERIODS) {
      const past = series[p.days]
      returns[p.key] = past && past.close > 0 ? (latest.close - past.close) / past.close : null
    }
    tickerReturns.set(etf.ticker, returns)
    tickerLatest.set(etf.ticker, latest)
    result.push({
      ticker: etf.ticker,
      name: etf.name,
      group: etf.group_label,
      latestClose: latest.close,
      latestDate: latest.date,
      returns,
    })
  }

  // ── 보유 종목 sub-theme 그룹 — 같은 큰 묶음 종목들의 등가중 평균 trailing return ──
  // 그룹: AI 반도체 / AI 에너지/원전 / 저장/냉각/연결 / 방산 / 우주 / 넥스트
  // axis='넥스트'는 그대로 '넥스트', 나머지는 sector를 sub-theme으로 매핑 (holdings/kanban 공통 규칙)
  const THEME_SHORT: Record<string, string> = {
    'AI 반도체': 'SEMI',
    'AI 에너지/원전': 'NRG',
    '저장/냉각/연결': 'DC',
    '방산': 'DEF',
    '우주': 'SPACE',
    '넥스트': 'NEXT',
  }
  const portRes = await supabase
    .from('stock_watchlist')
    .select('ticker, name, sector, axis')
    .eq('group_name', 'portfolio')
  if (portRes.error) return NextResponse.json({ error: portRes.error.message }, { status: 500 })

  const tickerToName = new Map<string, string>()
  for (const row of portRes.data || []) {
    if (row.name) tickerToName.set(row.ticker, row.name)
  }

  function mapToSubTheme(sector: string | null, axis: string | null): string | null {
    if (axis === '넥스트') return '넥스트'
    if (!sector) return null
    if (/반도체|semiconductor|chip|메모리|memory|패키징|장비|HBM|ASIC|GPU|테스터/i.test(sector)) return 'AI 반도체'
    if (/에너지|원전|원자력|nuclear|우라늄|연료전지|fuel cell|가스터빈|발전|터빈/i.test(sector)) return 'AI 에너지/원전'
    if (/데이터센터|냉각|네트워킹|네트워크|cooling|datacenter|storage|스토리지|저장|인프라|광|cloud|클라우드|NAND|SSD|HDD|서버/i.test(sector)) return '저장/냉각/연결'
    if (/방산|defense|military/i.test(sector)) return '방산'
    if (/우주|space|satellite|SpaceX|위성|달|lunar/i.test(sector)) return '우주'
    return null
  }

  const sectorTickers = new Map<string, string[]>()
  for (const row of portRes.data || []) {
    const subTheme = mapToSubTheme(row.sector, row.axis)
    if (!subTheme) continue
    const arr = sectorTickers.get(subTheme) || []
    arr.push(row.ticker)
    sectorTickers.set(subTheme, arr)
  }

  let groupOrder = 200
  for (const [sector, tickers] of sectorTickers) {
    if (tickers.length < 2) continue
    const periodSums: Record<'1m' | '3m' | '6m' | '1y', { sum: number; n: number }> = {
      '1m': { sum: 0, n: 0 }, '3m': { sum: 0, n: 0 }, '6m': { sum: 0, n: 0 }, '1y': { sum: 0, n: 0 },
    }
    let latestDate = ''
    const members: string[] = []
    for (const tk of tickers) {
      const r = tickerReturns.get(tk)
      const l = tickerLatest.get(tk)
      if (!r || !l) continue
      members.push(tickerToName.get(tk) || tk.replace('.KS', ''))
      if (l.date > latestDate) latestDate = l.date
      for (const p of PERIODS) {
        const v = r[p.key]
        if (v != null && !Number.isNaN(v)) {
          periodSums[p.key].sum += v
          periodSums[p.key].n += 1
        }
      }
    }
    if (members.length < 2) continue
    const returns: SectorRotationEtf['returns'] = { '1m': null, '3m': null, '6m': null, '1y': null }
    for (const p of PERIODS) {
      const s = periodSums[p.key]
      returns[p.key] = s.n > 0 ? s.sum / s.n : null
    }
    result.push({
      ticker: THEME_SHORT[sector] || sector,
      name: `${sector} · ${members.join(', ')}`,
      group: 'SectorGroup',
      latestClose: 0,
      latestDate,
      returns,
    })
    groupOrder++
  }

  return NextResponse.json({ etfs: result })
}
