import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { countKstDailyReviewnotesActivations } from '../reviewnotes-activation-alert'
import { getProductCeoReportConfig } from '../product-ceo-report-config'

const ROOT = '/Volumes/PRO-G40/app-dev/willow-invt'

test('ReviewNotes 활성화 알림은 KST 당일 첫 활성화만 누적한다', () => {
  const rows = [
    { first_problem_at: '2026-08-31T15:01:00.000Z' },
    { first_problem_at: '2026-09-01T02:57:00.000Z' },
    { first_problem_at: '2026-08-31T14:59:59.000Z' },
    { first_problem_at: 'invalid' },
  ]

  assert.equal(countKstDailyReviewnotesActivations(rows, new Date('2026-09-01T02:42:00.000Z')), 2)
})

test('ReviewNotes와 Scripta CEO 리포트는 서로 다른 프롬프트·로그·스케줄을 쓴다', () => {
  const reviewnotes = getProductCeoReportConfig('reviewnotes')
  const scripta = getProductCeoReportConfig('scripta')

  assert.equal(reviewnotes.projectId, 'kumaqaizejnjrvfqhahu')
  assert.equal(reviewnotes.threadProject, 'review-notes')
  assert.equal(reviewnotes.scheduleMinute, 10)
  assert.equal(scripta.projectId, 'xmlbtykkgozxmjkyshfz')
  assert.equal(scripta.threadProject, 'scripta')
  assert.equal(scripta.scheduleMinute, 20)
  assert.notEqual(reviewnotes.promptPath, scripta.promptPath)
  assert.notEqual(reviewnotes.logDir, scripta.logDir)
})

test('각 앱 프롬프트는 앱 고유 활성화·잔존·오류·추적 기준을 갖는다', () => {
  const reviewnotesPrompt = readFileSync(`${ROOT}/scripts/reviewnotes-ceo-report-prompt.md`, 'utf8')
  const scriptaPrompt = readFileSync(`${ROOT}/scripts/scripta-ceo-report-prompt.md`, 'utf8')

  for (const section of ['신규가입·활성화', '잔존·핵심행동', '결제·전환', '로그·오류', '추적 이슈']) {
    assert.match(reviewnotesPrompt, new RegExp(section))
    assert.match(scriptaPrompt, new RegExp(section))
  }
  assert.match(reviewnotesPrompt, /n\."origin" is null/i)
  assert.match(reviewnotesPrompt, /"StudyResult"/)
  assert.match(scriptaPrompt, /scripta_texts/)
  assert.match(scriptaPrompt, /scripta_attempts/)
  assert.match(scriptaPrompt, /title ilike 'Scripta%'/i)
  assert.match(reviewnotesPrompt, /📊 ReviewNotes 리포트/)
  assert.match(scriptaPrompt, /📊 Scripta 리포트/)
})

test('launchd는 외장 볼륨 안전 실행기로 앱별 리포트를 아침·저녁에 분리 실행한다', () => {
  const cases = [
    { file: 'com.willow.reviewnotes-ceo-report.plist', product: 'reviewnotes', minute: 10 },
    { file: 'com.willow.scripta-ceo-report.plist', product: 'scripta', minute: 20 },
  ]

  for (const item of cases) {
    const plist = readFileSync(`${ROOT}/scripts/${item.file}`, 'utf8')
    assert.match(plist, /\/Users\/dongwookkim\/scripts\/drive-launcher\.sh/)
    assert.match(plist, /<key>WorkingDirectory<\/key>\s*<string>\/Users\/dongwookkim<\/string>/)
    assert.match(plist, new RegExp(`<string>${item.product}</string>`))
    assert.match(plist, /<key>Hour<\/key><integer>9<\/integer>/)
    assert.match(plist, /<key>Hour<\/key><integer>21<\/integer>/)
    assert.match(plist, new RegExp(`<key>Minute</key><integer>${item.minute}</integer>`))
  }
})
