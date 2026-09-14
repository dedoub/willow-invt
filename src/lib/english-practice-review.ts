/**
 * 채점 뒤 보여 줄 것들과, 힌트 단계를 정하는 셈.
 *
 * 앞의 둘(교정 표시·조각 기록)은 스크립타 `src/features/practice/` 의
 * `correction-diff.ts`·`chunk-record.ts` 에서 가져왔다. 거기서 실제로 겪은 것이
 * 그대로 규칙이 되어 있어 다시 만들 이유가 없다(CEO 2026-09-14: "스크립타를 참고해").
 */

/* ── 낱말 다듬기 ──────────────────────────────────────────── */

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/…/g, '...')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

/* ── 교정 표시 ────────────────────────────────────────────── */

export type DiffPart = { text: string; changed: boolean }

/** 낱말과 그 사이 공백을 둘 다 남긴다 — 합치면 원문이 그대로 나와야 한다. */
function tokenize(sentence: string): string[] {
  return sentence.split(/(\s+)/).filter(token => token !== '')
}

const isSpace = (token: string) => /^\s+$/.test(token)

/**
 * 교정 문장을 조각으로 나누고, 내가 쓴 글에 없던 낱말에 표시를 단다.
 *
 * 두 문장을 나란히 놓기만 하면 오타 하나는 눈에 안 들어온다. 스크립타에서 실제로
 * `whilte` → `white` 한 글자가 묻혔고, 쓴 사람은 "교정문이 내 것과 똑같다"고 읽었다.
 *
 * 최장 공통 부분수열로 맞춘다. 앞뒤에서 같은 것만 걷어내면 가운데 낱말 하나가 늘거나
 * 빠졌을 때 그 뒤가 전부 "바뀐 것"으로 밀린다. 낱말 단위로 견주는 이유도 같다 —
 * 글자 단위로 가면 `whilte`/`white` 가 조각나 오히려 읽기 어렵다.
 */
export function correctionDiff(mine: string, corrected: string): DiffPart[] {
  const source = tokenize(mine)
  const target = tokenize(corrected)
  if (target.length === 0) return []

  // lcs[i][j] = source[i..] 와 target[j..] 의 최장 공통 길이
  const lcs: number[][] = Array.from({ length: source.length + 1 }, () => new Array<number>(target.length + 1).fill(0))
  for (let i = source.length - 1; i >= 0; i--) {
    for (let j = target.length - 1; j >= 0; j--) {
      lcs[i][j] = source[i] === target[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const parts: DiffPart[] = []
  let i = 0
  let j = 0
  while (j < target.length) {
    if (i < source.length && source[i] === target[j]) {
      parts.push({ text: target[j], changed: false })
      i += 1; j += 1
      continue
    }
    if (i < source.length && lcs[i + 1][j] >= lcs[i][j + 1]) {
      // 내가 쓴 낱말이 빠졌다. 교정문에는 남길 것이 없으므로 건너뛴다.
      i += 1
      continue
    }
    // 공백은 바뀐 것으로 칠하지 않는다 — 칠해도 보이지 않고 조각만 늘어난다.
    parts.push({ text: target[j], changed: !isSpace(target[j]) })
    j += 1
  }

  // 같은 표시가 이어지면 하나로 합친다 — 상자마다 span 이 흩어지지 않게.
  return parts.reduce<DiffPart[]>((merged, part) => {
    const last = merged[merged.length - 1]
    if (last && last.changed === part.changed) last.text += part.text
    else merged.push({ ...part })
    return merged
  }, [])
}

/* ── 조각 기록 ────────────────────────────────────────────── */

/** 낱말의 이만큼이 차례대로 들어 있으면 「썼다」로 친다. */
const HIT_RATIO = 0.8

function words(value: string): string[] {
  return normalize(value)
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .split(' ')
    .filter(word => word.length > 0)
}

/**
 * 이 조각을 답에 썼는가.
 *
 * 채점이 아니라 기록이다. 관사 하나 빠진 것까지 빨갛게 찍으면 띠가 온통 빨개져
 * 정작 늘 빠지는 자리가 안 보인다. AI 를 부르지 않는다.
 *
 * **스크립타와 한 가지가 다르다: 차례를 따지지 않는다.** 거기서는 읽은 글을 그대로
 * 따라 쓰므로 낱말 차례가 곧 정답이다. 여기서는 뜻만 주고 문장은 스스로 세우기 때문에,
 * 같은 말을 다른 자리에 놓는 것이 오답이 아니다. 차례를 따졌더니 "it can increase
 * control" 을 "it increase control ... and can" 으로 쓴 답에서 이 조각이 빠진 것으로
 * 잡혔다 — 낱말은 다 썼는데도(2026-09-14 실측).
 */
export function chunkWritten(chunk: string, answer: string): boolean {
  const need = words(chunk)
  if (need.length === 0) return false
  const have = [...words(answer)]
  let matched = 0
  for (const word of need) {
    const at = have.indexOf(word)
    if (at < 0) continue
    // 쓴 낱말은 덜어 낸다 — 답에 한 번 나온 the 로 조각의 the 둘을 채우지 않게.
    have.splice(at, 1)
    matched += 1
  }
  return matched / need.length >= HIT_RATIO
}

/** 조각마다 이번 답에 썼는지. 점수는 문장 단위라 어느 자리가 약한지 말해 주지 않는다. */
export function chunkRecord(chunks: string[], answer: string): boolean[] {
  return chunks.map(chunk => chunkWritten(chunk, answer))
}

/* ── 힌트 단계 ────────────────────────────────────────────── */

/** 힌트 단계. 숫자가 클수록 덜 보여 준다. */
export const HINT_CHUNKS = 1
export const HINT_SENTENCE = 2
export const HINT_TOPIC = 3
export type HintLevel = 1 | 2 | 3

export const HINT_LABEL: Record<HintLevel, string> = {
  1: '청킹',
  2: '문장 전체',
  3: '주제만',
}

/**
 * 마지막 시도부터 거꾸로 세어 연속 합격 수.
 *
 * 시도는 오래된 것부터 들어온다. 마지막이 불합격이면 0이다 — 예전에 아무리 붙었어도
 * 방금 틀렸으면 다시 처음부터다.
 */
export function passStreak(attempts: { passed: boolean }[]): number {
  let streak = 0
  for (let i = attempts.length - 1; i >= 0; i--) {
    if (!attempts[i].passed) break
    streak += 1
  }
  return streak
}

/**
 * 연속 정답 수로 정하는 힌트 단계.
 * 두 번 연속 맞으면 청킹을 걷고 문장만, 세 번째부터는 주제만 남긴다(CEO 2026-09-14).
 */
export function hintLevelFor(streak: number): HintLevel {
  if (streak >= 3) return HINT_TOPIC
  if (streak >= 2) return HINT_SENTENCE
  return HINT_CHUNKS
}

/** 힌트를 눌러 되돌린 만큼 낮춘 단계. 청킹보다 더 내려갈 곳은 없다. */
export function easedLevel(base: HintLevel, stepsBack: number): HintLevel {
  return Math.max(HINT_CHUNKS, base - Math.max(0, stepsBack)) as HintLevel
}
