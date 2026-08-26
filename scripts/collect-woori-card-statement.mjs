#!/usr/bin/env node
// Collects the 우리카드 이용대금명세서 summary — the amount the card company
// will actually withdraw — alongside the approval-level data the other
// collector already gathers.
//
//   node scripts/collect-woori-card-statement.mjs
//
// Runs against the default Chrome, where the card site's security module works.

import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { financeIdentity } from './lib/tensw-local-finance.mjs'
import { wooriCardStatement } from './lib/woori-card-statement.mjs'
import { chromeJavascript, chromeTabState, openChromeTab, positionChromeWindow, sleep } from './lib/desktop.mjs'

const execFileAsync = promisify(execFile)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const IDENTITY = financeIdentity()
const HOST = 'pc.wooricard.com'
const STATEMENT_URL = 'https://pc.wooricard.com/dcpc/yh2/bcv/bcv03/stmt/H2BCV203S01.do'
const ARTIFACT_DIR = path.join(os.homedir(), 'logs', `${IDENTITY.company}-local-finance`)

function log(message) {
  console.log(`[woori-card-statement] ${message}`)
}

async function pageScript(javascript) {
  const output = await chromeJavascript(javascript, { host: HOST })
  if (output === 'missing') throw new Error('우리카드 탭을 찾지 못했어요.')
  return output
}

async function isLoggedIn() {
  const state = await chromeTabState(HOST)
  return Boolean(state.title) && !state.title.includes('기업로그인')
}

async function ensureLogin() {
  const existing = await chromeTabState(HOST)
  if (!existing.url) {
    await openChromeTab(STATEMENT_URL, HOST)
    await sleep(8_000)
  }
  await positionChromeWindow(HOST)
  await sleep(2_000)
  if (await isLoggedIn()) {
    log('reused existing session')
    return
  }

  await execFileAsync('/opt/homebrew/bin/node', [path.join(ROOT, 'scripts', 'woori-card-certificate-login.mjs'), '--force-login'], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  })
  if (!await isLoggedIn()) throw new Error('우리카드 로그인 상태를 확인하지 못했어요.')
  log('logged in')
}

// Loading the screen fresh is what renders the query panel; a panel left in the
// error state from a previous query stays hidden.
async function openStatementScreen() {
  await pageScript(`(() => { location.href = ${JSON.stringify(STATEMENT_URL)}; return 'navigating'; })()`)
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    await sleep(3_000)
    const ready = await pageScript(`(() => {
      const button = document.getElementById('btnSearch');
      if (!button) return 'no';
      const rect = button.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 ? 'yes' : 'no';
    })()`).catch(() => 'no')
    if (ready === 'yes') return
  }
  throw new Error('우리카드 이용대금명세서 조회 화면이 열리지 않았어요.')
}

// Only the button is pressed: touching the radios fires their own search and the
// card site rejects the pair with "동일한 거래 요청이 동시에 인입되었습니다".
async function runQuery() {
  const result = await pageScript(`(() => {
    const button = document.getElementById('btnSearch');
    if (!button) return 'no-button';
    button.click();
    return 'queried';
  })()`)
  if (result !== 'queried') throw new Error('우리카드 명세서 조회 버튼을 찾지 못했어요.')
  await sleep(6_000)
}

// The site shows a "처리중입니다" modal while the query runs, so the summary is
// polled for rather than read once.
async function readStatement(timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const result = await readStatementOnce().catch(() => null)
    if (result) return result
    if (Date.now() > deadline) throw new Error('우리카드 명세서 요약표를 찾지 못했어요.')
    await sleep(3_000)
  }
}

async function readStatementOnce() {
  const output = await pageScript(`(() => {
    const shown = element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const table = [...document.querySelectorAll('table')].filter(shown)
      .find(candidate => [...candidate.querySelectorAll('th')]
        .some(header => header.innerText.trim() === '청구내역'));
    if (!table) return 'no-table';
    const rows = [...table.querySelectorAll('tr')]
      .map(row => [...row.querySelectorAll('th,td')].map(cell => cell.innerText.trim().replace(/\\s+/g, ' ')))
      .filter(cells => cells.length);
    return JSON.stringify({ rows, text: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 2000) });
  })()`)
  if (output === 'no-table') throw new Error('우리카드 명세서 요약표를 찾지 못했어요.')
  return JSON.parse(output)
}

async function run() {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true })
  await ensureLogin()
  await openStatementScreen()
  await runQuery()

  const { rows, text } = await readStatement()
  const statement = wooriCardStatement(rows, text, new Date().toISOString())

  const destination = path.join(ARTIFACT_DIR, 'latest-woori-card-statement.json')
  await fs.writeFile(destination, `${JSON.stringify(statement, null, 2)}\n`, { mode: 0o600 })

  log(`statement ${statement.statement_date} (${statement.period_start} ~ ${statement.period_end})`)
  log(`billed: ${statement.billed_amount.toLocaleString()}원, 결제일 ${statement.payment_date}`)
  log(`saved ${destination}`)
}

run().catch(error => {
  console.error(`[woori-card-statement] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
