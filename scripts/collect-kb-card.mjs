#!/usr/bin/env node
// Collects the KB국민카드 기업 승인내역 into the JSON
// scripts/import-local-card.mjs loads.
//
//   FINANCE_COMPANY=willow node scripts/collect-kb-card.mjs [--days 30]
//
// KB drops the session when a screen is opened by address, the same way 홈택스
// does, so the menu anchor is clicked instead. The session also expires after
// about ten idle minutes, so this signs in and collects in one run.

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
import { kbApprovalFromCells, pairApprovalRows, summarizeKbCardApprovals } from './lib/kb-card-local.mjs'
import { chromeJavascript, chromeTabState, openChromeTab, positionChromeWindow, sleep } from './lib/desktop.mjs'

const execFileAsync = promisify(execFile)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const IDENTITY = financeIdentity()
const SITE = certSite('kb-card')
const HOST = new URL(SITE.url).host
const ARTIFACT_DIR = path.join(os.homedir(), 'logs', `${IDENTITY.company}-local-finance`)
// 조회 > 이용내역 > 승인내역
const APPROVALS_PATH = '/CXERCMLSD0001.cms'
const APPROVALS_TABLE = '#dtailTable'

function argumentValue(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const DAYS = Number(argumentValue('--days', '30'))

function log(message) {
  console.log(`[kb-card-collect] ${message}`)
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

// Opening the screen by address signs the session out, so the menu anchor's own
// handler is what navigates.
async function openApprovals() {
  // The same screen code also appears in a czone tracking parameter on links
  // back to the home page, so the anchor is matched on its path.
  const clicked = await pageScript(`(() => {
    const wanted = ${JSON.stringify(APPROVALS_PATH)};
    const anchor = [...document.querySelectorAll('a')].find(item => {
      const href = item.getAttribute('href') || '';
      return href.split('?')[0].endsWith(wanted);
    });
    if (!anchor) return 'no-link';
    anchor.click();
    return 'clicked';
  })()`)
  if (clicked !== 'clicked') throw new Error('KB카드 승인내역 메뉴를 찾지 못했어요.')

  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    await sleep(2_500)
    const state = await chromeTabState(HOST)
    if (state.url.split('?')[0].endsWith(APPROVALS_PATH)) {
      await sleep(3_000)
      return
    }
  }
  throw new Error('KB카드 승인내역 화면이 열리지 않았어요.')
}

function yyyymmdd(date) {
  const pad = value => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
}

export function collectionWindow(now, days) {
  const end = new Date(now)
  const start = new Date(now.getTime() - (days - 1) * 86_400_000)
  return { start, end }
}

// 한 번에 100건까지만 돌려주므로 기간을 잘라 묻는다.
const CHUNK_DAYS = 10

export function dateChunks(start, end, days) {
  const chunks = []
  let cursor = new Date(start)
  while (cursor <= end) {
    const chunkEnd = new Date(Math.min(cursor.getTime() + (days - 1) * 86_400_000, end.getTime()))
    chunks.push({ start: new Date(cursor), end: chunkEnd })
    cursor = new Date(chunkEnd.getTime() + 86_400_000)
  }
  return chunks
}

// The date boxes carry Korean ids, and a Korean string literal does not survive
// the trip through AppleScript, so they are found by the YYYYMMDD already in
// them. 조회 runs the page's own getList('1').
async function runQuery(start, end) {
  const result = await pageScript(`(() => {
    const visible = element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const dates = [...document.querySelectorAll('input')].filter(visible)
      .filter(element => /^\\d{8}$/.test(element.value || ''));
    if (dates.length < 2) return 'no-start';

    const set = (element, value) => {
      element.value = value;
      for (const type of ['input', 'change', 'blur']) {
        element.dispatchEvent(new Event(type, { bubbles: true }));
      }
    };
    set(dates[0], ${JSON.stringify(yyyymmdd(start))});
    set(dates[1], ${JSON.stringify(yyyymmdd(end))});

    const all = document.getElementById('searchAll');
    if (all) {
      all.checked = true;
      all.dispatchEvent(new Event('click', { bubbles: true }));
    }

    const button = [...document.querySelectorAll('a,button')]
      .find(item => (item.getAttribute('onclick') || '').includes("getList('1')"));
    if (!button) return 'no-button';
    button.click();
    return 'queried';
  })()`)
  if (result !== 'queried') throw new Error(`KB카드 승인내역 조회를 실행하지 못했어요: ${result}`)
  await sleep(10_000)
}

async function readApprovals(timeoutMs = 40_000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const output = await pageScript(`(() => {
      const table = document.querySelector(${JSON.stringify(APPROVALS_TABLE)});
      if (!table) return 'no-table';
      const rows = [...table.querySelectorAll('tbody tr')]
        .map(row => [...row.querySelectorAll('td')]
          .map(cell => cell.innerText.trim().replace(/\\s+/g, ' ')));
      return JSON.stringify(rows);
    })()`).catch(() => 'no-table')
    if (output !== 'no-table') return JSON.parse(output)
    if (Date.now() > deadline) throw new Error('KB카드 승인내역 표를 찾지 못했어요.')
    await sleep(3_000)
  }
}

// KB pages the grid ten approvals at a time. Its pager runs getListTab1(n) and
// only shows ten page links at once, so crossing into the next block needs the
// 다음 목록 arrow first. The last page number comes from the 마지막 arrow, so the
// walk knows where it ends instead of guessing.
async function lastPageNumber(timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  let best = 1
  for (;;) {
    // 마지막 화살표가 없는 경우도 있어, 페이저에 걸린 모든 getListTab1(n) 중
    // 가장 큰 값을 함께 본다.
    const output = await pageScript(`(() => {
      const numbers = [...document.querySelectorAll('a')]
        .map(item => (item.getAttribute('onclick') || '').match(/getListTab1\\('(\\d+)'\\)/))
        .filter(Boolean)
        .map(match => Number(match[1]));
      return String(numbers.length ? Math.max(...numbers) : 1);
    })()`).catch(() => '1')
    best = Math.max(best, Number(output) || 1)
    if (best > 1 || Date.now() > deadline) return best
    await sleep(2_000)
  }
}

// 현재 쪽은 페이저에서 링크가 아닌 항목(recentList)으로 표시된다.
async function currentPage() {
  const output = await pageScript(`(() => {
    const marker = document.querySelector('.recentList');
    if (!marker) return '0';
    const text = (marker.innerText || '').trim();
    return /^\\d+$/.test(text) ? text : '0';
  })()`).catch(() => '0')
  return Number(output) || 0
}

async function goToPage(page) {
  const jump = `(() => {
    const wanted = "getListTab1('" + ${JSON.stringify(String(page))} + "')";
    const anchor = [...document.querySelectorAll('a')]
      .find(item => (item.getAttribute('onclick') || '').includes(wanted));
    if (!anchor) return 'no-page';
    anchor.click();
    return 'moved';
  })()`

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const moved = await pageScript(jump).catch(() => 'no-page')
    if (moved === 'no-page') {
      // 블록 밖의 쪽이면 다음 목록으로 넘어간 뒤 다시 찾는다.
      const advanced = await pageScript(`(() => {
        const next = document.querySelector('a.page.next');
        if (!next) return 'no-next';
        next.click();
        return 'next';
      })()`).catch(() => 'no-next')
      if (advanced !== 'next') return false
      await sleep(7_000)
      continue
    }

    // 클릭이 먹었는지 표시로 확인한다 — 안 먹으면 같은 쪽을 다시 읽게 된다.
    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
      await sleep(2_000)
      if (await currentPage() === page) return true
    }
  }
  return false
}

// 페이저는 한 블록(10쪽)만 보여주므로 마지막 쪽 번호를 미리 알 수 없다. 이동이
// 더 안 될 때까지 진행하고, 안전장치로 상한만 둔다.
const MAX_PAGES = 80

async function readAllPages(collected, seen) {
  const lastPage = await lastPageNumber()
  log(`pages: 최소 ${lastPage}`)

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    if (page > 1 && !await goToPage(page)) {
      log(`page ${page}: 이동하지 못해 여기서 멈춰요.`)
      break
    }

    const pairs = pairApprovalRows(await readApprovals())
      .filter(pair => kbApprovalFromCells(pair.row, pair.detail) !== null)
    let added = 0
    for (const pair of pairs) {
      const mapped = kbApprovalFromCells(pair.row, pair.detail)
      if (seen.has(mapped.fingerprint)) continue
      seen.add(mapped.fingerprint)
      collected.push(pair)
      added += 1
    }
    log(`page ${page}: ${pairs.length}건 (신규 ${added}건)`)
  }
}

async function run() {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true })
  await ensureLogin()
  await openApprovals()

  // KB returns at most ten pages of ten per query, so a long window is asked for
  // in chunks rather than silently losing its earliest days.
  const { start, end } = collectionWindow(new Date(), DAYS)
  const rows = []
  const seen = new Set()
  for (const chunk of dateChunks(start, end, CHUNK_DAYS)) {
    log(`조회 ${yyyymmdd(chunk.start)} ~ ${yyyymmdd(chunk.end)}`)
    await runQuery(chunk.start, chunk.end)
    await readAllPages(rows, seen)
  }
  const summary = summarizeKbCardApprovals(rows)

  const payload = {
    collected_at: new Date().toISOString(),
    start_date: yyyymmdd(start),
    end_date: yyyymmdd(end),
    ...summary,
    rows,
  }
  const destination = path.join(ARTIFACT_DIR, 'latest-kb-card-approvals.json')
  await fs.writeFile(destination, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 })

  log(`approvals: ${summary.raw_count}건 (유효 ${summary.effective_count}건, 순액 ${summary.net_krw_amount.toLocaleString()}원)`)
  log(`saved ${destination}`)
}

run().catch(error => {
  console.error(`[kb-card-collect] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
