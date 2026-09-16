/** ETF 일별 시계열을 차트에 올리기 전에 다듬는 것들. 순수 함수만 둔다. */

export interface DailyFigure {
  symbol: string
  date: string
  market_cap: number | null
}

/**
 * 하루치가 통째로 들어오지 않는 날을 메운다.
 *
 * AUM 적재가 종목마다 다른 작업으로 돌아서, 어떤 날은 일부 종목만 들어온다
 * (2026-09-15: 상장 당일 KCHP 만 적재되고 KDEF·KMCA·BOBP 는 하루 뒤에 들어왔다).
 * 그날 들어온 것만 더하면 합계가 $122M 에서 $0.24M 로 떨어져, 차트에서는 선이
 * 끊긴 것처럼 보인다. 빠진 종목은 직전에 본 값을 그대로 이어 쓴다(CEO 2026-09-16).
 *
 * 한 번도 안 나온 종목은 그 날짜에 아직 없는 것이므로 채우지 않는다 — 상장 전
 * 구간에 없던 AUM 을 지어내면 안 된다.
 */
export function carryForwardMissingDays(rows: DailyFigure[]): DailyFigure[] {
  const byDate = new Map<string, Map<string, number | null>>()
  for (const row of rows) {
    const forDate = byDate.get(row.date) ?? new Map<string, number | null>()
    forDate.set(row.symbol, row.market_cap)
    byDate.set(row.date, forDate)
  }

  const filled: DailyFigure[] = []
  const lastSeen = new Map<string, number | null>()
  for (const date of [...byDate.keys()].sort()) {
    for (const [symbol, value] of byDate.get(date)!) lastSeen.set(symbol, value)
    for (const [symbol, value] of lastSeen) filled.push({ symbol, date, market_cap: value })
  }
  return filled
}
