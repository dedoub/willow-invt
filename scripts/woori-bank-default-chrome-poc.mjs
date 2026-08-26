#!/usr/bin/env node

import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import sharp from 'sharp'
import {
  analyzeWooriKeypadScreenshot,
  countMaskedCharacters,
  findWooriGridOriginY,
} from './lib/secure-keypad.mjs'
import {
  parseWooriAccountCardText,
  parseWooriTransactionBodyText,
  readCertificatePassword,
} from './lib/tensw-local-finance.mjs'

const execFileAsync = promisify(execFile)
const HOME = process.env.HOME || '/Users/dongwookkim'
const ARTIFACT_DIR = path.join(HOME, 'logs', 'tensw-local-finance')
const SCREENSHOT_PATH = path.join(ARTIFACT_DIR, 'woori-default-live.png')
const RAW_SCREENSHOT_PATH = path.join(ARTIFACT_DIR, 'woori-default-live@2x.png')
const ACCOUNTS_PATH = path.join(ARTIFACT_DIR, 'latest-woori-accounts.json')
const TRANSACTIONS_PATH = path.join(ARTIFACT_DIR, 'latest-woori-transactions.json')
const WOORI_URL = 'https://nbi.wooribank.com/nbi/woori?withyou=BISVC0030'
const LOGIN = process.argv.includes('--login')
const INSPECT = process.argv.includes('--inspect')
const ACCOUNTS = process.argv.includes('--accounts')
const COLLECT = process.argv.includes('--collect')
const TRANSACTIONS_INSPECT = process.argv.includes('--transactions-inspect')
const QUERY_INSPECT = process.argv.includes('--query-inspect')
const COLLECT_TRANSACTIONS = process.argv.includes('--collect-transactions')

const EXPECTED_WOORI_ACCOUNTS = new Set([
  '1005403461450', '1005903636048', '1005603639403', '1005704524272',
  '1005204474909', '1005403914716', '1005803628060', '1005604650468',
])

async function appleScript(script) {
  const { stdout } = await execFileAsync('/usr/bin/osascript', ['-e', script], { encoding: 'utf8' })
  return stdout.trim()
}

// The secure keypad drops a click that lands immediately after the pointer jumps
// to a new tile, and splitting the move into its own cliclick run does not help:
// the settle has to happen inside the same invocation.
async function click(x, y) {
  await execFileAsync('/opt/homebrew/bin/cliclick', ['-e', '30', `m:${x},${y}`, 'w:120', `c:${x},${y}`])
}

async function captureScreen() {
  await execFileAsync('/usr/sbin/screencapture', [
    '-x',
    '-R0,0,1440,1080',
    RAW_SCREENSHOT_PATH,
  ])
  await sharp(RAW_SCREENSHOT_PATH).resize(1440, 1080).png().toFile(SCREENSHOT_PATH)
  return SCREENSHOT_PATH
}

async function waitForModal(timeout = 50_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const imagePath = await captureScreen()
    const { data, info } = await sharp(imagePath).raw().toBuffer({ resolveWithObject: true })
    const pixel = (x, y) => {
      const offset = (y * info.width + x) * info.channels
      return [data[offset], data[offset + 1], data[offset + 2]]
    }
    const background = pixel(100, 250)
    const modal = pixel(700, 250)
    if (background.every(value => value < 160) && modal.every(value => value > 235)) return
    await new Promise(resolve => setTimeout(resolve, 1_000))
  }
  throw new Error('기본 Chrome에서 우리은행 인증서 창이 50초 안에 열리지 않았어요.')
}

async function validateMode(mode) {
  const imagePath = await captureScreen()
  const originY = await findWooriGridOriginY(imagePath, { minY: 800, maxY: 900 })
  const result = await analyzeWooriKeypadScreenshot(imagePath, mode, { originY })
  if (result.lockedCount !== 4 || result.unlockedCount !== 36) {
    throw new Error(`${mode} 키패드 배열 검증에 실패했어요.`)
  }
  console.log(`[woori-default] ${mode} layout validated: locks=4, keys=36, originY=${originY}`)
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
  await new Promise(resolve => setTimeout(resolve, 300))
  return targetMode
}

async function enterCertificatePassword(password) {
  let currentMode = 'base'
  let latestOriginY

  for (const character of password) {
    const imagePath = await captureScreen()
    const originY = await findWooriGridOriginY(imagePath, { minY: 800, maxY: 900 })
    const targetMode = modeForCharacter(character)
    currentMode = await switchMode(currentMode, targetMode, originY)

    const layout = await validateMode(currentMode)
    const point = layout.keyMap[character]
    if (!point) throw new Error(`필요한 ${currentMode} 키를 안전하게 찾지 못했어요.`)
    await click(point.x, point.y)
    latestOriginY = layout.originY
    await new Promise(resolve => setTimeout(resolve, 180))
  }

  await click(940, latestOriginY + 132)
  await new Promise(resolve => setTimeout(resolve, 500))
  const imagePath = await captureScreen()
  const maskedCount = await countMaskedCharacters(imagePath, { top: 758, bottom: 778 })
  if (maskedCount !== [...password].length) {
    throw new Error(`입력된 인증서 비밀번호 길이가 달라 제출하지 않았어요: expected=${[...password].length}, actual=${maskedCount}`)
  }

  await click(785, 913)
  console.log(`[woori-default] password mask validated: length=${maskedCount}`)
}

async function inspectLoggedInPage(windowId) {
  const snapshot = await appleScript(`tell application "Google Chrome"
    tell active tab of window id ${windowId}
      return execute javascript "JSON.stringify((()=>({url:location.href,title:document.title,headings:[...document.querySelectorAll('h1,h2,h3,h4')].map(x=>x.innerText.trim()).filter(Boolean).slice(0,30),controls:[...document.querySelectorAll('a,button')].map(x=>x.innerText.trim()).filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).slice(0,200),tableHeaders:[...document.querySelectorAll('th')].map(x=>x.innerText.trim()).filter(Boolean).slice(0,100)}))())"
    end tell
  end tell`)
  const parsed = JSON.parse(snapshot)
  console.log('[woori-default] logged-in page structure')
  console.log(JSON.stringify(parsed, null, 2))
}

async function navigateByControlText(windowId, text) {
  const encoded = JSON.stringify(text).replaceAll('"', '\\"')
  const result = await appleScript(`tell application "Google Chrome"
    tell active tab of window id ${windowId}
      return execute javascript "(()=>{const t=${encoded};const el=[...document.querySelectorAll('a,button')].find(x=>x.innerText.trim()===t);if(!el)return 'missing';el.click();return 'clicked'})()"
    end tell
  end tell`)
  if (result !== 'clicked') throw new Error(`${text} 메뉴를 찾지 못했어요.`)
  await new Promise(resolve => setTimeout(resolve, 5_000))
}

async function inspectAccountPage(windowId) {
  await navigateByControlText(windowId, '전계좌조회')
  const snapshot = await appleScript(`tell application "Google Chrome"
    tell active tab of window id ${windowId}
      return execute javascript "JSON.stringify((()=>{const redact=v=>v.replace(/[0-9]/g,'#');const balances=[...document.querySelectorAll('*')].filter(x=>x.children.length===0&&x.innerText&&x.innerText.trim()==='계좌잔액').map(x=>{let p=x;const chain=[];for(let i=0;i<5&&p;i++,p=p.parentElement)chain.push({tag:p.tagName,id:p.id,className:p.className,text:redact(p.innerText||'').slice(0,700)});return chain});return {url:location.href,title:document.title,headings:[...document.querySelectorAll('h1,h2,h3,h4')].map(x=>x.innerText.trim()).filter(Boolean).slice(0,30),balanceStructures:balances,frames:[...document.querySelectorAll('iframe')].map(x=>({id:x.id,name:x.name,src:x.src})),tables:[...document.querySelectorAll('table')].map((table,index)=>({index,headers:[...table.querySelectorAll('th')].map(x=>x.innerText.trim()).filter(Boolean),rows:[...table.querySelectorAll('tbody tr')].slice(0,12).map(row=>[...row.querySelectorAll('th,td')].map(cell=>redact(cell.innerText.trim()))) })).filter(table=>table.headers.length||table.rows.length)}})())"
    end tell
  end tell`)
  console.log('[woori-default] account page structure')
  console.log(snapshot)
}

async function collectAccounts(windowId) {
  await navigateByControlText(windowId, '전계좌조회')
  const raw = await appleScript(`tell application "Google Chrome"
    tell active tab of window id ${windowId}
      return execute javascript "JSON.stringify([...document.querySelectorAll('*')].filter(x=>x.children.length===0&&x.innerText&&x.innerText.trim()==='계좌잔액').map(x=>x.parentElement.parentElement.parentElement.parentElement.innerText))"
    end tell
  end tell`)
  const accounts = JSON.parse(raw)
    .map(parseWooriAccountCardText)
    .filter(account => account.account_type === 'deposit')

  const actual = new Set(accounts.map(account => account.account))
  const missing = [...EXPECTED_WOORI_ACCOUNTS].filter(account => !actual.has(account))
  const unexpected = [...actual].filter(account => !EXPECTED_WOORI_ACCOUNTS.has(account))
  if (accounts.length !== EXPECTED_WOORI_ACCOUNTS.size || missing.length || unexpected.length) {
    throw new Error(`우리은행 입출금 계좌 구성이 달라졌어요: count=${accounts.length}, missing=${missing.length}, unexpected=${unexpected.length}`)
  }

  const payload = {
    collected_at: new Date().toISOString(),
    bank: '우리은행',
    company: '텐소프트웍스',
    accounts,
  }
  await fs.writeFile(ACCOUNTS_PATH, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 })
  await fs.chmod(ACCOUNTS_PATH, 0o600)
  console.log(`[woori-default] collected ${accounts.length} deposit accounts`)
  console.log(`[woori-default] saved ${ACCOUNTS_PATH}`)
}

async function inspectTransactionPage(windowId) {
  await navigateByControlText(windowId, '전계좌조회')
  const targetAccount = [...EXPECTED_WOORI_ACCOUNTS][0]
  const targetDisplay = targetAccount.replace(/^(\d{4})(\d{3})(\d{6})$/, '$1-$2-$3')
  await openTransactionPage(windowId, targetDisplay, false)
  const snapshot = await appleScript(`tell application "Google Chrome"
    tell active tab of window id ${windowId}
      return execute javascript "JSON.stringify((()=>{const redact=v=>v.replace(/[0-9]/g,'#');return {url:location.href,title:document.title,headings:[...document.querySelectorAll('h1,h2,h3,h4')].map(x=>x.innerText.trim()).filter(Boolean).slice(0,30),bodyText:redact(document.body.innerText).slice(0,10000),inputs:[...document.querySelectorAll('input,select')].map(x=>({tag:x.tagName,type:x.type,id:x.id,name:x.name,className:x.className,value:redact(x.value||''),options:x.tagName==='SELECT'?[...x.options].map(o=>o.text.trim()).slice(0,30):undefined})).slice(0,100),tables:[...document.querySelectorAll('table')].map((table,index)=>({index,headers:[...table.querySelectorAll('th')].map(x=>x.innerText.trim()).filter(Boolean),rowCount:table.querySelectorAll('tbody tr').length,firstRows:[...table.querySelectorAll('tbody tr')].slice(0,3).map(row=>[...row.querySelectorAll('th,td')].map(cell=>redact(cell.innerText.trim())))})).filter(x=>x.headers.length||x.rowCount)}})())"
    end tell
  end tell`)
  console.log('[woori-default] transaction page structure')
  console.log(snapshot)
}

async function openTransactionPage(windowId, targetDisplay, navigate = true) {
  if (navigate) await navigateByControlText(windowId, '전계좌조회')
  const encoded = JSON.stringify(targetDisplay).replaceAll('"', '\\"')
  const clicked = await appleScript(`tell application "Google Chrome"
    tell active tab of window id ${windowId}
      return execute javascript "(()=>{const target=${encoded};const label=[...document.querySelectorAll('*')].filter(x=>x.innerText&&x.innerText.includes(target)).sort((a,b)=>a.innerText.length-b.innerText.length)[0];if(!label)return 'account-missing';let card=label;while(card&&!(card.innerText||'').includes('거래내역조회'))card=card.parentElement;if(!card)return 'card-missing';const button=[...card.querySelectorAll('a,button')].find(x=>x.innerText.trim()==='거래내역조회');if(!button)return 'button-missing';button.click();return 'clicked'})()"
    end tell
  end tell`)
  if (clicked !== 'clicked') throw new Error(`거래내역조회 진입에 실패했어요: ${clicked}`)
  await new Promise(resolve => setTimeout(resolve, 5_000))
}

function dateText(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date).replaceAll('-', '.')
}

async function queryTransactionBody(windowId, startDate, endDate) {
  const start = JSON.stringify(startDate).replaceAll('"', '\\"')
  const end = JSON.stringify(endDate).replaceAll('"', '\\"')
  const queryResult = await appleScript(`tell application "Google Chrome"
    tell active tab of window id ${windowId}
      return execute javascript "(()=>{const set=(id,value)=>{const x=document.getElementById(id);if(!x)return false;x.value=value;x.dispatchEvent(new Event('input',{bubbles:true}));x.dispatchEvent(new Event('change',{bubbles:true}));return true};if(!set('startDate',${start})||!set('endDate',${end}))return 'date-missing';let p=document.getElementById('startDate');while(p){const b=[...p.querySelectorAll('button,a')].find(x=>x.innerText.trim()==='조회');if(b){b.click();return 'clicked'}p=p.parentElement}return 'query-missing'})()"
    end tell
  end tell`)
  if (queryResult !== 'clicked') throw new Error(`거래내역 조회 실행에 실패했어요: ${queryResult}`)
  await new Promise(resolve => setTimeout(resolve, 6_000))
  return appleScript(`tell application "Google Chrome"
    tell active tab of window id ${windowId}
      return execute javascript "document.body.innerText"
    end tell
  end tell`)
}

async function collectTransactions(windowId) {
  await collectAccounts(windowId)
  const { accounts } = JSON.parse(await fs.readFile(ACCOUNTS_PATH, 'utf8'))
  const end = new Date()
  const start = new Date(end.getTime() - 13 * 24 * 60 * 60 * 1000)
  const startDate = dateText(start)
  const endDate = dateText(end)
  const transactions = []

  for (const [index, account] of accounts.entries()) {
    await openTransactionPage(windowId, account.account_display)
    const body = await queryTransactionBody(windowId, startDate, endDate)
    const rows = parseWooriTransactionBodyText(body).map(row => ({
      organization: '0020',
      account: account.account,
      account_label: account.account_label,
      ...row,
    }))
    transactions.push(...rows)
    console.log(`[woori-default] transactions ${index + 1}/${accounts.length}: rows=${rows.length}`)
  }

  const payload = {
    collected_at: new Date().toISOString(),
    bank: '우리은행',
    company: '텐소프트웍스',
    start_date: startDate.replaceAll('.', '-'),
    end_date: endDate.replaceAll('.', '-'),
    account_count: accounts.length,
    transactions,
  }
  await fs.writeFile(TRANSACTIONS_PATH, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 })
  await fs.chmod(TRANSACTIONS_PATH, 0o600)
  console.log(`[woori-default] collected ${transactions.length} transactions from ${accounts.length} accounts`)
  console.log(`[woori-default] saved ${TRANSACTIONS_PATH}`)
}

async function inspectQueriedTransactions(windowId) {
  await inspectTransactionPage(windowId)
  await queryTransactionBody(windowId, '2026.08.12', '2026.08.25')
  const snapshot = await appleScript(`tell application "Google Chrome"
    tell active tab of window id ${windowId}
      return execute javascript "JSON.stringify((()=>{const redact=v=>v.replace(/[0-9]/g,'#');const nodes=[...document.querySelectorAll('[aria-label]')].filter(x=>(x.getAttribute('aria-label')||'').includes('행')).map((x,index)=>({index,tag:x.tagName,className:x.className,role:x.getAttribute('role'),ariaLabel:redact(x.getAttribute('aria-label')||''),text:redact(x.innerText||'').slice(0,500)}));return {url:location.href,bodyTail:redact(document.body.innerText).slice(-8000),nodes:nodes.slice(0,150)}})())"
    end tell
  end tell`)
  console.log('[woori-default] queried transaction structure')
  console.log(snapshot)
}

async function run() {
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
    await new Promise(resolve => setTimeout(resolve, 4_000))

    const alreadyLoggedIn = await appleScript(`tell application "Google Chrome"
      tell active tab of window id ${windowId}
        return execute javascript "document.body.innerText.includes('로그아웃') ? 'yes' : 'no'"
      end tell
    end tell`)
    if (alreadyLoggedIn === 'yes') {
      console.log('[woori-default] reused existing Woori Bank session')
      if (COLLECT_TRANSACTIONS) await collectTransactions(windowId)
      else if (QUERY_INSPECT) await inspectQueriedTransactions(windowId)
      else if (TRANSACTIONS_INSPECT) await inspectTransactionPage(windowId)
      else if (COLLECT) await collectAccounts(windowId)
      else if (ACCOUNTS) await inspectAccountPage(windowId)
      else if (INSPECT) await inspectLoggedInPage(windowId)
      return
    }

    const clicked = await appleScript(`tell application "Google Chrome"
      tell active tab of window id ${windowId}
        return execute javascript "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes('공동인증서'));if(!b)return 'missing';b.click();return 'clicked'})()"
      end tell
    end tell`)
    if (clicked !== 'clicked') throw new Error('공동인증서 로그인 버튼을 찾지 못했어요.')

    await waitForModal()
    await click(700, 581)
    await click(790, 768)
    await new Promise(resolve => setTimeout(resolve, 800))

    if (LOGIN) {
      const password = await readCertificatePassword()
      await enterCertificatePassword(password)
      await new Promise(resolve => setTimeout(resolve, 8_000))
      const loggedIn = await appleScript(`tell application "Google Chrome"
        tell active tab of window id ${windowId}
          return execute javascript "document.body.innerText.includes('로그아웃') ? 'yes' : 'no'"
        end tell
      end tell`)
      if (loggedIn !== 'yes') throw new Error('우리은행 로그인 성공 화면을 확인하지 못했어요.')
      console.log('[woori-default] Woori Bank login verified')
      if (COLLECT_TRANSACTIONS) await collectTransactions(windowId)
      else if (QUERY_INSPECT) await inspectQueriedTransactions(windowId)
      else if (TRANSACTIONS_INSPECT) await inspectTransactionPage(windowId)
      else if (COLLECT) await collectAccounts(windowId)
      else if (ACCOUNTS) await inspectAccountPage(windowId)
      else if (INSPECT) await inspectLoggedInPage(windowId)
    } else {
      await validateMode('base')
      await click(520, 980)
      await new Promise(resolve => setTimeout(resolve, 400))
      await validateMode('shift')
      await click(520, 980)
      await click(478, 936)
      await new Promise(resolve => setTimeout(resolve, 400))
      await validateMode('special')
      console.log('[woori-default] probe passed; password was not read or clicked')
    }
  } finally {
    if (windowId) {
      await appleScript(`tell application "Google Chrome" to close window id ${windowId}`).catch(() => {})
    }
  }
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
