#!/usr/bin/env node
// 사회보험통합징수포털에서 4대보험 **개인별** 산출내역 CSV 를 내려받는다.
// 급여내역(scripts/tensw_payroll_register.py)이 먹는 바로 그 파일이다.
//
//   node scripts/collect-nhis-persons.mjs                 # 조회되는 최신월
//   node scripts/collect-nhis-persons.mjs --month 2026-09
//   node scripts/collect-nhis-persons.mjs --month 2026-09 --out ~/some/dir
//
// 보험마다 고지가 올라오는 날이 다르다. 건강은 16일쯤, 연금·산재는 21~24일쯤이라
// 급여일 무렵에 돌리면 건강만 나오는 달이 흔하다. 없는 보험은 조용히 건너뛰지 않고
// "없음" 으로 찍어 준다 — 급여내역 쪽에서 직전 달 숫자를 이어써야 하기 때문이다.

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { financeIdentity } from './lib/tensw-local-finance.mjs'
import { NHIS_INSURANCES } from './lib/nhis.mjs'
import { ensureNhisLogin, nhisDownloadFromForm, nhisSubmitForm } from './lib/nhis-session.mjs'

const IDENTITY = financeIdentity()

// 보험마다 조회 화면이 따로 있고, 엑셀 주소는 그 화면이 알려 준다.
const SEARCH_ACTION = Object.freeze({
  health: '/jpbc/JpBca00201.do',
  pension: '/jpbc/JpBca00202.do',
  goyong: '/jpbc/JpBca00203.do',
  sanjae: '/jpbc/JpBca00204.do',
})

function argumentValue(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

function log(message) {
  console.log(`[nhis-persons] ${message}`)
}

function parseMonth(value) {
  const match = /^(\d{4})-(\d{1,2})$/.exec(String(value ?? '').trim())
  if (!match) throw new Error(`--month 은 2026-09 꼴이라야 해요: ${value}`)
  return { year: match[1], month: String(Number(match[2])) }
}

function monthLabel({ year, month }) {
  return `${year}${month.padStart(2, '0')}`
}

function previousMonth({ year, month }) {
  const number = Number(month)
  return number > 1
    ? { year, month: String(number - 1) }
    : { year: String(Number(year) - 1), month: '12' }
}

function searchFields(insurance, { year, month }) {
  return {
    popYn: 'N',
    excelYn: 'N',
    noDouble: '',
    hidPageNum: '',
    insuTypeCd: insurance.value,
    returnName: 'list',
    hidWrkgbn: 'S',
    schYyyy: year,
    schMm: month,
    schUnbNo: '-1',
  }
}

async function queryInsurance(insurance, period) {
  return nhisSubmitForm({
    action: SEARCH_ACTION[insurance.id],
    fields: searchFields(insurance, period),
  })
}

// 건강보험이 가장 먼저 올라오므로 "조회되는 최신월" 은 건강 기준으로 찾는다.
async function latestMonthWithData(startFrom, tries = 4) {
  const health = NHIS_INSURANCES.find(insurance => insurance.id === 'health')
  let period = startFrom
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const result = await queryInsurance(health, period)
    if (!result.empty) return period
    log(`${period.year}-${period.month.padStart(2, '0')} 건강보험 자료가 아직 없어요.`)
    period = previousMonth(period)
  }
  throw new Error('최근 넉 달 안에 조회되는 고지가 없어요.')
}

async function run() {
  const requested = process.argv.includes('--month') ? parseMonth(argumentValue('--month')) : null
  const now = new Date()
  const period = requested ?? await latestMonthWithData({
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1),
  })
  const label = monthLabel(period)

  const outDir = path.resolve(argumentValue(
    '--out',
    path.join(os.homedir(), 'logs', `${IDENTITY.company}-local-finance`, 'nhis-persons', label),
  ).replace(/^~(?=$|\/)/, os.homedir()))
  await fs.mkdir(outDir, { recursive: true })

  log(`${period.year}년 ${period.month}월 개인별 산출내역`)

  const collected = []
  const missing = []
  for (const insurance of NHIS_INSURANCES) {
    const result = await queryInsurance(insurance, period)
    if (result.empty || !result.excelAction) {
      log(`${insurance.label}: 없음 (아직 고지가 올라오지 않았어요)`)
      missing.push(insurance.label)
      continue
    }
    const file = await nhisDownloadFromForm({ action: result.excelAction })
    const destination = path.join(outDir, `nhis-${insurance.id}-${label}.csv`)
    await fs.writeFile(destination, file.buffer, { mode: 0o600 })
    log(`${insurance.label}: ${file.buffer.length.toLocaleString()}바이트 → ${path.basename(destination)}`)
    collected.push({
      insurance: insurance.label,
      path: destination,
      // 포털이 붙여 준 이름도 남긴다. 손으로 받은 파일과 같은 것인지 볼 수 있게.
      portal_filename: file.filename,
    })
  }

  const manifest = {
    collected_at: new Date().toISOString(),
    company: IDENTITY.company,
    period: `${period.year}-${period.month.padStart(2, '0')}`,
    files: collected,
    missing,
  }
  await fs.writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 })

  log(`받은 보험 ${collected.length}종, 없는 보험 ${missing.length}종${missing.length ? ` (${missing.join(', ')})` : ''}`)
  log(`saved ${outDir}`)
}

// 로그인은 화면을 쓰지만, 조회·내려받기는 모두 그 탭 안에서 끝난다.
ensureNhisLogin({ company: IDENTITY.company, log })
  .then(run)
  .catch(error => {
    console.error(`[nhis-persons] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
