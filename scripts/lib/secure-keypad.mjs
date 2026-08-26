export function mapOrderedKeys(orderedCharacters, slots) {
  const characters = [...orderedCharacters]
  const available = slots.filter(slot => !slot.locked)

  if (available.length !== characters.length) {
    throw new Error(`키 개수가 예상과 달라요: expected=${characters.length}, actual=${available.length}`)
  }

  return Object.fromEntries(characters.map((character, index) => [
    character,
    { x: available[index].x, y: available[index].y },
  ]))
}

function modeForCharacter(character) {
  if (/^[A-Z]$/.test(character)) return 'shift'
  if (/^[a-z0-9]$/.test(character)) return 'base'
  return 'special'
}

export function requiredKeyCoordinates(password, layouts) {
  return [...password].map(character => {
    const mode = modeForCharacter(character)
    const point = layouts[mode]?.[character]
    if (!point) {
      throw new Error(`필요한 키를 안전하게 확인하지 못했어요: mode=${mode}`)
    }
    return { character, mode, point }
  })
}

const GRID_ORIGIN = { x: 478, y: 737 }
const GRID_STEP = 44
const DATA_COLUMNS_BY_ROW = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  [2, 3, 4, 5, 6, 7, 8, 9, 10],
  [2, 3, 4, 5, 6, 7, 8, 9],
]

export const WOORI_ORDERED_CHARACTERS = {
  base: '1234567890qwertyuiopasdfghjklzxcvbnm',
  shift: '1234567890QWERTYUIOPASDFGHJKLZXCVBNM',
  special: '!@#$%^&*()-_=+\\|{}[];:\'",.<>$~`!@#/?',
}

export function isLockedCell({ bluePixels }, minimumBluePixels = 80) {
  return bluePixels >= minimumBluePixels
}

export function countCellPixels(pixels, channels) {
  let bluePixels = 0
  let darkPixels = 0

  for (let index = 0; index < pixels.length; index += channels) {
    const red = pixels[index]
    const green = pixels[index + 1]
    const blue = pixels[index + 2]
    if (blue > red + 8 && blue > green + 2 && blue > 140) bluePixels += 1
    if (red < 100 && green < 100 && blue < 100) darkPixels += 1
  }

  return { bluePixels, darkPixels }
}

export function wooriDataSlots({ originX = GRID_ORIGIN.x, originY = GRID_ORIGIN.y } = {}) {
  return DATA_COLUMNS_BY_ROW.flatMap((columns, row) => columns.map(column => ({
    x: originX + column * GRID_STEP,
    y: originY + row * GRID_STEP,
    row,
    column,
  })))
}

function cellCountsFromImage(data, info, x, y) {
  const pixels = []
  for (let sampleY = y - 10; sampleY <= y + 10; sampleY += 1) {
    for (let sampleX = x - 10; sampleX <= x + 10; sampleX += 1) {
      const offset = (sampleY * info.width + sampleX) * info.channels
      for (let channel = 0; channel < info.channels; channel += 1) {
        pixels.push(data[offset + channel])
      }
    }
  }
  return countCellPixels(pixels, info.channels)
}

export function selectGridOrigin(candidates) {
  const valid = candidates.filter(candidate => candidate.lockedCount === 4)
  if (valid.length === 0) throw new Error('보안키패드의 잠금칸 4개를 찾지 못했어요.')
  return valid.sort((a, b) => b.bluePixels - a.bluePixels)[0].originY
}

export function countColumnClusters(columns) {
  let clusters = 0
  let previous = -Infinity
  for (const column of columns) {
    if (column > previous + 1) clusters += 1
    previous = column
  }
  return clusters
}

export async function countMaskedCharacters(imagePath, { left = 700, right = 850, top, bottom }) {
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) {
    throw new Error('마스킹 문자 검사 영역이 필요해요.')
  }
  const { default: sharp } = await import('sharp')
  const { data, info } = await sharp(imagePath).raw().toBuffer({ resolveWithObject: true })
  const activeColumns = []
  for (let x = left; x <= right; x += 1) {
    let darkPixels = 0
    for (let y = top; y <= bottom; y += 1) {
      const offset = (y * info.width + x) * info.channels
      if (data[offset] < 80 && data[offset + 1] < 80 && data[offset + 2] < 80) darkPixels += 1
    }
    if (darkPixels >= 2) activeColumns.push(x)
  }
  return countColumnClusters(activeColumns)
}

export async function findWooriGridOriginY(imagePath, { originX = GRID_ORIGIN.x, minY = 700, maxY = 900 } = {}) {
  const { default: sharp } = await import('sharp')
  const { data, info } = await sharp(imagePath).raw().toBuffer({ resolveWithObject: true })
  const candidates = []

  for (let originY = minY; originY <= maxY; originY += 1) {
    const counts = wooriDataSlots({ originX, originY }).map(slot => (
      cellCountsFromImage(data, info, slot.x, slot.y)
    ))
    candidates.push({
      originY,
      lockedCount: counts.filter(count => isLockedCell(count)).length,
      bluePixels: counts.reduce((total, count) => total + count.bluePixels, 0),
    })
  }

  return selectGridOrigin(candidates)
}

export async function analyzeWooriKeypadScreenshot(imagePath, mode, grid = {}) {
  const orderedCharacters = WOORI_ORDERED_CHARACTERS[mode]
  if (!orderedCharacters) throw new Error(`지원하지 않는 키패드 모드예요: ${mode}`)

  const { default: sharp } = await import('sharp')
  const { data, info } = await sharp(imagePath).raw().toBuffer({ resolveWithObject: true })
  if (info.width < 1002 || info.height < 890) {
    throw new Error(`키패드 캡처 크기가 예상보다 작아요: ${info.width}x${info.height}`)
  }

  const slots = wooriDataSlots(grid).map(slot => {
    const counts = cellCountsFromImage(data, info, slot.x, slot.y)
    return { ...slot, ...counts, locked: isLockedCell(counts) }
  })

  const keyMap = mapOrderedKeys(orderedCharacters, slots)
  return {
    mode,
    slotCount: slots.length,
    lockedCount: slots.filter(slot => slot.locked).length,
    unlockedCount: slots.filter(slot => !slot.locked).length,
    mappedKeyCount: Object.keys(keyMap).length,
    expectedUniqueKeyCount: new Set(orderedCharacters).size,
    slots,
    keyMap,
  }
}
