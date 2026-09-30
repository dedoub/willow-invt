import assert from 'node:assert/strict'
import test from 'node:test'
import { scorecard, skillCandidates } from './weekly.mjs'

test('성적표', () => {
  const s = scorecard({ from: '2026-10-05', to: '2026-10-11', writes: 40, reverts: 4, closedByEvidence: 12, missed: 1, asked: 5, reused: 3, judgeFailures: 0 })
  assert.equal(s.revertRate, 0.1)
  assert.match(s.text, /^경영관리 주간 점검 \(2026-10-05~2026-10-11\)/)
  assert.match(s.text, /되돌림 4 \(10%\)/)
})
test('레시피 없는 반복 할 일만 스킬 후보', () => {
  const now = new Date('2026-10-12T00:00:00Z')
  const e = (body, d, company = 'tensw') => ({ kind: 'todo', company, assignee: '김동욱', body, occurred_at: `${d}T01:00:00Z`, source_ref: `r-${d}` })
  const entries = [
    e('독립잇다 전자세금계산서 발행 (990만원)', '2026-09-20'), e('NIA 전자세금계산서 발행 (5,500,000원)', '2026-09-28'),
    e('교통비 입금 1건 처리', '2026-09-18'), e('교통비 입금 2건 처리', '2026-09-25'), e('교통비 입금 1건 처리', '2026-10-06'),
    e('급여대장 요청', '2026-09-22'), e('급여대장 요청', '2026-10-01'), e('급여대장 요청', '2026-10-08'),
    e('교통비 입금 처리', '2026-08-01'),
  ]
  const c = skillCandidates(entries, ['급여', '출근부', '지원금'], { now })
  assert.deepEqual(c.map(x => [x.label, x.count]), [['교통비 입금 건 처리', 3]])
  assert.equal(c[0].refs.length, 3)
})
