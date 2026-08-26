#!/usr/bin/env node

import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import {
  WOORI_CARD_KEYPAD_ROWS,
  buildWooriCardKeypadMap,
  needsWooriCardWindowReposition,
  parseWooriCardTabState,
} from './lib/woori-card-local.mjs'
import { countMaskGlyphs, maskedLengthMatches } from './lib/cert-dialog.mjs'
import {
  blockingCertLock, certLockMessage, certLockPath, clearCertLock, recordCertRejection,
} from './lib/cert-attempt-lock.mjs'
import {
  captureScreen, clickSettled, nativeWindows, ocrScreenshot, selectEnglishInputSource,
} from './lib/desktop.mjs'
import { buttonPoint, windowRect } from './lib/cert-dialog.mjs'

const execFileAsync = promisify(execFile)
const CLICLICK = '/opt/homebrew/bin/cliclick'
const MAGICK = '/opt/homebrew/bin/magick'
const SCREENSHOT = path.join(os.tmpdir(), 'willow-woori-card-keypad.png')
const CARD_URL = 'https://pc.wooricard.com/dcpc/yh2/bcv/bcv04/apvhisinq/H2BCV204S01.do'
const KEYCHAIN_SERVICE = 'willow.tensw.hometax.certificate'
const KEYCHAIN_ACCOUNT = 'tensoftworks'
const LOG_DIR = path.join(os.homedir(), 'logs', 'tensw-local-finance')
const FORCE_LOGIN = process.argv.includes('--force-login')
// Enters the password and captures the masked field without clicking 확인, so a
// verification run costs zero of the five certificate attempts.
const DRY_RUN = process.argv.includes('--dry-run')
const CERT_LOCK = certLockPath('tensw', 'woori-card')

function appleScriptLiteral(value) {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

async function appleScript(source) {
  const { stdout } = await execFileAsync('/usr/bin/osascript', ['-e', source], { encoding: 'utf8' })
  return stdout.trim()
}

function cardTabScript(body, missing = 'missing') {
  const titleFilter = FORCE_LOGIN ? ' and (title of chromeTab) contains "기업로그인"' : ''
  return `tell application "Google Chrome"
  repeat with chromeWindow in windows
    repeat with chromeTab in tabs of chromeWindow
      if (URL of chromeTab) contains "pc.wooricard.com"${titleFilter} then
        ${body}
      end if
    end repeat
  end repeat
  return "${missing}"
end tell`
}

async function cardTabState() {
  const output = await appleScript(cardTabScript(
    'return (URL of chromeTab) & linefeed & (title of chromeTab)',
  ))
  return parseWooriCardTabState(output)
}

async function positionCardWindowForSecureClicks() {
  const output = await appleScript(cardTabScript(`set windowBounds to bounds of chromeWindow
        return (item 1 of windowBounds as text) & "," & (item 2 of windowBounds as text) & "," & (item 3 of windowBounds as text) & "," & (item 4 of windowBounds as text)`))
  const [left, top, right, bottom] = output.split(',').map(Number)
  if ([left, top, right, bottom].some(value => !Number.isFinite(value))) {
    throw new Error('우리카드 Chrome 창 위치를 확인하지 못했어요.')
  }
  if (needsWooriCardWindowReposition({ left, top, right, bottom })) {
    await appleScript(cardTabScript(`set bounds of chromeWindow to {0, 0, 1920, 1080}
        return "positioned"`))
    await sleep(500)
  }
  await appleScript(cardTabScript(`set index of chromeWindow to 1
        activate
        return "active"`))
}

async function ensureCardTab() {
  let state = await cardTabState()
  if (state.url) {
    await positionCardWindowForSecureClicks()
    return state
  }

  await appleScript(`tell application "Google Chrome"
  activate
  if (count of windows) is 0 then make new window
  tell front window to make new tab with properties {URL:${appleScriptLiteral(CARD_URL)}}
end tell`)
  await sleep(2_000)
  state = await cardTabState()
  if (!state.url) throw new Error('우리카드 Chrome 탭을 열지 못했어요.')
  await positionCardWindowForSecureClicks()
  return state
}

async function executeCardJavascript(javascript) {
  return appleScript(cardTabScript(
    `return execute chromeTab javascript ${appleScriptLiteral(javascript)}`,
  ))
}

async function waitFor(check, timeoutMs, errorMessage) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check()) return
    await sleep(750)
  }
  throw new Error(errorMessage)
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function openCertificateDialog() {
  await ensureCardTab()
  const state = await cardTabState()
  if (!state.url.includes('H2BCV204S01.do')) {
    await appleScript(cardTabScript(`set URL of chromeTab to ${appleScriptLiteral(CARD_URL)}
        return "navigating"`))
  }

  await waitFor(async () => {
    const result = await executeCardJavascript(`(() => {
      const tab = document.getElementById('tab_0_1');
      const button = document.getElementById('htmlCertSign');
      if (!tab || !button) return 'waiting';
      tab.click();
      setTimeout(() => button.click(), 300);
      return 'clicked';
    })()`).catch(() => 'waiting')
    return result === 'clicked'
  }, 30_000, '우리카드 공동인증서 로그인 버튼을 찾지 못했어요.')
  await sleep(2_000)
}

// Absolute screen points on the 1920x1080 logical desktop, calibrated against the
// INISAFE certificate dialog. Keep in sync with WOORI_CARD_KEYPAD_ROWS.
const KEYPAD_CLEAR = { x: 1205, y: 485 }
const KEYPAD_CLOSE = { x: 1252, y: 416 }
// The keypad has a Shift at each end; the left one is the one that works.
const SHIFT_KEY = { x: 1205, y: 644 }
const CERT_DIALOG_BANNER = { x: 938, y: 300 }
const CERT_ROW_TENSW = { x: 938, y: 575 }
const PASSWORD_FIELD = { x: 938, y: 727 }
// The commit key is the right-hand ENTER.
const KEYPAD_ENTER = { x: 705, y: 602 }
const CERT_CANCEL = { x: 1014, y: 821 }
// The keypad shows the masking dots on its own title line; the field below stays
// empty until the entry is committed, and closing the keypad with X throws the
// entry away, so this is the only place the work can be checked before submit.
const KEYPAD_MASK_RECT = { x: 757, y: 446, w: 200, h: 14 }
// Every click into a bizapp window that is not key is swallowed raising it.

async function click(x, y, count = 1) {
  const commands = Array.from({ length: count }, () => `c:${x},${y}`)
  await execFileAsync(CLICLICK, commands)
}

async function captureKeypad() {
  await execFileAsync('/usr/sbin/screencapture', ['-x', SCREENSHOT])
  const { stdout } = await execFileAsync(MAGICK, [
    SCREENSHOT,
    '-resize', '1920x1080!',
    '-depth', '8',
    'rgb:-',
  ], { encoding: 'buffer', maxBuffer: 10 * 1024 * 1024 })
  return stdout
}

function meanBlueMinusRed(rgb, x, y, radius = 10) {
  let difference = 0
  let count = 0
  for (let sampleY = y - radius; sampleY <= y + radius; sampleY += 1) {
    for (let sampleX = x - radius; sampleX <= x + radius; sampleX += 1) {
      const offset = (sampleY * 1920 + sampleX) * 3
      difference += rgb[offset + 2] - rgb[offset]
      count += 1
    }
  }
  return difference / count
}

function lockedCoordinates(rgb, offset = { dx: 0, dy: 0 }) {
  return WOORI_CARD_KEYPAD_ROWS.flatMap(row => row.xs
    .filter(x => meanBlueMinusRed(rgb, x + offset.dx, row.y + offset.dy) > 20)
    .map(x => ({ x, y: row.y })))
}

async function keychainPassword() {
  const { stdout } = await execFileAsync('/usr/bin/security', [
    'find-generic-password',
    '-s', KEYCHAIN_SERVICE,
    '-a', KEYCHAIN_ACCOUNT,
    '-w',
  ], { encoding: 'utf8' })
  const password = stdout.replace(/\r?\n$/, '')
  if (!password) throw new Error('텐소프트웍스 인증서 비밀번호가 Keychain에 없어요.')
  return password
}

// Uppercase letters and the symbols printed on the upper half of a key both
// need the keypad in its shifted layout.
const SHIFTED_ONLY = new Set([...'~!@#$%^&*()_+|{}:"<>?'])

function requiresShift(character) {
  return /[A-Z]/.test(character) || SHIFTED_ONLY.has(character)
}

// The keypad is a free-floating window that the user — or a stray click on its
// title strip — can move, so every key is addressed relative to where the window
// actually is rather than to where it was calibrated.
const KEYPAD_ORIGIN = { x: 650, y: 398 }

async function keypadOffset() {
  let keypad = (await nativeWindows('bizapp')).find(window => window.name === 'Virtual Key')
  if (!keypad) throw new Error('우리카드 보안키패드 창을 찾지 못했어요.')

  // Put it back where the key grid was measured. Without this the window keeps
  // whatever position a previous run left it in, and it can sit far enough right
  // that part of the grid is off screen and unreadable.
  if (keypad.x !== KEYPAD_ORIGIN.x || keypad.y !== KEYPAD_ORIGIN.y) {
    await appleScript(`tell application "System Events" to tell process "bizapp" to set position of window "Virtual Key" to {${KEYPAD_ORIGIN.x}, ${KEYPAD_ORIGIN.y}}`)
      .catch(() => {})
    await sleep(500)
    keypad = (await nativeWindows('bizapp')).find(window => window.name === 'Virtual Key')
  }
  return { dx: keypad.x - KEYPAD_ORIGIN.x, dy: keypad.y - KEYPAD_ORIGIN.y }
}

function shift(point, offset) {
  return { x: point.x + offset.dx, y: point.y + offset.dy }
}

// The keypad only accepts the entry when the pointer arrives the way a hand
// moves it. Easing costs an occasional keystroke, which the mask check catches.
async function pressKey(point) {
  await clickSettled(point.x, point.y)
}

// The commit key only takes when the pointer arrives the way a hand moves it;
// a teleporting click there is ignored even though it works on the other tiles.
async function pressCommit(point) {
  await clickSettled(point.x, point.y, { easing: 40, settleMs: 250 })
}

// A rejected password leaves an alert on screen that blocks the next run, so any
// leftover is cleared before the dialog is touched.
async function dismissModuleAlert() {
  const alertWindow = (await nativeWindows('bizapp')).find(window => window.name === 'Dialog')
  if (!alertWindow) return
  const items = await ocrScreenshot(await captureScreen(SCREENSHOT))
  const point = buttonPoint(items, '확인', { within: windowRect(alertWindow) })
  await clickSettled(point.x, point.y)
  await sleep(1_200)
  console.log('[woori-card-login] 이전 오류 알림을 닫았어요.')
}

async function typeCertificatePassword({ dryRun = false } = {}) {
  let offset = await keypadOffset()
  // cliclick posts every click with clickCount=1, so a repeat count is N separate
  // key presses, not one double-click. Only the very first click after the keypad
  // window appears is swallowed to activate it, so spend exactly one throwaway
  // click on the backspace and use single clicks for every key afterwards. Never
  // click the title strip: a click there drags the window off its coordinates.
  // No warm-up press of any kind: the keypad is already the key window after the
  // click that opened it, and any extra tile press — backspace or an inert decoy
  // alike — leaves it in a state where the commit key discards the whole entry.

  // The keypad follows the system input source: with 한글 active every tile
  // enters a jamo instead of the letter printed on it, so the field fills to the
  // right length and the certificate rejects it. That is what happened on
  // 2026-08-27 — the run that worked the day before had ABC selected.
  await selectEnglishInputSource()

  const password = await keychainPassword()
  const expected = [...password].length

  // Easing drops a keystroke now and then, so the entry is retried until the
  // keypad shows the right number of characters. Retries cost nothing: the
  // attempt counter only moves when the entry is committed.
  let masked = 0
  for (let attempt = 1; attempt <= 4 && masked !== expected; attempt += 1) {
    if (attempt > 1) {
      // Start over with a fresh keypad rather than backspacing the old entry
      // away: backspace leaves the keypad in a state where the commit key throws
      // the whole thing out. Closing alone does not empty the field, though —
      // the next attempt then lands on top of the last one and the count climbs
      // 9, 19, 29 instead of settling on 10 — so the entry is cleared first.
      await click(...Object.values(shift(KEYPAD_CLEAR, offset)), 40)
      await sleep(400)
      await click(...Object.values(shift(KEYPAD_CLOSE, offset)))
      await sleep(800)
      await clickSettled(PASSWORD_FIELD.x, PASSWORD_FIELD.y)
      await sleep(2_000)
      offset = await keypadOffset()
    }

    let shifted = false
    let layouts = buildWooriCardKeypadMap(lockedCoordinates(await captureKeypad(), offset), offset)
    for (const character of password) {
      const wantsShift = requiresShift(character)
      if (wantsShift !== shifted) {
        await pressKey(shift(SHIFT_KEY, offset))
        await sleep(500)
        shifted = wantsShift
        layouts = buildWooriCardKeypadMap(lockedCoordinates(await captureKeypad(), offset), offset)
      }
      const point = shifted ? layouts.shifted[character] : layouts.base[character]
      if (!point) throw new Error('우리카드 키패드에서 비밀번호 문자를 안전하게 찾지 못했어요.')
      await pressKey(point)
      await sleep(150)
    }

    const maskRect = shift(KEYPAD_MASK_RECT, offset)
    masked = countMaskGlyphs(await captureKeypad(), { ...KEYPAD_MASK_RECT, ...maskRect })
    console.log(`[woori-card-login] keypad entry attempt ${attempt}: ${masked}/${expected}`)
  }

  // Committing is what spends one of the five attempts before the certificate
  // locks, so a short entry is never committed.
  if (!maskedLengthMatches(expected, masked)) {
    const evidence = path.join(LOG_DIR, `cert-mismatch-woori-card-${Date.now()}.png`)
    await execFileAsync('/usr/sbin/screencapture', ['-x', evidence]).catch(() => {})
    await fs.chmod(evidence, 0o600).catch(() => {})
    await click(...Object.values(shift(KEYPAD_CLEAR, offset)), 40)
    await click(...Object.values(shift(KEYPAD_CLOSE, offset)))
    throw new Error(`키패드 입력이 계속 짧아 제출하지 않았어요: expected=${expected}, actual=${masked}, 증거=${evidence}`)
  }

  if (dryRun) {
    const evidence = path.join(LOG_DIR, `keypad-dry-run-${Date.now()}.png`)
    await execFileAsync('/usr/sbin/screencapture', ['-x', evidence])
    await fs.chmod(evidence, 0o600).catch(() => {})
    // Never leave a real password sitting in the keypad on a dry run.
    await click(...Object.values(shift(KEYPAD_CLEAR, offset)), 40)
    await click(...Object.values(shift(KEYPAD_CLOSE, offset)))
    console.log(`[woori-card-login] dry-run: 확인 버튼을 누르지 않았어요. 증거=${evidence}`)
    return { dryRun: true }
  }

  // Same shape as the 우리은행 flow that works: the keypad's own commit key hands
  // the characters to the field, the field is checked, and only then is the
  // dialog's 확인 pressed. The keypad is modal, so 확인 is unreachable until the
  // keypad has closed itself.
  // The keypad's commit key both hands the password over and submits it. The two
  // outcomes look different: a rejected password lands the masked characters in
  // the field and raises the module's alert, while an accepted one leaves the
  // field empty, closes the dialog, and takes a while to land on the next page.
  await pressCommit(shift(KEYPAD_ENTER, offset))
  return { dryRun: false }
}

async function waitForCardScreen() {
  await appleScript(cardTabScript(`set URL of chromeTab to ${appleScriptLiteral(CARD_URL)}
        return "navigating"`))
  await waitFor(async () => {
    const state = await cardTabState()
    return state.url.includes('H2BCV204S01.do') && state.title.includes('이용내역')
  }, 40_000, '우리카드 승인내역 화면 진입에 실패했어요.')
}

async function closeCertificateDialog() {
  const dialog = (await nativeWindows('bizapp')).find(window => window.name === 'Form')
  if (!dialog) return
  await clickSettled(CERT_CANCEL.x, CERT_CANCEL.y)
  await sleep(1_200)
  await clickSettled(CERT_CANCEL.x, CERT_CANCEL.y)
  await sleep(1_500)
}

// After the commit key the module takes one of three paths, and only one of
// them has spent an attempt.
async function certificateOutcome() {
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    await sleep(2_000)
    const windows = await nativeWindows('bizapp')
    if (windows.some(window => window.name === 'Dialog')) return 'rejected'

    const state = await cardTabState()
    if (state.url && !state.title.includes('기업로그인')) return 'logged-in'

    // Keypad gone, dialog still up, nothing submitted: the entry was thrown
    // away, which costs none of the five attempts.
    const keypadOpen = windows.some(window => window.name === 'Virtual Key')
    const dialogOpen = windows.some(window => window.name === 'Form')
    if (!keypadOpen && dialogOpen && Date.now() > deadline - 25_000) return 'discarded'
  }
  return 'timeout'
}

async function run() {
  await fs.mkdir(LOG_DIR, { recursive: true })
  const modalOpen = process.argv.includes('--modal-open')
  const state = await ensureCardTab()
  if (!FORCE_LOGIN && state.url.includes('H2BCV204S01.do') && state.title.includes('이용내역')) {
    console.log('[woori-card-login] already authenticated')
    await clearCertLock(CERT_LOCK)
    return
  }

  // 이미 거부된 적이 있으면 새벽 실행이 남은 시도를 태우게 두지 않는다.
  // --dry-run 은 확인 버튼을 누르지 않으니 잠금과 무관하게 돌 수 있다.
  const blocked = DRY_RUN ? null : await blockingCertLock(CERT_LOCK)
  if (blocked) throw new Error(certLockMessage('우리카드', blocked, CERT_LOCK))

  if (!modalOpen) await openCertificateDialog()
  await dismissModuleAlert()

  // The dialog swallows the first click raising itself, so it is spent on the
  // banner. Then the Tensoftworks row, then the field that opens the keypad.
  await clickSettled(CERT_DIALOG_BANNER.x, CERT_DIALOG_BANNER.y)
  await sleep(400)
  await clickSettled(CERT_ROW_TENSW.x, CERT_ROW_TENSW.y)
  await sleep(600)

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (attempt > 1) {
      // Reopening the field alone leaves the keypad in whatever state the
      // discard left it in, and the layout it then reports has been seen to
      // disagree with the tiles it actually draws. A brand-new dialog is the
      // only state this can trust.
      await dismissModuleAlert()
      await closeCertificateDialog()
      await openCertificateDialog()
      await clickSettled(CERT_DIALOG_BANNER.x, CERT_DIALOG_BANNER.y)
      await sleep(400)
      await clickSettled(CERT_ROW_TENSW.x, CERT_ROW_TENSW.y)
      await sleep(600)
    }

    await clickSettled(PASSWORD_FIELD.x, PASSWORD_FIELD.y)
    await sleep(2_500)

    const result = await typeCertificatePassword({ dryRun: DRY_RUN })
    if (result.dryRun) return

    const outcome = await certificateOutcome()
    if (outcome === 'logged-in') {
      await waitForCardScreen()
      await clearCertLock(CERT_LOCK)
      console.log('[woori-card-login] success')
      return
    }
    if (outcome === 'rejected') {
      const evidence = path.join(LOG_DIR, `cert-rejected-woori-card-${Date.now()}.png`)
      await execFileAsync('/usr/sbin/screencapture', ['-x', evidence]).catch(() => {})
      await fs.chmod(evidence, 0o600).catch(() => {})
      const lock = await recordCertRejection(CERT_LOCK, { reason: `증거=${evidence}` })
      throw new Error(
        `우리카드가 인증서 암호를 거부했어요 (누적 ${lock.rejections}회). 자동 재시도하지 않아요. 증거=${evidence}`,
      )
    }
    // The keypad threw the entry away without submitting it, so retrying here
    // spends nothing.
    console.log(`[woori-card-login] commit ${attempt}: 키패드가 입력을 버려서 다시 시도해요.`)
  }

  throw new Error('우리카드 키패드가 비밀번호를 제출하지 못했어요. 자동 재시도하지 않아요.')
}

run().catch(async error => {
  await fs.rm(SCREENSHOT, { force: true }).catch(() => {})
  console.error(`[woori-card-login] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}).finally(() => fs.rm(SCREENSHOT, { force: true }).catch(() => {}))
