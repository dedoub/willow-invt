/**
 * GEO 단계·원인 어휘와 화면이 받는 자료 모양.
 *
 * 집계(geo-answers.ts)에서 떼어낸 이유는 하나다 — 이걸 쓰는 카드가 클라이언트
 * 컴포넌트인데, 집계 쪽은 서비스 키 supabase와 GSC 클라이언트를 물고 있어서 같이 있으면
 * google-auth-library까지 브라우저 번들로 딸려온다. 여기에는 값과 타입만 둘 것.
 */

// ─── 단계와 원인 ──────────────────────────────────────────────────────────────

/** 질문 하나에서 우리가 어디까지 갔는가. 색인 5단계와 같은 문법으로 읽는다. */
export type GeoStage = 'absent' | 'cited' | 'mentioned' | 'recommended'

/**
 * 실패 원인. 처방이 서로 완전히 다르므로 섞으면 안 된다.
 *   index      우리 페이지가 색인조차 안 됐다 → 답변엔진이 인용할 대상이 없다
 *   authority  색인은 됐는데 출처로 한 번도 안 잡힌다 → 신뢰도·외부 언급 문제
 *   content    출처로는 잡히는데 추천은 안 된다 → 페이지가 그 질문에 답하지 않는다
 *   competitor 언급까지는 되는데 특정 경쟁사가 Top3를 계속 가져간다
 */
export type GeoCause = 'index' | 'authority' | 'content' | 'competitor' | null

export const CAUSE_LABEL: Record<Exclude<GeoCause, null>, string> = {
  index: '색인',
  authority: '외부 신뢰도',
  content: '콘텐츠',
  competitor: '경쟁사 우위',
}

export const STAGE_LABEL: Record<GeoStage, string> = {
  absent: '미등장',
  cited: '인용만',
  mentioned: '언급',
  recommended: '추천 Top3',
}

export interface GeoRates {
  runs: number
  mentioned: number
  top3: number
  cited: number
}

export interface GeoQuestionRow {
  questionId: string
  question: string
  priority: number
  runs: number
  mentioned: number
  top3: number
  cited: number
  stage: GeoStage
  cause: GeoCause
  competitors: string[]
  lastMeasured: string | null
}

export interface GeoAction {
  id: number
  questionId: string | null
  cause: string | null
  actionType: string
  title: string
  status: string
  shippedOn: string | null
  baselineTop3: number | null
  resultTop3: number | null
  verdict: string | null
}

export interface GeoAnswerStats {
  site: string
  days: string[]
  /** 최신 회차가 속한 주(measured_week = 그 주 월요일). 측정을 실행한 날이 아니다 */
  latestDay: string | null
  baselineDay: string | null
  /** 그 주에 마지막으로 잰 시각. 주 라벨만 보면 재측정해도 안 움직이는 것처럼 보인다 */
  latestMeasuredAt: string | null
  latest: GeoRates
  baseline: GeoRates
  byEngine: Array<{ engine: string } & GeoRates>
  questions: GeoQuestionRow[]
  causes: Array<{ cause: Exclude<GeoCause, null>; questions: number }>
  competitors: Array<{ name: string; answers: number }>
  actions: GeoAction[]
  daily: Array<{ date: string; top3: number; mentioned: number; cited: number }>
  /** AI 답변에서 넘어온 클릭 (vc_crawl_log referral) */
  aiClicks: { today: number; last7d: number; total: number }
  /** 색인된 대표 URL 수 — index 원인 판정의 근거 */
  indexedPages: number
}
