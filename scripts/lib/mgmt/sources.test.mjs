import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeGmail, normalizeChat, isRecordedSpace, newerThan, hitCap } from './sources.mjs'

const b64 = s => Buffer.from(s).toString('base64url')
test('윌로우 메일은 willow, 보낸 메일은 out', () => {
  const m = { id: 'g1', threadId: 't1', internalDate: String(Date.parse('2026-10-01T00:00:00Z')), labelIds: ['SENT'],
    payload: { headers: [{ name: 'From', value: 'dw.kim@willowinvt.com' }, { name: 'To', value: 'kyle@etc.com' }, { name: 'Subject', value: 'Invoice #26-ETC-20' }],
      mimeType: 'text/plain', body: { data: b64('Please find attached') } } }
  const x = normalizeGmail(m, 'default')
  assert.equal(x.company, 'willow'); assert.equal(x.direction, 'out'); assert.equal(x.text, 'Please find attached'); assert.equal(x.ref, 'g1')
})
test('챗 메시지 모양', () => {
  const x = normalizeChat({ name: 'spaces/A/messages/B', createTime: '2026-10-01T01:00:00Z', text: '세금계산서 발행 부탁드립니다', sender: { displayName: '김의향' }, thread: { name: 'spaces/A/threads/T' } }, { name: 'spaces/A', displayName: 'Tensw 운영자방' })
  assert.deepEqual([x.company, x.ref, x.space, x.from], ['tensw', 'spaces/A/messages/B', 'Tensw 운영자방', '김의향'])
})
test('봇 방·휴면 방 제외', () => {
  const now = new Date('2026-10-01T00:00:00Z')
  assert.equal(isRecordedSpace({ displayName: 'VS Code' }, '2026-09-30T00:00:00Z', now), false)
  assert.equal(isRecordedSpace({ displayName: 'Todo - 장비고' }, '2026-09-30T00:00:00Z', now), false)
  assert.equal(isRecordedSpace({ displayName: 'Tensw 업무보고' }, '2026-06-01T00:00:00Z', now), false)
  assert.equal(isRecordedSpace({ displayName: 'Tensw 업무보고' }, '2026-09-29T00:00:00Z', now), true)
})
test('커서 이후만, 같은 시각 같은 ref 는 제외', () => {
  const items = [{ ref: 'a', at: '2026-10-01T00:00:00Z' }, { ref: 'b', at: '2026-10-01T00:00:00Z' }, { ref: 'c', at: '2026-09-30T00:00:00Z' }]
  assert.deepEqual(newerThan(items, { last_seen_at: '2026-10-01T00:00:00Z', last_ref: 'a' }).map(x => x.ref), ['b'])
})
test('hitCap: 상한에 닿고 커서 경계 전이면 true', () => {
  assert.equal(hitCap({ pages: 20, maxPages: 20, reachedCursor: false }), true)
})
test('hitCap: 커서 경계에 닿았으면 상한에 닿았어도 false', () => {
  assert.equal(hitCap({ pages: 20, maxPages: 20, reachedCursor: true }), false)
})
