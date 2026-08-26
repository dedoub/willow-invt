#!/usr/bin/env node
// Collects the KB국민카드 기업 이용대금명세서 — the amount KB actually withdraws —
// alongside the approval-level data the other collector gathers.
//
//   FINANCE_COMPANY=willow node scripts/collect-kb-card-statement.mjs [--month 202608]
//
// The screen's 조회기간 select lists recent billing months. The current month is
// usually not billed yet and comes back empty, so without --month this walks
// back through the list until a month has figures.

import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { certSite } from './lib/cert-sites.mjs'
import { financeIdentity } from './lib/tensw-local-finance.mjs'
import { PAGE_TEXT_SCRIPT, SESSION_STATE, sessionState } from './lib/finance-session.mjs'
import { isEmptyStatementRow, kbCardStatement } from './lib/kb-card-statement.mjs'
import { chromeJavascript, chromeTabState, openChromeTab, positionChromeWindow, sleep } from './lib/desktop.mjs'

const execFileAsync = promisify(execFile)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const IDENTITY = financeIdentity()
const SITE = certSite('kb-card')
const HOST = new URL(SITE.url).host
const ARTIFACT_DIR = path.join(os.homedir(), 'logs', `${IDENTITY.company}-local-finance`)
// 조회 > 이용대금 > 명세서조회
const STATEMENT_PATH = '/CXERCMLS0004.cms'

function argumentValue(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const REQUESTED_MONTH = argumentValue('--month', null)

function log(message) {
  console.log(`[kb-statement] ${message}`)
}

async function pageScript(javascript) {
  const output = await chromeJavascript(javascript, { host: HOST })
  if (output === 'missing') throw new Error('KB카드 탭을 찾지 못했어요.')
  return output
}

async function isLoggedIn() {
  const text = await pageScript(PAGE_TEXT_SCRIPT).catch(() => '')
  return sessionState(text, IDENTITY.company) === SESSION_STATE.ours
}

async function ensureLogin() {
  const existing = await chromeTabState(HOST)
  if (!existing.url) {
    await openChromeTab(SITE.url, HOST)
    await sleep(8_000)
  }
  await positionChromeWindow(HOST)
  await sleep(2_000)
  if (await isLoggedIn()) {
    log('reused existing session')
    return
  }

  await execFileAsync('/opt/homebrew/bin/node', [path.join(ROOT, 'scripts', 'login-kb-card.mjs')], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    env: process.env,
  })
  if (!await isLoggedIn()) throw new Error('KB카드 로그인 상태를 확인하지 못했어요.')
  log('logged in')
}

// Opening the screen by address signs the session out, and the same screen code
// also appears in a czone tracking parameter, so the anchor is matched on path.
async function openStatement() {
  const clicked = await pageScript(`(() => {
    const wanted = ${JSON.stringify(STATEMENT_PATH)};
    const anchor = [...document.querySelectorAll('a')].find(item => {
      const href = item.getAttribute('href') || '';
      return href.split('?')[0].endsWith(wanted);
    });
    if (!anchor) return 'no-link';
    anchor.click();
    return 'clicked';
  })()`)
  if (clicked !== 'clicked') throw new Error('KB카드 명세서조회 메뉴를 찾지 못했어요.')

  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    await sleep(2_500)
    const state = await chromeTabState(HOST)
    if (state.url.split('?')[0].endsWith(STATEMENT_PATH)) {
      await sleep(3_000)
      return
    }
  }
  throw new Error('KB카드 명세서조회 화면이 열리지 않았어요.')
}

async function billingMonths() {
  const output = await pageScript(`(() => {
    const term = document.getElementById('term');
    if (!term) return '[]';
    return JSON.stringify([...term.options].map(option => option.value));
  })()`)
  const months = JSON.parse(output).filter(value => /^\d{6}$/.test(value))
  if (months.length === 0) throw new Error('KB카드 명세서 조회기간 목록을 읽지 못했어요.')
  return months
}

async function queryMonth(month) {
  const result = await pageScript(`(() => {
    const term = document.getElementById('term');
    if (!term) return 'no-term';
    term.value = ${JSON.stringify(month)};
    term.dispatchEvent(new Event('change', { bubbles: true }));
    const button = [...document.querySelectorAll('a,button')]
      .find(item => (item.getAttribute('onclick') || '').includes("getList('1')"));
    if (!button) return 'no-button';
    button.click();
    return 'queried';
  })()`)
  if (result !== 'queried') throw new Error(`KB카드 명세서 조회를 실행하지 못했어요: ${result}`)
  await sleep(9_000)
}

async function readStatementRows() {
  const output = await pageScript(`(() => {
    const visible = element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const table = [...document.querySelectorAll('table')].filter(visible)
      .filter(item => item.id !== 'searchTable')
      .find(item => [...item.querySelectorAll('th')]
        .some(header => header.innerText.replace(/\\s+/g, '').includes('결제금액')));
    if (!table) return 'no-table';
    const rows = [...table.querySelectorAll('tbody tr')]
      .map(row => [...row.querySelectorAll('td')]
        .map(cell => cell.innerText.trim().replace(/\\s+/g, ' ')));
    return JSON.stringify(rows);
  })()`)
  if (output === 'no-table') throw new Error('KB카드 명세서 표를 찾지 못했어요.')
  return JSON.parse(output)
}

async function run() {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true })
  await ensureLogin()
  await openStatement()

  const months = REQUESTED_MONTH ? [REQUESTED_MONTH] : await billingMonths()
  for (const month of months) {
    await queryMonth(month)
    const rows = await readStatementRows()
    if (rows.every(isEmptyStatementRow)) {
      log(`${month}: 아직 청구 전이에요.`)
      continue
    }

    const statement = kbCardStatement(rows, month, new Date().toISOString())
    const destination = path.join(ARTIFACT_DIR, 'latest-kb-card-statement.json')
    await fs.writeFile(destination, `${JSON.stringify(statement, null, 2)}\n`, { mode: 0o600 })

    log(`${month}: ${statement.total_amount.toLocaleString()}원, 결제일 ${statement.payment_due_date}`)
    log(`saved ${destination}`)
    return
  }
  throw new Error('KB카드 명세서에서 청구된 달을 찾지 못했어요.')
}

run().catch(error => {
  console.error(`[kb-statement] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
