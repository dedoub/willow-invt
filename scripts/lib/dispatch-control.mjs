// 윌리 → 로컬 디스패치 통제. 2026-10-01: 디스패치가 대표 확인 없이 인턴 3명에게 메일을 두 번 보냈고,
// 몇 분 사이 쌓인 서로 다른 지시(보내라 → 취소해라 → 정정해라 → 회수해라)를 차례로 모두 실행했다.
//
// 1. 모든 지시 앞에 규칙을 붙인다(발송 금지, 문서화된 명령만, 초안·결과 경로 보고).
// 2. 같은 프로젝트에 정정 지시가 몰리면 마지막 것만 실행한다. 앞선 지시는 skipped 로 두고 맥락으로만 넘긴다.
// 3. 실행이 끝나면 그 사이 실제로 나간 메일이 있는지 본다(발송 차단은 send-guard.mjs).

export const SUPERSEDE_WINDOW_MIN = 15

export const DISPATCH_RULES = `# 디스패치 규칙(대표 지시, 반드시 지킨다)
- 메일·메시지를 보내지 않는다. Gmail은 초안까지만 만들고 초안 ID를 보고한다. "보내라"는 지시가 있어도 초안으로 멈추고 "초안 준비됨, 발송은 대표 확인 후"라고 보고한다. 회수·정정 메일도 보내지 않는다.
- 레포 문서(CLAUDE.md "반복 작업 레시피", .claude/skills)에 있는 명령을 쓴다. 기존 스크립트에 이번 달 숫자를 하드코딩하거나 즉석 스크립트를 짜지 않는다. 레시피가 없으면 무엇이 필요한지 보고하고 멈춘다.
- 숫자(출근일·휴일·금액)는 원본(최근 회신 첨부, 대장, 은행 기록)에서 사람별로 확인하고, 근거를 결과에 적는다. 모두에게 같은 숫자를 일괄 적용하지 않는다.
- 공문서(HWP)는 scripts/hwp/hwp.mjs 로만 만든다. PDF 위에 덧쓰지 않고, 남의 서명을 옮겨 붙이지 않는다.
- 끝나면 만든 파일 경로·초안 ID·검증 결과를 짧게 보고한다. 하지 않은 것은 하지 않았다고 쓴다.
`

const t = iso => Date.parse(iso)

// 같은 프로젝트의 pending 중, 15분 안에 더 새 지시가 들어온 것은 건너뛴다(정정·취소가 이어진 경우).
export function supersededIds(pending, windowMin = SUPERSEDE_WINDOW_MIN) {
  const skip = []
  for (const row of pending) {
    const newer = pending.some(o => o.id !== row.id && o.project === row.project
      && t(o.created_at) > t(row.created_at) && t(o.created_at) - t(row.created_at) <= windowMin * 60_000)
    if (newer) skip.push(row.id)
  }
  return skip
}

export function buildDispatchPrompt({ instruction, contextPrefix = '', superseded = [] }) {
  const prior = superseded.length
    ? `# 앞서 들어왔다가 취소된 지시(실행하지 않았다 — 맥락으로만 보고, 아래 최신 지시를 따른다)\n${superseded.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n`
    : ''
  return `${DISPATCH_RULES}\n${prior}${contextPrefix}${instruction}`
}

// 실행 시간 동안 우리 계정에서 나간 메일(보낸편지함)만 고른다.
export function sentDuring(mails, startIso, endIso) {
  return mails.filter(m => m.direction === 'out' && t(m.at) >= t(startIso) - 60_000 && t(m.at) <= t(endIso) + 60_000)
}
