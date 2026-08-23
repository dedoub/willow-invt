import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const ROOT = process.cwd()

async function loadGrading() {
  return import('../english-ce-grading').catch(() => ({} as Record<string, unknown>))
}

test('the English profile switch names the CE mode 기출 작문', async () => {
  const source = await readFile(
    `${ROOT}/src/app/(dashboard)/_components/english-profile.tsx`,
    'utf8',
  )

  assert.match(source, /value:\s*'ryuha_ce',\s*label:\s*'기출 작문'/)
})

test('the English page renders the CE composition practice view', async () => {
  const page = await readFile(
    `${ROOT}/src/app/(dashboard)/(linear)/english/page.tsx`,
    'utf8',
  )
  const view = await readFile(
    `${ROOT}/src/app/(dashboard)/(linear)/english/_components/ce-composition-view.tsx`,
    'utf8',
  ).catch(() => '')

  assert.match(page, /profile\s*===\s*'ryuha_ce'/)
  assert.match(page, /<CeCompositionView/)
  assert.match(view, /기출 작문/)
  assert.match(view, /문제 풀이[\s\S]*(?:<textarea|<DrawPad)/)
  assert.match(view, /storageKey="english-ce-pad-h"/)
  assert.match(view, /\/api\/english\/ce\/queue\?kind=composition/)
  assert.match(view, /\/api\/english\/ce\/grade/)
})

test('the four-option English profile switch gets its own row on mobile', async () => {
  const layout = await readFile(
    `${ROOT}/src/app/(dashboard)/(linear)/layout.tsx`,
    'utf8',
  )

  assert.match(layout, /pathname\s*===\s*'\/english'\s*&&\s*!mobile\s*\?\s*<EnglishProfileToggle/)
  assert.match(layout, /pathname\s*===\s*'\/english'\s*&&\s*mobile[\s\S]*<EnglishProfileToggle/)
})

test('the CE queue exposes the latest ReviewNotes solution for composition guidance', async () => {
  const source = await readFile(
    `${ROOT}/src/app/api/english/ce/queue/route.ts`,
    'utf8',
  )

  assert.match(source, /solution:\s*p\.schemeText/)
})

test('CE APIs use the same dashboard access boundary as the existing English APIs', async () => {
  const [queue, grade, image] = await Promise.all([
    readFile(`${ROOT}/src/app/api/english/ce/queue/route.ts`, 'utf8'),
    readFile(`${ROOT}/src/app/api/english/ce/grade/route.ts`, 'utf8'),
    readFile(`${ROOT}/src/app/api/english/ce/image/route.ts`, 'utf8'),
  ])

  for (const source of [queue, grade, image]) {
    assert.doesNotMatch(source, /getAuthUser/)
    assert.doesNotMatch(source, /status:\s*401/)
  }
})

test('composition grading evaluates the three writing levels and gives a next practice action', async () => {
  const source = await readFile(
    `${ROOT}/src/app/api/english/ce/grade/route.ts`,
    'utf8',
  )

  assert.match(source, /문제 이해/)
  assert.match(source, /답안 구성/)
  assert.match(source, /문단 구성/)
  assert.match(source, /문단 내 문장 구성/)
  assert.match(source, /개별 문장의 완성도/)
  assert.match(source, /paragraph_structure/)
  assert.match(source, /paragraph_sentence_structure/)
  assert.match(source, /sentence_quality/)
  assert.match(source, /nextPractice/)
  assert.match(source, /exact wording/i)
  assert.match(source, /exact sentence count/i)
})

test('composition grading stays fast by using one compact text-only grading call', async () => {
  const source = await readFile(
    `${ROOT}/src/app/api/english/ce/grade/route.ts`,
    'utf8',
  )

  assert.match(source, /problem\.kind\s*===\s*'comprehension'[\s\S]*fetchS3Object/)
  assert.match(source, /llmJson\(system, user, 1400, problem\.kind === 'comprehension' \? images : undefined\)/)
})

test('composition grade is normalised into the three practice levels', async () => {
  const grading = await loadGrading()
  assert.equal(typeof grading.normaliseCompositionGrade, 'function')
  const normaliseCompositionGrade = grading.normaliseCompositionGrade as CompositionNormaliser
  const result = normaliseCompositionGrade(31, 35, [
    { level: 'sentence_quality', earned: 8, possible: 10, note: '문장 근거', nextPractice: '문장 연습' },
    { level: 'paragraph_structure', earned: 9, possible: 10, note: '문단 근거', nextPractice: '문단 연습' },
    { level: 'paragraph_sentence_structure', earned: 13, possible: 15, note: '문단 안 근거', nextPractice: '연결 연습' },
  ])

  assert.deepEqual(result.points.map(point => point.level), [
    'paragraph_structure',
    'paragraph_sentence_structure',
    'sentence_quality',
  ])
  assert.deepEqual(result.points.map(point => point.possible), [10, 15, 10])
  assert.equal(result.score, 30)
})

test('composition grade clamps invalid marks and keeps the total consistent', async () => {
  const grading = await loadGrading()
  assert.equal(typeof grading.normaliseCompositionGrade, 'function')
  const normaliseCompositionGrade = grading.normaliseCompositionGrade as CompositionNormaliser
  const result = normaliseCompositionGrade(35, 35, [
    { level: 'paragraph_structure', earned: 20, possible: 10, note: '', nextPractice: '' },
    { level: 'paragraph_sentence_structure', earned: -2, possible: 15, note: '', nextPractice: '' },
    { level: 'sentence_quality', earned: 7, possible: 10, note: '', nextPractice: '' },
  ])

  assert.deepEqual(result.points.map(point => point.earned), [10, 0, 7])
  assert.equal(result.score, 17)
})

test('composition grade does not reuse a partial or duplicate LLM point for missing levels', async () => {
  const grading = await loadGrading()
  const normaliseCompositionGrade = grading.normaliseCompositionGrade as CompositionNormaliser
  const result = normaliseCompositionGrade(20, 35, [
    { level: 'sentence_quality', earned: 8, possible: 10, note: '', nextPractice: '' },
    { level: 'sentence_quality', earned: 10, possible: 10, note: 'duplicate', nextPractice: 'duplicate' },
  ])

  assert.deepEqual(result.points.map(point => point.earned), [0, 0, 8])
  assert.equal(result.score, 8)
  assert.ok(result.points.every(point => point.note.length > 0))
  assert.ok(result.points.every(point => point.nextPractice.length > 0))
})

test('composition grade converts non-numeric marks to a finite zero', async () => {
  const grading = await loadGrading()
  const normaliseCompositionGrade = grading.normaliseCompositionGrade as CompositionNormaliser
  const result = normaliseCompositionGrade(20, 35, [
    { level: 'paragraph_structure', earned: Number.NaN, possible: 10, note: '', nextPractice: '' },
    { level: 'paragraph_sentence_structure', earned: 12, possible: Number.NaN, note: '', nextPractice: '' },
    { level: 'sentence_quality', earned: 7, possible: 10, note: '', nextPractice: '' },
  ])

  assert.deepEqual(result.points.map(point => point.earned), [0, 12, 7])
  assert.ok(Number.isFinite(result.score))
})

test('a first full score on a retry increments the visible solved count', async () => {
  const view = await readFile(
    `${ROOT}/src/app/(dashboard)/(linear)/english/_components/ce-composition-view.tsx`,
    'utf8',
  )

  assert.doesNotMatch(view, /data\.score\s*>=\s*data\.maxScore\s*&&\s*!current\.isReview/)
  assert.match(view, /solvedFull:\s*data\.score\s*>=\s*data\.maxScore/)
})

type CompositionNormaliser = (
  score: number,
  maxScore: number,
  points: Array<{
    level: string
    earned: number
    possible: number
    note: string
    nextPractice: string
  }>,
) => {
  score: number
  points: Array<{
    level: string
    earned: number
    possible: number
    note: string
    nextPractice: string
  }>
}
