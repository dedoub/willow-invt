// Decodes the KB국민카드 기업 (WIZVERA Delfino G4) on-screen keypad.
//
// The keypad is a single 594x190 PNG handed to the page as a data URI, so it can
// be read straight out of the DOM rather than off the screen. Its layout is a
// plain QWERTY grid at a fixed 40pt pitch; what varies per session is where the
// dolphin decoy keys sit. A decoy occupies a slot and pushes every later key in
// that row along, so the characters are assigned to the live slots in order —
// the same trick the 우리카드 keypad needs, but here the evidence is exact
// pixels from the page instead of a screenshot.
//
// Nothing is assumed about which layout is showing: after Shift is pressed the
// image is re-read and decoded again, so the shifted layout comes from the
// keypad itself.

/** 셀 채움색. 흰색이면 실제 키, 회색이면 돌고래(미끼) 키다. */
const LIVE = [255, 255, 255]
const DECOY = [234, 234, 234]

const CELL = 34
const PITCH = 40

// 행마다 첫 셀의 x 시작점과 셀 개수가 다르다. y 는 행의 중앙.
export const KEYPAD_ROWS = Object.freeze([
  Object.freeze({ y: 16, x: 0, cells: 15, characters: '`1234567890-=' }),
  Object.freeze({ y: 55, x: 17, cells: 14, characters: 'qwertyuiop[]\\' }),
  Object.freeze({ y: 94, x: 40, cells: 13, characters: "asdfghjkl;'" }),
  Object.freeze({ y: 133, x: 57, cells: 12, characters: 'zxcvbnm,./' }),
])

// Shift 를 누르면 이미지가 통째로 바뀌므로, 대문자 배열도 같은 방식으로 다시 읽는다.
export const KEYPAD_SHIFTED_ROWS = Object.freeze([
  Object.freeze({ y: 16, x: 0, cells: 15, characters: '~!@#$%^&*()_+' }),
  Object.freeze({ y: 55, x: 17, cells: 14, characters: 'QWERTYUIOP{}|' }),
  Object.freeze({ y: 94, x: 40, cells: 13, characters: 'ASDFGHJKL:"' }),
  Object.freeze({ y: 133, x: 57, cells: 12, characters: 'ZXCVBNM<>?' }),
])

/** 맨 아랫줄은 무작위가 아니라 고정이다. */
export const KEYPAD_CONTROLS = Object.freeze({
  shift: Object.freeze({ x: 56, y: 172 }),
  space: Object.freeze({ x: 296, y: 172 }),
  backspace: Object.freeze({ x: 496, y: 172 }),
  enter: Object.freeze({ x: 556, y: 172 }),
})

export const KEYPAD_SIZE = Object.freeze({ width: 594, height: 190 })

function sameColour(pixel, target, tolerance = 6) {
  return pixel.every((value, index) => Math.abs(value - target[index]) <= tolerance)
}

/**
 * 셀 한 칸의 대표색. 글자 획을 피하려고 최빈색을 쓴다 — 글자는 칸 면적의 일부라
 * 배경색이 항상 최빈이다.
 */
function cellFill(pixel, cx, cy) {
  const counts = new Map()
  for (let y = cy - 12; y <= cy + 12; y += 2) {
    for (let x = cx - 14; x <= cx + 14; x += 2) {
      const key = pixel(x, y).join(',')
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  let best = null
  let bestCount = -1
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key
      bestCount = count
    }
  }
  return best.split(',').map(Number)
}

/**
 * 키패드 이미지에서 문자 → 좌표 맵을 만든다. 좌표는 이미지 기준이므로, 화면에
 * 클릭하려면 이미지의 화면 위치를 더해야 한다.
 *
 * @param {(x: number, y: number) => number[]} pixel 이미지 픽셀 접근자
 * @param {boolean} shifted Shift 가 눌린 배열인지
 */
export function decodeKeypadLayout(pixel, { shifted = false } = {}) {
  const rows = shifted ? KEYPAD_SHIFTED_ROWS : KEYPAD_ROWS
  const keys = {}

  for (const row of rows) {
    const live = []
    for (let index = 0; index < row.cells; index += 1) {
      const cx = row.x + PITCH * index + Math.round(CELL / 2)
      const fill = cellFill(pixel, cx, row.y)
      if (sameColour(fill, DECOY)) continue
      if (!sameColour(fill, LIVE)) {
        throw new Error(`키패드 셀 색을 알아보지 못했어요: y=${row.y}, x=${cx}, rgb=${fill.join(',')}`)
      }
      live.push({ x: cx, y: row.y })
    }

    const characters = [...row.characters]
    if (live.length !== characters.length) {
      throw new Error(
        `키패드 배열이 예상과 달라요: y=${row.y}, 실제 키 ${live.length}개, 문자 ${characters.length}개`,
      )
    }
    for (const [index, character] of characters.entries()) keys[character] = live[index]
  }

  return keys
}

/**
 * 비밀번호를 키패드 조작 순서로 바꾼다. 현재 배열에 없는 문자는 Shift 를 눌러야
 * 하는데, Shift 를 누르면 이미지가 바뀌므로 그 시점에 다시 읽으라고 알린다.
 */
export function keypadActions(password, layout) {
  const actions = []
  for (const character of password) {
    if (layout[character]) {
      actions.push({ type: 'key', character, point: layout[character] })
      continue
    }
    actions.push({ type: 'shift', character })
  }
  return actions
}

/** 이미지 좌표를 화면 좌표로 옮긴다. */
export function toScreenPoint(point, origin) {
  return { x: origin.x + point.x, y: origin.y + point.y }
}
