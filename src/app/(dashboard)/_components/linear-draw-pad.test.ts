import assert from 'node:assert/strict'
import test from 'node:test'

import { acceptsPointer } from './linear-draw-pad'

test('a pad that has never seen a pen takes anything', () => {
  for (const type of ['touch', 'pen', 'mouse']) {
    assert.equal(acceptsPointer(type, false), true, type)
  }
})

test('once the pad has seen a pen, fingers are ignored', () => {
  assert.equal(acceptsPointer('touch', true), false)
})

test('the pen and the mouse keep drawing after a pen has been seen', () => {
  // 마우스는 손바닥이 아니다 — 펜 태블릿을 마우스와 같이 쓰는 자리가 있다.
  assert.equal(acceptsPointer('pen', true), true)
  assert.equal(acceptsPointer('mouse', true), true)
})

test('an unknown pointer type is not treated as a palm', () => {
  // 모르는 종류를 막으면 그 기기에서는 아무것도 못 그린다. 막는 것은 touch 뿐이다.
  assert.equal(acceptsPointer('', true), true)
  assert.equal(acceptsPointer('stylus', true), true)
})
