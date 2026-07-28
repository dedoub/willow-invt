/**
 * 표별 보기 설정 저장 — 행수와 정렬.
 *
 * 값 자체는 각 표가 들고, 여기서는 표별 키와 유효 범위만 한곳에 모은다.
 */

const STORAGE_PREFIX = 'page-size:'
const SORT_PREFIX = 'table-sort:'
const DEFAULT_PAGE_SIZE = 10

/** 표별로 마지막에 고른 행수. 서버 렌더 중에는 기본값 */
export function getStoredPageSize(key: string, fallback = DEFAULT_PAGE_SIZE): number {
  if (typeof window === 'undefined') return fallback
  const n = Number(localStorage.getItem(STORAGE_PREFIX + key))
  return n >= 1 && n <= 100 ? n : fallback
}

export function savePageSize(key: string, n: number): void {
  localStorage.setItem(STORAGE_PREFIX + key, String(n))
}

export interface StoredSort {
  /** 정렬 컬럼의 key. 컬럼 구성이 바뀌어 사라졌으면 복원하지 않는다 */
  col: string
  dir: 'asc' | 'desc'
}

/**
 * 표별 마지막 정렬. 컬럼 순서(인덱스)가 아니라 key로 저장한다 —
 * 컬럼을 넣고 빼면 인덱스는 다른 컬럼을 가리키게 된다.
 */
export function getStoredSort(key: string): StoredSort | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(SORT_PREFIX + key)
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as StoredSort
    return typeof v?.col === 'string' && (v.dir === 'asc' || v.dir === 'desc') ? v : null
  } catch {
    return null
  }
}

/** null이면 정렬 해제 상태를 저장한다(원본 순서로 돌아온다) */
export function saveSort(key: string, sort: StoredSort | null): void {
  if (sort) localStorage.setItem(SORT_PREFIX + key, JSON.stringify(sort))
  else localStorage.removeItem(SORT_PREFIX + key)
}
