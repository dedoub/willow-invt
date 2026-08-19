import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildChunkedTranslationPrompt,
  detectChunkedTranslationRequest,
  filterDuplicateRows,
  formatChunkedTranslationError,
  summarizeChunkedTranslationResult,
  verifyAppendedRows,
  type ChunkedTranslationRows,
} from '../ryuha-chunked-translation'

test('detects a Rina chunked translation request and extracts the Korean source', () => {
  const request = detectChunkedTranslationRequest([
    '오늘 학교에서 친구한테 같이 점심 먹자고 말하고 싶어.',
    '',
    '청킹번역해서 넣어줘',
  ].join('\n'))

  assert.ok(request)
  assert.equal(request.sourceText, '오늘 학교에서 친구한테 같이 점심 먹자고 말하고 싶어.')
})

test('does not treat ordinary study management messages as chunked translation requests', () => {
  assert.equal(detectChunkedTranslationRequest('오늘 숙제 뭐 있어?'), null)
})

test('builds the generation prompt with British English-only instructions', () => {
  const prompt = buildChunkedTranslationPrompt('비가 와서 걸어가기는 쉽지 않을 것 같아.')

  assert.match(prompt, /British English/)
  assert.doesNotMatch(prompt, /German|german|독일어/)
  assert.match(prompt, /Rina's original intent and emotion/)
  assert.match(prompt, /base expression \+ two variations/)
  assert.match(prompt, /strict JSON/)
})

test('filters duplicates by normalized Question and Answer pairs', () => {
  const rows: ChunkedTranslationRows = {
    english: [
      { question: '비가 와서', answer: 'Because it is raining' },
      { question: '걸어가긴 어렵겠어', answer: 'walking there will be hard' },
    ],
  }

  const filtered = filterDuplicateRows(rows, {
    english: [['Question', 'Answer'], ['비가  와서', 'Because it is raining']],
  })

  assert.deepEqual(filtered.english, [
    { question: '걸어가긴 어렵겠어', answer: 'walking there will be hard' },
  ])
})

test('verifies appended rows against re-read English sheet tails', () => {
  const expected: ChunkedTranslationRows = {
    english: [
      { question: '비가 와서', answer: 'Because it is raining' },
      { question: '걷기는 어렵겠어', answer: 'walking there will be hard' },
    ],
  }

  assert.deepEqual(verifyAppendedRows(expected, {
    english: [
      ['Question', 'Answer', 'Memo', 'Bookmark'],
      ['비가 와서', 'Because it is raining', '', ''],
      ['걷기는 어렵겠어', 'walking there will be hard', '', ''],
    ],
  }), {
    english: { ok: true, expected: 2, found: 2 },
  })

  assert.deepEqual(verifyAppendedRows(expected, {
    english: [['Question', 'Answer', 'Memo', 'Bookmark']],
  }).english.ok, false)
})

test('summarizes only fully verified writes as complete', () => {
  assert.equal(summarizeChunkedTranslationResult({
    englishAdded: 3,
    englishSkipped: 1,
    verified: {
      english: { ok: true, expected: 3, found: 3 },
    },
  }), '영국식 영어 청킹 3개를 영어 시트에 추가했고, 기존 중복 1개는 제외했어. 영어 시트 재조회 검증까지 완료했어.')

  assert.match(summarizeChunkedTranslationResult({
    englishAdded: 3,
    englishSkipped: 0,
    verified: {
      english: { ok: false, expected: 3, found: 2 },
    },
  }), /완료하지 못했어/)
})

test('formats Google Sheets permission errors with the service account email', () => {
  const message = formatChunkedTranslationError(
    Object.assign(new Error('The caller does not have permission'), { code: 403 }),
    'bot@example.iam.gserviceaccount.com'
  )

  assert.match(message, /편집 권한/)
  assert.match(message, /bot@example\.iam\.gserviceaccount\.com/)
})
