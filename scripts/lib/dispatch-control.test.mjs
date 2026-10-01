import assert from 'node:assert/strict'
import test from 'node:test'
import { supersededIds, buildDispatchPrompt, sentDuring, DISPATCH_RULES } from './dispatch-control.mjs'

test('같은 프로젝트에 15분 안에 새 지시가 오면 앞선 지시는 건너뛴다', () => {
  const p = [
    { id: 'a', project: 'willow-invt', created_at: '2026-10-01T01:50:00Z' },
    { id: 'b', project: 'willow-invt', created_at: '2026-10-01T01:53:00Z' },
    { id: 'c', project: 'willow-invt', created_at: '2026-10-01T01:55:00Z' },
    { id: 'd', project: 'scripta', created_at: '2026-10-01T01:51:00Z' },
    { id: 'e', project: 'willow-invt', created_at: '2026-10-01T03:00:00Z' },
  ]
  assert.deepEqual(supersededIds(p).sort(), ['a', 'b'])
})

test('지시 앞에 규칙과 취소된 지시를 붙인다', () => {
  const s = buildDispatchPrompt({ instruction: '출근부 초안 만들어', superseded: ['메일 보내'] })
  assert.ok(s.startsWith(DISPATCH_RULES))
  assert.match(s, /메일·메시지를 보내지 않는다/)
  assert.match(s, /취소된 지시[\s\S]*1\. 메일 보내/)
  assert.ok(s.endsWith('출근부 초안 만들어'))
})

test('실행 시간 동안 나간 메일만 고른다', () => {
  const m = [
    { id: '1', direction: 'out', at: '2026-10-01T01:52:30Z' },
    { id: '2', direction: 'in', at: '2026-10-01T01:52:40Z' },
    { id: '3', direction: 'out', at: '2026-10-01T00:10:00Z' },
  ]
  assert.deepEqual(sentDuring(m, '2026-10-01T01:52:00Z', '2026-10-01T01:55:00Z').map(x => x.id), ['1'])
})
