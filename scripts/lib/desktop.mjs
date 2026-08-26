// Thin wrappers around the macOS tools the certificate automation needs.
// Everything works in logical points on a 1920x1080 desktop; screenshots are
// captured at native retina size and rescaled once so both agree.

import { execFile } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { parseNativeWindows } from './cert-dialog.mjs'

const execFileAsync = promisify(execFile)

export const LOGICAL_WIDTH = 1920
export const LOGICAL_HEIGHT = 1080

const CLICLICK = process.env.FINANCE_CLICLICK || '/opt/homebrew/bin/cliclick'
const MAGICK = process.env.FINANCE_MAGICK || '/opt/homebrew/bin/magick'
export const OCR_HELPER = process.env.FINANCE_OCR_HELPER
  || path.join(os.homedir(), '.willow', 'runtime', 'tensw-local-finance', 'bin', 'ocr-region')
const INPUT_SOURCE_HELPER = process.env.FINANCE_INPUT_SOURCE_HELPER
  || path.join(os.homedir(), '.willow', 'runtime', 'tensw-local-finance', 'bin', 'select-abc-input-source')

export function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

export function appleScriptLiteral(value) {
  return `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

// trim is off wherever leading whitespace carries meaning: a window with no name
// starts its line with the tab that separates it from the first coordinate.
export async function appleScript(source, { trim = true } = {}) {
  const { stdout } = await execFileAsync('/usr/bin/osascript', ['-e', source], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  })
  return trim ? stdout.trim() : stdout
}

// Chrome runs Apple Event JavaScript in an isolated world: the page's own
// globals are invisible, but the DOM is shared, so drive elements, not scripts.
export async function chromeJavascript(javascript, { host } = {}) {
  const body = `return execute chromeTab javascript ${appleScriptLiteral(javascript)}`
  if (!host) {
    return appleScript(`tell application "Google Chrome" to tell front window to return execute (tab (active tab index)) javascript ${appleScriptLiteral(javascript)}`)
  }
  return appleScript(`tell application "Google Chrome"
  repeat with chromeWindow in windows
    repeat with chromeTab in tabs of chromeWindow
      if (URL of chromeTab) contains ${appleScriptLiteral(host)} then
        ${body}
      end if
    end repeat
  end repeat
  return "missing"
end tell`)
}

export async function chromeTabState(host) {
  const output = await appleScript(`tell application "Google Chrome"
  repeat with chromeWindow in windows
    repeat with chromeTab in tabs of chromeWindow
      if (URL of chromeTab) contains ${appleScriptLiteral(host)} then
        return (URL of chromeTab) & linefeed & (title of chromeTab)
      end if
    end repeat
  end repeat
  return "missing"
end tell`)
  if (output === 'missing') return { url: '', title: '' }
  const [url = '', title = ''] = output.split('\n')
  return { url, title }
}

export async function openChromeTab(url, host) {
  const state = await chromeTabState(host)
  if (state.url) {
    await appleScript(`tell application "Google Chrome"
  repeat with chromeWindow in windows
    repeat with chromeTab in tabs of chromeWindow
      if (URL of chromeTab) contains ${appleScriptLiteral(host)} then
        set URL of chromeTab to ${appleScriptLiteral(url)}
        set index of chromeWindow to 1
        return "navigated"
      end if
    end repeat
  end repeat
end tell`)
    return
  }
  await appleScript(`tell application "Google Chrome"
  activate
  if (count of windows) is 0 then make new window
  tell front window to make new tab with properties {URL:${appleScriptLiteral(url)}}
end tell`)
}

// The certificate dialogs render at fixed pixel sizes, so the browser window is
// pinned to a known geometry before any coordinate is resolved.
export async function positionChromeWindow(host) {
  // The trigger has to run in the visible tab: a background tab still receives
  // the click, but the module draws its dialog for the foreground page only.
  await appleScript(`tell application "Google Chrome"
  repeat with chromeWindow in windows
    repeat with tabIndex from 1 to (count of tabs of chromeWindow)
      if (URL of tab tabIndex of chromeWindow) contains ${appleScriptLiteral(host)} then
        set bounds of chromeWindow to {0, 0, ${LOGICAL_WIDTH}, ${LOGICAL_HEIGHT}}
        set active tab index of chromeWindow to tabIndex
        set index of chromeWindow to 1
        activate
        return "positioned"
      end if
    end repeat
  end repeat
end tell`)
  await sleep(600)
}

export async function nativeWindows(processName) {
  const output = await appleScript(`tell application "System Events"
  if not (exists process ${appleScriptLiteral(processName)}) then return ""
  tell process ${appleScriptLiteral(processName)}
    set output to ""
    repeat with targetWindow in windows
      set windowPosition to position of targetWindow
      set windowSize to size of targetWindow
      set output to output & (name of targetWindow) & tab & (item 1 of windowPosition as text) & tab & (item 2 of windowPosition as text) & tab & (item 1 of windowSize as text) & tab & (item 2 of windowSize as text) & linefeed
    end repeat
    return output
  end tell
end tell`, { trim: false }).catch(() => '')
  return parseNativeWindows(output)
}

export async function waitForNativeWindow(processName, windowName, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const match = (await nativeWindows(processName)).find(window => window.name === windowName)
    if (match && match.w > 0 && match.h > 0) return match
    await sleep(500)
  }
  throw new Error(`${processName}의 "${windowName}" 창이 열리지 않았어요.`)
}

export async function activateProcess(processName) {
  await appleScript(`tell application "System Events" to tell process ${appleScriptLiteral(processName)} to set frontmost to true`)
    .catch(() => {})
  await sleep(400)
}

export async function click(x, y, presses = 1) {
  await execFileAsync(CLICLICK, Array.from({ length: presses }, () => `c:${x},${y}`))
}

// A Korean input source swallows or transliterates every synthetic keystroke,
// so the layout is forced to ABC before anything is typed.
export async function selectEnglishInputSource() {
  await execFileAsync(INPUT_SOURCE_HELPER, [])
}

export async function typeText(text) {
  await selectEnglishInputSource()
  await execFileAsync(CLICLICK, [`t:${text}`])
}

export async function pressKey(key, times = 1) {
  await execFileAsync(CLICLICK, Array.from({ length: times }, () => `kp:${key}`))
}

export async function captureScreen(destination) {
  await execFileAsync('/usr/sbin/screencapture', ['-x', destination])
  return destination
}

// Native pixels rescaled to the logical desktop so pixel maths and cliclick
// coordinates share one space.
export async function captureLogicalRgb(destination) {
  await captureScreen(destination)
  const { stdout } = await execFileAsync(MAGICK, [
    destination,
    '-resize', `${LOGICAL_WIDTH}x${LOGICAL_HEIGHT}!`,
    '-depth', '8',
    'rgb:-',
  ], { encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 })
  return stdout
}

export async function ocrScreenshot(imagePath) {
  const { stdout } = await execFileAsync(OCR_HELPER, [imagePath], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, OCR_LOGICAL_WIDTH: String(LOGICAL_WIDTH) },
  })
  return JSON.parse(stdout)
}

export async function captureAndRead(destination) {
  await captureScreen(destination)
  return ocrScreenshot(destination)
}

// Screen rectangle of a page element, in the same logical points cliclick uses.
// window.screenY is the window top, so the browser chrome above the viewport has
// to be added before a DOM rect means anything on screen.
// The selector may list several candidates: modules such as AnySign keep one
// password box per mode in the DOM and show only the one in use.
export async function chromeElementRect(host, selector) {
  const output = await chromeJavascript(`(() => {
    const element = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find(candidate => {
        const box = candidate.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      });
    if (!element) return 'missing';
    const rect = element.getBoundingClientRect();
    const viewportTop = window.screenY + (window.outerHeight - window.innerHeight);
    return JSON.stringify({
      x: Math.round(window.screenX + rect.left),
      y: Math.round(viewportTop + rect.top),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
    });
  })()`, { host })
  if (!output || output === 'missing' || output === 'hidden' || output === 'missing tab') return null
  return JSON.parse(output)
}

export function rectCenter(rect) {
  return { x: Math.round(rect.x + rect.w / 2), y: Math.round(rect.y + rect.h / 2) }
}

// Pastes instead of typing. Some certificate modules intercept synthesized
// keystrokes at a low level and record something other than what was sent, and a
// paste goes through the pasteboard instead. The clipboard is cleared right
// after so the password does not linger there.
export async function pasteText(text) {
  const copy = execFile('/usr/bin/pbcopy')
  copy.stdin.end(text)
  await new Promise((resolve, reject) => {
    copy.on('close', resolve)
    copy.on('error', reject)
  })
  try {
    await execFileAsync(CLICLICK, ['kd:cmd', 't:v', 'ku:cmd'])
  } finally {
    const clear = execFile('/usr/bin/pbcopy')
    clear.stdin.end('')
    await new Promise(resolve => clear.on('close', resolve))
  }
}

// The secure keypads drop a click that lands immediately after the pointer jumps
// to a new tile, and issuing the move as a separate cliclick invocation does not
// help — the wait has to happen inside the same run. Easing makes the pointer
// travel to the tile the way a hand would instead of teleporting onto it.
export async function clickSettled(x, y, { settleMs = 120, easing = 30 } = {}) {
  await execFileAsync(CLICLICK, ['-e', String(easing), `m:${x},${y}`, `w:${settleMs}`, `c:${x},${y}`])
}

export async function pressReturn() {
  await execFileAsync(CLICLICK, ['kp:return'])
}

// Press and hold, then release, with the pointer already resting on the target.
// Some keypad tiles ignore an instantaneous click but accept a held press.
export async function clickHeld(x, y, { settleMs = 200, holdMs = 140, easing = 30 } = {}) {
  await execFileAsync(CLICLICK, [
    '-e', String(easing),
    `m:${x},${y}`, `w:${settleMs}`,
    `dd:${x},${y}`, `w:${holdMs}`,
    `du:${x},${y}`,
  ])
}

// WebSquare menus ignore a DOM click from the Apple Event isolated world, so
// menu items are found on screen by their label and clicked for real.
export async function clickScreenText(label, { within, settleMs = 150 } = {}) {
  const { buttonPoint } = await import('./cert-dialog.mjs')
  const shot = path.join(os.tmpdir(), 'willow-screen-text.png')
  const items = await ocrScreenshot(await captureScreen(shot))
  const point = buttonPoint(items, label, { within })
  await clickSettled(point.x, point.y, { settleMs })
  return point
}

// Finds an element by its exact label through the DOM, then clicks where it
// actually sits on screen. WebSquare ignores a DOM click from the Apple Event
// isolated world, but reading geometry from the DOM avoids the ambiguity OCR
// runs into when the same word appears in a breadcrumb and a menu.
export async function clickPageText(label, { host, nth = 0 } = {}) {
  const output = await chromeJavascript(`(() => {
    const shown = element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const matches = [...document.querySelectorAll('a,button,span,li,div,input[type=button]')]
      .filter(shown)
      .filter(element => ((element.innerText ?? element.value ?? '').trim()) === ${JSON.stringify(label)})
      .sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return (ra.width * ra.height) - (rb.width * rb.height);
      });
    const element = matches[${Number(nth)}];
    if (!element) return 'missing';
    const rect = element.getBoundingClientRect();
    const viewportTop = window.screenY + (window.outerHeight - window.innerHeight);
    return JSON.stringify({
      x: Math.round(window.screenX + rect.left + rect.width / 2),
      y: Math.round(viewportTop + rect.top + rect.height / 2),
      count: matches.length,
    });
  })()`, { host })

  if (!output || output === 'missing' || output === 'missing tab') {
    throw new Error(`화면에서 "${label}" 항목을 찾지 못했어요.`)
  }
  const point = JSON.parse(output)
  await clickSettled(point.x, point.y)
  return point
}

// Same idea as clickPageText, addressed by element id where the page gives a
// stable one.
export async function clickPageElement(selector, { host } = {}) {
  const rect = await chromeElementRect(host, selector)
  if (!rect) throw new Error(`화면에서 "${selector}" 요소를 찾지 못했어요.`)
  const point = rectCenter(rect)
  await clickSettled(point.x, point.y)
  return point
}
