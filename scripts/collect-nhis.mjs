#!/usr/bin/env node
// Collects the 4대보험 notice ledger from 사회보험통합징수포털 into the JSON shape
// scripts/import-finance-tax-obligations.mjs loads.
//
//   node scripts/collect-nhis.mjs [--year 2026]
//
// The portal keeps one screen per insurance behind the same form, so each of the
// four is queried in turn.

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { financeIdentity } from './lib/tensw-local-finance.mjs'
import { NHIS_INSURANCES, nhisObligations, nhisObligationsPayload } from './lib/nhis.mjs'
import { ensureNhisLogin, nhisPageScript } from './lib/nhis-session.mjs'
import { chromeTabState, sleep } from './lib/desktop.mjs'

const IDENTITY = financeIdentity()
const HOST = 'si4n.nhis.or.kr'
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

async function openLedger() {
  await nhisPageScript(`(() => { location.href = ${JSON.stringify(LEDGER_URL)}; return 'navigating'; })()`)
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
  const result = await nhisPageScript(`(() => {
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
  const output = await nhisPageScript(`(() => {
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
  await ensureNhisLogin({ company: IDENTITY.company, log })
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
