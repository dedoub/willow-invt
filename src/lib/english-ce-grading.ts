export const COMPOSITION_GRADE_LEVELS = [
  'paragraph_structure',
  'paragraph_sentence_structure',
  'sentence_quality',
] as const

export type CompositionGradeLevel = (typeof COMPOSITION_GRADE_LEVELS)[number]

export interface RawCompositionPoint {
  level?: string
  earned?: number
  possible?: number
  note?: string
  nextPractice?: string
}

export interface CompositionGradePoint {
  level: CompositionGradeLevel
  earned: number
  possible: number
  note: string
  nextPractice: string
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function possibleMarks(maxScore: number): [number, number, number] {
  if (maxScore === 35) return [10, 15, 10]
  const paragraph = Math.round(maxScore * 10 / 35)
  const paragraphSentences = Math.round(maxScore * 15 / 35)
  return [paragraph, paragraphSentences, Math.max(0, maxScore - paragraph - paragraphSentences)]
}

function isGradeLevel(value: string | undefined): value is CompositionGradeLevel {
  return COMPOSITION_GRADE_LEVELS.includes(value as CompositionGradeLevel)
}

const FALLBACK_FEEDBACK: Record<CompositionGradeLevel, { note: string; nextPractice: string }> = {
  paragraph_structure: {
    note: '문단 구성 근거가 충분하지 않아 점수를 주지 않았어요.',
    nextPractice: '쓰기 전에 각 문단의 역할을 한 줄씩 적어 보세요.',
  },
  paragraph_sentence_structure: {
    note: '문단 안 문장 구성 근거가 충분하지 않아 점수를 주지 않았어요.',
    nextPractice: '한 문단을 주장, 설명, 예시 순서로 다시 써 보세요.',
  },
  sentence_quality: {
    note: '개별 문장의 완성도를 판단할 근거가 충분하지 않았어요.',
    nextPractice: '문장 하나씩 주어, 동사, 문장부호를 확인해 보세요.',
  },
}

function cleanFeedback(value: unknown, fallback: string): string {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || fallback
}

export function normaliseCompositionGrade(
  rawScore: number,
  maxScore: number,
  rawPoints: RawCompositionPoint[],
): { score: number; points: CompositionGradePoint[] } {
  const safeMax = Math.max(0, Math.round(Number(maxScore) || 0))
  const weights = possibleMarks(safeMax)
  const byLevel = new Map<CompositionGradeLevel, RawCompositionPoint>()
  for (const point of rawPoints) {
    if (isGradeLevel(point.level) && !byLevel.has(point.level)) byLevel.set(point.level, point)
  }

  const hasUsablePoints = [...byLevel.values()].some(point => Number.isFinite(Number(point.earned)))
  const fallbackScore = clamp(Math.round(Number(rawScore) || 0), 0, safeMax)
  let fallbackRemaining = fallbackScore

  const points = COMPOSITION_GRADE_LEVELS.map((level, index) => {
    const possible = weights[index]
    const raw = byLevel.get(level)
    let earned: number

    if (raw && Number.isFinite(Number(raw.earned))) {
      const rawPossible = Number(raw.possible)
      const rawEarned = Number(raw.earned)
      earned = Number.isFinite(rawPossible) && rawPossible > 0
        ? Math.round((rawEarned / rawPossible) * possible)
        : Math.round(rawEarned)
      earned = clamp(earned, 0, possible)
    } else if (!hasUsablePoints) {
      earned = Math.min(possible, fallbackRemaining)
      fallbackRemaining -= earned
    } else {
      earned = 0
    }

    const fallback = FALLBACK_FEEDBACK[level]
    return {
      level,
      earned,
      possible,
      note: cleanFeedback(raw?.note, fallback.note),
      nextPractice: cleanFeedback(raw?.nextPractice, fallback.nextPractice),
    }
  })

  return {
    score: points.reduce((sum, point) => sum + point.earned, 0),
    points,
  }
}
