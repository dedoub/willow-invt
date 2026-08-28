#!/usr/bin/env node
// 공인인증서 모듈이 남긴 창을 닫는다.
//
//   node scripts/close-cert-dialogs.mjs [--print]
//
// 한 단계가 인증서 창을 띄운 채로 죽으면 그 창이 화면 한복판에 남아 다음 단계를
// 막는다. Chrome 을 내렸다 올려도 소용없다 — 이 창들은 Chrome 것이 아니라 별도
// 모듈 프로세스(INISAFECrossWebEXSvc·bizapp 등) 것이다. 2026-08-29 에 신한은행
// 인증서선택 창이 남아 재실행 자체를 막았고, 우리카드가 커밋에 실패하고 남긴 창
// 때문에 그 다음 묶음이 탭조차 열지 못했다.
//
// 창을 닫는 길이 둘인 이유: 신한은행 인증서선택 창은 접근성 API 로 단추가 보이지만,
// 우리카드가 쓰는 bizapp "Form" 은 단추를 하나도 노출하지 않는 직접 그린 창이라
// 화면을 읽어야만 취소를 찾을 수 있다.
//
// ─ 안전 규칙 ─────────────────────────────────────────────────────────
// 인증서 창에서 "확인"은 절대 누르지 않는다. 확인은 제출이고, 제출은 인증서 5회
// 오류 카운터를 태운다. 5회면 인증서가 잠기고 홈택스까지 함께 멈춘다.
// 취소가 보이면 취소만 누른다. 확인만 있고 취소가 없는 창은 이미 떠 버린 오류
// 알림이라 눌러서 치우는 게 맞다.
// ────────────────────────────────────────────────────────────────────
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { appleScript, appleScriptLiteral, captureScreen, click, nativeWindows, ocrScreenshot, sleep } from './lib/desktop.mjs'
import { findOcrText, windowRect } from './lib/cert-dialog.mjs'

const PROCESSES = [
  'INISAFECrossWebEXSvc', 'bizapp', 'AnySign', 'AnySign.ex',
  'delfino', 'veraport', 'nProtect', 'CrossEXService', 'TouchEn',
]
const CANCEL_LABELS = ['취소', '취소하기', '닫기', 'Cancel']
const DISMISS_LABELS = ['확인', 'OK']
const SCREENSHOT = path.join(os.tmpdir(), 'willow-cert-cleanup.png')

function log(message) {
  console.log(`[cert-cleanup] ${message}`)
}

/** 접근성 API 로 이름 붙은 단추를 누른다. 신한은행 인증서선택 창이 이 길로 닫힌다. */
async function clickAccessibleButton(processName, windowName, label) {
  await appleScript(`tell application "System Events" to tell process ${appleScriptLiteral(processName)}
    click button ${appleScriptLiteral(label)} of window ${appleScriptLiteral(windowName)}
  end tell`)
  return true
}

/** 단추를 노출하지 않는 창은 그림을 읽어 글자 자리를 누른다. */
async function clickPaintedButton(rect, label) {
  const items = await ocrScreenshot(await captureScreen(SCREENSHOT))
  const match = findOcrText(items, label, { within: rect })
  if (!match) return null
  const point = { x: Math.round(match.x + match.w / 2), y: Math.round(match.y + match.h / 2) }
  await click(point.x, point.y)
  return point
}

/** 이 창에 취소가 있는가. 있으면 확인은 건드리지 않는다. */
async function hasCancel(rect) {
  const items = await ocrScreenshot(await captureScreen(SCREENSHOT))
  return CANCEL_LABELS.some(label => findOcrText(items, label, { within: rect }))
}

async function closeWindow(processName, window) {
  const rect = windowRect(window)
  const name = window.name || ''

  for (const label of CANCEL_LABELS) {
    try {
      await clickAccessibleButton(processName, name, label)
      log(`${processName} "${name}" — 취소(${label}) 눌렀어요.`)
      return true
    } catch { /* 이 창에는 그 이름의 단추가 없다 */ }
  }

  for (const label of CANCEL_LABELS) {
    const point = await clickPaintedButton(rect, label)
    if (point) {
      log(`${processName} "${name}" — 화면에서 ${label}(${point.x},${point.y}) 눌렀어요.`)
      return true
    }
  }

  // 취소가 어디에도 없을 때만 확인을 본다. 오류 알림은 확인 말고 닫을 길이 없다.
  if (!await hasCancel(rect)) {
    for (const label of DISMISS_LABELS) {
      try {
        await clickAccessibleButton(processName, name, label)
        log(`${processName} "${name}" — 알림 ${label} 눌렀어요.`)
        return true
      } catch { /* 계속 */ }
      const point = await clickPaintedButton(rect, label)
      if (point) {
        log(`${processName} "${name}" — 화면에서 알림 ${label}(${point.x},${point.y}) 눌렀어요.`)
        return true
      }
    }
  }

  log(`${processName} "${name}" — 닫지 못했어요. pos=(${rect.x},${rect.y}) size=${rect.w}x${rect.h}`)
  return false
}

async function run() {
  let closed = 0
  for (const processName of PROCESSES) {
    const windows = await nativeWindows(processName)
    for (const window of windows) {
      if (await closeWindow(processName, window)) {
        closed += 1
        await sleep(1_000)
      }
    }
  }
  if (closed > 0) log(`인증서 창 ${closed}개를 닫았어요.`)
}

run().catch(error => {
  // 정리에 실패해도 수집을 죽일 이유는 없다. 다음 단계가 알아서 넘어진다.
  log(error instanceof Error ? error.message : String(error))
})
