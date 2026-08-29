#!/usr/bin/env node

import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import {
  shouldExpandWooriCardRows,
  validateWooriCardPayload,
} from './lib/woori-card-local.mjs'

const execFileAsync = promisify(execFile)
const ARTIFACT_DIR = path.join(os.homedir(), 'logs', 'tensw-local-finance')
const OUTPUT_PATH = path.join(ARTIFACT_DIR, 'latest-woori-card-approvals.json')

function appleScriptLiteral(value) {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

function extractionJavascript() {
  const bridgeId = `willy-woori-card-${Date.now()}`
  const pageContextJavascript = `(() => {
    const target = document.getElementById(${JSON.stringify(bridgeId)});
    try {
      const rows = H2BCV204S01.variable.dataList.map(({ CD_NO_16, ...row }) => row);
      const numberText = value => Number(String(value || '').replace(/[^0-9-]/g, '')) || 0;
      target.value = JSON.stringify({
        source: 'woori-local-chrome',
        source_url: location.href,
        // collected_at — 다른 수집기와 같은 이름을 쓴다. 여기만 captured_at 이라
        // 알림의 신선도 검사(collectionGaps)가 값을 못 찾아, 매일 정상 수집하고도
        // "오늘 못 가져온 항목: 우리카드 승인내역"이 붙어 나갔다(08-30 확인).
        collected_at: new Date().toISOString(),
        search_date: document.getElementById('searchDate')?.innerText || '',
        ui_count: numberText(document.getElementById('totCn')?.innerText),
        ui_net_krw_amount: numberText(document.getElementById('apvAm')?.innerText),
        rows,
      });
    } catch (error) {
      target.value = JSON.stringify({ error: String(error?.message || error) });
    }
  })()`

  return `(() => {
    const existing = document.getElementById(${JSON.stringify(bridgeId)});
    if (existing) existing.remove();
    const bridge = document.createElement('textarea');
    bridge.id = ${JSON.stringify(bridgeId)};
    bridge.hidden = true;
    document.body.appendChild(bridge);
    const script = document.createElement('script');
    script.textContent = ${JSON.stringify(pageContextJavascript)};
    document.documentElement.appendChild(script);
    script.remove();
    const output = bridge.value;
    bridge.remove();
    return output;
  })()`
}

function moreRowsJavascript(clickMore = false) {
  const bridgeId = `willy-woori-card-more-${Date.now()}`
  const pageContextJavascript = `(() => {
    const target = document.getElementById(${JSON.stringify(bridgeId)});
    try {
      const more = document.getElementById('btnMore');
      const moreVisible = Boolean(more && more.offsetParent !== null && getComputedStyle(more).display !== 'none');
      if (${JSON.stringify(clickMore)} && moreVisible) more.click();
      target.value = JSON.stringify({
        rowCount: H2BCV204S01.variable.dataList.length,
        moreVisible,
      });
    } catch (error) {
      target.value = JSON.stringify({ error: String(error?.message || error) });
    }
  })()`

  return `(() => {
    const bridge = document.createElement('textarea');
    bridge.id = ${JSON.stringify(bridgeId)};
    bridge.hidden = true;
    document.body.appendChild(bridge);
    const script = document.createElement('script');
    script.textContent = ${JSON.stringify(pageContextJavascript)};
    document.documentElement.appendChild(script);
    script.remove();
    const output = bridge.value;
    bridge.remove();
    return output;
  })()`
}

function chromeAppleScript() {
  const javascript = appleScriptLiteral(extractionJavascript().replace(/\s+/g, ' '))
  return `tell application "Google Chrome"
  repeat with chromeWindow in windows
    repeat with chromeTab in tabs of chromeWindow
      if (URL of chromeTab) contains "H2BCV204S01.do" and (title of chromeTab) contains "이용내역" then
        return execute chromeTab javascript ${javascript}
      end if
    end repeat
  end repeat
  return "{\\"error\\":\\"로그인된 우리카드 이용내역 탭을 찾지 못했어요.\\"}"
end tell`
}

function cardJavascriptAppleScript(javascript) {
  const source = appleScriptLiteral(javascript.replace(/\s+/g, ' '))
  return `tell application "Google Chrome"
  repeat with chromeWindow in windows
    repeat with chromeTab in tabs of chromeWindow
      if (URL of chromeTab) contains "H2BCV204S01.do" and (title of chromeTab) contains "이용내역" then
        return execute chromeTab javascript ${source}
      end if
    end repeat
  end repeat
  return "{\\"error\\":\\"로그인된 우리카드 이용내역 탭을 찾지 못했어요.\\"}"
end tell`
}

function queryAppleScript(startDate, endDate) {
  const javascript = appleScriptLiteral(`(() => {
    const setValue = (id, value) => {
      const element = document.getElementById(id);
      if (!element) return false;
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };
    const allCards = document.getElementById('inqDisAll');
    const search = document.getElementById('btnSearch');
    if (!allCards || !search) return 'controls-missing';
    allCards.click();
    if (!setValue('inqStaDy8', ${JSON.stringify(startDate)}) || !setValue('inqEndDy8', ${JSON.stringify(endDate)})) {
      return 'dates-missing';
    }
    search.click();
    return 'clicked';
  })()`)
  return `tell application "Google Chrome"
  repeat with chromeWindow in windows
    repeat with chromeTab in tabs of chromeWindow
      if (URL of chromeTab) contains "H2BCV204S01.do" and (title of chromeTab) contains "이용내역" then
        return execute chromeTab javascript ${javascript}
      end if
    end repeat
  end repeat
  return "tab-missing"
end tell`
}

function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}.${month}.${day}`
}

async function runQuery() {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 13)
  const { stdout } = await execFileAsync('/usr/bin/osascript', [
    '-e', queryAppleScript(formatDate(start), formatDate(end)),
  ], { encoding: 'utf8' })
  const result = stdout.trim()
  if (result !== 'clicked') throw new Error(`우리카드 최근 14일 조회를 실행하지 못했어요: ${result}`)
  await new Promise(resolve => setTimeout(resolve, 5_000))
}

async function readMoreRowsState(clickMore = false) {
  const { stdout } = await execFileAsync('/usr/bin/osascript', [
    '-e', cardJavascriptAppleScript(moreRowsJavascript(clickMore)),
  ], { encoding: 'utf8' })
  const state = JSON.parse(stdout.trim())
  if (state.error) throw new Error(state.error)
  return state
}

async function expandAllRows() {
  let previousState = null
  for (let page = 0; page < 20; page += 1) {
    const state = await readMoreRowsState()
    if (!shouldExpandWooriCardRows(state, previousState)) {
      if (state.moreVisible) throw new Error('우리카드 더보기 후 승인 행이 증가하지 않았어요.')
      return
    }

    previousState = state
    await readMoreRowsState(true)
    const deadline = Date.now() + 5_000
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 500))
      const nextState = await readMoreRowsState()
      if (!nextState.moreVisible || nextState.rowCount > state.rowCount) break
    }
  }
  throw new Error('우리카드 더보기 반복 횟수가 안전 한도를 초과했어요.')
}

async function run() {
  await runQuery()
  await expandAllRows()
  const { stdout } = await execFileAsync('/usr/bin/osascript', ['-e', chromeAppleScript()], {
    encoding: 'utf8',
    maxBuffer: 5 * 1024 * 1024,
  })
  const payload = JSON.parse(stdout.trim())
  if (payload.error) throw new Error(payload.error)

  const summary = validateWooriCardPayload(payload)
  await fs.mkdir(ARTIFACT_DIR, { recursive: true })
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify({ ...payload, summary }, null, 2)}\n`, { mode: 0o600 })
  console.log(
    `[woori-card-collect] raw=${summary.raw_count}, effective=${summary.effective_count}, `
    + `net=${summary.net_krw_amount}, output=${OUTPUT_PATH}`,
  )
}

run().catch(error => {
  console.error(`[woori-card-collect] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
