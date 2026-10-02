import assert from 'node:assert/strict'
import test from 'node:test'
import { countKstDailyScriptaActivations, freshScriptaActivations, scriptaActivationMessage } from './scripta-activation-alert'

const rows = [
  { userId: 'a', at: '2026-10-01T14:30:00Z' }, // 10/1 23:30 KST
  { userId: 'b', at: '2026-10-01T15:10:00Z' }, // 10/2 00:10 KST
  { userId: 'c', at: '2026-10-02T05:00:00Z' }, // 10/2 14:00 KST
]

test('오늘 누적은 KST 날짜로 센다', () => {
  assert.equal(countKstDailyScriptaActivations(rows, new Date('2026-10-02T10:00:00Z')), 2)
})

test('첫 실행은 소급 알림 없이 기준만 잡는다', () => {
  assert.deepEqual(freshScriptaActivations(rows, undefined), [])
  assert.deepEqual(freshScriptaActivations(rows, ['a', 'b']).map(r => r.userId), ['c'])
})

test('메시지: 이름·이메일·경과·누적', () => {
  const s = scriptaActivationMessage(rows[2], {
    user_id: 'c', email: 'x@y.com', name: 'Kim', created_at: '2026-10-02T04:48:00Z', texts: 1, attempts: 3,
  }, 2)
  assert.match(s, /^🎉 \[Scripta 신규 활성 사용자\]/)
  assert.match(s, /사용자: Kim \(x@y\.com\)/)
  assert.match(s, /가입→활성화: 약 12분/)
  assert.match(s, /글 1개 · 연습 3회/)
  assert.match(s, /오늘 누적 활성화: 2명/)
  assert.match(scriptaActivationMessage(rows[0], undefined, 0), /사용자: a/)
})
