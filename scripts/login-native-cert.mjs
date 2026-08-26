#!/usr/bin/env node
// Certificate login for the sites whose dialog is an opaque native window but
// still accepts typed keystrokes: 신한은행 기업뱅킹 and 위택스.
//
//   node scripts/login-native-cert.mjs --site shinhan-bank [--dry-run]
//
// --dry-run enters the password, verifies the field, then cancels instead of
// submitting, so a verification run costs none of the attempts a site allows
// before it locks the certificate out.

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { financeIdentity, readCertificatePassword } from './lib/tensw-local-finance.mjs'
import { certSite, splitBusinessNumber } from './lib/cert-sites.mjs'
import {
  buttonPoint,
  findOcrText,
  textCenter,
  anchoredPoint,
  certificateRowPoint,
  countMaskGlyphs,
  maskedLengthMatches,
  windowRect,
} from './lib/cert-dialog.mjs'
import {
  activateProcess,
  captureLogicalRgb,
  captureScreen,
  chromeJavascript,
  chromeTabState,
  click,
  clickSettled,
  nativeWindows,
  ocrScreenshot,
  openChromeTab,
  positionChromeWindow,
  pressKey,
  sleep,
  pasteText,
  waitForNativeWindow,
} from './lib/desktop.mjs'

const IDENTITY = financeIdentity()
const LOG_DIR = path.join(os.homedir(), 'logs', `${IDENTITY.company}-local-finance`)
const SCRATCH = path.join(os.tmpdir(), 'willow-cert-login.png')

function argumentValue(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const SITE_ID = argumentValue('--site')
const DRY_RUN = process.argv.includes('--dry-run')
const BUSINESS_NUMBER = IDENTITY.businessNumber

function hostOf(url) {
  return new URL(url).host
}

function log(message) {
  console.log(`[cert-login:${SITE_ID}] ${message}`)
}

async function readDialog(site) {
  const window = await waitForNativeWindow(site.process, site.window, 30_000)
  // The window exists before it has painted its contents, and OCR of a blank
  // dialog finds none of the controls.
  await sleep(1_500)
  const items = await ocrScreenshot(await captureScreen(SCRATCH))
  return { window, items, within: windowRect(window) }
}

// The dialog only raises itself on a click that arrives while another window is
// key, and that click is consumed. Spending one throwaway click up front means
// every later click is a real press.
async function focusDialog(site) {
  await activateProcess(site.process)
  const [window] = await nativeWindows(site.process)
  if (!window) throw new Error(`${site.label} 인증서 창을 찾지 못했어요.`)
  await clickSettled(window.x + Math.round(window.w / 2), window.y + 12)
  await sleep(250)
}

// A page-level JavaScript alert blocks every Apple Event until it is answered,
// so it is dismissed by clicking it before any DOM call is attempted.
async function dismissPageAlert(host) {
  const alertWindow = (await nativeWindows('Google Chrome'))
    .find(window => window.name.includes(host))
  if (!alertWindow) return

  const items = await ocrScreenshot(await captureScreen(SCRATCH))
  const point = buttonPoint(items, '확인', { within: windowRect(alertWindow) })
  await click(point.x, point.y, 2)
  await sleep(1_500)
  log('page alert dismissed')
}

function triggerScript(site) {
  if (site.trigger.kind === 'element-id') {
    return `(() => {
      const element = document.getElementById(${JSON.stringify(site.trigger.value)});
      if (!element) return 'waiting';
      element.click();
      return 'clicked';
    })()`
  }
  // Some login screens hide the certificate button behind a tab that has to be
  // opened first, so the ids are clicked in order.
  if (site.trigger.kind === 'element-ids') {
    return `(() => {
      const ids = ${JSON.stringify(site.trigger.value)};
      const elements = ids.map(id => document.getElementById(id));
      if (elements.some(element => !element)) return 'waiting';
      elements[0].click();
      for (let index = 1; index < elements.length; index += 1) {
        setTimeout(() => elements[index].click(), 300 * index);
      }
      return 'clicked';
    })()`
  }
  return `(() => {
    const label = ${JSON.stringify(site.trigger.value)};
    const element = [...document.querySelectorAll('a,button,input[type=button]')]
      .find(candidate => (candidate.innerText || candidate.value || '').includes(label));
    if (!element) return 'waiting';
    element.click();
    return 'clicked';
  })()`
}

async function prefillFields(site, host) {
  if (!site.prefill?.length) return
  const parts = splitBusinessNumber(BUSINESS_NUMBER)
  const values = site.prefill.map(field => ({ id: field.id, value: parts[field.part] }))
  const result = await chromeJavascript(`(() => {
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
  })()`, { host })
  if (result !== 'filled') throw new Error(`로그인 폼 사전 입력에 실패했어요: ${result}`)
  log('business number filled')
}

// A rejected password leaves the module's alert on top of the dialog, where it
// hides the controls the run needs to read.
async function dismissModuleAlert(site) {
  const alertWindow = (await nativeWindows(site.process)).find(window => window.name !== site.window)
  if (!alertWindow) return false
  const items = await ocrScreenshot(await captureScreen(SCRATCH))
  const within = windowRect(alertWindow)
  const button = findOcrText(items, 'OK', { within }) ?? findOcrText(items, '확인', { within })
  if (!button) return false
  const point = textCenter(button)
  await clickSettled(point.x, point.y)
  await sleep(1_500)
  log('이전 오류 알림을 닫았어요.')
  return true
}

// A dialog left open by an earlier run would take the new password on top of the
// old entry, so any leftover is closed before starting.
async function closeStaleDialog(site) {
  await dismissModuleAlert(site)
  const stale = (await nativeWindows(site.process)).find(window => window.name === site.window)
  if (!stale) return
  const items = await ocrScreenshot(await captureScreen(SCRATCH))
  const point = buttonPoint(items, site.cancel, { within: windowRect(stale) })
  await clickSettled(point.x, point.y)
  await sleep(1_500)
  await clickSettled(point.x, point.y)
  await sleep(1_500)
  log('이전 인증서 창을 닫았어요.')
}

async function openCertificateDialog(site) {
  await closeStaleDialog(site)
  const host = hostOf(site.url)
  await openChromeTab(site.url, host)
  await sleep(5_000)
  if (site.pageAlert) await dismissPageAlert(host)
  await positionChromeWindow(host)
  if (site.pageAlert) await dismissPageAlert(host)
  await prefillFields(site, host)

  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    const result = await chromeJavascript(triggerScript(site), { host }).catch(() => 'waiting')
    if (result === 'clicked') break
    await sleep(1_000)
  }

  return readDialog(site)
}

// The masking dots render from the left edge of the field, not around the click
// point, and the band stays inside the box so its border is not counted.
function maskRect(point, spec) {
  return { x: point.x + spec.dx, y: point.y + spec.dy, w: spec.w, h: spec.h }
}

async function enterPassword(site, dialog) {
  await focusDialog(site)

  // 하드디스크 holds the NPKI certificate; the dialog may open on another tab.
  const storage = buttonPoint(dialog.items, site.storageTab, { within: dialog.within })
  await clickSettled(storage.x, storage.y)
  await sleep(800)

  const refreshed = await readDialog(site)
  const row = certificateRowPoint(refreshed.items, IDENTITY.certificateOwnerKeyword, { within: refreshed.within })
  await clickSettled(row.x, row.y)
  await sleep(500)

  const field = anchoredPoint(refreshed.items, site.passwordField, { within: refreshed.within })
  await clickSettled(field.x, field.y)
  await sleep(400)

  if (site.keypadWindow) await closeKeypadWindow(site)

  const password = await readCertificatePassword()
  // Pasted rather than typed: INISAFE recorded something other than the keys
  // cliclick sent, and these fields are plain boxes, not secure keypads.
  await pasteText(password)
  await sleep(600)

  const rect = maskRect(field, site.maskRect)
  const rgb = await captureLogicalRgb(SCRATCH)
  const masked = countMaskGlyphs(rgb, rect)
  if (!maskedLengthMatches([...password].length, masked)) {
    await clearField(password.length)
    throw new Error(`입력된 비밀번호 길이가 달라 제출하지 않았어요: expected=${[...password].length}, actual=${masked}`)
  }
  log(`password mask validated: length=${masked}`)
  return { refreshed, password }
}

// 우리카드 pops its own on-screen keypad the moment the field is focused. The
// password is pasted, not clicked in, so the keypad is dismissed to keep it from
// stealing the key window.
async function closeKeypadWindow(site) {
  const keypad = (await nativeWindows(site.process)).find(window => window.name === site.keypadWindow)
  if (!keypad) return
  await click(keypad.x + keypad.w - 21, keypad.y + 17, 2)
  await sleep(600)
}

async function clearField(length) {
  await pressKey('delete', Math.max(20, length + 10))
}

async function cancel(site, dialog) {
  const point = buttonPoint(dialog.items, site.cancel, { within: dialog.within })
  await clickSettled(point.x, point.y)
  await sleep(1_000)
}

async function submit(site, dialog) {
  // Taking the screenshot for the mask check can leave the dialog without key
  // focus, and the click that restores it is swallowed. Spend that click on the
  // title bar so the one that follows really presses 확인.
  await focusDialog(site)
  // Clicking 확인 spends one of the attempts before lockout, so it is clicked
  // exactly once and never retried on failure.
  const point = buttonPoint(dialog.items, site.confirm, { within: dialog.within })
  await clickSettled(point.x, point.y, { easing: 40, settleMs: 250 })
}

async function run() {
  if (!SITE_ID) throw new Error('--site 인자가 필요해요. 예: --site shinhan-bank')
  const site = certSite(SITE_ID)
  if (site.mechanism !== 'native-type') {
    throw new Error(`${site.label}은(는) ${site.mechanism} 방식이라 이 스크립트로 로그인하지 않아요.`)
  }
  if (site.keypadWindow) await closeKeypadWindow(site)

  await fs.mkdir(LOG_DIR, { recursive: true })
  const dialog = await openCertificateDialog(site)
  log(`dialog ready at ${dialog.window.x},${dialog.window.y} ${dialog.window.w}x${dialog.window.h}`)

  const { refreshed } = await enterPassword(site, dialog)

  if (DRY_RUN) {
    const evidence = path.join(LOG_DIR, `cert-dry-run-${SITE_ID}-${Date.now()}.png`)
    await captureScreen(evidence)
    await fs.chmod(evidence, 0o600).catch(() => {})
    await clearField(40)
    await cancel(site, refreshed)
    log(`dry-run: 확인을 누르지 않았어요. 증거=${evidence}`)
    return
  }

  await submit(site, refreshed)

  // The dialog stays put when the certificate module rejects the password, so a
  // closed dialog is the signal that the submit was accepted.
  const deadline = Date.now() + 30_000
  let dialogOpen = true
  while (Date.now() < deadline) {
    await sleep(2_000)
    dialogOpen = (await nativeWindows(site.process)).some(window => window.name === site.window)
    if (!dialogOpen) break
  }

  const evidence = path.join(LOG_DIR, `cert-result-${SITE_ID}-${Date.now()}.png`)
  await captureScreen(evidence).catch(() => {})
  await fs.chmod(evidence, 0o600).catch(() => {})

  if (dialogOpen) {
    throw new Error(`인증서 창이 닫히지 않았어요. 비밀번호가 거부됐을 수 있어 재시도하지 않아요. 증거=${evidence}`)
  }

  const state = await chromeTabState(hostOf(site.url))
  if (!state.url) throw new Error(`${site.label} 탭을 잃어버렸어요.`)
  log(`submitted: ${state.title} (증거=${evidence})`)
}

run()
  .catch(async error => {
    const evidence = path.join(LOG_DIR, `cert-failure-${SITE_ID || 'unknown'}-${Date.now()}.png`)
    await captureScreen(evidence).catch(() => {})
    await fs.chmod(evidence, 0o600).catch(() => {})
    console.error(`[cert-login:${SITE_ID}] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
  .finally(() => fs.rm(SCRATCH, { force: true }).catch(() => {}))
