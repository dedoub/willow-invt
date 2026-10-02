import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { planJudgement, applyJudgement } from './apply-judgement.mjs'
import { buildPrompt, codexRunner, isPersonalItem } from './judge.mjs'

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

// --- 리뷰 반영: 항목별 시험 ---

test('1. buildPrompt은 subject·space·from·openCases·openSchedules 도 가린다', () => {
  const prompt = buildPrompt({
    company: 'tensw',
    // space 를 일부러 빼서 subject 경로(x.space ?? x.subject) 자체가 가려지는지 증명한다.
    items: [{ ref: 'r1', at: '2026-10-01T00:00:00Z', from: '김철수 PW: Abc!2345xy', subject: '관리자 PW: Abc!2345xy', text: '본문' }],
    openCases: [{ name: '어떤 건 PW: Abc!2345xy' }],
    openSchedules: [{ source_key: 'mgmt:tensw:x:2026-10:1', title: '비밀번호 Abc!2345xy 변경', schedule_date: '2026-10-05' }],
  })
  assert.doesNotMatch(prompt, /Abc!2345xy/)
})

test('2. 저장되는 모델 산출 문자열도 전부 가린다(계좌번호, 옵션 id 포함)', () => {
  const secretItems = [{ source: 'chat', company: 'tensw', ref: 'spaces/A/messages/1', text: '본문', at: '2026-09-30T01:00:00Z' }]
  const p = planJudgement('tensw', {
    cases: [{ name: '계좌 1005-123-456789 확인', counterparty: '계좌 1005-123-456789', stage: '계좌 1005-123-456789', summary: '요약' }],
    entries: [{ kind: 'todo', case: null, body: '본문', actor: '계좌 1005-123-456789', assignee: '계좌 1005-123-456789', due_date: null, source_ref: 'spaces/A/messages/1' }],
    schedules: [],
    decisions: [{ kind: 'money', subject_key: '계좌 1005-123-456789', question: '질문',
      options: [{ id: '계좌 1005-123-456789', label: '계좌 1005-123-456789로 송금' }], recommended: '계좌 1005-123-456789', source_ref: 'spaces/A/messages/1' }],
  }, { items: secretItems, openSchedules: [] })
  assert.doesNotMatch(p.cases[0].name, /1005-123-456789/)
  assert.doesNotMatch(p.cases[0].counterparty, /1005-123-456789/)
  assert.doesNotMatch(p.cases[0].stage, /1005-123-456789/)
  assert.doesNotMatch(p.entries[0].actor, /1005-123-456789/)
  assert.doesNotMatch(p.entries[0].assignee, /1005-123-456789/)
  assert.doesNotMatch(p.decisions[0].subject_key, /1005-123-456789/)
  assert.doesNotMatch(p.decisions[0].options[0].id, /1005-123-456789/)
  assert.doesNotMatch(p.decisions[0].options[0].label, /1005-123-456789/)
  assert.doesNotMatch(p.decisions[0].recommended, /1005-123-456789/)
})

test('3. company 가드: 알 수 없는 회사는 던진다', () => {
  assert.throws(() => planJudgement('nope', { cases: [], entries: [], schedules: [], decisions: [] }, { items: [], openSchedules: [] }))
})

test('3b. 타사 아이템은 byRef 에서 제외되고 dropped 로 잡힌다', () => {
  const mixedItems = [
    { source: 'chat', company: 'tensw', ref: 'r1', text: 'A', at: '2026-10-01T00:00:00Z' },
    { source: 'mail', company: 'willow', ref: 'r2', text: 'B', at: '2026-10-01T00:00:00Z' },
  ]
  const jj = { cases: [], entries: [{ kind: 'todo', case: null, body: '윌로우 항목', actor: null, assignee: null, due_date: null, source_ref: 'r2' }], schedules: [], decisions: [] }
  const p = planJudgement('tensw', jj, { items: mixedItems, openSchedules: [] })
  assert.equal(p.entries.length, 0)
  assert.ok(p.dropped >= 1)
})

test('3c. 타사 소유(mgmt:) 열린 일정은 매치되지 않는다', () => {
  const willowRuleRow = { id: 'w1', source_key: 'mgmt:willow:tax:2026-10:1', title: '윌로우 세금', schedule_date: '2026-10-10', evidence: [] }
  const jj = { cases: [], entries: [], schedules: [{ op: 'complete', title: 'x', date: null, source_ref: 'spaces/A/messages/2', match_key: 'mgmt:willow:tax:2026-10:1', reason: 'done' }], decisions: [] }
  const p = planJudgement('tensw', jj, { items, openSchedules: [willowRuleRow] })
  assert.equal(p.scheduleUpdates.length, 0)
  assert.ok(p.dropped >= 1)
})

test('3d. willow 입장에서는 mgmt-chat: 행도 타사 소유(챗은 텐소 전용)', () => {
  const wItems = [{ source: 'mail', company: 'willow', ref: 'g1', text: '완료했습니다', at: '2026-10-07T00:00:00Z' }]
  const chatRow = { id: 'c1', source_key: 'mgmt-chat:spaces/A/messages/0', title: '텐소 챗 일정', schedule_date: '2026-09-30', evidence: [] }
  const jj = { cases: [], entries: [], schedules: [{ op: 'complete', title: 'x', date: null, source_ref: 'g1', match_key: 'mgmt-chat:spaces/A/messages/0', reason: 'done' }], decisions: [] }
  const p = planJudgement('willow', jj, { items: wItems, openSchedules: [chatRow] })
  assert.equal(p.scheduleUpdates.length, 0)
  assert.ok(p.dropped >= 1)
})

test('1(2회차). entries[].due_date 가 잘못돼도 항목은 살고 날짜만 비워지며 dropped 에 잡힌다', () => {
  const jj = { cases: [], entries: [{ kind: 'todo', case: null, body: '본문', actor: null, assignee: null, due_date: '10월 2일', source_ref: 'spaces/A/messages/1' }], schedules: [], decisions: [] }
  const p = planJudgement('tensw', jj, { items, openSchedules: [] })
  assert.equal(p.entries.length, 1)
  assert.equal(p.entries[0].due_date, null)
  assert.ok(p.dropped >= 1)
})

test('2(2회차). isValidDate는 존재하지 않는 날짜를 버린다(2월 30일, 13월)', () => {
  const jjA = { cases: [], entries: [], schedules: [{ op: 'create', title: 'x', date: '2026-02-30', source_ref: 'spaces/A/messages/1', match_key: null, reason: '' }], decisions: [] }
  const pA = planJudgement('tensw', jjA, { items, openSchedules: [] })
  assert.equal(pA.scheduleInserts.length, 0)
  assert.ok(pA.dropped >= 1)

  const jjB = { cases: [], entries: [], schedules: [{ op: 'create', title: 'x', date: '2026-13-01', source_ref: 'spaces/A/messages/1', match_key: null, reason: '' }], decisions: [] }
  const pB = planJudgement('tensw', jjB, { items, openSchedules: [] })
  assert.equal(pB.scheduleInserts.length, 0)
  assert.ok(pB.dropped >= 1)
})

test('4. 정기 규칙 행(mgmt:)은 증빙만 추가하고 완료·날짜는 바꾸지 않는다', () => {
  const ruleRow = { id: 'r1', source_key: 'mgmt:tensw:tax:2026-09:1', title: '9월 원천세', schedule_date: '2026-09-30', is_completed: false, agent_state: 'planned', evidence: [] }
  const jj = { cases: [], entries: [], schedules: [{ op: 'complete', title: '9월 원천세', date: null, source_ref: 'spaces/A/messages/2', match_key: 'mgmt:tensw:tax:2026-09:1', reason: '납부했습니다' }], decisions: [] }
  const p = planJudgement('tensw', jj, { items, openSchedules: [ruleRow] })
  assert.equal(p.scheduleUpdates.length, 1)
  assert.equal(p.scheduleUpdates[0].patch.is_completed, undefined)
  assert.equal(p.scheduleUpdates[0].patch.agent_state, undefined)
  assert.equal(p.scheduleUpdates[0].patch.schedule_date, undefined)
  assert.equal(p.scheduleUpdates[0].patch.evidence.at(-1).kind, 'message')
})

test('4c. 정기 규칙 행(mgmt:)은 update op 로도 날짜를 바꾸지 않는다(증빙만)', () => {
  const ruleRow = { id: 'r2', source_key: 'mgmt:tensw:tax:2026-09:1', title: '9월 원천세', schedule_date: '2026-09-30', is_completed: false, agent_state: 'planned', evidence: [] }
  const jj = { cases: [], entries: [], schedules: [{ op: 'update', title: '9월 원천세', date: '2026-10-05', source_ref: 'spaces/A/messages/2', match_key: 'mgmt:tensw:tax:2026-09:1', reason: '기한 연장' }], decisions: [] }
  const p = planJudgement('tensw', jj, { items, openSchedules: [ruleRow] })
  assert.equal(p.scheduleUpdates.length, 1)
  assert.equal(p.scheduleUpdates[0].patch.schedule_date, undefined)
  assert.equal(p.scheduleUpdates[0].patch.is_completed, undefined)
  assert.equal(p.scheduleUpdates[0].patch.agent_state, undefined)
  assert.equal(p.scheduleUpdates[0].patch.evidence.length, 1)
})

test('4b. mgmt-chat 행은 update op 로 날짜가 바뀐다(at 포함)', () => {
  const chatRow = { id: 'c1', source_key: 'mgmt-chat:spaces/A/messages/0', title: '입금', schedule_date: '2026-09-20', evidence: [] }
  const jj = { cases: [], entries: [], schedules: [{ op: 'update', title: '입금', date: '2026-09-25', source_ref: 'spaces/A/messages/2', match_key: 'mgmt-chat:spaces/A/messages/0', reason: '일정 변경' }], decisions: [] }
  const p = planJudgement('tensw', jj, { items, openSchedules: [chatRow] })
  assert.equal(p.scheduleUpdates[0].patch.schedule_date, '2026-09-25')
  assert.equal(p.scheduleUpdates[0].patch.evidence.at(-1).at, items[1].at)
})

test('6. codexRunner는 임시 폴더를 정리하고 stderr를 무시한다', () => {
  let capturedDir, capturedStdio
  const fakeExec = (cmd, args, opts) => {
    const outPath = args[args.indexOf('-o') + 1]
    capturedDir = path.dirname(outPath)
    capturedStdio = opts.stdio
    fs.writeFileSync(outPath, JSON.stringify({ cases: [], entries: [], schedules: [], decisions: [] }))
  }
  const result = codexRunner('프롬프트', { exec: fakeExec })
  assert.deepEqual(result, { cases: [], entries: [], schedules: [], decisions: [] })
  assert.equal(capturedStdio[2], 'ignore')
  assert.equal(fs.existsSync(capturedDir), false)
})

test('6b. 잘못된 날짜 형식은 버리고 dropped 로 잡는다', () => {
  const jj = { cases: [], entries: [], schedules: [{ op: 'create', title: '이상한 날짜', date: '10월 2일', source_ref: 'spaces/A/messages/1', match_key: null, reason: '' }], decisions: [] }
  const p = planJudgement('tensw', jj, { items, openSchedules: [] })
  assert.equal(p.scheduleInserts.length, 0)
  assert.ok(p.dropped >= 1)
})

test('6c. 한 메시지에서 두 일정이 나오면 키가 갈린다', () => {
  const jj = { cases: [], entries: [], schedules: [
    { op: 'create', title: '일정 A', date: '2026-10-02', source_ref: 'spaces/A/messages/1', match_key: null, reason: '' },
    { op: 'create', title: '일정 B', date: '2026-10-03', source_ref: 'spaces/A/messages/1', match_key: null, reason: '' },
  ], decisions: [] }
  const p = planJudgement('tensw', jj, { items, openSchedules: [] })
  assert.equal(p.scheduleInserts.length, 2)
  assert.equal(p.scheduleInserts[0].source_key, 'mgmt-chat:spaces/A/messages/1')
  assert.equal(p.scheduleInserts[1].source_key, 'mgmt-chat:spaces/A/messages/1:2')
})

test('6d. 같은 행에 대한 여러 패치는 하나로 합쳐진다(증빙 순서대로)', () => {
  const row = { id: 's9', source_key: 'mgmt-chat:spaces/A/messages/0', title: '부스 참가비 입금', schedule_date: '2026-09-30', evidence: [] }
  const jj = { cases: [], entries: [], schedules: [
    { op: 'update', title: '부스 참가비 입금', date: '2026-10-05', source_ref: 'spaces/A/messages/1', match_key: 'mgmt-chat:spaces/A/messages/0', reason: '날짜 변경' },
    { op: 'complete', title: '부스 참가비 입금', date: null, source_ref: 'spaces/A/messages/2', match_key: 'mgmt-chat:spaces/A/messages/0', reason: '송금했습니다' },
  ], decisions: [] }
  const p = planJudgement('tensw', jj, { items, openSchedules: [row] })
  assert.equal(p.scheduleUpdates.length, 1)
  assert.equal(p.scheduleUpdates[0].patch.schedule_date, '2026-10-05')
  assert.equal(p.scheduleUpdates[0].patch.is_completed, true)
  assert.equal(p.scheduleUpdates[0].patch.evidence.length, 2)
  assert.equal(p.scheduleUpdates[0].patch.evidence[0].ref, 'spaces/A/messages/1')
  assert.equal(p.scheduleUpdates[0].patch.evidence[1].ref, 'spaces/A/messages/2')
  assert.ok(p.scheduleUpdates[0].patch.evidence[0].at)
})

// --- 7. applyJudgement — 가짜 sb 로 호출을 기록 ---
function makeFakeSb({ existingEntries = [], caseLookup = {}, insertErrorFor = () => null } = {}) {
  const calls = { upsert: [], insert: [], update: [] }
  function from(table) {
    return {
      upsert(row, opts) {
        calls.upsert.push({ table, row, opts })
        return { select: () => ({ single: async () => ({ data: { id: `${table}-${row.name}`, name: row.name }, error: null }) }) }
      },
      select() {
        const eqs = []
        return {
          eq(col, val) { eqs.push([col, val]); return this },
          in(_col, _vals) {
            return Promise.resolve({ data: table === 'mgmt_entries' ? existingEntries : [], error: null })
          },
          maybeSingle: async () => {
            if (table !== 'mgmt_cases') return { data: null, error: null }
            const key = eqs.map(([, v]) => v).join('|')
            const id = caseLookup[key]
            return { data: id ? { id } : null, error: null }
          },
        }
      },
      insert(row) {
        calls.insert.push({ table, row })
        return Promise.resolve({ error: insertErrorFor(table, row) })
      },
      update(patch) {
        const entry = { table, patch }
        calls.update.push(entry)
        return { eq: async (col, val) => { entry.eqArgs = [col, val]; return { error: null } } }
      },
    }
  }
  return { from, calls }
}

test('7. dryRun은 sb 호출을 하나도 만들지 않는다', async () => {
  const { from, calls } = makeFakeSb()
  const plan = {
    cases: [{ company: 'tensw', name: 'X', counterparty: null, stage: null, summary: 's' }],
    entries: [{ company: 'tensw', case_name: 'X', kind: 'todo', body: 'b', actor: null, assignee: null, due_date: null, source: 'chat', source_ref: 'r1', occurred_at: '2026-10-01T00:00:00Z' }],
    scheduleInserts: [{ table: 'tensw_mgmt_schedules', title: 't', schedule_date: '2026-10-02', type: 'deadline', category: 'other', source_key: 'k', origin: 'chat', recipe: null, agent_state: 'planned', is_completed: false, evidence: [] }],
    scheduleUpdates: [{ table: 'tensw_mgmt_schedules', id: 's1', patch: { is_completed: true } }],
    decisions: [{ company: 'tensw', kind: 'money', subject_key: 'tensw:x', question: 'q', options: [], recommended: null, refs: ['r1'], status: 'open' }],
  }
  await applyJudgement({ from }, plan, { dryRun: true })
  assert.equal(calls.upsert.length, 0)
  assert.equal(calls.insert.length, 0)
  assert.equal(calls.update.length, 0)
})

test('7b. 이미 있는 (kind, source_ref) 항목은 건너뛰고, 같은 실행 안 다른 ref 는 들어간다', async () => {
  const { from, calls } = makeFakeSb({ existingEntries: [{ kind: 'todo', source_ref: 'r1' }] })
  const plan = {
    cases: [], scheduleInserts: [], scheduleUpdates: [], decisions: [],
    entries: [
      { company: 'tensw', case_name: null, kind: 'todo', body: 'b', actor: null, assignee: null, due_date: null, source: 'chat', source_ref: 'r1', occurred_at: '2026-10-01T00:00:00Z' },
      { company: 'tensw', case_name: null, kind: 'todo', body: 'c', actor: null, assignee: null, due_date: null, source: 'chat', source_ref: 'r2', occurred_at: '2026-10-01T00:00:00Z' },
    ],
  }
  await applyJudgement({ from }, plan, {})
  assert.equal(calls.insert.length, 1)
  assert.equal(calls.insert[0].row.source_ref, 'r2')
})

test('7c. insert 의 23505 는 무시된다', async () => {
  const { from, calls } = makeFakeSb({ insertErrorFor: () => ({ code: '23505' }) })
  const plan = { cases: [], scheduleInserts: [], scheduleUpdates: [], decisions: [],
    entries: [{ company: 'tensw', case_name: null, kind: 'todo', body: 'b', actor: null, assignee: null, due_date: null, source: 'chat', source_ref: 'r1', occurred_at: '2026-10-01T00:00:00Z' }] }
  await assert.doesNotReject(applyJudgement({ from }, plan, {}))
  assert.equal(calls.insert.length, 1)
})

test('7d. 일정 갱신은 그 행의 테이블로 간다', async () => {
  const { from, calls } = makeFakeSb()
  const plan = { cases: [], entries: [], scheduleInserts: [], decisions: [],
    scheduleUpdates: [{ table: 'willow_mgmt_schedules', id: 'w1', patch: { is_completed: true } }] }
  await applyJudgement({ from }, plan, {})
  assert.equal(calls.update.length, 1)
  assert.equal(calls.update[0].table, 'willow_mgmt_schedules')
  assert.deepEqual(calls.update[0].eqArgs, ['id', 'w1'])
})

test('5/7e. 사례 upsert는 status를 보내지 않고 null 필드는 생략한다', async () => {
  const { from, calls } = makeFakeSb()
  const plan = { cases: [{ company: 'tensw', name: 'X', counterparty: null, stage: null, summary: '요약' }], entries: [], scheduleInserts: [], scheduleUpdates: [], decisions: [] }
  await applyJudgement({ from }, plan, {})
  assert.equal(calls.upsert.length, 1)
  assert.ok(!('status' in calls.upsert[0].row))
  assert.ok(!('counterparty' in calls.upsert[0].row))
  assert.ok(!('stage' in calls.upsert[0].row))
  assert.equal(calls.upsert[0].row.summary, '요약')
})

test('5/7f. 이번 실행에 없는 case_name 은 (company, name) 으로 DB 에서 찾는다', async () => {
  const { from, calls } = makeFakeSb({ caseLookup: { 'tensw|X': 'case-99' } })
  const plan = { cases: [], scheduleInserts: [], scheduleUpdates: [], decisions: [],
    entries: [{ company: 'tensw', case_name: 'X', kind: 'todo', body: 'b', actor: null, assignee: null, due_date: null, source: 'chat', source_ref: 'r1', occurred_at: '2026-10-01T00:00:00Z' }] }
  await applyJudgement({ from }, plan, {})
  assert.equal(calls.insert[0].row.case_id, 'case-99')
})

test('I9: 개인·가족·개인투자 메시지는 judge 앞에서 거른다', () => {
  assert.equal(isPersonalItem({ subject: '[미래에셋증권] 김류하님의 거래내역입니다', from: 'noreply@miraeasset.com', text: '' }), true)
  assert.equal(isPersonalItem({ subject: '류하 학원 상담 안내', from: 'a@b.c', text: '' }), true)
  assert.equal(isPersonalItem({ subject: 'Security alert', from: 'no-reply@accounts.google.com', text: 'New sign-in' }), true)
  assert.equal(isPersonalItem({ subject: '[키움증권] ETF 상장 일정 협의', from: 'etf@kiwoom.com', text: '거래내역 첨부드립니다' }), false)
  assert.equal(isPersonalItem({ subject: '[GS네오텍] 2026년 9월 사용내역 안내', from: 'bill@gsneotek.com', text: '사용내역을 보내드립니다' }), false)
  assert.equal(isPersonalItem({ space: 'Tensw 운영자방', from: '김의향', text: '세금계산서 발행 부탁드립니다' }), false)
})
test('I9: judge 프롬프트는 개인 메시지를 무시하라고 적는다', () => {
  const p = buildPrompt({ company: 'tensw', items: [], openCases: [], openSchedules: [] })
  assert.match(p, /개인·가족·개인투자 메시지는 무시한다\(아무 항목도 만들지 않는다\)/)
})

test('I10: codexRunner 는 임시 폴더를 cwd 로, 읽기 전용 샌드박스로 부른다', () => {
  let captured
  const fakeExec = (cmd, args, opts) => {
    captured = { args, opts }
    fs.writeFileSync(args[args.indexOf('-o') + 1], JSON.stringify({ cases: [], entries: [], schedules: [], decisions: [] }))
  }
  codexRunner('프롬프트', { exec: fakeExec })
  const outDir = path.dirname(captured.args[captured.args.indexOf('-o') + 1])
  assert.equal(captured.opts.cwd, outDir)
  assert.equal(captured.args[captured.args.indexOf('--sandbox') + 1], 'read-only')
  assert.ok(captured.args.includes('--ephemeral'))
})

test('다른 사람 회의는 [이름]·watch: 키·meeting 으로, 본인 일은 그대로', () => {
  const jj = { cases: [], entries: [], decisions: [], schedules: [
    { op: 'create', title: '독립기념관 9월 월간보고 14:00(13:30 도착)', date: '2026-10-02', source_ref: 'spaces/A/messages/1', match_key: null, reason: '외부 일정', kind: 'meeting', owner: '김철형' },
    { op: 'create', title: 'NIA 9월 월간보고 자료', date: '2026-10-02', source_ref: 'spaces/A/messages/1', match_key: null, reason: '요청', kind: 'task', owner: '김동욱' },
  ] }
  const p = planJudgement('tensw', jj, { items, openSchedules: [] })
  const [others, mine] = p.scheduleInserts
  assert.equal(others.title, '[김철형] 독립기념관 9월 월간보고 14:00(13:30 도착)')
  assert.equal(others.type, 'meeting')
  assert.match(others.source_key, /^watch:mgmt-chat:spaces\/A\/messages\/1$/)
  assert.equal(mine.title, 'NIA 9월 월간보고 자료')
  assert.equal(mine.type, 'deadline')
  assert.match(mine.source_key, /^mgmt-chat:spaces\/A\/messages\/1:2$/)
})

test('모니터링 행도 완료 신호로 닫힌다(watch: 대화 행)', () => {
  const openW = [{ id: 'w1', source_key: 'watch:mgmt-chat:spaces/A/messages/0', title: '[김철형] 회의', schedule_date: '2026-09-30', evidence: [] }]
  const jj = { cases: [], entries: [], decisions: [], schedules: [{ op: 'complete', title: '회의', date: null, source_ref: 'spaces/A/messages/2', match_key: 'watch:mgmt-chat:spaces/A/messages/0', reason: '다녀왔습니다', kind: 'meeting', owner: '김철형' }] }
  const p = planJudgement('tensw', jj, { items, openSchedules: openW })
  assert.equal(p.scheduleUpdates[0].patch.is_completed, true)
})

test('판단 프롬프트: 일정 kind·owner 규칙, 초안 금지, 최근 대표 결정', () => {
  const s = buildPrompt({ company: 'tensw', items, openCases: [], openSchedules: [], decisions: ['임치계약 갱신? → 임치물 회수 후 종료 (2026-10-01)'] })
  assert.match(s, /kind\(task=/)
  assert.match(s, /owner/)
  assert.match(s, /초안/)
  assert.match(s, /최근 대표 결정[\s\S]*임치물 회수 후 종료/)
})
