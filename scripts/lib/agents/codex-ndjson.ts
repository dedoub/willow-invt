import readline from 'node:readline'
import { Transform } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'

/**
 * Codex SDK 의 NDJSON 스트림을 U+2028/U+2029 로부터 지킨다.
 *
 * ── 무슨 일이 있었나 (2026-09-13) ──────────────────────────────────────────
 * 윌리가 텐소 이메일의 .docx 첨부를 읽다가 턴 전체가 죽었다.
 *   Failed to parse item: {"type":"item.completed",...,"aggregated_output":"나라장터...
 *   cause: SyntaxError: Unterminated string in JSON at position 951
 *
 * 범인은 codex 도, 우리 코드도 아니다. **Node 의 readline 이 U+2028(LINE
 * SEPARATOR)과 U+2029 를 줄바꿈으로 취급한다.** codex 는 도구 출력을 NDJSON
 * 한 줄에 통째로 싣는데, Word 문서를 textutil 로 뽑으면 문단 안 줄바꿈이
 * U+2028 로 나온다. 그 줄이 readline 을 지나며 둘로 쪼개지고, 양쪽 다 깨진
 * JSON 이 되어 SDK 가 던지고, 제너레이터가 죽으면서 대화가 통째로 실패한다.
 *
 * SDK 0.144.1 과 최신 0.154.0 이 같은 코드라 올려도 안 고쳐진다
 * (둘 다 `readline.createInterface({ input: child.stdout })`).
 *
 * ── 어떻게 막나 ───────────────────────────────────────────────────────────
 * 문자를 지우지 않는다 — 본문이 달라진다. 대신 readline 에 닿기 전에
 * 여섯 글자 이스케이프(백슬래시 u 2028)로 바꾼다. JSON 문자열 안에서 뜻이 같으므로
 * JSON.parse 를 지나면 원래 문자가 그대로 돌아온다. 줄은 하나로 남는다.
 *
 * UTF-8 에서 U+2028 은 E2 80 A8 세 바이트다. 청크 경계가 그 한가운데를 자를 수
 * 있어 StringDecoder 로 이어 붙인 뒤에 바꾼다.
 */

const LINE_SEPARATORS = /[\u2028\u2029]/g

/** 스트림을 지나가며 U+2028/U+2029 만 JSON 이스케이프로 바꾼다. */
export function escapeLineSeparators(): Transform {
  const decoder = new StringDecoder('utf8')
  return new Transform({
    transform(chunk, _enc, done) {
      const text = decoder.write(chunk as Buffer)
      done(null, text.replace(LINE_SEPARATORS, m => (m === '\u2028' ? '\\u2028' : '\\u2029')))
    },
    flush(done) {
      const rest = decoder.end()
      done(null, rest ? rest.replace(LINE_SEPARATORS, m => (m === '\u2028' ? '\\u2028' : '\\u2029')) : '')
    },
  })
}

let installed = false

/**
 * `readline.createInterface` 를 감싸 입력 스트림을 먼저 위 변환에 통과시킨다.
 *
 * SDK 안에서 인터페이스를 만들기 때문에 바깥에서 끼어들 자리가 여기뿐이다.
 * 저장소의 다른 코드는 readline 을 쓰지 않아(2026-09-13 전수 확인) 부작용이 없다.
 * NDJSON 을 읽는 데 U+2028 로 줄을 나누는 동작이 필요한 곳은 없다.
 */
export function installNdjsonReadlineGuard(): void {
  if (installed) return
  installed = true

  const original = readline.createInterface.bind(readline)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(readline as any).createInterface = function patchedCreateInterface(...args: any[]) {
    const [opts] = args
    const input = opts?.input
    // 스트림을 넘겨받은 경우에만 끼어든다. 나머지 호출 모양은 그대로 넘긴다.
    if (input && typeof input.pipe === 'function') {
      return original({ ...opts, input: input.pipe(escapeLineSeparators()) })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (original as any)(...args)
  }
}
