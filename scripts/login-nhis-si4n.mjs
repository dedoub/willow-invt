#!/usr/bin/env node
// Certificate login for 사회보험통합징수포털 (si4n.nhis.or.kr).
//
//   node scripts/login-nhis-si4n.mjs [--dry-run]
//
// --dry-run enters the password and verifies the field, then cancels instead of
// submitting, so a verification run costs none of the attempts the portal allows
// before it locks the certificate out.
//
// Three portal facts shape this script:
//   * AnySign refuses a Playwright-launched Chrome ("보안 프로그램 설치가 필요합니다"),
//     so it runs in the user's default browser like 우리은행 does.
//   * fn_makeSignNEW('1') 브라우저 인증서 hands the password box to a TouchEn
//     transKey keypad that reopens on every focus; fn_makeSignNEW('2')
//     공동인증서 keeps a plain box that accepts typed keystrokes, so this uses '2'.
//   * Every page load raises a phishing-warning alert that blocks Apple Events.
//
// The dialog is in-page, so its structure is driven through the DOM and only the
// keystrokes go through cliclick — AnySign marks the box read-only and collects
// characters itself, so its value cannot simply be assigned.

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { financeIdentity, readCertificatePassword } from './lib/tensw-local-finance.mjs'
import { certSite, splitBusinessNumber } from './lib/cert-sites.mjs'
import { buttonPoint, countMaskGlyphs, maskedLengthMatches, windowRect } from './lib/cert-dialog.mjs'
import {
  captureLogicalRgb,
  captureScreen,
  chromeElementRect,
  chromeJavascript,
  chromeTabState,
  click,
  nativeWindows,
  ocrScreenshot,
  openChromeTab,
  positionChromeWindow,
  pressKey,
  rectCenter,
  sleep,
  pasteText,
} from './lib/desktop.mjs'

const IDENTITY = financeIdentity()
const SITE = certSite('nhis')
const HOST = new URL(SITE.url).host
const LOG_DIR = path.join(os.homedir(), 'logs', `${IDENTITY.company}-local-finance`)
const SCRATCH = path.join(os.tmpdir(), 'willow-nhis-login.png')
const DRY_RUN = process.argv.includes('--dry-run')
const BUSINESS_NUMBER = IDENTITY.businessNumber

function log(message) {
  console.log(`[nhis-login] ${message}`)
}

async function pageScript(javascript) {
  const output = await chromeJavascript(javascript, { host: HOST })
  if (output === 'missing') throw new Error('사회보험 포털 탭을 찾지 못했어요.')
  return output
}

// The alert is a Chrome-owned window, so it is found and answered the same way
// the native certificate dialogs are.
async function dismissPageAlert() {
  const alertWindow = (await nativeWindows('Google Chrome'))
    .find(window => window.name.includes(HOST))
  if (!alertWindow) return false

  const items = await ocrScreenshot(await captureScreen(SCRATCH))
  const point = buttonPoint(items, '확인', { within: windowRect(alertWindow) })
  await click(point.x, point.y, 2)
  await sleep(1_500)
  log('page alert dismissed')
  return true
}

async function fillBusinessNumber() {
  const parts = splitBusinessNumber(BUSINESS_NUMBER)
  const values = SITE.businessNumberFields.map((id, index) => ({ id, value: parts[index] }))
  const result = await pageScript(`(() => {
    const values = ${JSON.stringify(values)};
    for (const entry of values) {
      const element = document.getElementById(entry.id);
      if (!element) return 'missing:' + entry.id;
      element.focus();
      element.value = entry.value;
      for (const type of ['input', 'keyup', 'change']) {
        element.dispatchEvent(new Event(type, { bubbles: true }));
      }
    }
    return 'filled';
  })()`)
  if (result !== 'filled') throw new Error(`사업자등록번호 입력에 실패했어요: ${result}`)
  log('business number filled')
}

async function dialogIsOpen() {
  const result = await pageScript(`(() => {
    const body = document.getElementById('xwup_body');
    if (!body) return 'absent';
    return body.getBoundingClientRect().height > 0 ? 'open' : 'hidden';
  })()`).catch(() => 'absent')
  return result === 'open'
}

// AnySign only draws its dialog once its local helper has connected, and the
// click is a no-op until then, so the trigger is pressed until it takes.
async function openCertificateDialog() {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (await dialogIsOpen()) return
    await pageScript(`(() => {
      const label = ${JSON.stringify(SITE.certTrigger)};
      const element = [...document.querySelectorAll('a,button,input[type=button]')]
        .find(candidate => (candidate.innerText || candidate.value || '').includes(label));
      if (!element) return 'waiting';
      element.click();
      return 'clicked';
    })()`).catch(() => 'waiting')
    await sleep(3_000)
    await dismissPageAlert()
  }
  throw new Error('사회보험 인증서 창이 열리지 않았어요.')
}

async function selectHardDisk() {
  const result = await pageScript(`(() => {
    const tab = document.querySelector(${JSON.stringify(SITE.selectors.hardDiskTab)});
    if (!tab) return 'absent';
    if (tab.disabled) return 'disabled';
    tab.click();
    return 'clicked';
  })()`)
  if (result === 'clicked') log('hard disk store selected')
  await sleep(1_500)
}

async function selectCertificate() {
  const owner = IDENTITY.certificateOwnerKeyword.replaceAll(' ', '')
  const result = await pageScript(`(() => {
    const owner = ${JSON.stringify(owner)};
    const rows = [...document.querySelectorAll('#xwup_cert_table tr')]
      .filter(row => /\\d{4}[-.]\\d{1,2}[-.]\\d{1,2}/.test(row.innerText || ''));
    const matches = rows.filter(row => (row.innerText || '').replace(/\\s+/g, '').includes(owner));
    if (matches.length === 0) return 'none:' + rows.length;
    if (matches.length > 1) return 'ambiguous:' + matches.length;
    matches[0].click();
    return 'selected:' + (matches[0].innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 40);
  })()`)

  if (result.startsWith('none')) {
    throw new Error(`${IDENTITY.certificateOwnerKeyword} 인증서를 목록에서 찾지 못했어요 (목록 ${result.split(':')[1]}건).`)
  }
  if (result.startsWith('ambiguous')) {
    throw new Error(`${IDENTITY.certificateOwnerKeyword} 인증서가 여러 건이라 확정하지 못했어요: ${result}`)
  }
  log(`certificate selected: ${result.slice('selected:'.length)}`)
  await sleep(600)
}

async function enterPassword() {
  const field = await chromeElementRect(HOST, SITE.selectors.password)
  if (!field) throw new Error('인증서 암호 입력칸을 찾지 못했어요.')

  const center = rectCenter(field)
  await click(center.x, center.y)
  await sleep(600)

  const password = await readCertificatePassword()
  // Pasted rather than typed: the certificate modules record something other
  // than the keys cliclick sends, and this box is a plain field.
  await pasteText(password)
  await sleep(600)

  // Count the masking dots inside the box, clear of its border.
  const rect = { x: field.x + 4, y: field.y + 4, w: field.w - 8, h: field.h - 8 }
  const masked = countMaskGlyphs(await captureLogicalRgb(SCRATCH), rect)
  if (!maskedLengthMatches([...password].length, masked)) {
    const evidence = path.join(LOG_DIR, `cert-mismatch-nhis-${Date.now()}.png`)
    await captureScreen(evidence).catch(() => {})
    await fs.chmod(evidence, 0o600).catch(() => {})
    await clearPassword()
    throw new Error(`입력된 비밀번호 길이가 달라 제출하지 않았어요: expected=${[...password].length}, actual=${masked}, 증거=${evidence}`)
  }
  log(`password mask validated: length=${masked}`)
}

async function clearPassword() {
  await pressKey('delete', 40)
}

async function clickDialogButton(selector) {
  await pageScript(`(() => {
    const button = document.querySelector(${JSON.stringify(selector)});
    if (!button) return 'absent';
    button.click();
    return 'clicked';
  })()`)
}

async function run() {
  await fs.mkdir(LOG_DIR, { recursive: true })

  await openChromeTab(SITE.url, HOST)
  await sleep(6_000)
  await dismissPageAlert()
  await positionChromeWindow(HOST)
  await dismissPageAlert()

  await fillBusinessNumber()
  await openCertificateDialog()
  await selectHardDisk()
  await selectCertificate()
  await enterPassword()

  if (DRY_RUN) {
    const evidence = path.join(LOG_DIR, `cert-dry-run-nhis-${Date.now()}.png`)
    await captureScreen(evidence)
    await fs.chmod(evidence, 0o600).catch(() => {})
    await clearPassword()
    await clickDialogButton(SITE.selectors.cancel)
    log(`dry-run: 확인을 누르지 않았어요. 증거=${evidence}`)
    return
  }

  // Submitting spends one of the attempts before the certificate locks, so it is
  // clicked once and never retried.
  await clickDialogButton(SITE.selectors.confirm)
  await sleep(8_000)

  const state = await chromeTabState(HOST)
  if (state.url.includes('JpBaa00101')) {
    throw new Error(`로그인이 완료되지 않았어요. 현재 화면: ${state.title}`)
  }
  log(`success: ${state.title}`)
}

run()
  .catch(async error => {
    const evidence = path.join(LOG_DIR, `cert-failure-nhis-${Date.now()}.png`)
    await captureScreen(evidence).catch(() => {})
    await fs.chmod(evidence, 0o600).catch(() => {})
    console.error(`[nhis-login] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
  .finally(() => fs.rm(SCRATCH, { force: true }).catch(() => {}))
