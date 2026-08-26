#!/usr/bin/env node
// Collects the 위택스 지방세 납부대상 ledger into the JSON shape
// scripts/import-finance-tax-obligations.mjs loads.
//
//   node scripts/collect-wetax.mjs
//
// 위택스 drops the session after about thirty idle minutes, so this logs in when
// it has to rather than assuming a session is open.

import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { certSite } from './lib/cert-sites.mjs'
import { financeIdentity } from './lib/tensw-local-finance.mjs'
import { isEmptyResultRow, wetaxObligationsPayload } from './lib/wetax.mjs'
import {
  chromeJavascript,
  chromeTabState,
  openChromeTab,
  positionChromeWindow,
  sleep,
} from './lib/desktop.mjs'

const execFileAsync = promisify(execFile)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const IDENTITY = financeIdentity()
const SITE = certSite('wetax')
const HOST = new URL(SITE.url).host
const ARTIFACT_DIR = path.join(os.homedir(), 'logs', `${IDENTITY.company}-local-finance`)
const OUTSTANDING_URL = 'https://www.wetax.go.kr/etq/etp/lot/E020111M01.do'

function log(message) {
  console.log(`[wetax-collect] ${message}`)
}

async function pageScript(javascript) {
  const output = await chromeJavascript(javascript, { host: HOST })
  if (output === 'missing') throw new Error('위택스 탭을 찾지 못했어요.')
  return output
}

async function isLoggedIn() {
  const result = await pageScript(`(() => document.body.innerText.includes('로그아웃') ? 'yes' : 'no')()`)
    .catch(() => 'no')
  return result === 'yes'
}

async function ensureLogin() {
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

  await execFileAsync('/opt/homebrew/bin/node', [path.join(ROOT, 'scripts', 'login-native-cert.mjs'), '--site', 'wetax'], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  })

  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    await sleep(3_000)
    if (await isLoggedIn()) {
      log('logged in')
      return
    }
  }
  throw new Error('위택스 로그인 상태를 확인하지 못했어요.')
}

// Every screen has its own address, so navigation needs no menu clicking.
async function openScreen(url) {
  await pageScript(`(() => { location.href = ${JSON.stringify(url)}; return 'navigating'; })()`)
  const deadline = Date.now() + 40_000
  while (Date.now() < deadline) {
    await sleep(2_000)
    const state = await chromeTabState(HOST)
    if (state.url.includes(new URL(url).pathname)) {
      await sleep(3_000)
      return
    }
  }
  throw new Error(`위택스 화면을 열지 못했어요: ${url}`)
}

async function readLedger() {
  const output = await pageScript(`(() => {
    const table = document.getElementById('tblList');
    if (!table) return 'no-table';
    const rows = [...table.querySelectorAll('tbody tr')]
      .map(row => [...row.querySelectorAll('td')].map(cell => cell.innerText.trim().replace(/\\s+/g, ' ')));
    return JSON.stringify(rows);
  })()`)
  if (output === 'no-table') throw new Error('위택스 납부대상 표를 찾지 못했어요.')
  return JSON.parse(output)
}

async function run() {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true })
  await ensureLogin()
  await openScreen(OUTSTANDING_URL)

  const rows = await readLedger()
  if (rows.length === 1 && isEmptyResultRow(rows[0])) {
    log('outstanding local tax: none')
  }

  const payload = wetaxObligationsPayload(rows, new Date().toISOString())
  const destination = path.join(ARTIFACT_DIR, 'latest-wetax-obligations.json')
  await fs.writeFile(destination, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 })

  const total = payload.obligations.reduce((sum, item) => sum + item.amount, 0)
  log(`obligations: ${payload.obligations.length}, total=${total.toLocaleString()}원`)
  log(`saved ${destination}`)
}

run().catch(error => {
  console.error(`[wetax-collect] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
