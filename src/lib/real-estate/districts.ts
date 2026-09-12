/**
 * 국토부 실거래 수집 대상 자치구 — 단일 진실원.
 *
 * 크론 라우트(src/app/api/cron/real-estate-sync/route.ts)와 백필 스크립트
 * (scripts/real-estate-pipeline.ts)가 같은 목록을 각자 복사해 들고 있었다.
 * 한쪽만 고치면 매일 도는 수집과 과거 백필의 범위가 갈라져, 새 구가 최근 두 달만
 * 있고 과거가 비거나 그 반대가 된다. 그런 어긋남은 화면에서 "그 구는 원래 거래가
 * 적나 보다" 로 읽혀 한참 뒤에나 드러난다.
 *
 * 수집은 구 단위 전량이다 — LAWD_CD 하나로 그 구의 모든 아파트 거래가 들어온다.
 * 추적 단지(re_complexes.is_tracked)와는 무관하며, 단지 필터는 조회 시점에 걸린다.
 */

/** 강남 3구 — 호가 크롤링과 단지별 카드가 붙어 있는 기존 추적 권역 */
export const CORE_DISTRICTS: Record<string, string> = {
  '11680': '강남구',
  '11650': '서초구',
  '11710': '송파구',
}

/**
 * 외곽 6구 — 강남 3구와 추세를 견주기 위한 비교 권역(2026-09-13).
 * 실거래만 받는다. 네이버 호가는 단지별 크롤링이라 손이 많이 들고 추세 비교에는
 * 쓰지 않으므로 켜지 않는다.
 *
 * 두 묶음으로 나눠 보는 것이 국내 시장 논의의 관행이다:
 *   노도강 = 노원·도봉·강북, 금관구 = 금천·관악·구로
 */
export const OUTER_DISTRICTS: Record<string, string> = {
  '11350': '노원구',
  '11320': '도봉구',
  '11305': '강북구',
  '11545': '금천구',
  '11620': '관악구',
  '11530': '구로구',
}

/** 수집 대상 전체. 크론과 백필이 모두 이걸 돈다. */
export const DISTRICTS: Record<string, string> = {
  ...CORE_DISTRICTS,
  ...OUTER_DISTRICTS,
}

/** 권역 묶음 — 지수 비교의 단위. 구 하나씩 보는 화면이 아니다. */
export const DISTRICT_ZONES = {
  강남3구: Object.keys(CORE_DISTRICTS),
  노도강: ['11350', '11320', '11305'],
  금관구: ['11545', '11620', '11530'],
} as const

export type DistrictZone = keyof typeof DISTRICT_ZONES

export function zoneOf(districtCode: string): DistrictZone | null {
  for (const [zone, codes] of Object.entries(DISTRICT_ZONES)) {
    if ((codes as readonly string[]).includes(districtCode)) return zone as DistrictZone
  }
  return null
}
