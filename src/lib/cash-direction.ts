/**
 * 현금 한 줄이 들어온 돈인가 나간 돈인가.
 *
 * 표에는 방향 칸이 없다. 구분(type)과 금액의 부호 둘을 같이 봐야 알 수 있고, 둘의 관계가
 * 구분마다 같지 않다. 실제 원장에서 읽어낸 규칙이다(2026-09-15, willow_mgmt_cash ·
 * tensw_mgmt_cash 전수 확인):
 *
 *  · 매출·부채·대체·환전은 부호가 곧 방향이다.
 *      대출금 입금 +105,730,750 / 대여금 상환 −20,000,000 / 외화환전 입금 +16,298,560
 *  · 비용과 자산은 거꾸로다. 비용 +는 나간 돈이고, 비용 −는 환급이라 들어온 돈이다
 *      ("카드 입금 (환급)" −960,000, "포인트리" −50,000). 자산도 마찬가지로 +는 사들여
 *      나간 돈, −는 "대여금 회수" −5,000,000 처럼 들어온 돈이다.
 *
 * 모르는 구분은 부호를 따른다 — 새 구분이 생겼을 때 비용처럼 뒤집어 읽는 것보다
 * 부호 그대로 읽는 편이 틀려도 덜 이상하다.
 */

/** 금액의 부호가 현금 방향과 반대인 구분. */
const FLIPPED = new Set(['expense', 'asset'])

export type CashDirection = 'in' | 'out' | 'none'

export function cashDirection(type: string | null | undefined, amount: number): CashDirection {
  if (!amount) return 'none'
  const inflow = FLIPPED.has(type ?? '') ? amount < 0 : amount > 0
  return inflow ? 'in' : 'out'
}

/** 표·지표에서 쓰는 색조. 0원은 색을 주지 않는다 — 방향이 없는 줄이다. */
export function cashTone(type: string | null | undefined, amount: number): 'pos' | 'neg' | 'text' {
  const dir = cashDirection(type, amount)
  return dir === 'in' ? 'pos' : dir === 'out' ? 'neg' : 'text'
}
