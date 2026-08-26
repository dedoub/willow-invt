#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import dotenv from 'dotenv'
import {
  financeIdentity,
  failureMessage,
  taxInvoiceFromCells,
} from './lib/tensw-local-finance.mjs'
import { HOMETAX_URL, hometaxLogin } from './lib/hometax-session.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true })
dotenv.config({ path: path.join(ROOT, '.env'), quiet: true })

const HOME = process.env.HOME || '/Users/dongwookkim'
const IDENTITY = financeIdentity()
const PROFILE_DIR = path.join(HOME, '.willow', 'browser-profiles', `${IDENTITY.company}-finance`)
const ARTIFACT_DIR = path.join(HOME, 'logs', `${IDENTITY.company}-local-finance`)
const PROBE_ONLY = process.argv.includes('--probe')
const COLLECT = process.argv.includes('--collect')
const TAX_INVOICE_URL = 'https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&tmIdx=46&tm2lIdx=4609050000&tm3lIdx=4609050300'

class SessionExpiredError extends Error {}

async function readCurrentMonthRows(page, transeType) {
  const rows = page.locator('#mf_txppWframe_resultGrid_body_table tr')
  const count = await rows.count()
  const invoices = []
  for (let index = 1; index < count; index += 1) {
    const cells = (await rows.nth(index).locator('td').allTextContents()).map(value => value.trim())
    if (cells.length >= 22 && /^\d{4}-\d{2}-\d{2}$/.test(cells[2])) {
      invoices.push(taxInvoiceFromCells(cells, transeType))
    }
  }
  return invoices
}

async function collectCurrentMonth(page, transeType) {
  await page.goto(TAX_INVOICE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  const expiredMessage = page.getByText('로그인 정보가 없습니다', { exact: false })
  if (await expiredMessage.isVisible({ timeout: 3_000 }).catch(() => false)) {
    throw new SessionExpiredError('홈택스 로그인 세션이 만료됐어요.')
  }
  await page.locator('#mf_txppWframe_trigger50').waitFor({ timeout: 30_000 })
  const radio = transeType === 'sales'
    ? '#mf_txppWframe_radio3_input_0'
    : '#mf_txppWframe_radio3_input_1'
  await page.locator(radio).evaluate(element => element.click())
  await page.locator('#mf_txppWframe_trigger50').click()
  await page.waitForTimeout(6_000)

  let invoices = await readCurrentMonthRows(page, transeType)
  if (invoices.length === 0) {
    // WebSquare occasionally paints an empty grid on the first request.
    await page.locator('#mf_txppWframe_trigger50').click()
    await page.waitForTimeout(6_000)
    invoices = await readCurrentMonthRows(page, transeType)
  }
  return invoices
}

async function collectTaxInvoices(page) {
  const sales = await collectCurrentMonth(page, 'sales')
  const purchases = await collectCurrentMonth(page, 'purchase')
  const result = {
    collected_at: new Date().toISOString(),
    period: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' })
      .format(new Date()),
    sales,
    purchases,
  }
  await fs.writeFile(path.join(ARTIFACT_DIR, 'latest-tax-invoices.json'), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 })
  console.log(`[local-finance] current-month tax invoices: sales=${sales.length}, purchase=${purchases.length}`)
}

async function collectTaxInvoicesWithRetry(page) {
  let lastError
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await collectTaxInvoices(page)
      return
    } catch (error) {
      lastError = error
      if (error instanceof SessionExpiredError) throw error
      if (attempt === 1) {
        console.log('[local-finance] tax invoice screen delayed; retrying once')
        await page.goto(HOMETAX_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => {})
        await page.waitForTimeout(3_000)
      }
    }
  }
  throw lastError
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
  let stage = 'open-hometax'

  try {
    stage = 'hometax-login'
    const outcome = await hometaxLogin(page, { log: message => console.log(`[local-finance] ${message}`) })

    if (outcome === 'reused' && !COLLECT) return
    if (PROBE_ONLY) {
      console.log('[local-finance] probe passed; password was not read or transmitted')
      return
    }

    if (COLLECT) {
      stage = 'collect-tax-invoices'
      await collectTaxInvoicesWithRetry(page)
    }
  } catch (error) {
    const timestamp = new Date().toISOString().replaceAll(':', '-')
    await page.screenshot({ path: path.join(ARTIFACT_DIR, `failure-${timestamp}.png`), fullPage: true }).catch(() => {})
    throw new Error(failureMessage(stage, error))
  } finally {
    await context.close()
  }
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
