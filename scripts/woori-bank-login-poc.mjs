#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright'
import sharp from 'sharp'
import { analyzeWooriKeypadScreenshot } from './lib/secure-keypad.mjs'
import { ensureWooriLoopbackPermission } from './lib/woori-browser-profile.mjs'

const HOME = process.env.HOME || '/Users/dongwookkim'
const PROFILE_DIR = path.join(HOME, '.willow', 'browser-profiles', 'tensw-finance-woori')
const ARTIFACT_DIR = path.join(HOME, 'logs', 'tensw-local-finance')
const WOORI_URL = 'https://nbi.wooribank.com/nbi/woori?withyou=BISVC0030'

async function clickIfVisible(locator, timeout = 3_000) {
  if (await locator.isVisible({ timeout }).catch(() => false)) {
    await locator.click()
    return true
  }
  return false
}

function validationSummary(result) {
  return {
    mode: result.mode,
    slots: result.slotCount,
    locks: result.lockedCount,
    keys: result.unlockedCount,
    valid: result.lockedCount === 4 && result.unlockedCount === 36,
  }
}

async function captureAndValidate(page, mode) {
  const imagePath = path.join(ARTIFACT_DIR, `woori-live-${mode}.png`)
  await page.screenshot({ path: imagePath })
  const result = await analyzeWooriKeypadScreenshot(imagePath, mode)
  const summary = validationSummary(result)
  if (!summary.valid) throw new Error(`${mode} 키패드 배열 검증에 실패했어요.`)
  console.log(`[woori] ${mode} layout validated: locks=${summary.locks}, keys=${summary.keys}`)
  return result
}

async function waitForAnySignModal(page, timeout = 50_000) {
  const deadline = Date.now() + timeout
  let stableFrames = 0
  while (Date.now() < deadline) {
    const screenshot = await page.screenshot()
    const { data, info } = await sharp(screenshot).raw().toBuffer({ resolveWithObject: true })
    const points = [[510, 120], [700, 100], [930, 650]]
    const modalVisible = points.every(([x, y]) => {
      const offset = (y * info.width + x) * info.channels
      return data[offset] > 235 && data[offset + 1] > 235 && data[offset + 2] > 235
    }) && (() => {
      const offset = (100 * info.width + 100) * info.channels
      return data[offset] < 150 && data[offset + 1] < 150 && data[offset + 2] < 150
    })()
    stableFrames = modalVisible ? stableFrames + 1 : 0
    if (stableFrames >= 3) return
    await page.waitForTimeout(750)
  }
  throw new Error('우리은행 인증서 창이 50초 안에 열리지 않았어요.')
}

async function run() {
  await fs.mkdir(PROFILE_DIR, { recursive: true })
  await fs.mkdir(ARTIFACT_DIR, { recursive: true })
  await ensureWooriLoopbackPermission(PROFILE_DIR)

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1440, height: 1000 },
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--disable-blink-features=AutomationControlled'],
  })
  const page = context.pages()[0] || await context.newPage()

  try {
    await page.goto(WOORI_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForTimeout(3_000)
    await clickIfVisible(page.getByText('아니요', { exact: true }))

    const login = page.getByText('인증서 로그인', { exact: true }).first()
    await login.waitFor({ state: 'visible', timeout: 30_000 })
    await login.click()
    await waitForAnySignModal(page)
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'woori-live-modal.png') })

    // AnySign renders this modal outside the ordinary page DOM, so fixed viewport
    // coordinates are used only to open it. Every password key is image-validated.
    await page.mouse.click(700, 454)
    await page.mouse.click(790, 643)
    await page.waitForTimeout(800)

    await captureAndValidate(page, 'base')
    await page.mouse.click(520, 869)
    await page.waitForTimeout(500)
    await captureAndValidate(page, 'shift')
    await page.mouse.click(520, 869)
    await page.mouse.click(478, 825)
    await page.waitForTimeout(500)
    await captureAndValidate(page, 'special')

    console.log('[woori] probe passed; password was not read or clicked')
  } finally {
    await context.close()
  }
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
