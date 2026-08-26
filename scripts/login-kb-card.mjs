#!/usr/bin/env node
// Certificate login for KB국민카드 기업 (biz.kbcard.com).
//
//   FINANCE_COMPANY=willow node scripts/login-kb-card.mjs [--dry-run]
//
// --dry-run enters the password, verifies it, then cancels instead of
// submitting, so a verification run costs none of the attempts KB allows before
// it locks the certificate out.
//
// Three facts about this site shape the script, all observed on 2026-08-26:
//   * The dialog is WIZVERA Delfino G4 drawn in a same-origin iframe, so its
//     structure is read from the DOM rather than by OCR — the certificate rows
//     carry their full owner names and nothing is truncated.
//   * The password box is fed by Delfino's own on-screen keypad. Typing and
//     pasting both leave it empty, so the characters have to be clicked.
//   * That keypad is a 594x190 PNG data URI in the DOM. Its QWERTY layout is
//     fixed; the dolphin decoy keys move every session and shift the real keys
//     along, so the image is decoded rather than assumed.

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { financeIdentity, readCertificatePassword } from './lib/tensw-local-finance.mjs'
import { certSite } from './lib/cert-sites.mjs'
import { decodeKeypadLayout, KEYPAD_CONTROLS, KEYPAD_SIZE, toScreenPoint } from './lib/kb-card-keypad.mjs'
import {
  activateProcess,
  captureScreen,
  chromeJavascript,
  chromeTabState,
  clickSettled,
  openChromeTab,
  positionChromeWindow,
  sleep,
} from './lib/desktop.mjs'

const execFileAsync = promisify(execFile)
const MAGICK = process.env.FINANCE_MAGICK || '/opt/homebrew/bin/magick'
const IDENTITY = financeIdentity()
const SITE = certSite('kb-card')
const HOST = new URL(SITE.url).host
const LOG_DIR = path.join(os.homedir(), 'logs', `${IDENTITY.company}-local-finance`)
const SCRATCH = path.join(os.tmpdir(), 'willow-kb-keypad')
const DRY_RUN = process.argv.includes('--dry-run')

function log(message) {
  console.log(`[kb-card-login] ${message}`)
}

async function pageScript(javascript) {
  const output = await chromeJavascript(javascript, { host: HOST })
  if (output === 'missing') throw new Error('KB카드 탭을 찾지 못했어요.')
  return output
}

// Everything inside the dialog is reached through the iframe, so the lookup is
// wrapped once rather than repeated in every snippet.
function inDialog(body) {
  return `(() => {
    const frame = [...document.querySelectorAll('iframe')].find(item => /delfino/.test(item.src));
    if (!frame) return 'no-dialog';
    const doc = frame.contentDocument;
    if (!doc) return 'no-access';
    const rect = frame.getBoundingClientRect();
    const viewportTop = window.screenY + (window.outerHeight - window.innerHeight);
    const screenPoint = element => {
      const box = element.getBoundingClientRect();
      return {
        x: Math.round(window.screenX + rect.left + box.left),
        y: Math.round(viewportTop + rect.top + box.top),
        w: Math.round(box.width),
        h: Math.round(box.height),
      };
    };
    ${body}
  })()`
}

async function isLoggedIn() {
  const result = await pageScript(
    `(() => document.body.innerText.includes('로그아웃') ? 'yes' : 'no')()`,
  ).catch(() => 'no')
  return result === 'yes'
}

// KB raises a JavaScript alert when the Delfino plugin has not been allowed for
// the tab, and an open alert blocks every Apple Event, so nothing else can run
// until it is answered.
async function openLoginPage() {
  const existing = await chromeTabState(HOST)
  if (!existing.url) {
    await openChromeTab(SITE.url, HOST)
    await sleep(9_000)
  }
  await positionChromeWindow(HOST)
  await sleep(2_000)
}

// A dialog left open by an earlier run keeps whatever was typed into it, and a
// second entry lands on top of the first — 11 characters became 22 this way.
async function closeStaleDialog() {
  const open = await pageScript(inDialog(`
    return doc.querySelector('input[name=selectDialogPasswordInput]') ? 'open' : 'closed';
  `)).catch(() => 'closed')
  if (open !== 'open') return
  await cancelDialog()
  await sleep(2_000)
  log('이전 인증서 창을 닫았어요.')
}

async function openCertificateDialog() {
  const opened = await pageScript(`(() => {
    const tab = [...document.querySelectorAll('.tabs__menu a')]
      .find(anchor => anchor.innerText.trim() === '공동인증서');
    if (!tab) return 'no-tab';
    tab.click();
    return 'tab';
  })()`)
  if (opened !== 'tab') throw new Error(`KB카드 공동인증서 탭을 찾지 못했어요: ${opened}`)
  await sleep(1_500)

  const clicked = await pageScript(`(() => {
    const panel = document.querySelector('.tabs__panel.cert');
    if (!panel) return 'no-panel';
    const button = [...panel.querySelectorAll('button')]
      .find(item => item.innerText.trim() === '로그인');
    if (!button) return 'no-button';
    button.click();
    return 'clicked';
  })()`)
  if (clicked !== 'clicked') throw new Error(`KB카드 인증서 로그인 버튼을 누르지 못했어요: ${clicked}`)

  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    await sleep(2_000)
    const ready = await pageScript(inDialog(`
      return doc.querySelector('input[name=selectDialogPasswordInput]') ? 'ready' : 'waiting';
    `)).catch(() => 'waiting')
    if (ready === 'ready') return
  }
  throw new Error('KB카드 인증서 창이 열리지 않았어요.')
}

async function selectCertificate() {
  const result = await pageScript(inDialog(`
    const disk = doc.querySelector('.localDiskButton');
    if (disk) disk.click();
    const rows = [...doc.querySelectorAll('tr')]
      .filter(row => (row.innerText || '').includes(${JSON.stringify(IDENTITY.certificateOwnerKeyword)}));
    if (rows.length === 0) return 'no-row';
    if (rows.length > 1) return 'many-rows:' + rows.length;
    rows[0].click();
    return 'selected:' + rows[0].innerText.replace(/\\s+/g, ' ').trim().slice(0, 60);
  `))
  if (!result.startsWith('selected:')) {
    throw new Error(`KB카드 인증서 목록에서 ${IDENTITY.label} 인증서를 고르지 못했어요: ${result}`)
  }
  log(result.slice('selected:'.length))
  await sleep(800)
}

// The keypad only exists once the field has focus, so it is clicked first and
// the keypad is waited for rather than assumed.
async function focusPasswordField() {
  const payload = await pageScript(inDialog(`
    const field = doc.querySelector('input[name=selectDialogPasswordInput]');
    if (!field) return 'no-field';
    const where = screenPoint(field);
    return JSON.stringify(where);
  `))
  if (payload === 'no-field') throw new Error('KB카드 인증서 암호칸을 찾지 못했어요.')
  const box = JSON.parse(payload)
  await clickSettled(box.x + Math.round(box.w / 2), box.y + Math.round(box.h / 2))

  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    await sleep(1_000)
    const size = await pageScript(inDialog(`
      const image = doc.querySelector('#keyboardDialogBody img.lowerKeyboard');
      if (!image) return '0x0';
      const box = image.getBoundingClientRect();
      return Math.round(box.width) + 'x' + Math.round(box.height);
    `)).catch(() => '0x0')
    if (size === `${KEYPAD_SIZE.width}x${KEYPAD_SIZE.height}`) return
  }
  throw new Error('KB카드 보안 키패드가 열리지 않았어요.')
}

// Reading the keypad means pulling its data URI out of the DOM and converting
// it to raw pixels; nothing is captured off the screen.
async function readKeypad() {
  // Two keypad images live in the dialog and only one is laid out: Delfino
  // swaps .lowerKeyboard for .upperKeyboard when Shift is on, so the visible one
  // also tells us which layout is showing.
  const payload = await pageScript(inDialog(`
    const image = [...doc.querySelectorAll('#keyboardDialogBody img')]
      .find(item => {
        const box = item.getBoundingClientRect();
        return box.width > 0 && box.height > 0
          && /lowerKeyboard|upperKeyboard/.test(String(item.className));
      });
    if (!image) return 'no-keypad';
    const where = screenPoint(image);
    return JSON.stringify({
      src: image.src,
      shifted: /upperKeyboard/.test(String(image.className)),
      origin: { x: where.x, y: where.y },
      w: where.w,
      h: where.h,
    });
  `))
  if (payload === 'no-keypad') throw new Error('KB카드 보안 키패드를 찾지 못했어요.')

  const { src, origin, w, h, shifted } = JSON.parse(payload)
  if (w !== KEYPAD_SIZE.width || h !== KEYPAD_SIZE.height) {
    throw new Error(`KB카드 키패드 크기가 달라졌어요: ${w}x${h}`)
  }

  const png = `${SCRATCH}.png`
  const raw = `${SCRATCH}.rgb`
  await fs.writeFile(png, Buffer.from(src.split(',')[1], 'base64'))
  await execFileAsync(MAGICK, [png, '-depth', '8', `rgb:${raw}`])
  const bytes = await fs.readFile(raw)
  const pixel = (x, y) => {
    const offset = (y * KEYPAD_SIZE.width + x) * 3
    return [bytes[offset], bytes[offset + 1], bytes[offset + 2]]
  }
  return { pixel, origin, shifted }
}

// 칸을 비우는 것도 키패드로만 된다 — delete 키는 이 칸에 닿지 않는다.
async function clearPasswordField() {
  const { origin } = await readKeypad()
  for (let index = 0; index < 40; index += 1) {
    await clickKeypad(KEYPAD_CONTROLS.backspace, origin)
  }
  const left = await maskedLength()
  if (left !== 0) throw new Error(`인증서 암호칸을 비우지 못했어요: ${left}자 남음`)
}

async function clickKeypad(point, origin) {
  const screen = toScreenPoint(point, origin)
  await clickSettled(screen.x, screen.y, { settleMs: 140 })
  await sleep(180)
}

/**
 * 한 글자씩, 매번 키패드를 다시 읽는다. Shift 를 누르면 이미지가 통째로 바뀌고
 * 한 번만 유효한지 계속 유효한지도 사이트마다 다르므로, 현재 화면에 그려진 것을
 * 그대로 믿는 편이 안전하다.
 */
async function enterPassword(password) {
  for (const character of password) {
    let keypad = await readKeypad()
    let point = decodeKeypadLayout(keypad.pixel, { shifted: keypad.shifted })[character]

    if (!point) {
      // The character belongs to the other layout, so Shift is pressed and the
      // keypad is read again rather than assuming what it turned into.
      await clickKeypad(KEYPAD_CONTROLS.shift, keypad.origin)
      await sleep(400)
      keypad = await readKeypad()
      point = decodeKeypadLayout(keypad.pixel, { shifted: keypad.shifted })[character]
    }
    if (!point) throw new Error('KB카드 키패드에서 비밀번호 문자를 찾지 못했어요.')

    await clickKeypad(point, keypad.origin)
  }
}

// Delfino keeps the value out of the DOM, so the field is verified by counting
// the masking glyphs it drew — the field's exact rectangle comes from the DOM,
// so the band needs no calibration.
async function maskedLength() {
  const payload = await pageScript(inDialog(`
    const field = doc.querySelector('input[name=selectDialogPasswordInput]');
    if (!field) return 'no-field';
    const where = screenPoint(field);
    return JSON.stringify({ ...where, domLength: field.value.length });
  `))
  if (payload === 'no-field') throw new Error('KB카드 인증서 암호칸을 찾지 못했어요.')
  const box = JSON.parse(payload)
  if (box.domLength > 0) return box.domLength

  const shot = `${SCRATCH}-field.png`
  await captureScreen(shot)
  const { stdout } = await execFileAsync(MAGICK, [
    shot,
    '-resize', '1920x1080!',
    '-crop', `${box.w - 8}x${box.h - 8}+${box.x + 4}+${box.y + 4}`,
    '+repage', '-depth', '8', 'rgb:-',
  ], { encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 })

  const width = box.w - 8
  const height = box.h - 8
  const columns = []
  for (let x = 0; x < width; x += 1) {
    let dark = 0
    for (let y = 0; y < height; y += 1) {
      const offset = (y * width + x) * 3
      if (stdout[offset] < 130 && stdout[offset + 1] < 130 && stdout[offset + 2] < 130) dark += 1
    }
    if (dark >= 2) columns.push(x)
  }
  let clusters = 0
  let previous = -Infinity
  for (const column of columns) {
    if (column > previous + 1) clusters += 1
    previous = column
  }
  return clusters
}

async function cancelDialog() {
  await pageScript(inDialog(`
    const cancel = doc.querySelector('.cancelButton');
    if (cancel) cancel.click();
    return 'cancelled';
  `)).catch(() => {})
}

async function run() {
  await fs.mkdir(LOG_DIR, { recursive: true })
  await openLoginPage()
  if (await isLoggedIn()) {
    log('reused existing session')
    return
  }

  await closeStaleDialog()
  await openCertificateDialog()
  await selectCertificate()
  await activateProcess('Google Chrome')
  await sleep(500)

  await focusPasswordField()
  await clearPasswordField()

  const password = await readCertificatePassword()
  await enterPassword(password)

  const entered = await maskedLength()
  const expected = [...password].length
  if (entered !== expected) {
    await cancelDialog()
    throw new Error(`입력된 비밀번호 길이가 달라 제출하지 않았어요: expected=${expected}, actual=${entered}`)
  }
  log(`password verified: length=${entered}`)

  if (DRY_RUN) {
    await cancelDialog()
    log('dry-run: 확인을 누르지 않았어요.')
    return
  }

  // Clicking 확인 spends one of the attempts before lockout, so it is clicked
  // exactly once and never retried on failure.
  await pageScript(inDialog(`
    const ok = doc.querySelector('.okButton');
    if (!ok) return 'no-ok';
    ok.click();
    return 'submitted';
  `))

  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    await sleep(3_000)
    if (await isLoggedIn()) {
      log('logged in')
      return
    }
  }
  throw new Error('KB카드 로그인 상태를 확인하지 못했어요.')
}

run()
  .catch(error => {
    console.error(`[kb-card-login] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
  .finally(async () => {
    for (const suffix of ['.png', '.rgb', '-field.png']) {
      await fs.rm(`${SCRATCH}${suffix}`, { force: true }).catch(() => {})
    }
  })
