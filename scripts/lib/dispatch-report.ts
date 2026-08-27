// 디스패처가 CEO 텔레그램으로 보내는 작업 알림의 포맷과 명령별 시간 상한.
//
// 두 가지를 여기서 정한다.
// 1) 상한: 브라우저를 직접 몰아 GSC UI를 클릭하는 색인 배치는 URL 한 건에 1~2분이 걸린다.
//    2026-08-27에 네 번째 사이트(Scripta)가 붙으면서 11건이 15분을 넘겼고, 10건을 이미
//    요청해 놓은 상태에서 codex가 잘려 보고와 문서 갱신만 사라졌다. 소요는 사이트 수를
//    따라 늘어나므로 이런 작업은 기본 상한과 분리해서 잡는다.
// 2) 포맷: 예전엔 결과를 통째로 한 줄로 눌러서(공백 전부 축약) 보냈다. 색인 보고처럼
//    항목이 줄 단위인 출력은 그러면 읽을 수가 없다. 줄 구조를 유지한 채로만 자른다.

export const DEFAULT_CMD_TIMEOUT_MS = 15 * 60 * 1000
export const SOURCE_TIMEOUT_MS: Record<string, number> = {
  'scheduled:gsc-indexing': 60 * 60 * 1000,
}

export function timeoutForSource(source?: string | null): number {
  const override = Number(process.env.WS_DISPATCH_TIMEOUT_MS)
  if (Number.isFinite(override) && override > 0) return override
  return SOURCE_TIMEOUT_MS[source || ''] ?? DEFAULT_CMD_TIMEOUT_MS
}

const SOURCE_TITLE: Record<string, string> = {
  'scheduled:gsc-indexing': 'GSC 색인 요청',
}

export function taskTitle(cmd: { source?: string | null; instruction?: string | null }): string {
  const known = SOURCE_TITLE[cmd.source || '']
  if (known) return known
  const firstLine = (cmd.instruction || '').split('\n').map(s => s.trim()).find(Boolean) || '작업'
  return firstLine.length > 60 ? `${firstLine.slice(0, 59)}…` : firstLine
}

// 줄바꿈을 살린 채 자른다. 줄 안의 잉여 공백만 정리한다.
export function clip(text: string, max: number): string {
  const lines = (text || '').split('\n').map(line => line.replace(/[ \t]+/g, ' ').trimEnd())
  const body = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  if (body.length <= max) return body
  const cut = body.slice(0, max - 1)
  const lastBreak = cut.lastIndexOf('\n')
  return `${(lastBreak > max * 0.6 ? cut.slice(0, lastBreak) : cut).trimEnd()}…`
}

export function kstClock(iso?: string | null): string {
  const ms = Date.parse(iso || '')
  if (!Number.isFinite(ms)) return ''
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(ms))
}

export function humanDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return ''
  const total = Math.round(ms / 1000)
  const min = Math.floor(total / 60)
  const sec = total % 60
  if (min >= 60) {
    const hour = Math.floor(min / 60)
    return `${hour}시간 ${min % 60}분`
  }
  if (min === 0) return `${sec}초`
  return sec ? `${min}분 ${sec}초` : `${min}분`
}

function timeLine(startedAt?: string | null, finishedAt?: string | null): string {
  const from = kstClock(startedAt)
  const to = kstClock(finishedAt)
  const span = humanDuration(Date.parse(finishedAt || '') - Date.parse(startedAt || ''))
  if (!from || !to) return span
  return span ? `${from} → ${to} · ${span}` : `${from} → ${to}`
}

// codex 런너가 던지는 짧은 에러 문자열을 CEO가 읽을 문장으로 바꾼다.
// 모르는 에러는 손대지 않고 그대로 보여준다 — 지어내는 것보다 낫다.
export function describeFailure(message: string, timeoutMs: number): string[] {
  const raw = (message || '').trim()
  if (/^codex timeout$/i.test(raw)) {
    return [
      `codex가 상한 ${humanDuration(timeoutMs)}을 넘겨 응답이 없어 중단했습니다.`,
      '중간까지 실제로 처리된 작업이 있을 수 있습니다. 다시 돌리기 전에 실제 상태부터 확인하세요.',
    ]
  }
  if (/^agent aborted$/i.test(raw)) return ['실행 중 취소됐습니다.']
  if (/레포 경로 없음/.test(raw)) return [raw, '경로가 옮겨졌는지 확인이 필요합니다.']
  return [raw]
}

export interface DispatchCommand {
  project?: string | null
  source?: string | null
  instruction?: string | null
  started_at?: string | null
}

export function formatSuccessReport(
  cmd: DispatchCommand,
  output: string,
  opts: { turn: number; finishedAt: string; max?: number },
): string {
  const head = `✅ ${taskTitle(cmd)} · ${cmd.project || '-'}`
  const meta = [timeLine(cmd.started_at, opts.finishedAt), `대화 ${opts.turn}번째`].filter(Boolean).join(' · ')
  const body = clip(output, opts.max ?? 1600)
  const header = [head, meta].filter(Boolean).join('\n')
  return body ? `${header}\n\n${body}` : header
}

export function formatFailureReport(
  cmd: DispatchCommand,
  message: string,
  opts: { timeoutMs: number; finishedAt: string },
): string {
  const head = `❌ ${taskTitle(cmd)} · ${cmd.project || '-'}`
  const span = timeLine(cmd.started_at, opts.finishedAt)
  const meta = span ? `${span} 만에 중단` : '중단'
  const body = describeFailure(message, opts.timeoutMs).map(line => clip(line, 400)).join('\n')
  const header = [head, meta].filter(Boolean).join('\n')
  return body ? `${header}\n\n${body}` : header
}
