#!/usr/bin/env npx tsx
/**
 * tensw-codef-sync.ts
 *
 * CODEF 은행 API로 텐소프트웍스 법인 계좌 거래내역을 끌어와
 * tensw_codef_transactions(스테이징)에 적재한다.
 *
 * 왜 tensw_mgmt_cash에 바로 넣지 않는가:
 *   현금관리는 revenue/expense/asset/liability/exchange 분류가 회계적 판단이라
 *   (대여금·미지급급여·부가세환급·외화환전 등) 자동 분류하면 틀린다.
 *   원본은 여기 쌓고, 분류·입력은 update-cash-transactions 워크플로우가 맡는다.
 *
 *   npx tsx scripts/tensw-codef-sync.ts                # 최근 14일, 전 계좌
 *   npx tsx scripts/tensw-codef-sync.ts --days 90
 *   npx tsx scripts/tensw-codef-sync.ts --from 20260101 --to 20260819
 *   npx tsx scripts/tensw-codef-sync.ts --account 1005403461450
 *   npx tsx scripts/tensw-codef-sync.ts --balances   # 보유계좌/잔액만 조회
 *   npx tsx scripts/tensw-codef-sync.ts --dry        # DB 미변경
 */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import crypto from 'node:crypto'
import { codefService, isQuotaExhausted } from '../src/lib/codef/client'
import {
  TENSW_ACCOUNTS,
  listCorporateAccounts,
  listCorporateTransactions,
  type BankAccount,
  type CodefTransaction,
} from '../src/lib/codef/bank'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const argv = process.argv.slice(2)
const flag = (n: string) => argv.includes(`--${n}`)
const arg = (n: string) => {
  const i = argv.indexOf(`--${n}`)
  return i >= 0 ? argv[i + 1] : undefined
}

const DRY = flag('dry')
const CONNECTED_ID = process.env.TENSW_CODEF_CONNECTED_ID

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY!

function ymd(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

function dateRange(): { startDate: string; endDate: string } {
  const from = arg('from')
  const to = arg('to')
  if (from) return { startDate: from, endDate: to ?? ymd(new Date()) }
  const days = Number(arg('days') ?? 14)
  const end = new Date()
  const start = new Date(end.getTime() - days * 86400000)
  return { startDate: ymd(start), endDate: ymd(end) }
}

function num(v: string | undefined): number {
  if (!v) return 0
  const n = Number(String(v).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function isoDate(yyyymmdd: string): string | null {
  if (!/^\d{8}$/.test(yyyymmdd)) return null
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`
}

function isoTime(hhmmss: string | undefined): string | null {
  if (!hhmmss) return null
  const digits = hhmmss.replace(/\D/g, '').padEnd(6, '0').slice(0, 6)
  if (digits === '000000' && !/\d/.test(hhmmss)) return null
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}:${digits.slice(4, 6)}`
}

/** 같은 거래를 다시 받아도 한 행만 남도록 하는 안정적인 키. */
function fingerprint(acct: BankAccount, tr: CodefTransaction): string {
  const parts = [
    acct.organization,
    acct.account,
    tr.resAccountTrDate,
    tr.resAccountTrTime ?? '',
    tr.resAccountIn ?? '',
    tr.resAccountOut ?? '',
    tr.resAfterTranBalance ?? '',
    tr.resAccountDesc1 ?? '',
    tr.resAccountDesc3 ?? '',
  ]
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex')
}

async function main() {
  if (!CONNECTED_ID) {
    console.error('[codef-sync] TENSW_CODEF_CONNECTED_ID 가 없습니다.')
    console.error('  먼저 npx tsx scripts/codef-register-account.ts --cert --org 0020 --der ... --key ... 로 발급하세요.')
    process.exit(1)
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('[codef-sync] Supabase env(.env.local) 누락')
    process.exit(1)
  }

  const only = arg('account')
  const accounts = only
    ? TENSW_ACCOUNTS.filter(a => a.account === only.replace(/\D/g, '') || a.label === only)
    : TENSW_ACCOUNTS
  if (!accounts.length) {
    console.error(`[codef-sync] --account ${only} 에 해당하는 계좌가 TENSW_ACCOUNTS 에 없습니다.`)
    process.exit(1)
  }

  console.log(`[codef-sync] service=${codefService()} accounts=${accounts.length}`)

  if (flag('balances')) {
    const orgs = [...new Set(accounts.map(a => a.organization))]
    for (const organization of orgs) {
      const data = await listCorporateAccounts({ connectedId: CONNECTED_ID, organization })
      for (const item of data.resDepositTrust ?? []) {
        console.log(`  ${organization} ${item.resAccountDisplay}  ${num(item.resAccountBalance).toLocaleString()}원  ${item.resAccountName}`)
      }
      for (const item of data.resForeignCurrency ?? []) {
        console.log(`  ${organization} ${item.resAccountDisplay}  ${item.resAccountBalance} ${item.resAccountCurrency}  ${item.resAccountName}`)
      }
    }
    return
  }

  const { startDate, endDate } = dateRange()
  console.log(`[codef-sync] 기간 ${startDate} ~ ${endDate}`)

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let totalNew = 0
  for (const acct of accounts) {
    let list
    try {
      list = await listCorporateTransactions({
        connectedId: CONNECTED_ID,
        organization: acct.organization,
        account: acct.account,
        startDate,
        endDate,
      })
    } catch (err) {
      console.error(`  ✗ ${acct.label}: ${err instanceof Error ? err.message : err}`)
      // 한도에 걸렸으면 남은 계좌도 전부 같은 오류다. 로그만 더럽히니 여기서 멈춘다.
      if (isQuotaExhausted()) { console.error('  ⚠ 일일 호출 한도 초과 — 남은 계좌 조회를 건너뜁니다.'); break }
      continue
    }

    const rows = list.resTrHistoryList
      .map(tr => {
        const trDate = isoDate(tr.resAccountTrDate)
        if (!trDate) return null
        return {
          organization: acct.organization,
          account: acct.account,
          account_label: acct.label,
          tr_date: trDate,
          tr_time: isoTime(tr.resAccountTrTime),
          amount_in: num(tr.resAccountIn),
          amount_out: num(tr.resAccountOut),
          balance_after: tr.resAfterTranBalance ? num(tr.resAfterTranBalance) : null,
          desc1: tr.resAccountDesc1 || null,
          desc2: tr.resAccountDesc2 || null,
          desc3: tr.resAccountDesc3 || null,
          desc4: tr.resAccountDesc4 || null,
          raw: tr,
          fingerprint: fingerprint(acct, tr),
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    if (DRY) {
      console.log(`  · ${acct.label}: ${rows.length}건 (dry, 잔액 ${list.resAccountBalance ?? '-'})`)
      for (const r of rows.slice(-5)) {
        console.log(`      ${r.tr_date} ${r.tr_time ?? ''} in=${r.amount_in} out=${r.amount_out} ${r.desc1 ?? ''} ${r.desc3 ?? ''}`)
      }
      continue
    }

    // fingerprint 유니크 → 이미 있는 건은 무시되고 신규만 반환된다.
    const { data, error } = await sb
      .from('tensw_codef_transactions')
      .upsert(rows, { onConflict: 'fingerprint', ignoreDuplicates: true })
      .select('id')
    if (error) {
      console.error(`  ✗ ${acct.label}: ${error.message}`)
      continue
    }
    const added = data?.length ?? 0
    totalNew += added
    console.log(`  · ${acct.label}: 조회 ${rows.length}건, 신규 ${added}건 (잔액 ${num(list.resAccountBalance).toLocaleString()}원)`)
  }

  if (!DRY) {
    console.log(`\n[codef-sync] 신규 ${totalNew}건 적재 완료.`)
    if (totalNew) console.log('  분류는 update-cash-transactions 워크플로우로 tensw_mgmt_cash 에 반영하세요.')
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
