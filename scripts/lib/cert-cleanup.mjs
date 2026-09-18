// 인증서 모듈이 띄운 창을 다룬다. 창 정리와 "도중에 뜬 알림 치우기" 둘 다 여기서 한다.
//
// 모듈 창은 Chrome 것이 아니라 별도 프로세스(INISAFECrossWebEXSvc·bizapp 등) 것이라
// Chrome 을 내렸다 올려도 남는다. 그리고 수집 도중에 뜨는 오류 알림은 화면을 덮어
// 그 단계를 타임아웃까지 멈춰 세운다 — 정작 로그에는 "인증서 창이 50초 안에 열리지
// 않았어요" 같은 엉뚱한 이유만 남아서, 무엇이 막았는지 사람이 알 수 없다.
//
// ─ 안전 규칙 ─────────────────────────────────────────────────────────
// 인증서 창에서 "확인"은 절대 누르지 않는다. 확인은 제출이고, 제출은 인증서 5회
// 오류 카운터를 태운다. 5회면 인증서가 잠기고 홈택스까지 함께 멈춘다.
// 취소가 보이면 취소만 누른다. 취소가 창 어디에도 없을 때만 — 즉 단추가 확인뿐인
// 오류 알림일 때만 — 확인을 눌러 치운다.
// ────────────────────────────────────────────────────────────────────
import { execFile } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { appleScript, appleScriptLiteral, captureScreen, click, nativeWindows, ocrScreenshot, sleep } from './desktop.mjs'
import { findOcrText, windowRect } from './cert-dialog.mjs'

const execFileAsync = promisify(execFile)

export const CERT_PROCESSES = [
  'INISAFECrossWebEXSvc', 'bizapp', 'AnySign', 'AnySign.ex',
  'delfino', 'veraport', 'nProtect', 'CrossEXService', 'TouchEn',
]

// 수집이 끝난 뒤 내리는 보안 프로그램. 위 목록은 창을 띄우는 것들이고, 여기에는
// 창 없이 배경에만 사는 것들이 더 있다 — Chrome 을 내려도 이것들은 그대로 남아
// 다음 접속 때까지 떠 있다. 2026-09-18 실측으로 떠 있던 것: AnySign.ex,
// CrossEXService, INISAFECrossWebEXSvc, MagicLine4NX, astxAgent·astxStatus·astxd,
// delfino, veraport. 목록에 없는 이름은 pkill 이 그냥 아무것도 안 하므로,
// 아직 안 만난 모듈도 미리 적어 둔다.
export const SECURITY_PROCESSES = [
  ...CERT_PROCESSES,
  'MagicLine4NX', 'MagicLine4NX.ex',
  'astxAgent', 'astxStatus', 'astxd',
  'WizVera', 'Veraport', 'XecureWeb', 'IPinside', 'Interezen',
  'nProtect Netizen', 'TouchEnKey', 'TouchEnNxKey',
]
const CANCEL_LABELS = ['취소', '취소하기', '닫기', 'Cancel']
const DISMISS_LABELS = ['확인', 'OK']
const SCREENSHOT = path.join(os.tmpdir(), 'willow-cert-cleanup.png')

async function moduleWindows() {
  const found = []
  for (const processName of CERT_PROCESSES) {
    for (const window of await nativeWindows(processName)) {
      if (window.w > 0 && window.h > 0) found.push({ processName, window })
    }
  }
  return found
}

async function screenItems() {
  return ocrScreenshot(await captureScreen(SCREENSHOT))
}

/** 창 안의 글자를 한 줄로 모은다. 알림이 무슨 말을 했는지 로그에 남기려고 읽는다. */
function textWithin(items, rect) {
  return items
    .filter(item => item.x >= rect.x && item.x <= rect.x + rect.w
      && item.y >= rect.y && item.y <= rect.y + rect.h)
    .sort((left, right) => left.y - right.y)
    .map(item => String(item.text ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 200)
}

async function clickAccessibleButton(processName, windowName, label) {
  await appleScript(`tell application "System Events" to tell process ${appleScriptLiteral(processName)}
    click button ${appleScriptLiteral(label)} of window ${appleScriptLiteral(windowName)}
  end tell`)
}

/** 단추를 노출하지 않는 직접 그린 창은 그림을 읽어 글자 자리를 누른다. */
async function clickPaintedLabel(items, rect, label) {
  const match = findOcrText(items, label, { within: rect })
  if (!match) return null
  const point = { x: Math.round(match.x + match.w / 2), y: Math.round(match.y + match.h / 2) }
  await click(point.x, point.y)
  return point
}

function hasCancel(items, rect) {
  return CANCEL_LABELS.some(label => findOcrText(items, label, { within: rect }))
}

async function pressLabel(processName, window, items, labels) {
  const rect = windowRect(window)
  for (const label of labels) {
    try {
      await clickAccessibleButton(processName, window.name || '', label)
      return { label, how: '접근성' }
    } catch { /* 이 창에는 그 이름의 단추가 없다 */ }
    const point = await clickPaintedLabel(items, rect, label)
    if (point) return { label, how: `화면(${point.x},${point.y})` }
  }
  return null
}

/**
 * 단추가 확인뿐인 오류 알림만 눌러 치운다. 취소가 있는 창은 인증서 창이므로
 * 손대지 않는다 — 그건 정리(closeCertDialogs)가 할 일이다.
 *
 * 수집 도중 대기 루프에서 부른다. 무엇이 막았는지 알 수 있게 알림 문구를 돌려준다.
 */
export async function dismissBlockingAlerts() {
  const dismissed = []
  for (const { processName, window } of await moduleWindows()) {
    const items = await screenItems()
    const rect = windowRect(window)
    if (hasCancel(items, rect)) continue
    const message = textWithin(items, rect)
    const pressed = await pressLabel(processName, window, items, DISMISS_LABELS)
    if (pressed) {
      dismissed.push({ process: processName, name: window.name, message })
      await sleep(1_000)
    }
  }
  return dismissed
}

/** 남아 있는 인증서 창을 모두 닫는다. 취소가 있으면 취소, 없으면 알림으로 보고 확인. */
export async function closeCertDialogs({ log = () => {} } = {}) {
  let closed = 0
  for (const { processName, window } of await moduleWindows()) {
    const items = await screenItems()
    const rect = windowRect(window)
    const name = window.name || ''

    const cancel = await pressLabel(processName, window, items, CANCEL_LABELS)
    if (cancel) {
      log(`${processName} "${name}" — ${cancel.label} ${cancel.how} 눌렀어요.`)
      closed += 1
      await sleep(1_000)
      continue
    }

    if (!hasCancel(items, rect)) {
      const message = textWithin(items, rect)
      const dismiss = await pressLabel(processName, window, items, DISMISS_LABELS)
      if (dismiss) {
        log(`${processName} "${name}" — 알림 ${dismiss.label} ${dismiss.how} 눌렀어요.${message ? ` 내용: ${message}` : ''}`)
        closed += 1
        await sleep(1_000)
        continue
      }
    }

    log(`${processName} "${name}" — 닫지 못했어요. pos=(${rect.x},${rect.y}) size=${rect.w}x${rect.h}`)
  }
  return closed
}

/** 그 이름의 프로세스가 떠 있나. pkill 과 같은 -x(이름 정확히 일치) 기준으로 본다. */
async function isRunning(processName) {
  try {
    await execFileAsync('/usr/bin/pgrep', ['-x', processName])
    return true
  } catch {
    return false
  }
}

/**
 * 은행 보안 프로그램을 내린다. 브라우저 창만 닫으면 이것들은 배경에 남는다 —
 * 수집이 다 끝난 뒤에는 인증서 모듈도 같이 꺼져야 한다(CEO 2026-09-18).
 * Chrome 을 먼저 내리고 부를 것. Chrome 이 살아 있으면 페이지가 다시 띄운다.
 */
export async function quitSecurityModules({ log = () => {} } = {}) {
  const stopped = []
  for (const processName of SECURITY_PROCESSES) {
    if (!(await isRunning(processName))) continue
    await execFileAsync('/usr/bin/pkill', ['-x', processName]).catch(() => {})
    // 스스로 정리할 틈을 준다. 그래도 남으면 끊는다 — 남은 모듈이 다음 실행의
    // 인증서 창을 가로챈다.
    for (let i = 0; i < 5; i += 1) {
      if (!(await isRunning(processName))) break
      await sleep(1_000)
    }
    if (await isRunning(processName)) {
      await execFileAsync('/usr/bin/pkill', ['-9', '-x', processName]).catch(() => {})
      await sleep(500)
    }
    stopped.push(processName)
    log(`${processName} 내렸어요.`)
  }
  return stopped
}
