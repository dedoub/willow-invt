import assert from 'node:assert/strict'
import test from 'node:test'
import { briefMessage, parseNoteArgs, noteRows } from './brief.mjs'

test('아침 브리핑: 오늘(시각순)·지난 미완료·이번 주·대표 몫·대기 결정', () => {
  const t = briefMessage({
    today: '2026-10-02',
    rows: [
      { company: 'tensw', title: '[김철형] 독립기념관 9월 월간보고', schedule_date: '2026-10-02', start_time: '14:00:00', source_key: 'watch:mgmt-chat:x' },
      { company: 'tensw', title: '원천세 납부', schedule_date: '2026-10-02', start_time: null, source_key: 'mgmt:tensw:withholding:2026-09:pay' },
      { company: 'willow', title: 'ETC 인보이스', schedule_date: '2026-10-05', start_time: null, source_key: 'mgmt:willow:etc-invoice:2026-09:send' },
    ],
    overdue: [{ company: 'tensw', title: '보안서약서 전달', schedule_date: '2026-10-01', source_key: 'mgmt-chat:y' }],
    todos: [{ company: 'tensw', body: 'LG U+에 신분증·인감증명서 제출', due_date: null }, { company: 'tensw', body: '인포테크 협약서 검토 의견', due_date: '2026-10-07' }],
    openDecisions: 2,
  })
  assert.match(t, /^아침 브리핑 10\/2\(금\)/)
  assert.match(t, /오늘 2건\n• 14:00 \[김철형\] 독립기념관 9월 월간보고 \(모니터링\)\n• 원천세 납부/)
  assert.match(t, /지난 미완료 1건\n• 10\/1\(목\) 보안서약서 전달/)
  assert.match(t, /이번 주 1건\n• 10\/5\(월\) ETC 인보이스 \(윌로우\)/)
  assert.match(t, /대표님 몫 2건\n• 10\/7\(수\) 인포테크 협약서 검토 의견\n• LG U\+/)
  assert.match(t, /대기 중인 결정 2건$/)
})

test('아침 브리핑: 빈 날도 보낸다', () => {
  assert.equal(briefMessage({ today: '2026-10-03' }), '아침 브리핑 10/3(토)\n\n오늘 — 없음')
})

test('note: 인자 해석과 오류', () => {
  const n = parseNoteArgs(['--company', 'tensw', '--kind', 'todo', '--case', '인포테크 협약', '--assignee', '김동욱', '--due', '2026-10-07', '협약서', '검토'])
  assert.equal(n.body, '협약서 검토'); assert.equal(n.kind, 'todo'); assert.equal(n.due, '2026-10-07')
  assert.throws(() => parseNoteArgs(['본문']), /company/)
  assert.throws(() => parseNoteArgs(['--company', 'tensw', '--kind', 'x', 'a']), /kind/)
  assert.throws(() => parseNoteArgs(['--company', 'tensw', '--date', '2026-10-07', 'a']), /title/)
  assert.throws(() => parseNoteArgs(['--company', 'tensw', '--due', '10/7', 'a']), /YYYY/)
})

test('note: 기록 한 줄, 일정은 --date 일 때만, 다른 사람 일정은 watch:', () => {
  const now = new Date('2026-10-02T05:00:00Z')
  const a = noteRows(parseNoteArgs(['--company', 'tensw', 'LG U+ 가입신청서 작성']), { id: 'n1', now })
  assert.equal(a.entry.source, 'session'); assert.equal(a.entry.source_ref, 'note:n1'); assert.equal(a.schedule, null)
  const b = noteRows(parseNoteArgs(['--company', 'tensw', '--date', '2026-10-08', '--time', '10:00', '--title', '인포테크 미팅', '--meeting', '--owner', '김철형', '협약 협의']), { id: 'n2', now })
  assert.equal(b.schedule.title, '[김철형] 인포테크 미팅')
  assert.equal(b.schedule.type, 'meeting'); assert.equal(b.schedule.start_time, '10:00:00')
  assert.equal(b.schedule.source_key, 'watch:mgmt-note:tensw:n2')
  const c = noteRows(parseNoteArgs(['--company', 'willow', '--date', '2026-10-08', '--title', '보고서 제출', 'x']), { id: 'n3', now })
  assert.equal(c.schedule.source_key, 'mgmt-note:willow:n3'); assert.equal(c.schedule.type, 'deadline')
})
