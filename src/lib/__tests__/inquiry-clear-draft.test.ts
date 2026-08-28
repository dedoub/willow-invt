import assert from 'node:assert/strict'
import test from 'node:test'

import { INQUIRY_APPS, clearDraft, type DraftClearClient } from '../inquiry-inbox-core'

/**
 * 발행하면 초안 칸을 비운다.
 *
 * `publish_inquiry_reply` 는 초안을 안 건드린다. 그래서 운영자가 <b>초안을
 * 고쳐</b> 보내면 고치기 전 원본이 DB 에 남고, 텔레그램에 승인 버튼이 붙는
 * 순간(`publish_inquiry_draft` 는 이미 DB 에 있고 부르는 곳만 없다) 그 낡은
 * 원본이 <b>두 번째 메시지로</b> 고객에게 간다.
 *
 * 앱마다 표·칸 이름이 다르다(`draft_body` vs `"draftBody"`). 한 앱만 조용히
 * 안 지워져도 아무도 모르므로 <b>네 앱 전부</b> 확인한다.
 */
type Call = { table: string; values: Record<string, unknown>; where: [string, string] }

function recorder(error: { message: string } | null = null) {
  const calls: Call[] = []
  const client = {
    from(table: string) {
      return {
        update(values: Record<string, unknown>) {
          return {
            eq: (column: string, value: string) => {
              calls.push({ table, values, where: [column, value] })
              return Promise.resolve({ error })
            },
          }
        },
      }
    },
  } as DraftClearClient
  return { client, calls }
}

for (const spec of INQUIRY_APPS) {
  test(`clearDraft — ${spec.label}: 자기 표의 자기 초안 칸을 스레드 id 로 비운다`, async () => {
    const { client, calls } = recorder()
    assert.equal(await clearDraft(spec, 'thread-1', client), true)
    assert.deepEqual(calls, [
      { table: spec.threadTable, values: { [spec.draft.body]: null }, where: [spec.thread.id, 'thread-1'] },
    ])
  })
}

test('clearDraft — 네 앱의 초안 칸 이름이 서로 다르다: 하나로 뭉뚱그리면 어딘가 안 지워진다', () => {
  assert.ok(new Set(INQUIRY_APPS.map(s => s.draft.body)).size > 1)
})

test('clearDraft — DB 가 거절하면 false: 못 지운 것을 지웠다고 하지 않는다', async () => {
  const { client } = recorder({ message: 'nope' })
  assert.equal(await clearDraft(INQUIRY_APPS[0], 'thread-1', client), false)
})

test('clearDraft — 클라이언트가 없으면 false: 미설정을 성공으로 보고하지 않는다', async () => {
  assert.equal(await clearDraft(INQUIRY_APPS[0], 'thread-1', null), false)
})
