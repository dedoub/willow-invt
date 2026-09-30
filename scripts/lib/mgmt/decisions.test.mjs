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
