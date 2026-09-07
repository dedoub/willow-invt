import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  isVoicecardsLearningActivated,
  voicecardsLearningActivationDate,
  isVoicecardsAnonDeviceRow,
  isVoicecardsDeviceAccountRow,
  isVoicecardsGoogleUserRow,
} from '../voicecards-device-journey'

const ROOT = process.cwd()
const BLOCK = `${ROOT}/src/app/(dashboard)/(linear)/voicecards/_components/voicecards-block.tsx`

test('an activated account with no known date is still activated', () => {
  // 기기 계정은 createdAt이 ''이다. 예전 퍼널은 날짜 유무로 활성화를 판정해서, journey
  // 행이 없어 installedAt까지 비면 표가 '완료'로 찍는 행을 세지 못했다. 2026-09-07
  // 실측 누락은 0건이었지만(활성화된 기기 계정 23개 전부 journey 행 보유) 구조는 남아
  // 있었다. 판정을 날짜에서 떼어 이 경로를 아예 없앤다.
  const deviceAccount = {
    id: 'device:d97a92c6-f770-4931-a88d-d1f1522e87d2',
    createdAt: '',
    installedAt: null,
    activatedAt: null,
    sheetCount: 2,
    cards: 40,
    ownCards: 40,
    flips: 0,
  }

  assert.equal(isVoicecardsLearningActivated(deviceAccount), true)
  assert.equal(voicecardsLearningActivationDate(deviceAccount), null)
})

test('demo-only and flip-only rows keep the dashboard activation definition', () => {
  const base = { id: 'u1', createdAt: '2026-09-01T00:00:00.000Z', sheetCount: 0, cards: 0 }

  // 데모 카드만 본 사용자는 활성화가 아니다 (ownCards가 데모를 뺀 값).
  assert.equal(isVoicecardsLearningActivated({ ...base, cards: 100, ownCards: 0 }), false)
  // 뒤집기만 한 사용자도 활성화다 (2026-07-25 CEO).
  assert.equal(isVoicecardsLearningActivated({ ...base, flips: 3 }), true)
  // ownCards가 없는 옛 payload는 cards로 강등 — 전원 활성화가 되는 착시를 막는다.
  assert.equal(isVoicecardsLearningActivated({ ...base, cards: 0 }), false)
  assert.equal(isVoicecardsLearningActivated({ ...base, cards: 7 }), true)
})

test('row kinds split the three populations without overlap', () => {
  const google = 'google-oauth|101662172713686736923'
  const deviceAccount = 'device:d97a92c6-f770-4931-a88d-d1f1522e87d2'
  const anonDevice = 'dev:d97a92c6-f770-4931-a88d-d1f1522e87d2'

  assert.deepEqual(
    [google, deviceAccount, anonDevice].map(isVoicecardsGoogleUserRow),
    [true, false, false],
  )
  assert.deepEqual(
    [google, deviceAccount, anonDevice].map(isVoicecardsDeviceAccountRow),
    [false, true, false],
  )
  assert.deepEqual(
    [google, deviceAccount, anonDevice].map(isVoicecardsAnonDeviceRow),
    [false, false, true],
  )
})

test('funnel and user table read activation from the one shared helper', async () => {
  const src = await readFile(BLOCK, 'utf8')

  // 퍼널 헤드라인 · 표 헤더 · 표 셀 · 정렬 — 네 곳 모두 같은 함수를 부른다.
  assert.ok(
    src.match(/isVoicecardsLearningActivated/g)!.length >= 5,
    'activation checks should all route through isVoicecardsLearningActivated',
  )
  // 판정식을 다시 손으로 적으면 두 섹션이 조용히 갈린다 (2026-09-07 실제 발생).
  assert.doesNotMatch(src, /sheetCount [=><]+ 0 &&/)
  assert.doesNotMatch(src, /sheetCount > 0 \|\| \(/)
})

test('funnel activation counts the same rows the user table renders', async () => {
  const src = await readFile(BLOCK, 'utf8')

  // 퍼널 '학습 활성화'의 모집단은 표가 그리는 배열과 같아야 한다: users + deviceRows.
  // userStats.users만 세면 표가 '완료'로 찍는 익명 기기 행이 퍼널에서 빠진다.
  assert.match(src, /const activatedRows = \[\.\.\.\(userStats\?\.users \?\? \[\]\), \.\.\.deviceRows\]/)
  assert.match(src, /const arr = \[\.\.\.userStats\.users, \.\.\.deviceRows\]/)
  // 표 헤더가 같은 값을 적어 화면에서 바로 대조된다.
  assert.match(src, /const activatedRowCount = sortedUsers\.filter\(isVoicecardsLearningActivated\)\.length/)
})
