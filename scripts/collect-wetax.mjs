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
import { LOGOUT_SCRIPT, PAGE_TEXT_SCRIPT, SESSION_STATE, sessionState } from './lib/finance-session.mjs'
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

// 위택스 메인은 안내 배너를 레이어로 띄운다. 두 장이 겹쳐 뜨는 날도 있고, 그
// 위에서는 아래 화면을 누를 수도 본문을 제대로 읽을 수도 없다. "오늘 하루
// 그만보기"까지 체크하고 닫아 하루치 실행 내내 다시 뜨지 않게 한다.
const DISMISS_POPUPS_SCRIPT = `(() => {
  const visible = element => {
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  };
  let closed = 0;
  for (const foot of document.querySelectorAll('.popup-foot')) {
    const button = foot.querySelector('button.close-btn, .close-btn');
    if (!button || !visible(button)) continue;
    const today = foot.querySelector('input[type=checkbox]');
    if (today && !today.checked) today.click();
    button.click();
    closed += 1;
  }
  for (const button of document.querySelectorAll('.btn-close-modal, .btn-close-checking')) {
    if (!visible(button)) continue;
    button.click();
    closed += 1;
  }
  return String(closed);
})()`

async function dismissPopups() {
  const closed = Number(await pageScript(DISMISS_POPUPS_SCRIPT).catch(() => '0'))
  if (closed > 0) {
    log(`안내 팝업 ${closed}개를 닫았어요.`)
    await sleep(1_000)
  }
  return closed
}

/** 누군가 로그인은 되어 있는지. 주인이 누구인지와는 별개다. */
async function someoneSignedIn() {
  const text = await pageScript(PAGE_TEXT_SCRIPT).catch(() => '')
  return /로그아웃/.test(text)
}

// 위택스 메인에는 로그인한 사업자 이름이 어디에도 찍히지 않는다. 그래서 메인만
// 보고는 "누구로 로그인했는지"를 알 수 없고, 살아 있는 세션 위에서도 로그아웃으로
// 판정해 인증서 창을 다시 열려다 멈췄다. 납부대상 화면은 이름을 찍으므로 세션
// 주인은 거기서 읽는다 — 다른 회사 세션으로 남의 지방세를 긁는 일은 그대로 막힌다.
// 주인을 못 읽은 채 멈추면 화면에 무엇이 떠 있었는지가 유일한 단서다. 마지막으로
// 읽은 주소와 본문을 들고 있다가 실패할 때 함께 남긴다.
let lastLedger = { url: '', text: '' }

async function sessionStateOnLedger() {
  await pageScript(`(() => { location.href = ${JSON.stringify(OUTSTANDING_URL)}; return 'navigating'; })()`)
    .catch(() => {})
  await sleep(6_000)
  await dismissPopups()
  const text = await pageScript(PAGE_TEXT_SCRIPT).catch(() => '')
  lastLedger = { url: (await chromeTabState(HOST)).url, text: String(text) }
  return sessionState(text, IDENTITY.company)
}

async function ledgerEvidence() {
  const file = path.join(ARTIFACT_DIR, `wetax-owner-unknown-${Date.now()}.png`)
  await execFileAsync('/usr/sbin/screencapture', ['-x', file]).catch(() => {})
  await fs.chmod(file, 0o600).catch(() => {})
  return [
    `주소=${lastLedger.url || '(없음)'}`,
    `본문=${lastLedger.text.slice(0, 300) || '(없음)'}`,
    `증거=${file}`,
  ].join(', ')
}

async function ensureLogin() {
  const existing = await chromeTabState(HOST)
  if (!existing.url) {
    await openChromeTab(SITE.url, HOST)
    await sleep(6_000)
  }
  await positionChromeWindow(HOST)
  await sleep(2_000)
  await dismissPopups()

  const state = await sessionStateOnLedger()
  if (state === SESSION_STATE.ours) {
    log('reused existing session')
    return
  }
  if (state === SESSION_STATE.other) {
    log('다른 회사 세션이 열려 있어 로그아웃해요.')
    await pageScript(LOGOUT_SCRIPT).catch(() => {})
    await sleep(6_000)
    await openChromeTab(SITE.url, HOST)
    await sleep(6_000)
  }

  await execFileAsync('/opt/homebrew/bin/node', [path.join(ROOT, 'scripts', 'login-native-cert.mjs'), '--site', 'wetax'], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  })

  // 먼저 로그인 자체가 끝나기를 기다린다. 주인 확인은 화면을 옮겨야 하므로,
  // 3초마다 옮기지 않고 로그인이 끝난 뒤 한 번만 옮긴다.
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    await sleep(3_000)
    await dismissPopups()
    if (!await someoneSignedIn()) continue

    const owner = await sessionStateOnLedger()
    if (owner === SESSION_STATE.other) {
      throw new Error('위택스에 다른 회사로 로그인됐어요. 이 회사 자료를 긁지 않아요.')
    }
    if (owner === SESSION_STATE.ours) {
      log('logged in')
      return
    }
    // 납부대상 화면이 상호를 한 글자도 찍지 않는 날이 있다 — 텐소프트웍스는
    // 본문에도 HTML 에도 없어서 45초를 채우고 실패했다. 방금 이 회사 인증서로
    // 로그인한 뒤라 주인은 우리이고, 남의 이름이 찍혔다면 위에서 이미 멈춘다.
    // 그래서 여기서는 로그인된 납부대상 화면인지만 확인하고 넘어간다.
    if (/로그아웃/.test(lastLedger.text)) {
      log('logged in (화면에 상호 표기가 없어 인증서 로그인 결과로 확인했어요)')
      return
    }
  }
  throw new Error(`위택스 로그인 상태를 확인하지 못했어요. ${await ledgerEvidence()}`)
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
      await dismissPopups()
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
