#!/usr/bin/env node
// 재무 자동화 결과를 CEO 봇으로 보낸다.
//
//   node scripts/notify-local-finance.mjs --company willow --status ok
//   node scripts/notify-local-finance.mjs --company tensw --status fail --step "신한은행 수집"
//   node scripts/notify-local-finance.mjs --company willow --status ok --print
//
// --print 는 보내지 않고 메시지만 찍는다.

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { financeCompany } from './lib/tensw-local-finance.mjs'
import { notifyMessage } from './lib/finance-notify.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true })

function argument(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : null
}

async function ceoChatId(url, key) {
  const response = await fetch(
    `${url}/rest/v1/telegram_conversations?bot_type=eq.ceo&select=chat_id&order=updated_at.desc&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  )
  if (!response.ok) throw new Error(`CEO 대화를 찾지 못했어요: ${response.status}`)
  const rows = await response.json()
  return rows[0]?.chat_id ?? null
}

/** 오늘 0시(현지) 이후. 러너가 새벽에 도니 하루 경계는 로컬 기준이 맞다. */
function startOfToday(now = new Date()) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  return start.toISOString()
}

async function countRows(url, key, table, filters) {
  const query = new URLSearchParams({ select: 'id', ...filters }).toString()
  const response = await fetch(`${url}/rest/v1/${table}?${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact', Range: '0-0' },
  })
  if (!response.ok) return null
  const range = response.headers.get('content-range') ?? ''
  const total = Number(range.split('/')[1])
  return Number.isFinite(total) ? total : null
}

/**
 * 오늘 새로 들어온 건수. 산출물 숫자는 조회 기간 전체라 매일 비슷하게 나오므로,
 * 어제와 무엇이 달라졌는지는 적재 시각으로 센다.
 */
async function dailyCounts(url, key, company, config) {
  const since = startOfToday()
  const [transactions, cardApprovals, taxInvoices, taxObligations, cash, pending] = await Promise.all([
    countRows(url, key, config.tables.transactions, { 'synced_at': `gte.${since}` }),
    countRows(url, key, config.tables.cardApprovals, { 'synced_at': `gte.${since}` }),
    countRows(url, key, config.tables.taxInvoices, { 'synced_at': `gte.${since}` }),
    countRows(url, key, 'finance_tax_obligations', { company: `eq.${company}`, 'collected_at': `gte.${since}` }),
    countRows(url, key, config.tables.cash, { 'created_at': `gte.${since}` }),
    countRows(url, key, config.tables.transactions, { status: 'eq.new' }),
  ])
  return { transactions, cardApprovals, taxInvoices, taxObligations, cash, pending }
}

async function run() {
  const company = argument('company') ?? 'tensw'
  const status = argument('status') ?? 'ok'
  const config = financeCompany(company)
  const artifactDir = path.join(os.homedir(), 'logs', `${company}-local-finance`)

  // 수집기가 남긴 파일을 그대로 읽는다. 없으면 그 단계를 못 돈 것이다.
  const names = [
    'latest-tax-invoices.json',
    'latest-hometax-national-tax.json',
    'latest-wetax-obligations.json',
    'latest-nhis-obligations.json',
    config.card.approvalsFile,
    config.card.statementFile,
    ...config.banks.flatMap(bank => [bank.accountsFile, bank.transactionsFile]),
  ]
  const artifacts = {}
  for (const name of names) {
    artifacts[name] = await fs.readFile(path.join(artifactDir, name), 'utf8')
      .then(JSON.parse)
      .catch(() => null)
  }

  const token = process.env.TELEGRAM_BOT_TOKEN
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('Supabase 환경변수가 없어요.')

  // 세는 데 실패해도 알림 자체는 나가야 한다.
  const daily = await dailyCounts(url, key, company, config).catch(() => null)

  const message = notifyMessage({
    company,
    label: config.label,
    status,
    step: argument('step'),
    artifacts,
    config,
    daily,
    logFile: path.join(artifactDir, 'launchd.log'),
  })

  if (process.argv.includes('--print')) {
    console.log(message)
    return
  }

  if (!token) throw new Error('텔레그램 환경변수가 없어요.')

  const chatId = await ceoChatId(url, key)
  if (!chatId) throw new Error('CEO 봇 대화가 없어 보낼 곳을 찾지 못했어요.')

  const sent = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message }),
  })
  if (!sent.ok) throw new Error(`텔레그램 전송 실패: ${sent.status} ${await sent.text()}`)
  console.log(`[finance-notify] company=${company}, status=${status} 전송 완료`)
}

run().catch(error => {
  // 알림이 실패해도 수집 결과까지 죽일 이유는 없다. 로그만 남긴다.
  console.error(`[finance-notify] ${error instanceof Error ? error.message : String(error)}`)
})
