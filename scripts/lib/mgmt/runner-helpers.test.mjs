import assert from 'node:assert/strict'
import test from 'node:test'
import { planSteps, parseSourceKey, cashFact, cashDirection, splitMailFacts, planClose, missedDecision, missedAnswerPatch, ruleReviewAnswerPatch, mailEvent, cashEvent, addDays, kstDateOf, closedToday, failureLine, pruneFailureLines, failuresOn, failureLabels, reuseRefs, isReuse, reuseLabel, staleMissedDecisionIds, pickDecisionsToSend, findAdoption, holdExpired, DECISIONS_PER_RUN, splitMessage, countJudgeFailures, poisonedSources, dryLine, mergeDryLines, dryDigestLines } from './runner-helpers.mjs'

test('planSteps: 시간대별 단계', () => {
  assert.deepEqual(planSteps('10:05'), ['learn', 'rules', 'collect', 'close', 'decide'])
  assert.deepEqual(planSteps('07:05'), ['learn', 'infer', 'rules', 'collect', 'close', 'decide'])
  assert.deepEqual(planSteps('07:35'), ['learn', 'rules', 'collect', 'close', 'decide'])
  assert.deepEqual(planSteps('18:35'), ['learn', 'rules', 'collect', 'close', 'decide', 'digest'])
  assert.deepEqual(planSteps('19:05'), ['learn', 'rules', 'collect', 'close', 'decide'])
  assert.deepEqual(planSteps('10:05', 'close'), ['close'])
  assert.deepEqual(planSteps('10:05', 'learn'), ['learn'])
  assert.deepEqual(planSteps('10:05', 'tune'), ['tune'])
  assert.deepEqual(planSteps('10:05', 'weekly'), ['weekly'])
  assert.throws(() => planSteps('10:05', 'nope'))
  assert.throws(() => planSteps('10:05', ''))
})

test('planSteps: 월요일 07:00~07:29 이면 infer 다음에 tune', () => {
  assert.deepEqual(planSteps('07:05', null, { monday: true }), ['learn', 'infer', 'tune', 'rules', 'collect', 'close', 'decide'])
  assert.deepEqual(planSteps('07:29', null, { monday: true }), ['learn', 'infer', 'tune', 'rules', 'collect', 'close', 'decide'])
  // 화요일 같은 시각엔 tune 이 없다
  assert.deepEqual(planSteps('07:05', null, { monday: false }), ['learn', 'infer', 'rules', 'collect', 'close', 'decide'])
  assert.deepEqual(planSteps('07:05'), ['learn', 'infer', 'rules', 'collect', 'close', 'decide'])
  // 월요일 07:30~07:59 은 tune 대신(infer 창을 벗어났으므로) weekly 가 끝에 붙는다
  assert.deepEqual(planSteps('07:35', null, { monday: true }), ['learn', 'rules', 'collect', 'close', 'decide', 'weekly'])
})

test('planSteps: 월요일 07:30~07:59 이면 weekly', () => {
  assert.deepEqual(planSteps('07:30', null, { monday: true }), ['learn', 'rules', 'collect', 'close', 'decide', 'weekly'])
  assert.deepEqual(planSteps('07:59', null, { monday: true }), ['learn', 'rules', 'collect', 'close', 'decide', 'weekly'])
  // 화요일 같은 시각엔 weekly 없다
  assert.deepEqual(planSteps('07:35', null, { monday: false }), ['learn', 'rules', 'collect', 'close', 'decide'])
  // 월요일이어도 시간대 밖이면 weekly 없다
  assert.deepEqual(planSteps('08:00', null, { monday: true }), ['learn', 'rules', 'collect', 'close', 'decide'])
  assert.deepEqual(planSteps('07:29', null, { monday: true }), ['learn', 'infer', 'tune', 'rules', 'collect', 'close', 'decide'])
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

test('ruleReviewAnswerPatch: off 만 규칙을 끈다', () => {
  const p = ruleReviewAnswerPatch({ answer: 'off', subject_key: 'tensw:rule:attendance:send' })
  assert.deepEqual(p, { company: 'tensw', task_key: 'attendance', step: 'send', patch: { active: false } })
  assert.equal(ruleReviewAnswerPatch({ answer: 'keep', subject_key: 'tensw:rule:attendance:send' }), null)
  assert.equal(ruleReviewAnswerPatch({ answer: 'off', subject_key: 'willow:missed:mgmt:willow:x:2026-09:y' }), null)
  assert.equal(ruleReviewAnswerPatch({ answer: 'off', subject_key: null }), null)
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

test('I3: 원장 행이 닫혔거나 사라진 missed 결정은 보내기 전에 expire', () => {
  const ds = [
    { id: 'd1', kind: 'missed', status: 'open', schedule_key: 'k1' },
    { id: 'd2', kind: 'missed', status: 'sent', schedule_key: 'k2' },
    { id: 'd3', kind: 'missed', status: 'open', schedule_key: 'k3' },
    { id: 'd4', kind: 'missed', status: 'answered', schedule_key: 'k2' },
    { id: 'd5', kind: 'money', status: 'open', schedule_key: 'k2' },
  ]
  const rows = new Map([['k1', { is_completed: false }], ['k2', { is_completed: true }]])
  assert.deepEqual(staleMissedDecisionIds(ds, rows), ['d2', 'd3'])
})
test('I3: 결정은 한 실행에 5개까지, 오래된 것부터', () => {
  const open = Array.from({ length: 8 }, (_, i) => ({ id: `d${i}`, created_at: `2026-09-${String(20 - i).padStart(2, '0')}T00:00:00+00:00` }))
  const picked = pickDecisionsToSend(open)
  assert.equal(picked.length, DECISIONS_PER_RUN)
  assert.deepEqual(picked.map(d => d.id), ['d7', 'd6', 'd5', 'd4', 'd3'])
})
test('M6: 보류는 7일 뒤에만 expire', () => {
  const now = new Date('2026-10-10T00:00:00Z')
  assert.equal(holdExpired({ answer: 'hold', answered_at: '2026-10-05T00:00:00+00:00' }, now), false)
  assert.equal(holdExpired({ answer: 'hold', answered_at: '2026-10-02T00:00:00+00:00' }, now), true)
  assert.equal(holdExpired({ answer: 'done', answered_at: '2026-09-01T00:00:00Z' }, now), false)
})

test('I4: 규칙 행 뒤에 생긴 커머셜 인보이스 행이 회차를 넘겨받으면 adopted 로 닫는다', () => {
  const now = new Date('2026-09-30T00:00:00Z')
  const rule = { company: 'willow', task_key: 'etc-invoice', step: 'issue', adopt_prefix: 'commercial:etc-invoice:', completion: { kind: 'sent_mail', context: 'default', subject: 'Invoice' } }
  const row = { id: 'r', source_key: 'mgmt:willow:etc-invoice:2026-09:issue', schedule_date: '2026-09-25', evidence: [] }
  const ledgerRows = [{ source_key: 'commercial:etc-invoice:2026-09-inv26', schedule_date: '2026-09-28' }]
  const c = planClose(row, rule, { sentMail: [], ledgerRows }, { now })
  assert.deepEqual(c.ev, { kind: 'adopted', ref: 'commercial:etc-invoice:2026-09-inv26', at: '2026-09-30T00:00:00.000Z' })
  assert.equal(c.patch.is_completed, true)
  // 6일 넘게 떨어지면 넘겨받지 않는다.
  assert.equal(findAdoption(row, rule, [{ source_key: 'commercial:etc-invoice:x', schedule_date: '2026-10-02' }], { now }), null)
})
test('I4: 재무 동기화 세금 고지 행(접두사+대상 월)도 넘겨받는다, 거절한 ref 는 아니다', () => {
  const now = new Date('2026-10-01T00:00:00Z')
  const rule = { company: 'tensw', task_key: 'social-insurance', step: 'pay', adopt_prefix: 'tensw-finance:tax-obligation:social:', completion: { kind: 'tax', types: ['pension'] } }
  const row = { id: 'r', source_key: 'mgmt:tensw:social-insurance:2026-09:pay', schedule_date: '2026-10-12', evidence: [] }
  const ledgerRows = [{ source_key: 'tensw-finance:tax-obligation:social:2026-09', schedule_date: '2026-10-10' }]
  assert.equal(planClose(row, rule, { taxObligations: [], ledgerRows }, { now }).ev.ref, 'tensw-finance:tax-obligation:social:2026-09')
  const rejectedRow = { ...row, evidence: [{ kind: 'rejected', ref: 'tensw-finance:tax-obligation:social:2026-09' }] }
  assert.equal(planClose(rejectedRow, rule, { taxObligations: [], ledgerRows }, { now }), null)
  assert.equal(findAdoption(row, { ...rule, adopt_prefix: undefined }, ledgerRows, { now }), null)
})

test('I5: dry 는 collect 를 18:30~18:59 에만, --only collect 는 그대로', () => {
  assert.deepEqual(planSteps('10:05', null, { dry: true }), ['learn', 'rules', 'close', 'decide'])
  assert.deepEqual(planSteps('18:35', null, { dry: true }), ['learn', 'rules', 'collect', 'close', 'decide', 'digest'])
  assert.deepEqual(planSteps('10:05', 'collect', { dry: true }), ['collect'])
  assert.deepEqual(planSteps('10:05', null, { dry: false }), ['learn', 'rules', 'collect', 'close', 'decide'])
})

test('I7: 3,800자 넘으면 줄 경계에서 나눈다, 긴 한 줄은 자른다', () => {
  const line = 'x'.repeat(1000)
  const text = Array(9).fill(line).join('\n')
  const parts = splitMessage(text)
  assert.equal(parts.length, 3)
  assert.ok(parts.every(p => p.length <= 3800))
  assert.equal(parts.join('\n'), text)
  assert.deepEqual(splitMessage('짧은 글'), ['짧은 글'])
  const long = splitMessage('y'.repeat(8000))
  assert.deepEqual(long.map(p => p.length), [3800, 3800, 400])
})

const fl = (step, at, dry = false) => JSON.stringify({ at, date: kstDateOf(at), step, message: 'x', dry })
test('I8: 주간 해석 실패는 collect 로 시작하는 non-dry 실패', () => {
  const lines = [fl('collect:mail:tensw', '2026-09-29T01:00:00Z'), fl('collect:chat:spaces/A', '2026-09-29T02:00:00Z'), fl('collect', '2026-09-29T03:00:00Z'),
    fl('collect:mail:tensw', '2026-09-29T04:00:00Z', true), fl('close', '2026-09-29T05:00:00Z'), fl('collect:mail:tensw:skipped', '2026-09-29T06:00:00Z')]
  assert.equal(countJudgeFailures(lines), 3)
  assert.equal(countJudgeFailures([fl('collect:lessons', '2026-09-29T07:00:00Z'), fl('collect:lesson-hits', '2026-09-29T07:00:00Z')]), 0)
})

test('M5: 같은 소스가 오늘 3번 실패하면 건너뛴다(dry 실패·어제 실패는 세지 않음)', () => {
  const today = '2026-09-30'
  const at = h => `2026-09-30T0${h}:00:00Z`
  const lines = [fl('collect:mail:tensw', at(1)), fl('collect:mail:tensw', at(2)), fl('collect:mail:tensw', at(3)),
    fl('collect:chat:spaces/A', at(1)), fl('collect:chat:spaces/A', at(2)), fl('collect:chat:spaces/A', at(3), true),
    fl('collect:mail:willow', '2026-09-29T01:00:00Z'), fl('collect:mail:willow', '2026-09-29T02:00:00Z'), fl('collect:mail:willow', at(1)),
    fl('collect:lessons', at(1)), fl('collect:lessons', at(2)), fl('collect:lessons', at(3))]
  const p = poisonedSources(lines, today)
  assert.deepEqual([...p.skip], ['mail:tensw'])
  assert.equal(p.alreadyMarked.size, 0)
  const marked = poisonedSources([...lines, fl('collect:mail:tensw:skipped', at(4))], today)
  assert.ok(marked.alreadyMarked.has('mail:tensw'))
  assert.deepEqual([...marked.skip], ['mail:tensw'], 'skipped 줄은 실패 수에 더하지 않는다')
})

test('I6: dry 기록은 가리고, 같은 날 같은 항목은 한 번, 7일 넘은 건 버리고, 요약은 종류별', () => {
  const now = new Date('2026-09-30T09:00:00Z')
  const old = dryLine('schedule', 'tensw', '옛 일정', new Date('2026-09-20T00:00:00Z'))
  const a = dryLine('schedule', 'tensw', '10월 급여대장 요청', now)
  const b = dryLine('decision', 'willow', '계정 password: Abc!2345xy 공유됨', now)
  const c = dryLine('inferred', 'tensw', 'GS네오텍 사용내역(매월 8일)', now)
  const merged = mergeDryLines([old, a], [a, b, c], now)
  assert.equal(merged.length, 3)
  assert.doesNotMatch(merged.join('\n'), /Abc!2345xy/)
  const digest = dryDigestLines(merged, '2026-09-30')
  assert.deepEqual(digest, ['만들 일정 1: 텐소 10월 급여대장 요청', '물을 결정 1: 윌로우 계정 password: [가림] 공유됨', '추정 규칙 1: 텐소 GS네오텍 사용내역(매월 8일)'])
})
