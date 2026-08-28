import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ALLOWED_MICROS, APPS, MICROS_PER_CREDIT, MIN_SAMPLES,
  appOf, creditsPerCall, entryOf, verdictFor,
  type RateEntry, type Sample,
} from '../credit-rates-core'

const entry = (app: string, key: string): RateEntry => {
  const found = entryOf(appOf(app)!, key)
  assert.ok(found, `${app}/${key} 가 없다`)
  return found
}

/** 마진 m 이 나오도록 만든 표본. n 은 판정이 열리도록 기본 넉넉히 준다. */
const sampleAt = (margin: number, credits: number, n = 10): Sample => {
  const totalCost = MICROS_PER_CREDIT * (1 - margin) * credits
  return { n, totalCost, totalCredits: credits, worstPerCredit: totalCost / credits }
}

test('띠 안이면 값을 바꾸라고 하지 않는다', () => {
  const v = verdictFor(entry('reviewnotes', 'deepSolution'), 8, sampleAt(0.85, 80))
  assert.equal(v.mark, '✅')
  assert.equal(v.suggested, undefined)
})

/**
 * <b>단위에 따라 제안 방향이 뒤집힌다.</b> `credits` 는 올릴수록 비싸지고,
 * `perCredit` 은 「N개당 1크레딧」이라 <b>올릴수록 싸진다</b>. 한 공식으로
 * 계산하면 태그 정리 같은 요율에서 정확히 반대 값을 제안하게 된다.
 */
test('원가가 높으면 credits 는 올리고 perCredit 은 내린다', () => {
  const cheapMargin = 0.70   // 띠 아래 — 더 받아야 한다

  const perCall = entry('reviewnotes', 'deepSolution')          // unit: credits
  const a = verdictFor(perCall, 8, sampleAt(cheapMargin, 80))
  assert.equal(a.mark, '⚠️')
  assert.ok(a.suggested! > 8, `credits 는 올라가야 한다: ${a.suggested}`)

  const perCredit = entry('reviewnotes', 'tagReviewProblemsPerCredit')   // unit: perCredit
  const b = verdictFor(perCredit, 3, sampleAt(cheapMargin, 30))
  assert.equal(b.mark, '⚠️')
  assert.ok(b.suggested! < 3, `perCredit 은 내려가야 한다: ${b.suggested}`)
})

test('제안값을 쓰면 마진이 정확히 목표에 앉는다', () => {
  const e = entry('scripta', 'correctionMilli.sentence')   // unit: milli
  const s = sampleAt(0.60, 28.7)
  const v = verdictFor(e, 287, s)
  // 제안값으로 다시 세면 크레딧이 그만큼 늘어 원가가 허용치와 같아진다.
  const recounted = s.totalCredits * (v.suggested! / 287)
  assert.ok(Math.abs(s.totalCost / recounted - ALLOWED_MICROS) < 1e-6)
})

/**
 * 표본 하나가 최악값일 때 모두가 그 값을 낸다. 실제로 지면 크롭을 그렇게 2에서
 * 12로 올렸다가 마진이 97.5% 로 반대쪽으로 넘쳤다.
 */
test('표본이 얇으면 판정만 하고 값을 내지 않는다', () => {
  const v = verdictFor(entry('reviewnotes', 'deepSolution'), 8, sampleAt(0.40, 8, MIN_SAMPLES - 1))
  assert.equal(v.mark, '❔')
  assert.equal(v.suggested, undefined)
  assert.ok(v.margin! < 0.5, '마진 자체는 보여 준다')
})

test('실측이 없고 정가도 모르면 실패로 표시한다', () => {
  const v = verdictFor(entry('reviewnotes', 'documentMinimumCredits'), 10, null)
  assert.equal(v.mark, '❌')
  assert.equal(v.basis, null)
})

/**
 * 보이스카드는 원가 로그가 없다. Google 공급가가 문자·바이트당으로 공개돼 있어
 * 요율에서 바로 원가가 나온다 — 실측보다 약하지만 띠를 벗어나면 보인다.
 */
test('보이스카드는 정가로 판정한다', () => {
  const premium = verdictFor(entry('voicecards', 'ttsUnits.premium'), 100, null)
  assert.equal(premium.basis, 'list')
  assert.equal(premium.mark, '✅')
  assert.ok(Math.abs(premium.margin! - 0.838) < 0.001, `${premium.margin}`)

  const hd = verdictFor(entry('voicecards', 'ttsUnits.hd'), 50, null)
  assert.ok(Math.abs(hd.margin! - 0.848) < 0.001, `${hd.margin}`)

  // 문자 수를 두 배로 하면 크레딧 하나가 두 배를 사므로 마진이 무너진다.
  const doubled = verdictFor(entry('voicecards', 'ttsUnits.premium'), 200, null)
  assert.equal(doubled.mark, '⚠️')
  assert.ok(doubled.suggested! < 200)
})

/**
 * 실측 크레딧은 <b>지금 요율로 다시 센다</b>. 로그에 적힌 그때의 크레딧을 쓰면
 * 요율을 바꾼 뒤 옛 행과 새 행이 다른 자를 쓰게 된다.
 */
test('실측 한 건의 크레딧은 지금 값으로 다시 센다', () => {
  const crop = entry('reviewnotes', 'regionCreditsPerPage')
  assert.equal(crop.creditsOf!({ pages: 3, credits: 36 }, 2), 6)
  assert.equal(crop.creditsOf!({ pages: 3, credits: 36 }, 12), 36)

  const grouping = entry('reviewnotes', 'groupingRegionsPerCredit')
  assert.equal(grouping.creditsOf!({ regions: 41 }, 20), 3)
  // 짝확인 시절 기록은 `pairs` 로 남았다. 둘 다 읽어야 옛 행이 빠지지 않는다.
  assert.equal(grouping.creditsOf!({ pairs: 41 }, 20), 3)

  const doc = entry('reviewnotes', 'documentCreditsPerPage')
  assert.equal(doc.creditsOf!({ pages: 2 }, 2), 10, '최소값이 걸린다')
  assert.equal(doc.creditsOf!({ pages: 20 }, 2), 40)
})

test('밀리는 1,000분의 1크레딧이다', () => {
  assert.equal(creditsPerCall(entry('scripta', 'correctionMilli.sentence'), 287), 0.287)
  assert.equal(creditsPerCall(entry('scripta', 'structureCreditsPerBatch'), 4), 4)
})

/**
 * 리뷰노트의 실측은 `creditsOf` 로 크레딧을 센다. 실측이 붙는다고 적어 놓고
 * 세는 법이 없으면 그 요율은 <b>조용히</b> 판정에서 빠진다.
 */
test('실측이 붙는 리뷰노트 요율에는 세는 법이 있다', () => {
  for (const e of appOf('reviewnotes')!.entries) {
    if (e.costFeature) assert.ok(e.creditsOf, `${e.key} 에 creditsOf 가 없다`)
  }
})

test('세 앱의 요율 키는 앱 안에서 겹치지 않는다', () => {
  for (const app of APPS) {
    const keys = app.entries.map((e) => e.key)
    assert.equal(new Set(keys).size, keys.length, `${app.key} 에 중복 키가 있다`)
    assert.ok(keys.length > 0)
  }
})
