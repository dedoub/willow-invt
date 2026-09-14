import assert from 'node:assert/strict'
import test from 'node:test'

import {
  correctionDiff, chunkWritten, chunkRecord,
  passStreak, hintLevelFor, easedLevel,
  HINT_CHUNKS, HINT_SENTENCE, HINT_TOPIC,
} from '../english-practice-review'

/* ── 교정 표시 ─────────────────────────────────────────── */

test('조각을 이으면 교정문이 그대로 나온다', () => {
  const parts = correctionDiff('I go to school', 'I went to the school')
  assert.equal(parts.map(p => p.text).join(''), 'I went to the school')
})

test('바뀐 낱말만 표시된다 — 한 글자 오타가 묻히지 않게', () => {
  const parts = correctionDiff('a whilte cat', 'a white cat')
  const changed = parts.filter(p => p.changed).map(p => p.text)
  assert.deepEqual(changed, ['white'])
})

test('가운데 낱말이 하나 늘어도 그 뒤가 통째로 밀리지 않는다', () => {
  const parts = correctionDiff('the cat sat on mat', 'the cat sat on the mat')
  const changed = parts.filter(p => p.changed).map(p => p.text)
  assert.deepEqual(changed, ['the'])
})

test('공백은 바뀐 것으로 칠하지 않는다', () => {
  const parts = correctionDiff('a b', 'a  b')
  assert.ok(parts.filter(p => p.changed).every(p => p.text.trim() !== ''))
})

test('빈 교정문은 조각이 없다', () => {
  assert.deepEqual(correctionDiff('anything', ''), [])
})

/* ── 조각 기록 ─────────────────────────────────────────── */

test('낱말이 차례대로 들어 있으면 썼다로 친다', () => {
  assert.equal(chunkWritten('in the AI era', 'In the AI era, things change.'), true)
})

// 기준은 낱말의 8할이다. 조각이 짧을수록 빠뜨릴 여유가 없다 —
// 다섯 낱말에서 하나는 0.8 로 통과하고, 네 낱말에서 하나는 0.75 라 통과하지 못한다.
test('긴 조각에서 관사 하나 빠진 것은 넘어간다 — 채점이 아니라 기록이다', () => {
  assert.equal(chunkWritten('the cost of the capital', 'the cost of capital'), true)
})

test('짧은 조각은 하나만 빠져도 안 쓴 것으로 본다', () => {
  assert.equal(chunkWritten('in the AI era', 'in AI era'), false)
})

test('아예 안 쓴 조각은 잡힌다', () => {
  assert.equal(chunkWritten('distribution rights', 'I went to the market today.'), false)
})

// 스크립타와 갈리는 자리. 여기서는 문장을 스스로 세우므로 낱말 차례가 달라도 쓴 것이다.
test('낱말을 다른 자리에 놓아도 쓴 것으로 본다', () => {
  assert.equal(chunkWritten('it can increase control', 'it increase control of the process and can reduce cost'), true)
})

test('낱말 하나를 두 번 세지 않는다', () => {
  // 조각에는 the 가 둘, 답에는 하나 — 2/4 라 기준에 못 미친다.
  assert.equal(chunkWritten('the cost of the capital', 'the cost'), false)
})

test('조각마다 하나씩 돌려준다', () => {
  const out = chunkRecord(['the cat', 'sat down'], 'the cat ran away')
  assert.deepEqual(out, [true, false])
})

test('빈 조각은 썼다고 하지 않는다', () => {
  assert.equal(chunkWritten('   ', 'anything at all'), false)
})

/* ── 힌트 단계 ─────────────────────────────────────────── */

test('마지막이 틀렸으면 연속은 0이다', () => {
  assert.equal(passStreak([{ passed: true }, { passed: true }, { passed: false }]), 0)
})

test('뒤에서부터 이어진 정답만 센다', () => {
  assert.equal(passStreak([{ passed: false }, { passed: true }, { passed: true }]), 2)
})

test('시도가 없으면 0이다', () => {
  assert.equal(passStreak([]), 0)
})

test('두 번 연속이면 문장만, 세 번이면 주제만', () => {
  assert.equal(hintLevelFor(0), HINT_CHUNKS)
  assert.equal(hintLevelFor(1), HINT_CHUNKS)
  assert.equal(hintLevelFor(2), HINT_SENTENCE)
  assert.equal(hintLevelFor(3), HINT_TOPIC)
  assert.equal(hintLevelFor(9), HINT_TOPIC)
})

test('힌트를 누르면 한 단계씩 내려가되 청킹 아래로는 못 간다', () => {
  assert.equal(easedLevel(HINT_TOPIC, 1), HINT_SENTENCE)
  assert.equal(easedLevel(HINT_TOPIC, 2), HINT_CHUNKS)
  assert.equal(easedLevel(HINT_TOPIC, 5), HINT_CHUNKS)
  assert.equal(easedLevel(HINT_CHUNKS, 3), HINT_CHUNKS)
})
