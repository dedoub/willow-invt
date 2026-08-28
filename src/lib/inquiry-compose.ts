// 답변 작성 상태와 "늦게 온 응답" 가드. 화면(React)에서 떼어 놓은 이유는 하나다 —
// 여기 걸린 두 결함이 다 실제 사고였고, 컴포넌트 안에 있으면 시험할 수가 없다.
//
//  1) 실패한 발행이 성공처럼 보인다. 서버가 확인하기 전에 입력창을 비우면 쓴 글이
//     사라지고, 실패 표시가 전역이면 A 스레드의 실패가 B 스레드 빈 칸 옆에 뜨면서
//     정작 A 에서는 지워진다. 그래서 초안도 실패도 **스레드마다** 따로 둔다.
//  2) 늦게 온 대화 응답이 엉뚱한 스레드에 꽂힌다. 요청마다 번호를 매기고 가장
//     최신 번호일 때만 반영한다. 가드는 **한 겹만** 둔다 — 두 겹이면 하나가 죽어도
//     시험이 초록이라, 죽은 걸 아무도 모른다.

/** 앱이 다르면 스레드 id 가 겹칠 수 있다. 화면 상태의 키는 항상 이 조합. */
export function composeKey(app: string, threadId: string): string {
  return `${app}:${threadId}`
}

export interface ComposeState {
  /** 스레드별 작성 중인 답변. 서버가 확인하기 전에는 절대 지우지 않는다. */
  drafts: Record<string, string>
  /** 스레드별 마지막 발행 실패 사유. */
  errors: Record<string, string>
  /**
   * 봇이 쓴 초안을 **한 글자도 고치지 않고** 들고 있는 스레드.
   *
   * 입력창의 진실은 여전히 `drafts` 하나다 — 이건 그 글이 어디서 왔는지를 적어
   * 두는 표시일 뿐이다. 화면이 "아직 아무도 승인 안 한 봇 초안"이라고 말하려면
   * 이 구별이 필요하다. 사람이 고치는 순간 걷힌다.
   */
  seeded: Record<string, true>
}

export const EMPTY_COMPOSE: ComposeState = { drafts: {}, errors: {}, seeded: {} }

/**
 * 입력. 그 스레드에 남아 있던 실패 표시는 다시 쓰기 시작하면 걷는다.
 * 사람이 손을 댄 순간부터는 봇 초안이 아니므로 seeded 표시도 걷는다.
 */
export function setDraft(state: ComposeState, key: string, text: string): ComposeState {
  const errors = { ...state.errors }
  delete errors[key]
  const seeded = { ...state.seeded }
  delete seeded[key]
  return { drafts: { ...state.drafts, [key]: text }, errors, seeded }
}

/**
 * 봇이 써 둔 초안을 입력창에 채운다.
 *
 * **그 스레드에 입력 이력이 있으면 아무것도 하지 않는다.** 사람이 쓰던 글은
 * 물론이고, 지워서 비워 둔 것도 사람의 결정이다 — 나중에 도착한 초안이 그걸
 * 덮으면 남의 글을 지우는 것이다. `key in drafts` 로 보는 이유가 이것이다
 * (`drafts[key]` 가 빈 문자열인 것과 아예 없는 것은 다르다).
 *
 * 같은 스레드를 다시 열어도 두 번 채우지 않는다 — 첫 채움으로 키가 생기므로
 * 그다음부터는 위 조건에 걸린다.
 */
export function seedDraft(state: ComposeState, key: string, text: string): ComposeState {
  if (key in state.drafts) return state
  if (text.trim() === '') return state
  return {
    drafts: { ...state.drafts, [key]: text },
    errors: state.errors,
    seeded: { ...state.seeded, [key]: true },
  }
}

/** 지금 입력창에 있는 글이 아무도 손대지 않은 봇 초안인가. */
export function isSeeded(state: ComposeState, key: string): boolean {
  return state.seeded[key] === true
}

/**
 * 발행 실패. 초안은 **그대로 둔다** — 사용자가 쓴 글은 서버가 받았다고 확인하기
 * 전까지 우리 것이 아니다. 사유는 그 스레드 칸에만 적는다.
 */
export function publishFailed(state: ComposeState, key: string, message: string): ComposeState {
  // seeded 도 그대로다. 발행이 실패했으면 그 글은 여전히 아무도 승인 안 한
  // 봇 초안이고, 화면은 계속 그렇게 말해야 한다.
  return { drafts: state.drafts, errors: { ...state.errors, [key]: message }, seeded: state.seeded }
}

/** 발행 성공(서버 확인 뒤에만 호출). 이때 비로소 그 스레드의 초안과 실패를 지운다. */
export function publishSucceeded(state: ComposeState, key: string): ComposeState {
  const drafts = { ...state.drafts }
  const errors = { ...state.errors }
  const seeded = { ...state.seeded }
  delete drafts[key]
  delete errors[key]
  delete seeded[key]
  return { drafts, errors, seeded }
}

export function draftOf(state: ComposeState, key: string): string {
  return state.drafts[key] ?? ''
}

export function errorOf(state: ComposeState, key: string): string | null {
  return state.errors[key] ?? null
}

// ─── 늦게 온 응답 가드 ─────────────────────────────────────────────────────────

export interface LatestOnly {
  /** 새 요청을 시작하고 표를 받는다. */
  begin(): number
  /** 이 표가 아직 최신인가. 아니면 그 응답은 버린다. */
  isCurrent(ticket: number): boolean
}

/**
 * 요청마다 번호를 하나 올린다. 응답이 돌아왔을 때 번호가 그대로면 반영하고,
 * 그 사이 다른 스레드를 골랐으면(번호가 올라갔으면) 버린다.
 *
 * 겹치는 두 선택으로 시험한다: A 시작 → B 시작 → B 도착(반영) → A 도착(버림).
 */
export function createLatestOnly(): LatestOnly {
  let seq = 0
  return {
    begin: () => ++seq,
    isCurrent: (ticket: number) => ticket === seq,
  }
}
