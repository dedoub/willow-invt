/**
 * 거래일 환율 조회 — 보유현황과 포트폴리오분석이 **같은 함수를 쓰도록** 뽑아낸 것.
 *
 * 왜 공용인가: 두 화면이 각자 조회를 들고 있다가 총손익이 137만원 어긋났다(2026-08-05).
 * 분석 쪽은 `stockHistory` 날짜 집합(1년치 거래일)에 forward-fill한 Map을 쓰고 있었는데,
 * 그 집합에 없는 날짜는 조회가 빗나가 **오늘 환율로 떨어졌다**. 해당하는 미국 거래일이 28개,
 * 2025-04-14부터 있었다 — 1년 이전 거래와 거래일이 아닌 날짜(주말·휴일)에 입력된 거래다.
 * 옛날에 산 달러 원가를 오늘 환율로 환산하니 원가와 실현손익이 통째로 틀어졌다.
 *
 * 그래서 조회 기준을 "그 날짜 이하의 가장 최근 환율"로 통일한다. 환율 이력(2년치)에
 * 직접 이분탐색하므로 거래일이 아니어도, 1년보다 오래돼도 맞는 값이 나온다.
 */

export type FxLookup = (date: string) => number

/**
 * @param fxHistory `YYYY-MM-DD` → USD/KRW
 * @param fallbackRate 이력보다 앞선 날짜에 쓸 값 (보통 현재 환율)
 */
export function createFxLookup(fxHistory: Record<string, number>, fallbackRate: number): FxLookup {
  const dates = Object.keys(fxHistory).filter(d => fxHistory[d] > 0).sort()
  if (dates.length === 0) return () => fallbackRate

  // 이력보다 앞선 날짜는 현재 환율보다 **가장 오래된 실제 환율**이 가깝다.
  const earliest = fxHistory[dates[0]]

  return (date: string): number => {
    const exact = fxHistory[date]
    if (exact > 0) return exact
    if (date < dates[0]) return earliest
    // date 이하의 마지막 원소를 찾는다
    let lo = 0, hi = dates.length - 1, found = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (dates[mid] <= date) { found = mid; lo = mid + 1 } else { hi = mid - 1 }
    }
    return found >= 0 ? fxHistory[dates[found]] : fallbackRate
  }
}
