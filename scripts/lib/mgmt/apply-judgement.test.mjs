import assert from 'node:assert/strict'
import test from 'node:test'
import { planJudgement } from './apply-judgement.mjs'
import { buildPrompt } from './judge.mjs'

const items = [
  { source: 'chat', company: 'tensw', ref: 'spaces/A/messages/1', text: '@김동욱 이사님 NIA 9월 월간보고 10/2까지 부탁드립니다', at: '2026-09-30T01:00:00Z' },
  { source: 'chat', company: 'tensw', ref: 'spaces/A/messages/2', text: '송금했습니다', at: '2026-09-30T02:00:00Z' },
]
const open = [{ id: 's9', source_key: 'mgmt-chat:spaces/A/messages/0', title: '부스 참가비 입금', schedule_date: '2026-09-30', evidence: [] }]
const j = {
  cases: [{ name: 'NIA 독립운동 데이터 구축', counterparty: 'NIA', stage: '수행', summary: '월간보고 준비' }],
  entries: [{ kind: 'todo', case: 'NIA 독립운동 데이터 구축', body: '9월 월간보고 제출', actor: '김의향', assignee: '김동욱', due_date: '2026-10-02', source_ref: 'spaces/A/messages/1' },
            { kind: 'todo', case: null, body: '지어낸 항목', actor: null, assignee: null, due_date: null, source_ref: 'spaces/Z/messages/404' }],
  schedules: [{ op: 'create', title: 'NIA 9월 월간보고', date: '2026-10-02', source_ref: 'spaces/A/messages/1', match_key: null, reason: '기한 있는 요청' },
              { op: 'complete', title: '부스 참가비 입금', date: null, source_ref: 'spaces/A/messages/2', match_key: 'mgmt-chat:spaces/A/messages/0', reason: '송금했습니다' },
              { op: 'complete', title: '없는 일정', date: null, source_ref: 'spaces/A/messages/2', match_key: 'mgmt:tensw:nope', reason: 'x' }],
  decisions: [],
}

test('입력 경로의 회사로 고정되고 지어낸 참조는 버린다', () => {
  const p = planJudgement('tensw', j, { items, openSchedules: open })
  assert.equal(p.entries.length, 1)
  assert.ok(p.entries.every(e => e.company === 'tensw'))
  assert.equal(p.cases[0].company, 'tensw')
})
test('기한 있는 요청은 일정으로, 완료 신호는 열린 일정을 닫는다', () => {
  const p = planJudgement('tensw', j, { items, openSchedules: open })
  assert.equal(p.scheduleInserts.length, 1)
  assert.equal(p.scheduleInserts[0].source_key, 'mgmt-chat:spaces/A/messages/1')
  assert.equal(p.scheduleInserts[0].origin, 'chat')
  assert.equal(p.scheduleUpdates.length, 1)
  assert.equal(p.scheduleUpdates[0].id, 's9')
  assert.equal(p.scheduleUpdates[0].patch.is_completed, true)
  assert.equal(p.scheduleUpdates[0].patch.evidence.at(-1).ref, 'spaces/A/messages/2')
})
test('윌로우 메일에서 온 것은 윌로우로', () => {
  const wItems = [{ source: 'mail', company: 'willow', ref: 'g1', text: 'Referral fees for 08/26', at: '2026-10-07T00:00:00Z' }]
  const p = planJudgement('willow', { cases: [], entries: [{ kind: 'todo', case: null, body: '레퍼럴 피 검산', actor: 'ETC', assignee: null, due_date: null, source_ref: 'g1' }],
    schedules: [{ op: 'create', title: '레퍼럴 피 검산', date: '2026-10-08', source_ref: 'g1', match_key: null, reason: '' }], decisions: [] }, { items: wItems, openSchedules: [] })
  assert.equal(p.entries[0].company, 'willow')
  assert.equal(p.scheduleInserts[0].source_key, 'mgmt-mail:willow:g1')
  assert.equal(p.scheduleInserts[0].table, 'willow_mgmt_schedules')
})
test('프롬프트에 비밀값이 들어가지 않는다', () => {
  const prompt = buildPrompt({ company: 'tensw', items: [{ ref: 'r', at: '2026-10-01T00:00:00Z', from: 'x', text: '관리자 PW: Abc!2345xy' }], openCases: [], openSchedules: [] })
  assert.doesNotMatch(prompt, /Abc!2345xy/)
})
test('저장할 본문도 가린다', () => {
  const p = planJudgement('tensw', { cases: [], entries: [{ kind: 'security', case: null, body: '비밀번호 Abc!2345xy 공유됨', actor: null, assignee: null, due_date: null, source_ref: 'spaces/A/messages/1' }], schedules: [], decisions: [] }, { items, openSchedules: [] })
  assert.doesNotMatch(p.entries[0].body, /Abc!2345xy/)
})
