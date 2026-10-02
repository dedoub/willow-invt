// brief.mjs — 아침 브리핑과 대화형 작업 입구(note)의 DB 없는 순수 로직. 시험은 brief.test.mjs.
// 2026-10-02 리뷰: 대표가 "오늘 독립기념관 몇 시였지"를 직접 물었다 → 07:3x 에 오늘·이번 주 일정과 대표 몫을 먼저 보낸다.
// 대화형 세션(Claude·윌리)에서 한 일은 원장에 안 들어가 사람이 손으로 옮겼다 → note 한 줄로 기록·일정을 남긴다.

const DOW = ['일', '월', '화', '수', '목', '금', '토']
const md = key => { const d = new Date(`${key}T00:00:00Z`); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${DOW[d.getUTCDay()]})` }
const hm = t => (t ? String(t).slice(0, 5) : null)
const isWatch = r => String(r.source_key ?? '').startsWith('watch:')
const CO = { tensw: '텐소', willow: '윌로우' }

function line(r, { withDate = false } = {}) {
  const parts = [withDate ? md(r.schedule_date) : null, hm(r.start_time), r.title].filter(Boolean)
  const tags = [r.company && r.company !== 'tensw' ? CO[r.company] : null, isWatch(r) ? '모니터링' : null].filter(Boolean)
  return `• ${parts.join(' ')}${tags.length ? ` (${tags.join('·')})` : ''}`
}
const byWhen = (a, b) => (a.schedule_date + (a.start_time ?? '99')).localeCompare(b.schedule_date + (b.start_time ?? '99'))

// rows: 두 회사 원장에서 오늘~+7일 미완료 행({ company, title, schedule_date, start_time, source_key }).
// todos: 대표(김동욱) 몫 미완료 할 일({ company, body, due_date }). overdue: 지난 미완료 행.
export function briefMessage({ today, rows = [], todos = [], overdue = [], openDecisions = 0, maxWeek = 12, maxTodos = 8 }) {
  const todays = rows.filter(r => r.schedule_date === today).sort(byWhen)
  const week = rows.filter(r => r.schedule_date > today).sort(byWhen)
  const out = [`아침 브리핑 ${md(today)}`]
  out.push('', `오늘 ${todays.length ? todays.length + '건' : '— 없음'}`, ...todays.map(r => line(r)))
  if (overdue.length) out.push('', `지난 미완료 ${overdue.length}건`, ...overdue.sort(byWhen).slice(0, 6).map(r => line(r, { withDate: true })))
  if (week.length) out.push('', `이번 주 ${week.length}건`, ...week.slice(0, maxWeek).map(r => line(r, { withDate: true })), ...(week.length > maxWeek ? [`… 외 ${week.length - maxWeek}건`] : []))
  if (todos.length) {
    const sorted = [...todos].sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
    out.push('', `대표님 몫 ${todos.length}건`, ...sorted.slice(0, maxTodos).map(t => `• ${t.due_date ? md(t.due_date) + ' ' : ''}${t.body}${t.company && t.company !== 'tensw' ? ` (${CO[t.company]})` : ''}`))
  }
  if (openDecisions) out.push('', `대기 중인 결정 ${openDecisions}건`)
  return out.join('\n')
}

// note — 대화형 세션에서 한 일을 원장에 남긴다.
//   node scripts/mgmt-agent.mjs note --company tensw [--kind material|todo|decision|daily] [--case "건 이름"]
//        [--assignee 김동욱] [--due YYYY-MM-DD] [--date YYYY-MM-DD --title "일정 제목" [--time HH:MM] [--meeting] [--owner 김철형]] "본문"
const KINDS = ['material', 'todo', 'decision', 'daily']
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '') && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
export function parseNoteArgs(argv) {
  const o = { company: null, kind: 'material', case: null, assignee: null, due: null, date: null, title: null, time: null, meeting: false, owner: null, body: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const v = () => { const x = argv[++i]; if (x === undefined) throw new Error(`${a} 값이 없어요`); return x }
    if (a === '--company') o.company = v()
    else if (a === '--kind') o.kind = v()
    else if (a === '--case') o.case = v()
    else if (a === '--assignee') o.assignee = v()
    else if (a === '--due') o.due = v()
    else if (a === '--date') o.date = v()
    else if (a === '--title') o.title = v()
    else if (a === '--time') o.time = v()
    else if (a === '--owner') o.owner = v()
    else if (a === '--meeting') o.meeting = true
    else if (a === '--dry') continue
    else o.body.push(a)
  }
  const body = o.body.join(' ').trim()
  if (!['tensw', 'willow'].includes(o.company)) throw new Error('--company tensw|willow 가 필요해요')
  if (!KINDS.includes(o.kind)) throw new Error(`--kind 는 ${KINDS.join('|')}`)
  if (!body) throw new Error('본문이 비었어요')
  if (o.due && !isDate(o.due)) throw new Error('--due 는 YYYY-MM-DD')
  if (o.date && !isDate(o.date)) throw new Error('--date 는 YYYY-MM-DD')
  if (o.date && !o.title) throw new Error('--date 를 주면 --title 도 주세요')
  if (o.time && !/^\d{2}:\d{2}$/.test(o.time)) throw new Error('--time 은 HH:MM')
  return { ...o, body }
}

const OTHERS = owner => typeof owner === 'string' && owner.trim() && !/김동욱|동욱|본인/.test(owner)
export function noteRows(n, { id, now = new Date() }) {
  const entry = {
    company: n.company, kind: n.kind, body: n.body, actor: '대화형 세션', assignee: n.assignee,
    due_date: n.due, source: 'session', source_ref: `note:${id}`, occurred_at: now.toISOString(),
  }
  if (!n.date) return { entry, caseName: n.case, schedule: null }
  const others = OTHERS(n.owner)
  const schedule = {
    title: others ? `[${n.owner}] ${n.title}` : n.title, schedule_date: n.date, start_time: n.time ? `${n.time}:00` : null,
    type: n.meeting ? 'meeting' : 'deadline', category: 'other', origin: 'manual', agent_state: 'planned', is_completed: false,
    source_key: `${others ? 'watch:' : ''}mgmt-note:${n.company}:${id}`, description: n.body,
    evidence: [{ kind: 'note', ref: `note:${id}`, at: now.toISOString() }],
  }
  return { entry, caseName: n.case, schedule }
}
