/**
 * 세 앱(보이스카드·리뷰노트·스크립타)의 크레딧 요율 — <b>목록과 판정 규칙</b>.
 *
 * 값 자체는 각 앱 DB 의 요율 표에 있다. 여기 있는 `fallback` 은 각 앱 코드에
 * 박힌 기본값을 옮겨 적은 것으로, 표가 비었을 때 그 앱이 실제로 무엇으로 도는지
 * 보여 주기 위한 것이다.
 *
 * <b>왜 한 곳인가</b>: 요율을 판단하는 자가 세 곳에 흩어져 있으면 같은 기능이
 * 화면에서는 띠 안, 주간 보고에서는 띠 밖으로 나온다. 실제로 감사 스크립트가
 * 요율을 따로 적어 두고 있었다. 화면도 스크립트도 이 파일 하나를 읽는다.
 *
 * 서버 전용이 아니다 — 화면이 그대로 import 한다. DB 접속은 `credit-rates.ts`.
 */

export const MICROS_PER_CREDIT = 9_900          // 크레딧 하나의 판매가(세 앱 공통)
export const TARGET_MARGIN = 0.85
export const ALLOWED_MICROS = MICROS_PER_CREDIT * (1 - TARGET_MARGIN)   // 1,485
export const MARGIN_BAND: [number, number] = [0.80, 0.90]
/** 이보다 표본이 적으면 판정만 하고 값을 바꾸라고 하지 않는다. */
export const MIN_SAMPLES = 3

export type AppKey = 'voicecards' | 'reviewnotes' | 'scripta'

/**
 * `credits`   — 값이 곧 크레딧. 올리면 사용자가 더 낸다.
 * `perCredit` — 「N개당 1크레딧」. <b>올리면 덜 낸다.</b>
 * `milli`     — 1,000분의 1크레딧. 스크립타의 채점만 이 단위다.
 *
 * 이 구별을 화면이 말해 주지 않으면 태그 정리를 3에서 10으로 올리며 「비싸게
 * 받는다」고 착각한다. 실제로는 3분의 1 값이 된다.
 */
export type RateUnit = 'credits' | 'perCredit' | 'milli'

export interface RateEntry {
  key: string
  label: string
  unit: RateUnit
  /** 그 앱 코드에 박힌 값. DB 가 비면 이걸로 돈다. */
  fallback: number
  hint: string
  /** 실측 원가가 이 이름으로 쌓인다. 없으면 실측이 없는 요율이다. */
  costFeature?: string
  /**
   * 실측 한 건이 <b>지금 요율로</b> 몇 크레딧인지. 리뷰노트처럼 건별 meta 가
   * 남는 앱만 쓴다. `value` 는 지금 이 요율의 값이다 — 옛 행에 적힌 크레딧을
   * 그대로 쓰면 요율을 바꾼 뒤 옛 행과 새 행이 다른 자를 쓰게 된다.
   */
  creditsOf?: (meta: Record<string, unknown>, value: number) => number
  /**
   * 실측이 없어도 <b>정가</b>로 원가를 알 수 있는 요율. 크레딧 하나에 드는
   * 마이크로달러를 요율 값에서 계산한다(보이스카드 TTS: 공급가 × 단위 수).
   */
  listMicrosPerCredit?: (value: number) => number
}

export interface AppRates {
  key: AppKey
  label: string
  /** 요율 표가 있는 DB 와 표 이름 — 화면이 어디를 고치는지 말해 준다. */
  table: string
  entries: RateEntry[]
  /** 실측 원가를 어디서 읽는지. 없으면 「정가 기준」만 보인다. */
  costSource?: string
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export const APPS: AppRates[] = [
  {
    key: 'voicecards',
    label: 'VoiceCards',
    table: 'public.ai_rates',
    // 원가 로그가 없다. 대신 Google TTS 공급가가 문자·바이트당으로 공개돼 있어
    // 요율에서 바로 원가가 나온다 — 실측보다 약하지만 띠를 벗어나면 보인다.
    entries: [
      {
        key: 'ttsUnits.premium',
        label: '프리미엄 음성',
        unit: 'perCredit',
        fallback: 100,
        hint: 'WaveNet·Neural2. 이 문자 수당 1크레딧. 공급가 $16/100만 자.',
        listMicrosPerCredit: (units) => units * 16,
      },
      {
        key: 'ttsUnits.hd',
        label: 'HD 음성',
        unit: 'perCredit',
        fallback: 50,
        hint: 'Chirp3-HD. 이 <b>바이트</b> 수당 1크레딧(한글 한 자는 3바이트). 공급가 $30/100만.',
        listMicrosPerCredit: (units) => units * 30,
      },
    ],
  },
  {
    key: 'reviewnotes',
    label: 'ReviewNotes',
    table: 'public."AiCreditRate"',
    costSource: 'EventLog(name=ai_tokens)',
    entries: [
      {
        key: 'regionCreditsPerPage', label: '지면 크롭', unit: 'credits', fallback: 2,
        hint: 'PDF 한 쪽에서 문항 자리를 찾아낸다. 쪽당.',
        costFeature: 'pageRegions',
        creditsOf: (m, v) => num(m.pages) * v,
      },
      {
        key: 'groupingRegionsPerCredit', label: '자리 그룹핑', unit: 'perCredit', fallback: 20,
        hint: '찾아낸 자리를 문항·답으로 묶는다. 이 개수당 1크레딧.',
        costFeature: 'regionGrouping',
        creditsOf: (m, v) => Math.max(1, Math.ceil(num(m.pairs ?? m.regions) / Math.max(1, v))),
      },
      {
        key: 'documentCreditsPerPage', label: '문서 추출', unit: 'credits', fallback: 2,
        hint: 'PDF·이미지에서 문항과 답을 글로 뽑는다. 쪽당.',
        costFeature: 'documentExtraction',
        creditsOf: (m, v) => Math.max(10, Math.max(1, num(m.pages)) * v),
      },
      {
        key: 'documentMinimumCredits', label: '문서 추출 최소', unit: 'credits', fallback: 10,
        hint: '쪽수가 적어도 이만큼은 받는다.',
      },
      {
        key: 'deepSolution', label: '심화 풀이', unit: 'credits', fallback: 8,
        hint: '이미 있는 풀이 위에 한 단계 더 깊게 설명한다.',
        costFeature: 'deepSolution',
        creditsOf: (_m, v) => v,
      },
      {
        key: 'deepSolutionWithImages', label: '심화 풀이(그림)', unit: 'credits', fallback: 9,
        hint: '그림이 붙은 문항. 입력만 늘어 차이가 작다.',
      },
      {
        key: 'textSolutionProblemsPerCredit', label: '풀이 생성', unit: 'perCredit', fallback: 1,
        hint: '글 문항의 풀이. 이 문항 수당 1크레딧.',
        costFeature: 'textSolution',
        creditsOf: (m, v) => Math.max(1, Math.ceil(Math.max(1, num(m.problems)) / Math.max(1, v))),
      },
      {
        key: 'imageSolutionPerProblem', label: '이미지 풀이', unit: 'credits', fallback: 5,
        hint: '그림 문항의 풀이. 문항당.',
      },
      {
        key: 'imageTagProblemsPerCredit', label: '이미지 태그 제안', unit: 'perCredit', fallback: 1,
        hint: '그림에서 단원·유형을 읽어 낸다. 이 문항 수당 1크레딧.',
        costFeature: 'imageTagSuggestion',
        creditsOf: (m, v) => Math.max(1, Math.ceil(Math.max(1, num(m.problems)) / Math.max(1, v))),
      },
      {
        key: 'textTagSuggestion', label: '텍스트 태그 제안', unit: 'credits', fallback: 5,
        hint: '글 문항에서 단원·유형을 제안한다. 한 번당.',
        costFeature: 'textTagSuggestion',
        creditsOf: (_m, v) => v,
      },
      {
        key: 'tagReviewProblemsPerCredit', label: '태그 정리', unit: 'perCredit', fallback: 3,
        hint: '붙은 태그를 훑어 고친다. 이 문항 수당 1크레딧.',
        costFeature: 'tagReview',
        creditsOf: (m, v) => Math.max(1, Math.ceil(Math.max(1, num(m.problems)) / Math.max(1, v))),
      },
      {
        key: 'similarProblem', label: '유사 문제', unit: 'credits', fallback: 5,
        hint: '틀린 문항을 닮은 새 문항을 만든다. 한 번당.',
        costFeature: 'similarProblem',
        creditsOf: (_m, v) => v,
      },
      {
        key: 'setSelection', label: '세트 선택', unit: 'credits', fallback: 5,
        hint: '문제 세트를 자동으로 고른다. 한 번당.',
        costFeature: 'setSelection',
        creditsOf: (_m, v) => v,
      },
    ],
  },
  {
    key: 'scripta',
    label: 'Scripta',
    table: 'public.scripta_ai_rates',
    costSource: 'sc_ai_cost_summary()',
    entries: [
      {
        key: 'correctionMilli.sentence', label: '문장 채점', unit: 'milli', fallback: 287,
        hint: '문장 하나를 교정·채점한다. 잔여는 이월된다.',
        costFeature: 'sentence',
      },
      {
        key: 'correctionMilli.paragraph', label: '문단 채점', unit: 'milli', fallback: 356,
        hint: '문단 하나를 교정·채점한다.',
        costFeature: 'paragraph',
      },
      {
        key: 'correctionMilli.text', label: '글 채점', unit: 'milli', fallback: 1_000,
        hint: '글 한 편을 통째로 교정·채점한다.',
        costFeature: 'text',
      },
      {
        key: 'structureCreditsPerBatch', label: '구조 생성', unit: 'credits', fallback: 4,
        hint: '글을 문단·문장·의미 조각으로 나눈다. 2,000자 조각당.',
        costFeature: 'structure',
      },
      {
        key: 'handwritingReadCredits', label: '손글씨 읽기', unit: 'credits', fallback: 1,
        hint: '펜으로 쓰거나 찍은 답을 글로 읽어 온다. 한 장당.',
        costFeature: 'handwriting',
      },
    ],
  },
]

export function appOf(key: string): AppRates | undefined {
  return APPS.find((a) => a.key === key)
}

export function entryOf(app: AppRates, key: string): RateEntry | undefined {
  return app.entries.find((e) => e.key === key)
}

/** 이 요율이 한 번에 사 가는 크레딧. 밀리는 1,000으로 나눈다. */
export function creditsPerCall(entry: RateEntry, value: number): number {
  return entry.unit === 'milli' ? value / 1_000 : value
}

export interface Sample {
  n: number
  totalCost: number
  totalCredits: number
  worstPerCredit: number
}

export type Basis = 'measured' | 'list'

export interface Verdict {
  mark: '✅' | '⚠️' | '❔' | '❌'
  n: number
  basis: Basis | null
  margin?: number
  worstMargin?: number
  /** 마진 85%로 맞추려면 이 값이어야 한다. 표본이 얇으면 내지 않는다. */
  suggested?: number
  note: string
}

/**
 * 실측(또는 정가)에서 마진을 내고 띠 안인지 본다.
 *
 * <b>표본이 얇으면 값을 바꾸라고 하지 않는다.</b> 그 한 건이 최악값일 때 모두가
 * 그 값을 낸다 — 실제로 지면 크롭을 그렇게 1에서 12로 올렸다가 마진이 97.5%로
 * 반대쪽으로 넘쳤다.
 */
export function verdictFor(entry: RateEntry, value: number, sample: Sample | null): Verdict {
  if (!sample || sample.n === 0) {
    const micros = entry.listMicrosPerCredit?.(value)
    if (micros === undefined) {
      return { mark: '❌', n: 0, basis: null, note: '실측 0건 — 계측이 붙어 있는지 확인' }
    }
    const margin = 1 - micros / MICROS_PER_CREDIT
    const mark = margin < MARGIN_BAND[0] || margin > MARGIN_BAND[1] ? '⚠️' : '✅'
    return {
      mark, n: 0, basis: 'list', margin, worstMargin: margin,
      suggested: mark === '⚠️' ? (ALLOWED_MICROS / micros) * value : undefined,
      note: mark === '✅' ? '정가 기준 띠 안' : '정가 기준 띠 밖',
    }
  }
  if (sample.totalCredits <= 0) {
    return { mark: '❔', n: sample.n, basis: 'measured', note: '크레딧 0 — 셀 수 없음' }
  }
  const perCredit = sample.totalCost / sample.totalCredits
  const margin = 1 - perCredit / MICROS_PER_CREDIT
  const worstMargin = 1 - sample.worstPerCredit / MICROS_PER_CREDIT
  const base = { n: sample.n, basis: 'measured' as const, margin, worstMargin }

  if (sample.n < MIN_SAMPLES) {
    return { ...base, mark: '❔', note: `표본 ${sample.n}건 — 값을 바꾸기엔 얇다` }
  }
  // 「이 값이어야 한다」는 단위에 따라 방향이 뒤집힌다. perCredit 은 올릴수록
  // 싸지므로, 원가가 두 배면 요율을 <b>반으로</b> 내려야 마진이 산다.
  const scale = sample.totalCost / ALLOWED_MICROS / sample.totalCredits
  const suggested = entry.unit === 'perCredit' ? value / scale : value * scale
  if (margin < MARGIN_BAND[0]) return { ...base, mark: '⚠️', suggested, note: '띠 아래 — 값을 올려야 한다' }
  if (margin > MARGIN_BAND[1]) return { ...base, mark: '⚠️', suggested, note: '띠 위 — 값을 내려야 한다' }
  return { ...base, mark: '✅', note: '띠 안' }
}

export const pct = (v: number | undefined): string =>
  v === undefined ? '—' : `${(v * 100).toFixed(1)}%`
