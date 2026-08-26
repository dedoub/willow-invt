#!/usr/bin/env node
// Collects the 4대보험 notice ledger from 사회보험통합징수포털 into the JSON shape
// scripts/import-finance-tax-obligations.mjs loads.
//
//   node scripts/collect-nhis.mjs [--year 2026]
//
// The portal keeps one screen per insurance behind the same form, so each of the
// four is queried in turn.

import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { certSite } from './lib/cert-sites.mjs'
import { financeIdentity } from './lib/tensw-local-finance.mjs'
import { NHIS_INSURANCES, nhisObligations, nhisObligationsPayload } from './lib/nhis.mjs'
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
const SITE = certSite('nhis')
const HOST = new URL(SITE.url).host
const ARTIFACT_DIR = path.join(os.homedir(), 'logs', `${IDENTITY.company}-local-finance`)
const LEDGER_URL = 'https://si4n.nhis.or.kr/jpbc/JpBca00101.do'

function argumentValue(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const YEAR = argumentValue('--year', String(new Date().getFullYear()))

function log(message) {
  console.log(`[nhis-collect] ${message}`)
}

async function pageScript(javascript) {
  const output = await chromeJavascript(javascript, { host: HOST })
  if (output === 'missing') throw new Error('사회보험 포털 탭을 찾지 못했어요.')
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

  await execFileAsync('/opt/homebrew/bin/node', [path.join(ROOT, 'scripts', 'login-nhis-si4n.mjs')], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  })

  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    await sleep(3_000)
    if (await isLoggedIn()) {
      log('logged in')
      return
    }
  }
  throw new Error('사회보험 로그인 상태를 확인하지 못했어요.')
}

async function openLedger() {
  await pageScript(`(() => { location.href = ${JSON.stringify(LEDGER_URL)}; return 'navigating'; })()`)
  const deadline = Date.now() + 40_000
  while (Date.now() < deadline) {
    await sleep(2_000)
    const state = await chromeTabState(HOST)
    if (state.url.includes('JpBca00101')) {
      await sleep(3_000)
      return
    }
  }
  throw new Error('사회보험 고지내역 화면을 열지 못했어요.')
}

// 조회 is an anchor carrying an inline onclick, so a DOM click runs the page's
// own handler.
async function queryInsurance(insurance) {
  const result = await pageScript(`(() => {
    const radio = document.getElementById(${JSON.stringify(insurance.id)});
    if (!radio) return 'no-radio';
    radio.checked = true;
    radio.dispatchEvent(new Event('click', { bubbles: true }));
    radio.dispatchEvent(new Event('change', { bubbles: true }));

    const set = (id, value) => {
      const element = document.getElementById(id);
      if (!element) return false;
      element.value = value;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };
    set('schYyyy', ${JSON.stringify(YEAR)});
    set('schMmFrom', '1');
    set('schMmTo', '12');

    const search = [...document.querySelectorAll('a')]
      .find(anchor => (anchor.getAttribute('onclick') || '').includes('fn_search'));
    if (!search) return 'no-search';
    search.click();
    return 'queried';
  })()`)
  if (result !== 'queried') throw new Error(`사회보험 ${insurance.label} 조회를 실행하지 못했어요: ${result}`)
  await sleep(8_000)
}

async function readLedgerRows() {
  const output = await pageScript(`(() => {
    const shown = element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const table = [...document.querySelectorAll('table')].filter(shown)
      .find(candidate => candidate.querySelectorAll('tbody tr').length > 5);
    if (!table) return 'no-table';
    const rows = [...table.querySelectorAll('tbody tr')]
      .map(row => [...row.querySelectorAll('td,th')].map(cell => cell.innerText.trim().replace(/\\s+/g, ' ')));
    return JSON.stringify(rows);
  })()`)
  if (output === 'no-table') return []
  return JSON.parse(output)
}

async function run() {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true })
  await ensureLogin()
  await openLedger()

  const groups = []
  for (const insurance of NHIS_INSURANCES) {
    await queryInsurance(insurance)
    const rows = await readLedgerRows()
    const obligations = nhisObligations(rows, { year: YEAR, insurance })
    log(`${insurance.label}: ${obligations.length}건`)
    groups.push(obligations)
  }

  const payload = nhisObligationsPayload(groups, new Date().toISOString())
  const destination = path.join(ARTIFACT_DIR, 'latest-nhis-obligations.json')
  await fs.writeFile(destination, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 })

  const unpaid = payload.obligations.filter(item => item.status === 'unpaid')
  const unpaidTotal = unpaid.reduce((sum, item) => sum + item.amount, 0)
  log(`obligations: ${payload.obligations.length} (미납 ${unpaid.length}건 ${unpaidTotal.toLocaleString()}원)`)
  log(`saved ${destination}`)
}

run().catch(error => {
  console.error(`[nhis-collect] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
