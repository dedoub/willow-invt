// 마이크 받아쓰기의 순수 부분 — 브라우저 API를 모르므로 그냥 테스트된다.
// 훅(use-dictation.ts)이 SpeechRecognition 수명을 맡고, 문자열 조립은 여기서 한다.

export interface RecognitionPiece {
  transcript: string
  isFinal: boolean
}

/**
 * `onresult`가 준 조각들을 확정분과 중간분으로 가른다.
 *
 * 확정분만 입력창에 들어가고 중간분은 미리보기로만 쓴다. 중간분은 다음 이벤트에서
 * 통째로 갈리는 값이라 입력창에 넣으면 글자가 계속 덮어써진다.
 */
export function partitionResults(results: RecognitionPiece[]): { final: string; interim: string } {
  let final = ''
  let interim = ''
  for (const piece of results || []) {
    const text = String(piece?.transcript ?? '').trim()
    if (!text) continue
    if (piece.isFinal) final = final ? `${final} ${text}` : text
    else interim = interim ? `${interim} ${text}` : text
  }
  return { final, interim }
}

/**
 * 확정분을 입력창 내용 뒤에 잇는다.
 *
 * 침묵 구간에서 빈 확정분이 올라오는 일이 있는데, 그때 꼬리 공백을 붙이면 커서가
 * 밀리기만 하고 얻는 게 없다. 그래서 빈 추가분은 원문을 그대로 돌려준다.
 */
export function appendTranscript(existing: string, addition: string): string {
  const next = String(addition ?? '').trim()
  if (!next) return existing
  const base = String(existing ?? '').trimEnd()
  return base ? `${base} ${next}` : next
}
