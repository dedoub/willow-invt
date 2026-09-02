#!/usr/bin/env node
// Collects 홈택스 전자세금계산서 매출·매입 for the company named by
// FINANCE_COMPANY, into the JSON scripts/import-local-tax-invoices.mjs reads.
//
//   FINANCE_COMPANY=willow node scripts/collect-hometax-tax-invoices.mjs --collect
//   FINANCE_COMPANY=willow node scripts/collect-hometax-tax-invoices.mjs --collect --from 2026-01 --to 2026-08
//
// --probe signs in and reports what it sees without writing an artifact.

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
  taxInvoiceMonths,
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

const GRID_ROWS = '#mf_txppWframe_resultGrid_body_table tr'
const QUERY_BUTTON = '#mf_txppWframe_trigger50'
const YEAR_SELECT = '#mf_txppWframe_selectboxYear'
const MONTH_SELECT = '#mf_txppWframe_selectboxMonth'
const PAGE_SIZE_SELECT = '#mf_txppWframe_selectbox90'
const NEXT_PAGE_BUTTON = '#mf_txppWframe_pglNavi_nextPage_btn'
const PAGE_SIZE = '50'
const MAX_PAGES = 40

// --from YYYY-MM --to YYYY-MM widens the daily current-month run into a backfill.
function argument(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : null
}

function currentMonth() {
  const [year, month] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' })
    .format(new Date()).split('-')
  return { year, month }
}

function requestedMonths() {
  const from = argument('from')
  const to = argument('to')
  if (!from && !to) return [currentMonth()]
  const now = currentMonth()
  return taxInvoiceMonths(from ?? `${now.year}-${now.month}`, to ?? `${now.year}-${now.month}`)
}

async function readGridRows(page, transeType) {
  const rows = page.locator(GRID_ROWS)
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

// "총 N 건" above the grid. The grid itself only paints one page.
async function readTotalCount(page) {
  const text = await page.locator('#mf_txppWframe').innerText()
  const match = /총\s*([\d,]+)\s*건/.exec(text)
  return match ? Number(match[1].replaceAll(',', '')) : null
}

async function runQuery(page) {
  await page.locator(QUERY_BUTTON).click()
  await page.waitForTimeout(6_000)
}

// One month of one direction. The screen answers a single 월별 window, so the
// year and month are set explicitly rather than trusting the default (today).
async function collectMonth(page, transeType, { year, month }) {
  await page.goto(TAX_INVOICE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  const expiredMessage = page.getByText('로그인 정보가 없습니다', { exact: false })
  if (await expiredMessage.isVisible({ timeout: 3_000 }).catch(() => false)) {
    throw new SessionExpiredError('홈택스 로그인 세션이 만료됐어요.')
  }
  await page.locator(QUERY_BUTTON).waitFor({ timeout: 30_000 })
  const radio = transeType === 'sales'
    ? '#mf_txppWframe_radio3_input_0'
    : '#mf_txppWframe_radio3_input_1'
  await page.locator(radio).evaluate(element => element.click())
  await page.locator('#mf_txppWframe_radio4_input_0').evaluate(element => element.click())
  await page.selectOption(YEAR_SELECT, year)
  await page.selectOption(MONTH_SELECT, `${month}월`)
  await page.selectOption(PAGE_SIZE_SELECT, PAGE_SIZE).catch(() => {})
  await runQuery(page)

  let invoices = await readGridRows(page, transeType)
  let total = await readTotalCount(page)
  if (invoices.length === 0 && total !== 0) {
    // WebSquare occasionally paints an empty grid on the first request.
    await runQuery(page)
    invoices = await readGridRows(page, transeType)
    total = await readTotalCount(page)
  }

  for (let pageNo = 2; total !== null && invoices.length < total && pageNo <= MAX_PAGES; pageNo += 1) {
    await page.locator(NEXT_PAGE_BUTTON).click()
    await page.waitForTimeout(4_000)
    const more = await readGridRows(page, transeType)
    if (more.length === 0) break
    invoices.push(...more)
  }
  if (total !== null && invoices.length !== total) {
    throw new Error(`홈택스 ${year}-${month} ${transeType} 목록이 ${total}건인데 ${invoices.length}건만 읽었어요.`)
  }
  console.log(`[local-finance] ${year}-${month} ${transeType}: ${invoices.length}`)
  return invoices
}

async function collectTaxInvoices(page) {
  const months = requestedMonths()
  const sales = []
  const purchases = []
  for (const month of months) {
    sales.push(...await collectMonth(page, 'sales', month))
    purchases.push(...await collectMonth(page, 'purchase', month))
  }
  const first = months[0]
  const last = months[months.length - 1]
  const result = {
    collected_at: new Date().toISOString(),
    period: months.length === 1
      ? `${first.year}-${first.month}`
      : `${first.year}-${first.month}..${last.year}-${last.month}`,
    sales,
    purchases,
  }
  await fs.writeFile(path.join(ARTIFACT_DIR, 'latest-tax-invoices.json'), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 })
  console.log(`[local-finance] tax invoices ${result.period}: sales=${sales.length}, purchase=${purchases.length}`)
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
