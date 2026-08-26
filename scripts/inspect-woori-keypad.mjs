#!/usr/bin/env node

import { analyzeWooriKeypadScreenshot } from './lib/secure-keypad.mjs'

const [imagePath, mode] = process.argv.slice(2)
if (!imagePath || !mode) {
  console.error('Usage: node scripts/inspect-woori-keypad.mjs <image> <base|shift|special>')
  process.exit(1)
}

try {
  const result = await analyzeWooriKeypadScreenshot(imagePath, mode)
  console.log(JSON.stringify({
    mode: result.mode,
    slotCount: result.slotCount,
    lockedCount: result.lockedCount,
    unlockedCount: result.unlockedCount,
    mappedKeyCount: result.mappedKeyCount,
    validated: result.lockedCount === 4
      && result.unlockedCount === 36
      && result.mappedKeyCount === result.expectedUniqueKeyCount,
  }))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
