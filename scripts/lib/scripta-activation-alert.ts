// 스크립타 신규 활성 사용자 알림 — 리뷰노트 알림과 같은 모양.
// 활성화 = 첫 글 등록(관리자 제외). 대시보드 sc_dashboard_stats.activation 과 같은 정의라 숫자가 맞는다.

export type ScriptaActivation = { userId: string; at: string }
export type ScriptaUserLite = {
  user_id: string
  email: string | null
  name: string | null
  created_at: string
  texts: number
  attempts: number
}

const kstDateKey = (date: Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date)

const kstShort = (iso: string) => new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(iso))

export function countKstDailyScriptaActivations(rows: ScriptaActivation[], now = new Date()): number {
  const today = kstDateKey(now)
  return rows.filter(r => {
    const d = new Date(r.at)
    return !Number.isNaN(d.getTime()) && kstDateKey(d) === today
  }).length
}

// 아직 알리지 않은 활성화만 고른다. known 이 없으면(첫 실행) 기준값만 잡고 소급 알림은 하지 않는다.
export function freshScriptaActivations(rows: ScriptaActivation[], known: string[] | undefined): ScriptaActivation[] {
  if (!known) return []
  const seen = new Set(known)
  return rows.filter(r => !seen.has(r.userId))
}

export function scriptaActivationMessage(a: ScriptaActivation, user: ScriptaUserLite | undefined, dailyCumulative: number): string {
  const label = user?.name?.trim() || user?.email || a.userId
  const elapsedMs = user?.created_at ? Date.parse(a.at) - Date.parse(user.created_at) : Number.NaN
  const elapsedMinutes = Number.isFinite(elapsedMs) ? Math.max(0, Math.round(elapsedMs / 60000)) : null
  return [
    '🎉 [Scripta 신규 활성 사용자]',
    `- 사용자: ${label}${user?.email && user.email !== label ? ` (${user.email})` : ''}`,
    '- 활성화: 가입 후 첫 글 등록 완료',
    elapsedMinutes !== null ? `- 가입→활성화: 약 ${elapsedMinutes}분` : '',
    `- 글 등록: ${kstShort(a.at)}`,
    user ? `- 지금까지: 글 ${user.texts}개 · 연습 ${user.attempts}회` : '',
    `- 오늘 누적 활성화: ${dailyCumulative}명`,
  ].filter(Boolean).join('\n')
}
