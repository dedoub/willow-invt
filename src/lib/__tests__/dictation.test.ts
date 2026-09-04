import assert from 'node:assert/strict'
import test from 'node:test'

import { appendTranscript, partitionResults } from '../dictation'

test('확정분과 중간분을 가른다', () => {
  const { final, interim } = partitionResults([
    { transcript: 'We need to check', isFinal: true },
    { transcript: ' the correlation', isFinal: true },
    { transcript: ' between our', isFinal: false },
  ])
  assert.equal(final, 'We need to check the correlation')
  assert.equal(interim, 'between our')
})

test('중간분만 있으면 확정분은 빈 문자열이다', () => {
  const { final, interim } = partitionResults([{ transcript: 'I sent the', isFinal: false }])
  assert.equal(final, '')
  assert.equal(interim, 'I sent the')
})

test('결과가 없으면 둘 다 빈 문자열이다', () => {
  assert.deepEqual(partitionResults([]), { final: '', interim: '' })
})

test('빈 입력창에는 공백 없이 넣는다', () => {
  assert.equal(appendTranscript('', 'I sent the invoice'), 'I sent the invoice')
})

test('기존 문장 뒤에는 공백 하나로 잇는다', () => {
  assert.equal(appendTranscript('I sent the invoice', 'yesterday'), 'I sent the invoice yesterday')
})

test('기존 문장이 공백으로 끝나도 공백이 겹치지 않는다', () => {
  assert.equal(appendTranscript('I sent the invoice  ', 'yesterday'), 'I sent the invoice yesterday')
})

test('빈 인식 결과는 입력창을 건드리지 않는다', () => {
  // 침묵 구간에서 빈 확정분이 올라오면 꼬리 공백만 붙어 커서가 밀린다.
  assert.equal(appendTranscript('I sent the invoice', '   '), 'I sent the invoice')
})

test('마침표 뒤에도 공백 하나로 잇는다', () => {
  assert.equal(appendTranscript('That works.', 'Let me check with my team.'),
    'That works. Let me check with my team.')
})
