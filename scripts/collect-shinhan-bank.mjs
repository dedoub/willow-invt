#!/usr/bin/env node
// Collects 신한은행 기업뱅킹 balances and recent transactions into the same JSON
// files scripts/import-tensw-local-bank.mjs already reads for 우리은행.
//
//   node scripts/collect-shinhan-bank.mjs [--days 14]
//
// The bank drops the session after about ten idle minutes, so this logs in and
// collects in one run rather than assuming a session is already open.

import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { certSite } from './lib/cert-sites.mjs'
import { financeIdentity } from './lib/tensw-local-finance.mjs'
import {
  collectionWindow,
  dottedDate,
  isoDate,
  shinhanAccountsPayload,
  shinhanTransactionsPayload,
} from './lib/shinhan-bank.mjs'
import {
  chromeJavascript,
  chromeTabState,
  clickPageElement,
  openChromeTab,
  positionChromeWindow,
  sleep,
} from './lib/desktop.mjs'

const execFileAsync = promisify(execFile)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const IDENTITY = financeIdentity()
const SITE = certSite('shinhan-bank')
const HOST = new URL(SITE.url).host
const ARTIFACT_DIR = path.join(os.homedir(), 'logs', `${IDENTITY.company}-local-finance`)

function argumentValue(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const DAYS = Number(argumentValue('--days', '14'))

function log(message) {
  console.log(`[shinhan-collect] ${message}`)
}

async function pageScript(javascript) {
  const output = await chromeJavascript(javascript, { host: HOST })
  if (output === 'missing') throw new Error('신한은행 탭을 찾지 못했어요.')
  return output
}

// 로그아웃 is a button input, so its label never appears in body text; the
// header widget itself is the reliable signal.
async function isLoggedIn() {
  const result = await pageScript(`(() => {
    const button = document.querySelector('[id$="userInfo_btn_logout"]');
    if (!button) return 'no';
    const rect = button.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? 'yes' : 'no';
  })()`).catch(() => 'no')
  return result === 'yes'
}

async function ensureLogin() {
  // Reloading the page would close the mega menu and reset the WebSquare tabs,
  // so an open tab is reused as it is.
  const existing = await chromeTabState(HOST)
  if (!existing.url) {
    await openChromeTab(SITE.url, HOST)
    await sleep(6_000)
  }
  await positionChromeWindow(HOST)
  await sleep(2_000)
  if (await isLoggedIn()) {
    log('reused existing session')
    return
  }
  await execFileAsync('/opt/homebrew/bin/node', [path.join(ROOT, 'scripts', 'login-native-cert.mjs'), '--site', 'shinhan-bank'], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  })
  // The certificate dialog closes before the bank finishes redirecting.
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    await sleep(3_000)
    if (await isLoggedIn()) {
      log('logged in')
      return
    }
  }
  throw new Error('신한은행 로그인 상태를 확인하지 못했어요.')
}

// The mega menu only reacts to real clicks. Its ids are stable, unlike the
// wq_uuid_* ids WebSquare hands out per session, so the geometry comes from the
// DOM and the click is delivered on screen.
const TOP_MENU = '#mf_header_gen_topGnb_0_grp_topItemLink'
const MENU_ITEMS = Object.freeze({
  // The anchor, not its list item: the item box is wider than the link, so its
  // centre can land beside the text and the click does nothing.
  '전체계좌 조회': '#mf_header_gen_topGnb_0_gen_menuBox_0_gen_section_0_gen_depth3_0_btn_dep3_text',
  계좌별거래내역: '#mf_header_gen_topGnb_0_gen_menuBox_1_gen_section_0_gen_depth3_0_btn_dep3_text',
})

async function menuEntryVisible(selector) {
  const script = "(() => {"
    + "const entry = document.querySelector(" + JSON.stringify(selector) + ");"
    + "if (!entry) return 'no';"
    + "const rect = entry.getBoundingClientRect();"
    + "return rect.width > 0 && rect.height > 0 ? 'yes' : 'no';"
    + "})()"
  const result = await pageScript(script).catch(() => 'no')
  return result === 'yes'
}

async function openMenu(item) {
  const selector = MENU_ITEMS[item]
  if (!selector) throw new Error(`등록되지 않은 메뉴예요: ${item}`)

  // The top item toggles the panel, so it is only clicked when the panel is
  // shut; clicking it again would close the menu the entry lives in. The entries
  // themselves only respond to a real click.
  const alreadyOpen = await menuEntryVisible(selector)
  log(`menu ${item}: ${alreadyOpen ? 'panel already open' : 'opening panel'}`)
  if (!alreadyOpen) {
    const opened = await pageScript(`(() => {
      const top = document.querySelector(${JSON.stringify(TOP_MENU)});
      // 'missing' is reserved: chromeJavascript uses it for "no matching tab".
      if (!top) return 'no-top';
      top.click();
      return 'clicked';
    })()`)
    if (opened !== 'clicked') throw new Error('신한은행 상단 메뉴를 열지 못했어요.')

    const deadline = Date.now() + 15_000
    while (Date.now() < deadline && !await menuEntryVisible(selector)) await sleep(1_000)
    if (!await menuEntryVisible(selector)) throw new Error(`신한은행 메뉴에 "${item}"이(가) 나타나지 않았어요.`)
    // The panel slides into place; measuring mid-animation aims the click at
    // where the entry was rather than where it lands.
    await sleep(2_000)
  }

  const point = await clickPageElement(selector, { host: HOST })
  log(`menu ${item}: clicked at ${point.x},${point.y}`)
  await sleep(9_000)
}

// WebSquare paints its grids well after the click that navigated to them.
async function readGrid(selector, timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const rows = await readGridOnce(selector).catch(() => null)
    if (rows && rows.length) return rows
    if (Date.now() > deadline) {
      if (rows) return rows
      throw new Error(`신한은행 표를 찾지 못했어요: ${selector}`)
    }
    await sleep(2_000)
  }
}

async function readGridOnce(selector) {
  const output = await pageScript(`(() => {
    const table = document.querySelector(${JSON.stringify(selector)});
    if (!table) return 'no-table';
    const rows = [...table.querySelectorAll('tbody tr')]
      .map(row => [...row.querySelectorAll('td')].map(cell => cell.innerText.trim().replace(/\\s+/g, ' ')));
    return JSON.stringify(rows);
  })()`)
  if (output === 'no-table') throw new Error(`신한은행 표를 찾지 못했어요: ${selector}`)
  return JSON.parse(output)
}

async function collectAccounts() {
  await openMenu('전체계좌 조회')
  const rows = await readGrid('[id$="_grd_gridlist1_body_table"]')
  const payload = shinhanAccountsPayload(rows, new Date().toISOString())
  log(`accounts: ${payload.accounts.length}`)
  return payload
}

async function queryTransactions(start, end) {
  const result = await pageScript(`(() => {
    const shown = element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const dates = [...document.querySelectorAll('input')].filter(shown)
      .filter(element => /^\\d{4}\\.\\d{2}\\.\\d{2}$/.test(element.value || ''));
    if (dates.length < 2) return 'dates';
    const set = (element, value) => {
      element.focus();
      element.value = value;
      for (const type of ['input', 'keyup', 'change', 'blur']) {
        element.dispatchEvent(new Event(type, { bubbles: true }));
      }
    };
    set(dates[0], ${JSON.stringify(dottedDate(start))});
    set(dates[1], ${JSON.stringify(dottedDate(end))});
    const search = document.querySelector('[id$="_body_btn_search"]');
    if (!search) return 'search';
    search.click();
    return 'queried';
  })()`)
  if (result !== 'queried') throw new Error(`신한은행 거래내역 조회 조건을 설정하지 못했어요: ${result}`)
  await sleep(9_000)
}

async function collectTransactions(accounts) {
  await openMenu('계좌별거래내역')
  const { start, end } = collectionWindow(new Date(), DAYS)
  await queryTransactions(start, end)

  const rows = await readGrid('[id$="_grd_gridList_body_table"]')
  // The screen queries the account already selected in its dropdown, which is
  // the only 입출금 account this company holds.
  const entries = [{ account: accounts[0].account, rows }]
  const payload = shinhanTransactionsPayload(entries, {
    collectedAt: new Date().toISOString(),
    startDate: isoDate(start),
    endDate: isoDate(end),
  })
  log(`transactions: ${payload.transactions.length} (${payload.start_date} ~ ${payload.end_date})`)
  return payload
}

async function writeArtifact(name, payload) {
  const destination = path.join(ARTIFACT_DIR, name)
  await fs.writeFile(destination, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 })
  return destination
}

async function run() {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true })
  await ensureLogin()

  const accounts = await collectAccounts()
  const transactions = await collectTransactions(accounts.accounts)

  log(`saved ${await writeArtifact('latest-shinhan-accounts.json', accounts)}`)
  log(`saved ${await writeArtifact('latest-shinhan-transactions.json', transactions)}`)
}

run().catch(error => {
  console.error(`[shinhan-collect] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
