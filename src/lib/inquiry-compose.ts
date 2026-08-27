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
}

export const EMPTY_COMPOSE: ComposeState = { drafts: {}, errors: {} }

/** 입력. 그 스레드에 남아 있던 실패 표시는 다시 쓰기 시작하면 걷는다. */
export function setDraft(state: ComposeState, key: string, text: string): ComposeState {
  const errors = { ...state.errors }
  delete errors[key]
  return { drafts: { ...state.drafts, [key]: text }, errors }
}

/**
 * 발행 실패. 초안은 **그대로 둔다** — 사용자가 쓴 글은 서버가 받았다고 확인하기
 * 전까지 우리 것이 아니다. 사유는 그 스레드 칸에만 적는다.
 */
export function publishFailed(state: ComposeState, key: string, message: string): ComposeState {
  return { drafts: state.drafts, errors: { ...state.errors, [key]: message } }
}

/** 발행 성공(서버 확인 뒤에만 호출). 이때 비로소 그 스레드의 초안과 실패를 지운다. */
export function publishSucceeded(state: ComposeState, key: string): ComposeState {
  const drafts = { ...state.drafts }
  const errors = { ...state.errors }
  delete drafts[key]
  delete errors[key]
  return { drafts, errors }
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
