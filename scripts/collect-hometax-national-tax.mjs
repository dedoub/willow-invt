#!/usr/bin/env node
// Collects the 홈택스 납부할 세액 ledger into the JSON shape
// scripts/import-finance-tax-obligations.mjs loads.
//
//   node scripts/collect-hometax-national-tax.mjs
//
// HomeTax ties its session to the browser context and drops it when a screen is
// opened by URL, so this signs in and then walks there through the SPA menu.

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import dotenv from 'dotenv'
import { financeIdentity } from './lib/tensw-local-finance.mjs'
import { HOMETAX_URL, hometaxLogin } from './lib/hometax-session.mjs'
import { nationalTaxPayload } from './lib/hometax-national-tax.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true })

const IDENTITY = financeIdentity()
const PROFILE_DIR = path.join(os.homedir(), '.willow', 'browser-profiles', `${IDENTITY.company}-finance`)
const ARTIFACT_DIR = path.join(os.homedir(), 'logs', `${IDENTITY.company}-local-finance`)
// 납부·고지·환급 > 납부 > 납부할 세액 조회/납부
const MENU_ANCHOR_ID = 'menuAtag_4201010000'
const LEDGER_TABLE = '#mf_txppWframe_grd_grdList_body_table'

function log(message) {
  console.log(`[hometax-tax-collect] ${message}`)
}

// Opening the screen by URL logs the session out, so the SPA's own menu handler
// is what navigates.
async function openLedger(page) {
  // The menu tree is built lazily; opening 전체메뉴 is what puts the anchors in
  // the document on a reused session.
  // Reloading the signed-in home page is what renders the menu tree with working
  // handlers; on a reused session the tree is otherwise absent or inert.
  await page.goto(HOMETAX_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  await page.waitForFunction(
    id => Boolean(document.getElementById(id)),
    MENU_ANCHOR_ID,
    { timeout: 30_000 },
  )
  await page.waitForTimeout(2_500)

  // A real click goes through the menu's own handler chain; the bare
  // element.click() only works while the panel is freshly rendered.
  const anchor = page.locator(`#${MENU_ANCHOR_ID}`)
  const clicked = await anchor.click({ timeout: 15_000 }).then(() => true).catch(() => false)
  if (!clicked) {
    const fallback = await page.evaluate(id => {
      const element = document.getElementById(id)
      if (!element) return 'missing'
      element.click()
      return 'clicked'
    }, MENU_ANCHOR_ID)
    if (fallback !== 'clicked') throw new Error('홈택스 납부할 세액 메뉴를 찾지 못했어요.')
  }

  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    await page.waitForTimeout(3_000)
    const ready = await page.evaluate(selector => Boolean(document.querySelector(selector)), LEDGER_TABLE)
    if (ready) {
      await page.waitForTimeout(3_000)
      return
    }
  }
  const title = await page.title()
  throw new Error(`홈택스 납부할 세액 화면이 열리지 않았어요. 현재 화면: ${title}`)
}

async function readLedger(page) {
  return page.evaluate(selector => {
    const table = document.querySelector(selector)
    if (!table) return []
    return [...table.querySelectorAll('tbody tr')]
      .map(row => [...row.querySelectorAll('td')].map(cell => cell.innerText.trim().replace(/\s+/g, ' ')))
  }, LEDGER_TABLE)
}

async function run() {
  await fs.mkdir(PROFILE_DIR, { recursive: true })
  await fs.mkdir(ARTIFACT_DIR, { recursive: true })

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1440, height: 1000 },
  })
  const page = context.pages()[0] || await context.newPage()
  page.on('dialog', dialog => dialog.accept().catch(() => {}))

  try {
    await hometaxLogin(page, { log })
    await openLedger(page)

    const rows = await readLedger(page)
    const payload = nationalTaxPayload(rows, new Date().toISOString())
    const destination = path.join(ARTIFACT_DIR, 'latest-hometax-national-tax.json')
    await fs.writeFile(destination, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 })

    const total = payload.obligations.reduce((sum, item) => sum + item.amount, 0)
    log(`obligations: ${payload.obligations.length}, total=${total.toLocaleString()}원`)
    log(`saved ${destination}`)
  } finally {
    await context.close()
  }
}

run().catch(error => {
  console.error(`[hometax-tax-collect] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
