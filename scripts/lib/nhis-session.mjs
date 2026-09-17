// 사회보험통합징수포털(si4n) 세션과 페이지 안에서의 폼 전송.
//
// 이 포털은 화면마다 alert() 를 띄운다. 화면 전환으로 조회하면 그 alert 가 Apple
// Event 를 막아 자동화가 통째로 멈추므로, 여기서는 페이지를 넘기지 않고 로그인된
// 탭 안에서 fetch 로 폼을 전송한다. 응답은 window 에 담아 두고 필요한 만큼만
// 꺼내 온다 — 조회 HTML 은 70KB 가 넘어 통째로 가져올 이유가 없다.

import { execFile } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { certSite } from './cert-sites.mjs'
import { LOGOUT_SCRIPT, PAGE_TEXT_SCRIPT, SESSION_STATE, sessionState } from './finance-session.mjs'
import { chromeJavascript, chromeTabState, openChromeTab, positionChromeWindow, sleep } from './desktop.mjs'

const execFileAsync = promisify(execFile)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

export const NHIS_SITE = certSite('nhis')
export const NHIS_HOST = new URL(NHIS_SITE.url).host

export async function nhisPageScript(javascript) {
  const output = await chromeJavascript(javascript, { host: NHIS_HOST })
  if (output === 'missing') throw new Error('사회보험 포털 탭을 찾지 못했어요.')
  return output
}

// 로그인 여부가 아니라 "누구로" 로그인됐는지를 본다. 공용 포털이라 다른 회사
// 세션이 살아 있으면 그 회사 데이터를 우리 회사 이름으로 적재하게 된다.
async function currentSessionState(company) {
  const text = await nhisPageScript(PAGE_TEXT_SCRIPT).catch(() => '')
  return sessionState(text, company)
}

async function signOutOther(log) {
  log('다른 회사 세션이 열려 있어 로그아웃해요.')
  await nhisPageScript(LOGOUT_SCRIPT).catch(() => {})
  await sleep(6_000)
  await openChromeTab(NHIS_SITE.url, NHIS_HOST)
  await sleep(6_000)
}

export async function ensureNhisLogin({ company, log = () => {} }) {
  const existing = await chromeTabState(NHIS_HOST)
  if (!existing.url) {
    await openChromeTab(NHIS_SITE.url, NHIS_HOST)
    await sleep(6_000)
  }
  await positionChromeWindow(NHIS_HOST)
  await sleep(2_000)

  const state = await currentSessionState(company)
  if (state === SESSION_STATE.ours) {
    log('reused existing session')
    return
  }
  if (state === SESSION_STATE.other) await signOutOther(log)

  await execFileAsync('/opt/homebrew/bin/node', [path.join(ROOT, 'scripts', 'login-nhis-si4n.mjs')], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  })

  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    await sleep(3_000)
    if (await currentSessionState(company) === SESSION_STATE.ours) {
      log('logged in')
      return
    }
  }
  throw new Error('사회보험 로그인 상태를 확인하지 못했어요.')
}

async function waitForSlot(slot, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await sleep(1_000)
    const state = await nhisPageScript(`(window.${slot} && window.${slot}.state) || 'absent'`)
    if (state === 'done') return
    if (state === 'error') {
      const message = await nhisPageScript(`window.${slot}.message || ''`)
      throw new Error(`포털 요청이 실패했어요: ${message}`)
    }
  }
  throw new Error('포털 응답을 기다리다 시간이 지났어요.')
}

/**
 * 폼을 전송하고 응답 HTML 을 탭 안에 남긴다. HTML 자체는 돌려주지 않는다.
 * 돌아오는 것은 조회 결과가 있었는지와, 그 화면이 쓰는 엑셀 내려받기 주소다.
 */
export async function nhisSubmitForm({ action, fields, slot = '__nhisPage', timeoutMs = 60_000 }) {
  const sent = await nhisPageScript(`(() => { try {
    const body = new URLSearchParams(${JSON.stringify(fields)});
    window.${slot} = { state: 'pending' };
    fetch(${JSON.stringify(action)}, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      credentials: 'same-origin',
    }).then(response => response.text()).then(text => {
      const excel = text.match(/fn_excelDown3[\\s\\S]{0,400}?document\\.frm\\.action\\s*=\\s*"([^"]+)"/);
      window.${slot} = {
        state: 'done',
        html: text,
        // 자료가 없는 달이면 포털이 조회·내려받기 함수 첫 줄에 이 안내를 심어 둔다.
        empty: text.indexOf('조회된 내역이 없습니다') >= 0,
        excelAction: excel ? excel[1] : '',
      };
    }).catch(error => { window.${slot} = { state: 'error', message: String(error && error.message || error) }; });
    return 'sent';
  } catch (error) { return 'throw:' + error.message } })()`)
  if (sent !== 'sent') throw new Error(`포털 요청을 보내지 못했어요: ${sent}`)

  await waitForSlot(slot, timeoutMs)
  const summary = await nhisPageScript(`(() => {
    const slot = window.${slot};
    return JSON.stringify({ empty: slot.empty, excelAction: slot.excelAction, length: slot.html.length });
  })()`)
  return JSON.parse(summary)
}

const CHUNK = 60_000

/**
 * 직전 조회 화면의 폼을 그대로 다시 부치되 excelYn 만 Y 로 바꾼다. 화면이 채워
 * 넣은 사업장기호·고지년월·차수가 그 폼 안에 들어 있어서, 우리가 지어낼 필요가 없다.
 */
export async function nhisDownloadFromForm({ action, slot = '__nhisPage', fileSlot = '__nhisFile', timeoutMs = 90_000 }) {
  const sent = await nhisPageScript(`(() => { try {
    const document_ = new DOMParser().parseFromString(window.${slot}.html, 'text/html');
    const form = document_.forms['frm'];
    if (!form) return 'no-form';
    const body = new URLSearchParams();
    for (let index = 0; index < form.elements.length; index += 1) {
      const element = form.elements[index];
      if (!element.name) continue;
      if ((element.type === 'radio' || element.type === 'checkbox') && !element.checked) continue;
      body.append(element.name, element.value);
    }
    body.set('excelYn', 'Y');
    body.set('popYn', 'N');
    window.${fileSlot} = { state: 'pending' };
    fetch(${JSON.stringify(action)}, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      credentials: 'same-origin',
    }).then(async response => {
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = '';
      for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
      window.${fileSlot} = {
        state: 'done',
        name: response.headers.get('content-disposition') || '',
        type: response.headers.get('content-type') || '',
        base64: btoa(binary),
      };
    }).catch(error => { window.${fileSlot} = { state: 'error', message: String(error && error.message || error) }; });
    return 'sent';
  } catch (error) { return 'throw:' + error.message } })()`)
  if (sent !== 'sent') throw new Error(`엑셀 내려받기를 보내지 못했어요: ${sent}`)

  await waitForSlot(fileSlot, timeoutMs)

  // AppleScript 로 한 번에 끌어올 수 있는 문자열에는 한계가 있다. 나눠 받는다.
  const meta = JSON.parse(await nhisPageScript(`(() => {
    const slot = window.${fileSlot};
    return JSON.stringify({ name: slot.name, type: slot.type, length: slot.base64.length });
  })()`))
  let base64 = ''
  for (let offset = 0; offset < meta.length; offset += CHUNK) {
    base64 += await nhisPageScript(`window.${fileSlot}.base64.slice(${offset}, ${offset + CHUNK})`)
  }
  const filename = /filename=([^;]+)/.exec(meta.name)?.[1]?.trim().replace(/"/g, '') ?? ''
  return { buffer: Buffer.from(base64, 'base64'), filename, contentType: meta.type }
}
