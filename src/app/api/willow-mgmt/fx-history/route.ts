import { NextResponse } from 'next/server'
import { denyUnlessDashboardAccess } from '@/lib/api-auth'

// 로그인 쿠키를 읽으므로 요청마다 실행돼야 한다. 이 줄이 없으면 Next 가 빌드 때 한 번
// 실행해 응답을 굳혀 버리고, 그때는 쿠키가 없어 401 이 통째로 캐시된다 (2026-08-27 투자 페이지).
export const dynamic = 'force-dynamic'

// GET - Fetch historical KRW/USD exchange rates from Yahoo Finance
export async function GET(request: Request) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied

  try {
    const res = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/KRW%3DX?interval=1d&range=2y',
      {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        next: { revalidate: 3600 }, // cache 1 hour
      }
    )
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch FX data' }, { status: 502 })
    }

    const data = await res.json()
    const result = data?.chart?.result?.[0]
    if (!result) {
      return NextResponse.json({ error: 'No FX data' }, { status: 502 })
    }

    const timestamps: number[] = result.timestamp || []
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || []

    // Build date → rate map
    const rates: Record<string, number> = {}
    for (let i = 0; i < timestamps.length; i++) {
      const date = new Date(timestamps[i] * 1000).toISOString().slice(0, 10)
      const rate = closes[i]
      if (rate && rate > 0) {
        rates[date] = Math.round(rate * 100) / 100
      }
    }

    return NextResponse.json({ rates })
  } catch {
    return NextResponse.json({ error: 'FX history fetch failed' }, { status: 500 })
  }
}
