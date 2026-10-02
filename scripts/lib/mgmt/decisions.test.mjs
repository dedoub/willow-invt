import assert from 'node:assert/strict'
import test from 'node:test'
import { decisionMessage, parseDecisionCallback, digestMessage, reuseAnswer } from './decisions.mjs'

const d = { id: '11111111-2222-3333-4444-555555555555', company: 'tensw', kind: 'money', question: '전국도서관대회 부스 250만원, 예산 밖입니다. 진행할까요?', options: [{ id: 'yes', label: '진행' }, { id: 'no', label: '보류' }], recommended: 'yes' }

test('버튼 데이터는 64바이트 이하이고 되읽힌다', () => {
  const m = decisionMessage(d)
  assert.match(m.text, /^\[텐소\]/)
  assert.match(m.text, /추천: 진행/)
  for (const row of m.buttons) for (const b of row) assert.ok(Buffer.byteLength(b.callback_data) <= 64)
  assert.deepEqual(parseDecisionCallback(m.buttons[0][0].callback_data), { id: d.id, option: '0' })
  assert.equal(parseDecisionCallback('다른버튼'), null)
})
test('한글 옵션 id 도 인덱스로 64바이트 이내에 되읽힌다', () => {
  const dk = { id: '11111111-2222-3333-4444-555555555555', company: 'tensw', kind: 'scope', question: '한글 옵션 테스트', options: [{ id: '진행하기 좋음', label: '진행하기 좋음' }, { id: '보류하고 다음달', label: '보류하고 다음달' }] }
  const m = decisionMessage(dk)
  for (const row of m.buttons) for (const b of row) assert.ok(Buffer.byteLength(b.callback_data) <= 64)
  assert.deepEqual(parseDecisionCallback(m.buttons[0][0].callback_data), { id: dk.id, option: '0' })
  assert.deepEqual(parseDecisionCallback(m.buttons[0][1].callback_data), { id: dk.id, option: '1' })
})
test('요약은 빈 부문을 뺀다', () => {
  assert.equal(digestMessage({ date: '2026-10-01', done: [], created: [], inferred: [], missed: [], openDecisions: [], failures: [] }), null)
  const s = digestMessage({ date: '2026-10-01', done: ['원천세 납부'], created: [], inferred: ['체육회 월말 보고서(매월 2일)'], missed: [], openDecisions: [], failures: [] })
  assert.match(s, /완료 1/); assert.match(s, /새 반복 규칙/); assert.doesNotMatch(s, /빠짐/)
})
test('같은 판단은 다시 묻지 않되 발송 승인은 예외', () => {
  const past = [{ subject_key: 'tensw:classify:GS네오텍', answer: 'expense', status: 'answered' }]
  assert.equal(reuseAnswer({ kind: 'classify', subject_key: 'tensw:classify:GS네오텍' }, past), 'expense')
  assert.equal(reuseAnswer({ kind: 'send_approval', subject_key: 'tensw:classify:GS네오텍' }, past), null)
})

test('digestMessage: 지난 판단 재사용 줄', () => {
  const s = digestMessage({ date: '2026-10-01', done: [], created: [], inferred: [], missed: [], openDecisions: [], failures: [], reused: ['아크로스 자문료 분류…'] })
  assert.match(s, /지난 판단 재사용 1: 아크로스 자문료 분류…/)
})

test('M3: 보안 결정은 지난 답으로 자동 처리하지 않는다', () => {
  const past = [{ subject_key: 'tensw:security:db-password', answer: 'rotate', status: 'answered' }]
  assert.equal(reuseAnswer({ kind: 'security', subject_key: 'tensw:security:db-password' }, past), null)
  assert.equal(reuseAnswer({ kind: 'classify', subject_key: 'tensw:security:db-password' }, past), 'rotate')
})

import { decisionEntry, decisionLine, isStaleDecision, answerLabel } from './decisions.mjs'

test('대표 답을 라벨로 기록부 decision 항목을 만든다(보류·무응답은 안 만든다)', () => {
  const d = { id: 'd1', company: 'tensw', question: '임치계약을 갱신할까요?', options: [{ id: 'renew', label: '갱신' }, { id: 'retrieve', label: '임치물 회수 후 종료' }], answer: 'retrieve', answered_at: '2026-10-01T02:10:00Z' }
  const e = decisionEntry(d)
  assert.equal(e.kind, 'decision')
  assert.equal(e.body, '대표 결정: 임치계약을 갱신할까요? → 임치물 회수 후 종료')
  assert.equal(e.source, 'decision'); assert.equal(e.source_ref, 'd1')
  assert.equal(decisionEntry({ ...d, answer: 'hold' }), null)
  assert.equal(decisionEntry({ ...d, answer: null }), null)
  assert.equal(answerLabel({ ...d, answer: 'x' }), 'x')
  assert.match(decisionLine(d), /회수 후 종료 \(2026-10-01\)$/)
})

test('보낸 지 14일 넘게 답 없는 결정만 오래된 것', () => {
  const now = new Date('2026-10-20T00:00:00Z')
  assert.equal(isStaleDecision({ status: 'sent', created_at: '2026-10-01T00:00:00Z' }, now), true)
  assert.equal(isStaleDecision({ status: 'sent', created_at: '2026-10-10T00:00:00Z' }, now), false)
  assert.equal(isStaleDecision({ status: 'answered', created_at: '2026-09-01T00:00:00Z' }, now), false)
})
