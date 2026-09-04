// 영작연습 출제 큐의 순수 부분 — DB를 모르므로 그냥 테스트된다.
// 복습 풀은 여기서 다루지 않는다: 오래 묵은 오답부터가 유일하게 맞는 순서라
// 사용자가 고를 여지가 없다.

export interface FreshItem {
  id: string
  created_at: string
  source_type?: string | null
}

/** 신규(미시도) 문항을 어떤 순서로 뽑을지. */
export type FreshOrder = 'oldest' | 'newest' | 'random' | 'spread'

const ORDERS: FreshOrder[] = ['oldest', 'newest', 'random', 'spread']

export function asFreshOrder(v: unknown): FreshOrder {
  return ORDERS.includes(v as FreshOrder) ? (v as FreshOrder) : 'oldest'
}

/**
 * 편향 없는 셔플.
 *
 * `sort(() => Math.random() - 0.5)`는 비교 함수가 일관되지 않아 결과가 균등하지
 * 않다 — 원래 순서 쪽으로 치우친다. 신규 묶음과 복습 묶음을 이어붙인 뒤 섞는
 * 구조라, 그 편향이 곧 "신규가 앞에 몰려 나온다"로 화면에 드러난다.
 */
export function shuffle<T>(list: readonly T[]): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** source_type별로 나눠 등록순을 지킨 버킷들. */
function bucketBySource(pool: readonly FreshItem[]): FreshItem[][] {
  const buckets = new Map<string, FreshItem[]>()
  for (const item of pool) {
    const key = item.source_type ?? 'unknown'
    const bucket = buckets.get(key)
    if (bucket) bucket.push(item)
    else buckets.set(key, [item])
  }
  return [...buckets.values()]
}

/**
 * 신규 문항 `count`개를 고른다. `pool`은 등록 오름차순이고 변경하지 않는다.
 *
 * - oldest: 지금까지의 기본. 오래된 미시도부터 차례로 소화한다.
 * - newest: 방금 만든 문항부터. 생성 직후 확인용.
 * - random: 미시도 전체에서 무작위. 새로 넣은 소재가 바로 섞여 나온다.
 * - spread: 소재(source_type)를 돌아가며. 한쪽 소재가 수백 개 쌓여 있어도
 *   다른 소재가 큐 뒤편에 묻히지 않는다 — 2026-09-04 회화 문항 40개가 신규
 *   큐 117번째부터 앉아 열두 큐 뒤에야 나오던 상태가 이걸 만든 이유다.
 */
export function selectFresh(
  pool: readonly FreshItem[],
  order: FreshOrder,
  count: number,
): FreshItem[] {
  const n = Math.max(0, Math.min(count, pool.length))
  if (n === 0) return []

  switch (order) {
    case 'newest':
      return [...pool].reverse().slice(0, n)
    case 'random':
      return shuffle(pool).slice(0, n)
    case 'spread': {
      const buckets = bucketBySource(pool)
      const out: FreshItem[] = []
      // 버킷을 한 바퀴씩 돌며 하나씩. 빈 버킷은 자연히 빠진다.
      for (let round = 0; out.length < n; round++) {
        let took = false
        for (const bucket of buckets) {
          if (round >= bucket.length) continue
          out.push(bucket[round])
          took = true
          if (out.length === n) break
        }
        if (!took) break
      }
      return out
    }
    case 'oldest':
    default:
      return pool.slice(0, n)
  }
}
