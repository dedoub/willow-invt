import assert from 'node:assert/strict'
import test from 'node:test'
import { planSteps, parseSourceKey, cashFact, cashDirection, splitMailFacts, planClose, missedDecision, missedAnswerPatch, mailEvent, cashEvent, addDays, kstDateOf, closedToday, failureLine, pruneFailureLines, failuresOn, failureLabels, reuseRefs, isReuse, reuseLabel } from './runner-helpers.mjs'

test('planSteps: 시간대별 단계', () => {
  assert.deepEqual(planSteps('10:05'), ['learn', 'rules', 'collect', 'close', 'decide'])
  assert.deepEqual(planSteps('07:05'), ['learn', 'infer', 'rules', 'collect', 'close', 'decide'])
  assert.deepEqual(planSteps('07:35'), ['learn', 'rules', 'collect', 'close', 'decide'])
  assert.deepEqual(planSteps('18:35'), ['learn', 'rules', 'collect', 'close', 'decide', 'digest'])
  assert.deepEqual(planSteps('19:05'), ['learn', 'rules', 'collect', 'close', 'decide'])
  assert.deepEqual(planSteps('10:05', 'close'), ['close'])
  assert.deepEqual(planSteps('10:05', 'learn'), ['learn'])
  assert.throws(() => planSteps('10:05', 'nope'))
  assert.throws(() => planSteps('10:05', ''))
})

test('parseSourceKey', () => {
  assert.deepEqual(parseSourceKey('mgmt:tensw:payroll:2026-10:request'), { company: 'tensw', task: 'payroll', period: '2026-10', step: 'request' })
  assert.equal(parseSourceKey('mgmt-chat:spaces/A/messages/B'), null)
  assert.equal(parseSourceKey(null), null)
})

test('cashFact: 날짜는 payment_date 우선, 급여 이체는 salary', () => {
  const f = cashFact({ id: 'a', type: 'expense', counterparty: '급여', description: '8월 급여 이체', amount: 17497978, payment_date: '2026-08-25', issue_date: null }, 'tensw_mgmt_cash')
  assert.deepEqual(f, { id: 'a', table: 'tensw_mgmt_cash', date: '2026-08-25', category: 'salary', counterparty: '급여', amount: 17497978 })
  const g = cashFact({ id: 'b', type: 'liability', counterparty: '직원 급여', description: '월급여 미지급급여 이체', amount: -1, payment_date: '2026-09-23' }, 't')
  assert.equal(g.category, 'salary')
  const h = cashFact({ id: 'c', type: 'revenue', counterparty: '', description: '급여 환급', amount: 100, payment_date: null, issue_date: '2026-09-01' }, 't')
  assert.equal(h.category, 'revenue')
  assert.equal(h.date, '2026-09-01')
  assert.equal(h.counterparty, '급여 환급')
  assert.equal(cashDirection({ type: 'revenue', amount: 5 }), 'in')
  assert.equal(cashDirection({ type: 'revenue', amount: -5 }), 'out')
  assert.equal(cashDirection({ type: 'liability', amount: 5 }), 'in')
  assert.equal(cashDirection({ type: 'liability', amount: -5 }), 'out')
  assert.equal(cashFact({ id: 'd', type: 'liability', counterparty: '급여 선급', amount: 100, payment_date: '2026-09-01' }, 't').category, 'liability')
})

test('splitMailFacts', () => {
  const { sent, received } = splitMailFacts([
    { ref: '1', direction: 'out', to: 'a@x', from: 'me', subject: 's1', at: 't1' },
    { ref: '2', direction: 'in', to: 'me', from: 'b@y', subject: 's2', at: 't2' },
  ], 'default')
  assert.deepEqual(sent, [{ id: '1', context: 'default', to: 'a@x', from: 'me', subject: 's1', at: 't1' }])
  assert.equal(received[0].from, 'b@y')
})

const row = { id: 'r', schedule_date: '2026-10-05', source_key: 'mgmt:tensw:attendance:2026-09:collect', evidence: [] }
test('planClose: completion 없는 규칙은 메시지 증빙으로 닫는다', () => {
  const msg = { kind: 'message', ref: 'spaces/A/messages/B', at: '2026-10-04T01:00:00Z', note: '회신' }
  const r = planClose({ ...row, evidence: [msg] }, { company: 'tensw', completion: null }, {})
  assert.deepEqual(r.ev, msg)
  assert.deepEqual(r.patch, { is_completed: true, agent_state: 'done', evidence: [msg] })
  assert.equal(planClose(row, { company: 'tensw', completion: null }, {}), null)
})
test('planClose: completion 있는 규칙은 메시지로 닫지 않는다', () => {
  const msg = { kind: 'message', ref: 'm', at: '2026-10-04T01:00:00Z' }
  const rule = { company: 'tensw', completion: { kind: 'sent_mail', context: 'tensoftworks', subject: '출근부' } }
  assert.equal(planClose({ ...row, evidence: [msg] }, rule, { sentMail: [] }), null)
  const hit = planClose(row, rule, { sentMail: [{ id: 'g1', context: 'tensoftworks', to: 'x', subject: '9월 출근부', at: '2026-10-03T00:00:00Z' }] })
  assert.equal(hit.ev.ref, 'g1')
  assert.equal(hit.patch.agent_state, 'done')
  assert.equal(planClose(row, undefined, {}), null)
})
test('planClose: 급여 규칙은 salary 로 도출된 현금 행으로 닫힌다', () => {
  const rule = { company: 'tensw', completion: { kind: 'cash', table: 'tensw_mgmt_cash', category: 'salary' } }
  const cash = [cashFact({ id: 'c1', type: 'liability', counterparty: '직원 급여', description: '9월 월급여 미지급급여 이체', amount: -1, payment_date: '2026-09-23' }, 'tensw_mgmt_cash')]
  const r = planClose({ id: 'p', schedule_date: '2026-09-25', evidence: [] }, rule, { cash })
  assert.equal(r.ev.ref, 'c1')
})

test('missedDecision', () => {
  const d = missedDecision('willow', { title: '9월 인보이스', schedule_date: '2026-09-25', source_key: 'mgmt:willow:etc-invoice:2026-09:issue' })
  assert.equal(d.subject_key, 'willow:missed:mgmt:willow:etc-invoice:2026-09:issue')
  assert.equal(d.kind, 'missed')
  assert.equal(d.status, 'open')
  assert.deepEqual(d.options.map(o => o.id), ['done', 'later', 'drop'])
})

test('missedAnswerPatch: R2', () => {
  const r = { id: 'x', is_completed: false, evidence: [{ kind: 'message' }] }
  const done = missedAnswerPatch({ id: 'd1', answer: 'done', answered_at: '2026-09-30T01:00:00Z' }, r, '2026-09-30')
  assert.deepEqual(done, { is_completed: true, agent_state: 'done', evidence: [{ kind: 'message' }, { kind: 'decision', ref: 'd1', at: '2026-09-30T01:00:00Z', note: 'done' }] })
  assert.equal(missedAnswerPatch({ id: 'd', answer: 'drop' }, r, '2026-09-30').agent_state, 'done')
  assert.deepEqual(missedAnswerPatch({ id: 'd', answer: 'later' }, r, '2026-09-30'), { agent_state: 'planned', schedule_date: '2026-10-07' })
  assert.equal(missedAnswerPatch({ id: 'd', answer: 'hold' }, r, '2026-09-30'), null)
  assert.equal(missedAnswerPatch({ id: 'd', answer: 'done' }, { ...r, is_completed: true }, '2026-09-30'), null)
  assert.equal(missedAnswerPatch({ id: 'd', answer: 'done' }, null, '2026-09-30'), null)
})

test('mailEvent / cashEvent', () => {
  const e = mailEvent({ direction: 'out', to: '세무 <jjtaxro@daum.net>', subject: 'RE: 9월 급여대장 요청', at: '2026-09-22T01:00:00Z', ref: 'g', context: 'tensoftworks' }, 'tensw')
  assert.equal(e.kind, 'sent_mail')
  assert.equal(e.to, 'jjtaxro@daum.net')
  assert.equal(e.subject, '급여대장 요청')
  assert.equal(e.key, 'sent_mail:jjtaxro@daum.net:급여대장 요청')
  assert.equal(e.date, '2026-09-22')
  const r = mailEvent({ direction: 'in', from: 'a@b.c', to: '', subject: 'Invoice', at: '2026-09-01T00:00:00Z', ref: 'h', context: 'default' }, 'willow')
  assert.equal(r.to, undefined)
  assert.equal(mailEvent({ direction: 'in', from: 'a@b.c', subject: '', at: '2026-09-01T00:00:00Z' }, 'willow'), null)
  const c = cashEvent({ id: 'c', type: 'expense', counterparty: '급여', amount: 100, payment_date: '2026-08-25' }, 'tensw_mgmt_cash', 'tensw')
  assert.equal(c.key, 'cash:tensw_mgmt_cash:급여:out')
  assert.equal(c.date, '2026-08-25')
  assert.equal(cashEvent({ id: 'c', type: 'expense', counterparty: '', description: '', amount: 1, payment_date: '2026-08-25' }, 't', 'tensw'), null)
})

test('addDays', () => {
  assert.equal(addDays('2026-09-30', 1), '2026-10-01')
  assert.equal(addDays('2026-09-30', -45), '2026-08-16')
})

test('kstDateOf / closedToday: KST 날짜로 비교', () => {
  assert.equal(kstDateOf('2026-09-30'), '2026-09-30')
  assert.equal(kstDateOf('2026-09-29T16:00:00Z'), '2026-09-30')
  assert.equal(kstDateOf('2026-09-30T15:30:00Z'), '2026-10-01')
  assert.equal(kstDateOf(null), null)
  const rows = [
    { title: 'a', agent_state: 'done', evidence: [{ at: '2026-09-29T16:10:00Z' }] },
    { title: 'b', agent_state: 'done', evidence: [{ at: '2026-09-30T15:10:00Z' }] },
    { title: 'c', agent_state: 'done', evidence: [{ at: '2026-09-30' }] },
    { title: 'd', agent_state: 'planned', evidence: [{ at: '2026-09-30' }] },
  ]
  assert.deepEqual(closedToday(rows, '2026-09-30').map(r => r.title), ['a', 'c'])
})

test('실패 기록: 줄 만들기·7일 정리·오늘 것만', () => {
  const now = new Date('2026-09-30T09:40:00Z')
  const l = failureLine('collect:mail:tensw', 'boom', now)
  assert.deepEqual(JSON.parse(l), { at: '2026-09-30T09:40:00.000Z', date: '2026-09-30', step: 'collect:mail:tensw', message: 'boom', dry: false })
  const old = failureLine('rules', 'x', new Date('2026-09-20T00:00:00Z'))
  const early = failureLine('timeout', '', new Date('2026-09-29T15:30:00Z')) // KST 09-30 00:30
  const yesterday = failureLine('close', '', new Date('2026-09-29T14:00:00Z')) // KST 09-29 23:00
  assert.deepEqual(pruneFailureLines([old, l, 'not json', early], now), [l, early])
  const today = failuresOn([l, early, yesterday, 'bad'], '2026-09-30')
  assert.deepEqual(today.map(f => f.step), ['collect:mail:tensw', 'timeout'])
  assert.deepEqual(failureLabels(today), ['18:40 collect:mail:tensw', '00:30 timeout'])
})

test('지난 판단 재사용 표식', () => {
  const d = { subject_key: 'willow:classify:akros', refs: ['m1'], question: '아크로스 자문료 입금을 매출로 분류할까요? 지난달과 같은 건입니다' }
  assert.deepEqual(reuseRefs(d), ['m1', { kind: 'reuse', from: 'willow:classify:akros' }])
  assert.deepEqual(reuseRefs({ subject_key: 'k', refs: null }), [{ kind: 'reuse', from: 'k' }])
  assert.equal(isReuse({ refs: reuseRefs(d) }), true)
  assert.equal(isReuse({ refs: ['m1'] }), false)
  assert.equal(reuseLabel(d), '아크로스 자문료 입금을 매출로 분류할까요? 지난달과 같…')
  assert.equal(reuseLabel({ question: '짧음' }), '짧음')
})
