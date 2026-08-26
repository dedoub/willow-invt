import assert from 'node:assert/strict'
import test from 'node:test'
import {
  KEYPAD_CONTROLS,
  KEYPAD_ROWS,
  decodeKeypadLayout,
  keypadActions,
  toScreenPoint,
} from './kb-card-keypad.mjs'

const LIVE = [255, 255, 255]
const DECOY = [234, 234, 234]

/** 돌고래 미끼 위치를 지정해 키패드 이미지를 흉내낸다. */
function fakeKeypad(decoysByRow) {
  return (x, y) => {
    const row = KEYPAD_ROWS.find(candidate => Math.abs(candidate.y - y) <= 14)
    if (!row) return [0, 0, 0]
    const index = Math.round((x - row.x - 17) / 40)
    return (decoysByRow[row.y] ?? []).includes(index) ? DECOY : LIVE
  }
}

// 2026-08-26에 실제로 받은 배열.
const REAL = { 16: [3, 10], 55: [8], 94: [0, 6], 133: [2, 7] }

test('decodeKeypadLayout은 미끼를 건너뛰고 남은 칸에 문자를 순서대로 배정한다', () => {
  const layout = decodeKeypadLayout(fakeKeypad(REAL))

  // 첫 행: ` 1 2 [미끼] 3 ... 이므로 3은 네 번째가 아니라 다섯 번째 칸에 있다.
  assert.deepEqual(layout['`'], { x: 17, y: 16 })
  assert.deepEqual(layout['2'], { x: 97, y: 16 })
  assert.deepEqual(layout['3'], { x: 177, y: 16 })
  // 셋째 행은 첫 칸이 미끼라 a 가 한 칸 밀린다.
  assert.deepEqual(layout.a, { x: 97, y: 94 })
  assert.deepEqual(layout.h, { x: 337, y: 94 })
  // 마지막 행.
  assert.deepEqual(layout.z, { x: 74, y: 133 })
  assert.deepEqual(layout['/'], { x: 514, y: 133 })
})

test('미끼 위치가 달라지면 같은 문자가 다른 칸으로 간다', () => {
  const shifted = decodeKeypadLayout(fakeKeypad({ 16: [0, 1], 55: [0], 94: [11, 12], 133: [10, 11] }))
  assert.deepEqual(shifted['`'], { x: 97, y: 16 })
  assert.deepEqual(shifted.a, { x: 57, y: 94 })
})

test('배열이 예상과 다르면 찍지 않고 실패한다', () => {
  // 미끼가 하나 모자라면 문자 수와 칸 수가 어긋난다 — 잘못 찍으면 인증서가 잠긴다.
  assert.throws(() => decodeKeypadLayout(fakeKeypad({ 16: [3], 55: [8], 94: [0, 6], 133: [2, 7] })),
    /키패드 배열이 예상과 달라요/)
  assert.throws(() => decodeKeypadLayout(() => [12, 34, 56]), /알아보지 못했어요/)
})

test('keypadActions는 현재 배열에 없는 문자를 Shift 로 표시한다', () => {
  const layout = decodeKeypadLayout(fakeKeypad(REAL))
  const actions = keypadActions('a^b', layout)

  assert.equal(actions[0].type, 'key')
  assert.equal(actions[0].character, 'a')
  // ^ 는 Shift+6 이라 소문자 배열에는 없다.
  assert.deepEqual(actions[1], { type: 'shift', character: '^' })
  assert.equal(actions[2].type, 'key')
})

test('toScreenPoint는 이미지 좌표를 화면 좌표로 옮긴다', () => {
  assert.deepEqual(toScreenPoint({ x: 17, y: 16 }, { x: 661, y: 810 }), { x: 678, y: 826 })
  assert.deepEqual(toScreenPoint(KEYPAD_CONTROLS.enter, { x: 661, y: 810 }), { x: 1217, y: 982 })
})
