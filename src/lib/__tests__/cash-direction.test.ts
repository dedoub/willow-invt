import assert from 'node:assert/strict'
import test from 'node:test'

import { cashDirection, cashTone } from '../cash-direction'

/** 사례는 전부 실제 원장에서 가져왔다 — 규칙이 아니라 장부가 답이다. */

test('매출·부채·대체·환전은 부호가 곧 방향이다', () => {
  assert.equal(cashDirection('revenue', 145_750_000), 'in')
  assert.equal(cashDirection('liability', 105_730_750), 'in')   // 추가 대출금 입금
  assert.equal(cashDirection('liability', -20_000_000), 'out')  // 대여금 상환
  assert.equal(cashDirection('transfer', 40_000_000), 'in')
  assert.equal(cashDirection('transfer', -40_000_500), 'out')
  assert.equal(cashDirection('exchange', 16_298_560), 'in')     // 외화환전 입금(원화)
})

test('비용은 거꾸로다 — 플러스가 나간 돈, 마이너스가 환급이다', () => {
  assert.equal(cashDirection('expense', 12_389_250), 'out')
  assert.equal(cashDirection('expense', -960_000), 'in')        // 카드 입금 (환급)
  assert.equal(cashDirection('expense', -50_000), 'in')         // KB포인트리
})

test('자산도 거꾸로다 — 회수는 마이너스로 적히지만 들어온 돈이다', () => {
  assert.equal(cashDirection('asset', -5_000_000), 'in')        // 텐소프트웍스 대여금 회수
  assert.equal(cashDirection('asset', 5_000_000), 'out')
})

test('0원과 모르는 구분', () => {
  assert.equal(cashDirection('expense', 0), 'none')
  assert.equal(cashDirection(null, 0), 'none')
  // 모르는 구분은 부호를 따른다 — 비용처럼 뒤집어 읽는 것보다 틀려도 덜 이상하다
  assert.equal(cashDirection('mystery', 1000), 'in')
  assert.equal(cashDirection('mystery', -1000), 'out')
})

test('색조는 들어온 돈 pos, 나간 돈 neg, 0원은 색 없음', () => {
  assert.equal(cashTone('revenue', 1), 'pos')
  assert.equal(cashTone('expense', 1), 'neg')
  assert.equal(cashTone('expense', -1), 'pos')
  assert.equal(cashTone('revenue', 0), 'text')
})
