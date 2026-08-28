#!/usr/bin/env node
// Collects 우리은행 balances and transactions into the JSON shape
// scripts/import-local-bank.mjs loads.
//
//   node scripts/collect-woori-bank.mjs
//
// 우리은행은 텐소프트웍스 계좌만 있다. 윌로우는 신한만 쓰므로 다른 회사로 부르면
// 바로 멈춘다 — 남의 계좌를 남의 원장에 넣는 사고가 2026-08-26 에 한 번 있었다.
//
// 인증서 비밀번호는 화면 보안키패드로만 받는다. 키패드는 열릴 때마다 자판을 섞고
// 화면에만 그려지므로, 스크린샷을 읽어 자리를 찾고 마우스로 누른다. 좌표가 창
// 위치에 묶여 있어 전용 창을 1440x1080 으로 새로 띄우고 끝나면 닫는다.

import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { appleScriptLiteral } from './lib/desktop.mjs'
import {
  analyzeWooriKeypadScreenshot,
  countMaskedCharacters,
  findWooriGridOriginY,
} from './lib/secure-keypad.mjs'
import { dismissBlockingAlerts } from './lib/cert-cleanup.mjs'
import {
  financeIdentity,
  parseWooriAccountCardText,
  parseWooriTransactionBodyText,
  readCertificatePassword,
} from './lib/tensw-local-finance.mjs'

const execFileAsync = promisify(execFile)
const IDENTITY = financeIdentity()
const ARTIFACT_DIR = path.join(os.homedir(), 'logs', `${IDENTITY.company}-local-finance`)
const SCREENSHOT_PATH = path.join(ARTIFACT_DIR, 'woori-bank-screen.png')
const RAW_SCREENSHOT_PATH = path.join(ARTIFACT_DIR, 'woori-bank-screen@2x.png')
const ACCOUNTS_PATH = path.join(ARTIFACT_DIR, 'latest-woori-accounts.json')
const TRANSACTIONS_PATH = path.join(ARTIFACT_DIR, 'latest-woori-transactions.json')
const WOORI_URL = 'https://nbi.wooribank.com/nbi/woori?withyou=BISVC0030'
const CLICLICK = '/opt/homebrew/bin/cliclick'
const LOOKBACK_DAYS = 13

// 계좌 구성이 곧 세션 주인이다. 다른 인증서로 로그인하면 여기서 걸린다.
const EXPECTED_ACCOUNTS = new Set([
  '1005403461450', '1005903636048', '1005603639403', '1005704524272',
  '1005204474909', '1005403914716', '1005803628060', '1005604650468',
])

function log(message) {
  console.log(`[woori-bank-collect] ${message}`)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function appleScript(script) {
  const { stdout } = await execFileAsync('/usr/bin/osascript', ['-e', script], { encoding: 'utf8' })
  return stdout.trim()
}

async function pageScript(windowId, javascript) {
  return appleScript(`tell application "Google Chrome"
    tell active tab of window id ${windowId}
      return execute javascript ${appleScriptLiteral(javascript)}
    end tell
  end tell`)
}

// 보안키패드는 포인터가 새 자리로 건너뛴 직후의 클릭을 삼킨다. 움직임과 클릭을
// 한 번의 cliclick 실행 안에 넣어야 눌린다 — 두 번으로 나누면 흘린다.
async function click(x, y) {
  await execFileAsync(CLICLICK, ['-e', '30', `m:${x},${y}`, 'w:120', `c:${x},${y}`])
}

async function captureScreen() {
  await execFileAsync('/usr/sbin/screencapture', ['-x', '-R0,0,1440,1080', RAW_SCREENSHOT_PATH])
  await sharp(RAW_SCREENSHOT_PATH).resize(1440, 1080).png().toFile(SCREENSHOT_PATH)
  await fs.chmod(SCREENSHOT_PATH, 0o600).catch(() => {})
  await fs.chmod(RAW_SCREENSHOT_PATH, 0o600).catch(() => {})
  return SCREENSHOT_PATH
}

/** 실패한 화면을 남긴다. 새벽에 혼자 멈추면 이 그림이 유일한 단서다. */
async function evidence(name) {
  const file = path.join(ARTIFACT_DIR, `woori-bank-${name}-${Date.now()}.png`)
  await execFileAsync('/usr/sbin/screencapture', ['-x', file]).catch(() => {})
  await fs.chmod(file, 0o600).catch(() => {})
  return file
}

/**
 * 모듈이 띄운 오류 알림을 치운다. 치웠으면 무슨 말이었는지 로그에 남긴다.
 *
 * 알림은 화면을 덮은 채 가만히 있으므로, 그냥 기다리면 이 단계는 타임아웃까지
 * 멈춰 있다가 "인증서 창이 안 열렸어요"로 끝난다 — 진짜 원인은 로그에 없다.
 * 2026-08-29 에 CEO 가 사람 손으로 닫아 줘야 했던 자리다.
 */
async function clearBlockingAlert() {
  const dismissed = await dismissBlockingAlerts().catch(() => [])
  for (const alert of dismissed) {
    log(`가로막은 알림을 닫았어요: ${alert.message || alert.name}`)
  }
  return dismissed.length > 0
}

async function waitForCertificateModal(timeout = 50_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    await clearBlockingAlert()
    const imagePath = await captureScreen()
    const { data, info } = await sharp(imagePath).raw().toBuffer({ resolveWithObject: true })
    const pixel = (x, y) => {
      const offset = (y * info.width + x) * info.channels
      return [data[offset], data[offset + 1], data[offset + 2]]
    }
    // 인증서 창이 뜨면 뒤 화면은 어두워지고 창 자리는 하얗게 된다.
    const background = pixel(100, 250)
    const modal = pixel(700, 250)
    if (background.every(value => value < 160) && modal.every(value => value > 235)) return
    await sleep(1_000)
  }
  throw new Error(`우리은행 인증서 창이 50초 안에 열리지 않았어요. 증거=${await evidence('no-modal')}`)
}

/** 자판 배열을 읽고 잠긴 칸 4개·글쇠 36개가 맞는지 확인한다. 어긋나면 누르지 않는다. */
/** 키패드를 못 읽으면 알림이 덮고 있는지 보고 한 번 더 본다. */
async function gridOriginY() {
  try {
    return await findWooriGridOriginY(await captureScreen(), { minY: 800, maxY: 900 })
  } catch (error) {
    if (!await clearBlockingAlert()) throw error
    await sleep(1_000)
    return findWooriGridOriginY(await captureScreen(), { minY: 800, maxY: 900 })
  }
}

async function validateMode(mode) {
  const imagePath = await captureScreen()
  const originY = await gridOriginY()
  const result = await analyzeWooriKeypadScreenshot(imagePath, mode, { originY })
  if (result.lockedCount !== 4 || result.unlockedCount !== 36) {
    throw new Error(`${mode} 키패드 배열 검증에 실패했어요. 증거=${await evidence(`keypad-${mode}`)}`)
  }
  return { ...result, originY }
}

function modeForCharacter(character) {
  if (/^[A-Z]$/.test(character)) return 'shift'
  if (/^[a-z0-9]$/.test(character)) return 'base'
  return 'special'
}

async function switchMode(currentMode, targetMode, originY) {
  if (currentMode === targetMode) return currentMode
  if (currentMode === 'special') {
    await click(478, originY + 88)
    currentMode = 'base'
  } else if (currentMode === 'shift') {
    await click(520, originY + 132)
    currentMode = 'base'
  }
  if (targetMode === 'special') await click(478, originY + 88)
  if (targetMode === 'shift') await click(520, originY + 132)
  await sleep(300)
  return targetMode
}

async function enterCertificatePassword(password) {
  let currentMode = 'base'
  let latestOriginY

  for (const character of password) {
    const originY = await gridOriginY()
    const targetMode = modeForCharacter(character)
    currentMode = await switchMode(currentMode, targetMode, originY)

    const layout = await validateMode(currentMode)
    const point = layout.keyMap[character]
    if (!point) throw new Error(`필요한 ${currentMode} 키를 안전하게 찾지 못했어요.`)
    await click(point.x, point.y)
    latestOriginY = layout.originY
    await sleep(180)
  }

  // 확인을 누르기 전에 몇 글자가 들어갔는지 센다. 길이가 모자란 채 제출하면
  // 인증서 오류 횟수만 쌓이고, 5회면 인증서가 잠겨 홈택스까지 멈춘다.
  await click(940, latestOriginY + 132)
  await sleep(500)
  const maskedCount = await countMaskedCharacters(await captureScreen(), { top: 758, bottom: 778 })
  const expected = [...password].length
  if (maskedCount !== expected) {
    throw new Error(`입력된 인증서 비밀번호 길이가 달라 제출하지 않았어요: expected=${expected}, actual=${maskedCount}, 증거=${await evidence('mask-mismatch')}`)
  }

  await click(785, 913)
  log(`keypad entry: ${maskedCount}/${expected}`)
}

async function signedIn(windowId) {
  const state = await pageScript(windowId, "document.body.innerText.includes('로그아웃') ? 'yes' : 'no'")
    .catch(() => 'no')
  return state === 'yes'
}

async function navigateByControlText(windowId, text) {
  const encoded = JSON.stringify(text)
  const result = await pageScript(windowId, `(()=>{const t=${encoded};const el=[...document.querySelectorAll('a,button')].find(x=>x.innerText.trim()===t);if(!el)return 'missing';el.click();return 'clicked'})()`)
  if (result !== 'clicked') throw new Error(`${text} 메뉴를 찾지 못했어요. 증거=${await evidence('menu-missing')}`)
  await sleep(5_000)
}

async function collectAccounts(windowId) {
  await navigateByControlText(windowId, '전계좌조회')
  const raw = await pageScript(windowId, "JSON.stringify([...document.querySelectorAll('*')].filter(x=>x.children.length===0&&x.innerText&&x.innerText.trim()==='계좌잔액').map(x=>x.parentElement.parentElement.parentElement.parentElement.innerText))")
  const accounts = JSON.parse(raw)
    .map(parseWooriAccountCardText)
    .filter(account => account.account_type === 'deposit')

  const actual = new Set(accounts.map(account => account.account))
  const missing = [...EXPECTED_ACCOUNTS].filter(account => !actual.has(account))
  const unexpected = [...actual].filter(account => !EXPECTED_ACCOUNTS.has(account))
  if (accounts.length !== EXPECTED_ACCOUNTS.size || missing.length || unexpected.length) {
    throw new Error(`우리은행 입출금 계좌 구성이 달라졌어요: count=${accounts.length}, missing=${missing.length}, unexpected=${unexpected.length}, 증거=${await evidence('account-mismatch')}`)
  }

  const payload = {
    collected_at: new Date().toISOString(),
    bank: '우리은행',
    company: IDENTITY.label,
    accounts,
  }
  await fs.writeFile(ACCOUNTS_PATH, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 })
  await fs.chmod(ACCOUNTS_PATH, 0o600)
  log(`accounts: ${accounts.length}`)
  for (const account of accounts) {
    log(`  ${account.account_display} ${Number(account.balance ?? 0).toLocaleString()} KRW`)
  }
  return accounts
}

async function openTransactionPage(windowId, accountDisplay, navigate = true) {
  if (navigate) await navigateByControlText(windowId, '전계좌조회')
  const encoded = JSON.stringify(accountDisplay)
  const clicked = await pageScript(windowId, `(()=>{const target=${encoded};const label=[...document.querySelectorAll('*')].filter(x=>x.innerText&&x.innerText.includes(target)).sort((a,b)=>a.innerText.length-b.innerText.length)[0];if(!label)return 'account-missing';let card=label;while(card&&!(card.innerText||'').includes('거래내역조회'))card=card.parentElement;if(!card)return 'card-missing';const button=[...card.querySelectorAll('a,button')].find(x=>x.innerText.trim()==='거래내역조회');if(!button)return 'button-missing';button.click();return 'clicked'})()`)
  if (clicked !== 'clicked') throw new Error(`${accountDisplay} 거래내역조회 진입에 실패했어요: ${clicked}`)
  await sleep(5_000)
}

function dateText(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date).replaceAll('-', '.')
}

/**
 * 조회 기간 칸이 생길 때까지 기다린다.
 *
 * 거래내역 화면은 계좌 카드의 "거래내역조회"를 누른 뒤에 그려지는데, 고정 5초를
 * 세고 바로 칸을 채우려 들면 늦게 그려지는 날 date-missing 으로 넘어졌다. 그러면
 * 그 계좌 하나가 아니라 8계좌 수집이 통째로 죽는다(08-29 08:57, 2번째 계좌).
 */
async function waitForDateFields(windowId, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const ready = await pageScript(windowId, "(()=>document.getElementById('startDate')&&document.getElementById('endDate')?'yes':'no')()")
      .catch(() => 'no')
    if (ready === 'yes') return true
    await sleep(1_000)
  }
  return false
}

async function queryTransactionBody(windowId, startDate, endDate) {
  const start = JSON.stringify(startDate)
  const end = JSON.stringify(endDate)
  const queryResult = await pageScript(windowId, `(()=>{const set=(id,value)=>{const x=document.getElementById(id);if(!x)return false;x.value=value;x.dispatchEvent(new Event('input',{bubbles:true}));x.dispatchEvent(new Event('change',{bubbles:true}));return true};if(!set('startDate',${start})||!set('endDate',${end}))return 'date-missing';let p=document.getElementById('startDate');while(p){const b=[...p.querySelectorAll('button,a')].find(x=>x.innerText.trim()==='조회');if(b){b.click();return 'clicked'}p=p.parentElement}return 'query-missing'})()`)
  if (queryResult !== 'clicked') throw new Error(`거래내역 조회 실행에 실패했어요: ${queryResult}`)
  await sleep(6_000)
  return pageScript(windowId, 'document.body.innerText')
}

async function collectTransactions(windowId, accounts) {
  const end = new Date()
  const start = new Date(end.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
  const startDate = dateText(start)
  const endDate = dateText(end)
  const transactions = []

  for (const [index, account] of accounts.entries()) {
    await openTransactionPage(windowId, account.account_display)
    // 칸이 안 보이면 화면을 잘못 짚었거나 아직 그려지는 중이다. 한 번 더 들어가
    // 본다 — 여기서 포기하면 남은 계좌까지 함께 날아간다.
    if (!await waitForDateFields(windowId)) {
      log(`${account.account_display}: 조회 기간 칸이 늦어 다시 들어가요.`)
      await openTransactionPage(windowId, account.account_display)
      if (!await waitForDateFields(windowId)) {
        throw new Error(`${account.account_display} 거래내역 화면에 조회 기간 칸이 없어요. 증거=${await evidence('no-date-fields')}`)
      }
    }
    const body = await queryTransactionBody(windowId, startDate, endDate)
    const rows = parseWooriTransactionBodyText(body).map(row => ({
      organization: '0020',
      account: account.account,
      account_label: account.account_label,
      ...row,
    }))
    transactions.push(...rows)
    log(`transactions ${index + 1}/${accounts.length} ${account.account_display}: ${rows.length}`)
  }

  const payload = {
    collected_at: new Date().toISOString(),
    bank: '우리은행',
    company: IDENTITY.label,
    start_date: startDate.replaceAll('.', '-'),
    end_date: endDate.replaceAll('.', '-'),
    account_count: accounts.length,
    transactions,
  }
  await fs.writeFile(TRANSACTIONS_PATH, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 })
  await fs.chmod(TRANSACTIONS_PATH, 0o600)
  log(`transactions: ${transactions.length} (${payload.start_date} ~ ${payload.end_date})`)
  log(`saved ${ACCOUNTS_PATH}`)
  log(`saved ${TRANSACTIONS_PATH}`)
}

async function run() {
  if (IDENTITY.company !== 'tensw') {
    throw new Error(`우리은행 계좌는 텐소프트웍스만 있어요. 지금 회사=${IDENTITY.company}`)
  }
  await fs.mkdir(ARTIFACT_DIR, { recursive: true })

  let windowId
  try {
    windowId = await appleScript(`tell application "Google Chrome"
      set w to make new window
      set bounds of w to {0, 0, 1440, 1080}
      set URL of active tab of w to "${WOORI_URL}"
      activate
      return id of w
    end tell`)
    await sleep(4_000)

    if (await signedIn(windowId)) {
      log('reused existing session')
    } else {
      const clicked = await pageScript(windowId, "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes('공동인증서'));if(!b)return 'missing';b.click();return 'clicked'})()")
      if (clicked !== 'clicked') {
        throw new Error(`공동인증서 로그인 버튼을 찾지 못했어요. 증거=${await evidence('no-login-button')}`)
      }

      await waitForCertificateModal()
      // 저장 위치(하드디스크)와 인증서 한 줄을 고르고 나면 암호 칸이 열린다.
      await click(700, 581)
      await click(790, 768)
      await sleep(800)

      await enterCertificatePassword(await readCertificatePassword())
      await sleep(8_000)
      if (!await signedIn(windowId)) {
        throw new Error(`우리은행 로그인 성공 화면을 확인하지 못했어요. 증거=${await evidence('login-failed')}`)
      }
      log('logged in')
    }

    const accounts = await collectAccounts(windowId)
    await collectTransactions(windowId, accounts)
  } finally {
    if (windowId) {
      await appleScript(`tell application "Google Chrome" to close window id ${windowId}`).catch(() => {})
    }
  }
}

run().catch(error => {
  console.error(`[woori-bank-collect] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
