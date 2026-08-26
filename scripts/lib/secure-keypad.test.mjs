import assert from 'node:assert/strict'
import test from 'node:test'

async function loadSubject() {
  try {
    return await import('./secure-keypad.mjs')
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') return {}
    throw error
  }
}

test('mapOrderedKeys skips inserted lock slots without shifting the key order', async () => {
  const { mapOrderedKeys } = await loadSubject()

  assert.equal(typeof mapOrderedKeys, 'function')
  assert.deepEqual(
    mapOrderedKeys('1234', [
      { x: 10, y: 20, locked: false },
      { x: 20, y: 20, locked: true },
      { x: 30, y: 20, locked: false },
      { x: 40, y: 20, locked: false },
      { x: 50, y: 20, locked: false },
    ]),
    {
      '1': { x: 10, y: 20 },
      '2': { x: 30, y: 20 },
      '3': { x: 40, y: 20 },
      '4': { x: 50, y: 20 },
    },
  )
})

test('mapOrderedKeys refuses a layout with a missing or extra unlocked key', async () => {
  const { mapOrderedKeys } = await loadSubject()

  assert.throws(
    () => mapOrderedKeys('1234', [
      { x: 10, y: 20, locked: false },
      { x: 20, y: 20, locked: true },
      { x: 30, y: 20, locked: false },
      { x: 40, y: 20, locked: false },
    ]),
    /키 개수가 예상과 달라요/,
  )
})

test('requiredKeyCoordinates returns only fully validated password characters', async () => {
  const { requiredKeyCoordinates } = await loadSubject()
  const layouts = {
    base: { a: { x: 1, y: 1 }, '1': { x: 2, y: 1 } },
    shift: { A: { x: 1, y: 1 } },
    special: { '!': { x: 3, y: 1 } },
  }

  assert.deepEqual(requiredKeyCoordinates('A1!a', layouts), [
    { character: 'A', mode: 'shift', point: { x: 1, y: 1 } },
    { character: '1', mode: 'base', point: { x: 2, y: 1 } },
    { character: '!', mode: 'special', point: { x: 3, y: 1 } },
    { character: 'a', mode: 'base', point: { x: 1, y: 1 } },
  ])
})

test('requiredKeyCoordinates aborts before clicking when any character is unavailable', async () => {
  const { requiredKeyCoordinates } = await loadSubject()

  assert.throws(
    () => requiredKeyCoordinates('A1!', {
      base: { '1': { x: 2, y: 1 } },
      shift: { A: { x: 1, y: 1 } },
      special: {},
    }),
    /필요한 키를 안전하게 확인하지 못했어요/,
  )
})

test('isLockedCell distinguishes the blue lock icon from dark key text', async () => {
  const { isLockedCell } = await loadSubject()

  assert.equal(isLockedCell({ bluePixels: 204, darkPixels: 0 }), true)
  assert.equal(isLockedCell({ bluePixels: 3, darkPixels: 48 }), false)
})

test('countCellPixels measures lock-blue and dark text pixels separately', async () => {
  const { countCellPixels } = await loadSubject()
  const pixels = Uint8Array.from([
    180, 205, 245,
    20, 30, 40,
    255, 255, 255,
  ])

  assert.deepEqual(countCellPixels(pixels, 3), { bluePixels: 1, darkPixels: 1 })
})

test('wooriDataSlots returns only character and random-lock cells', async () => {
  const { wooriDataSlots } = await loadSubject()

  const slots = wooriDataSlots()
  assert.equal(slots.length, 40)
  assert.deepEqual(slots[0], { x: 478, y: 737, row: 0, column: 0 })
  assert.deepEqual(slots.at(-1), { x: 874, y: 869, row: 3, column: 9 })
})

test('wooriDataSlots supports a fixed browser chrome offset', async () => {
  const { wooriDataSlots } = await loadSubject()

  assert.deepEqual(wooriDataSlots({ originX: 478, originY: 848 })[0], {
    x: 478,
    y: 848,
    row: 0,
    column: 0,
  })
})

test('ordered characters match the 36 unlocked Woori keys in every mode', async () => {
  const { WOORI_ORDERED_CHARACTERS } = await loadSubject()

  assert.equal([...WOORI_ORDERED_CHARACTERS.base].length, 36)
  assert.equal([...WOORI_ORDERED_CHARACTERS.shift].length, 36)
  assert.equal([...WOORI_ORDERED_CHARACTERS.special].length, 36)
})

test('selectGridOrigin chooses the strongest four-lock row alignment', async () => {
  const { selectGridOrigin } = await loadSubject()

  assert.equal(selectGridOrigin([
    { originY: 847, lockedCount: 3, bluePixels: 510 },
    { originY: 848, lockedCount: 4, bluePixels: 790 },
    { originY: 849, lockedCount: 4, bluePixels: 820 },
  ]), 849)
})

test('countColumnClusters counts separated password mask glyphs', async () => {
  const { countColumnClusters } = await loadSubject()

  assert.equal(countColumnClusters([710, 711, 718, 719, 726, 727]), 3)
  assert.equal(countColumnClusters([]), 0)
})
