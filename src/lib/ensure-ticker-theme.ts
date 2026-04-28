import { SupabaseClient } from '@supabase/supabase-js'

const SECTOR_THEME_MAP: [RegExp, string][] = [
  [/반도체|semiconductor|chip|메모리|memory|패키징|장비/i, 'AI 반도체'],
  [/에너지|원전|원자력|nuclear|우라늄|power gen/i, 'AI 에너지/원전'],
  [/데이터센터|냉각|네트워킹|네트워크|cooling|datacenter|storage|저장|인프라/i, '데이터센터/냉각/네트워킹'],
  [/방산|defense|military/i, '방산'],
  [/우주|space|satellite/i, '우주'],
  [/양자|quantum/i, '양자컴퓨팅'],
  [/로보틱스|robot|자동화|automation|자동차|EV|mobility/i, '로보틱스'],
]

export async function ensureTickerTheme(
  db: SupabaseClient,
  ticker: string,
  name: string,
  sector: string,
) {
  const normalizedTicker = ticker.replace('.KS', '')
  const isKR = /^\d{6}$/.test(normalizedTicker)
  const dbTicker = isKR ? `${normalizedTicker}.KS` : normalizedTicker

  const { data: existing } = await db
    .from('investment_tickers')
    .select('id')
    .eq('ticker', dbTicker)
    .maybeSingle()

  let tickerId = existing?.id
  if (!tickerId) {
    const { data: inserted, error } = await db
      .from('investment_tickers')
      .insert({ ticker: dbTicker, name, market: isKR ? 'KR' : 'US' })
      .select('id')
      .single()
    if (error || !inserted) return
    tickerId = inserted.id
  }

  const { count } = await db
    .from('investment_ticker_themes')
    .select('*', { count: 'exact', head: true })
    .eq('ticker_id', tickerId)
  if (count && count > 0) return

  const { data: themes } = await db
    .from('investment_themes')
    .select('id, name')
  if (!themes) return

  let themeId: string | null = null
  for (const [pattern, themeName] of SECTOR_THEME_MAP) {
    if (pattern.test(sector)) {
      const found = themes.find(t => t.name === themeName)
      if (found) { themeId = found.id; break }
    }
  }

  if (themeId) {
    await db.from('investment_ticker_themes').upsert(
      { ticker_id: tickerId, theme_id: themeId },
      { onConflict: 'ticker_id,theme_id' }
    )
  }
}
