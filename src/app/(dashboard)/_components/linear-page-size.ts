/**
 * 표의 "N개씩 보기" 값 저장.
 *
 * 값 자체는 각 블록의 입력칸이 들고, 여기서는 표별 키와 유효 범위만 한곳에 모은다.
 */

const STORAGE_PREFIX = 'page-size:'
const DEFAULT_PAGE_SIZE = 10

/** 표별로 마지막에 고른 행수. 서버 렌더 중에는 기본값 */
export function getStoredPageSize(key: string, fallback = DEFAULT_PAGE_SIZE): number {
  if (typeof window === 'undefined') return fallback
  const n = Number(localStorage.getItem(STORAGE_PREFIX + key))
  return n >= 5 && n <= 100 ? n : fallback
}

export function savePageSize(key: string, n: number): void {
  localStorage.setItem(STORAGE_PREFIX + key, String(n))
}
