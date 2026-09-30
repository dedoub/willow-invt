import assert from 'node:assert/strict'
import test from 'node:test'
import { findEvidence, closePatch } from './closers.mjs'

const row = { id: 's', schedule_date: '2026-10-12', evidence: [] }
const taxRule = { company: 'willow', completion: { kind: 'tax', types: ['health_insurance', 'pension'] } }

test('고지가 전부 납부되어야 닫는다', () => {
  const facts = { taxObligations: [
    { id: 't1', company: 'willow', obligation_type: 'health_insurance', due_date: '2026-10-12', status: 'paid', paid_at: '2026-10-12T01:00:00Z' },
    { id: 't2', company: 'willow', obligation_type: 'pension', due_date: '2026-10-12', status: 'unpaid' },
  ] }
  assert.equal(findEvidence(row, taxRule, facts), null)
  facts.taxObligations[1].status = 'paid'
  assert.equal(findEvidence(row, taxRule, facts).kind, 'tax')
})
test('다른 회사 고지로는 닫지 않는다', () => {
  const facts = { taxObligations: [{ id: 't1', company: 'tensw', obligation_type: 'pension', due_date: '2026-10-12', status: 'paid' }] }
  assert.equal(findEvidence(row, taxRule, facts), null)
})
test('보낸 메일로 닫기(수신자·제목·기간)', () => {
  const r = { id: 'p', schedule_date: '2026-10-20', evidence: [] }
  const rule = { company: 'tensw', completion: { kind: 'sent_mail', context: 'tensoftworks', to: 'jjtaxro@daum.net', subject: '급여' } }
  const facts = { sentMail: [
    { id: 'm0', context: 'tensoftworks', to: 'jjtaxro@daum.net', subject: '9월 급여대장 요청', at: '2026-09-22T01:00:00Z' },
    { id: 'm1', context: 'tensoftworks', to: 'jjtaxro@daum.net', subject: '10월 급여대장 요청', at: '2026-10-19T01:00:00Z' },
  ] }
  assert.equal(findEvidence(r, rule, facts).ref, 'm1')
})
test('닫는 patch 는 근거를 덧붙인다', () => {
  const p = closePatch({ evidence: [{ kind: 'x' }] }, { kind: 'tax', ref: 't1' })
  assert.deepEqual(p, { is_completed: true, agent_state: 'done', evidence: [{ kind: 'x' }, { kind: 'tax', ref: 't1' }] })
})
