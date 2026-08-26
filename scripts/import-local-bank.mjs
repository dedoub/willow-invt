#!/usr/bin/env node
// Loads the bank artifacts a collector wrote into the company's staging table
// and refreshes its balances.
//
//   node scripts/import-local-bank.mjs --company tensw [--dry]
//
// Which banks are read, which table they land in and how many accounts each
// bank is expected to hold all come from the company registry, so a bank is
// added by editing that registry rather than this script.

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import {
  accountLabelForTransaction,
  financeCompany,
  transactionIdentity,
  wooriTransactionFingerprint,
} from './lib/tensw-local-finance.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DRY_RUN = process.argv.includes('--dry')

dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true })

function argument(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : null
}

function supabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('Supabase 환경변수가 없어요.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function upsertBalances(sb, table, bankName, accounts, balanceDate) {
  let updated = 0
  let inserted = 0
  for (const account of accounts) {
    const { data: existing, error: findError } = await sb
      .from(table)
      .select('id')
      .eq('bank_name', bankName)
      .eq('account_number', account.account_label)
      .maybeSingle()
    if (findError) throw findError

    const values = {
      bank_name: bankName,
      account_number: account.account_label,
      balance: account.balance,
      balance_date: balanceDate,
      updated_at: new Date().toISOString(),
    }
    const query = existing
      ? sb.from(table).update(values).eq('id', existing.id)
      : sb.from(table).insert(values)
    const { error } = await query
    if (error) throw error
    if (existing) updated += 1
    else inserted += 1
  }
  return { updated, inserted }
}

// The fingerprint alone would let a second collector re-insert the same
// transaction under a different description, so identity is checked too.
async function excludeExistingTransactions(sb, table, rows) {
  const existingIdentities = new Set()
  for (const organization of [...new Set(rows.map(row => row.organization))]) {
    const bankRows = rows.filter(row => row.organization === organization)
    const accounts = [...new Set(bankRows.map(row => row.account))]
    const dates = bankRows.map(row => row.tr_date).sort()
    const { data, error } = await sb
      .from(table)
      .select('organization,account,tr_date,tr_time,amount_in,amount_out')
      .eq('organization', organization)
      .in('account', accounts)
      .gte('tr_date', dates[0])
      .lte('tr_date', dates.at(-1))
    if (error) throw error
    for (const row of data ?? []) existingIdentities.add(transactionIdentity(row))
  }
  return rows.filter(row => !existingIdentities.has(transactionIdentity(row)))
}

async function readBank(artifactDir, bank) {
  const [transactionPayload, accountPayload] = await Promise.all([
    fs.readFile(path.join(artifactDir, bank.transactionsFile), 'utf8').then(JSON.parse),
    fs.readFile(path.join(artifactDir, bank.accountsFile), 'utf8').then(JSON.parse),
  ])

  const collected = accountPayload.accounts?.length ?? 0
  // A bank whose expected count is null is one whose grid has not been seen in a
  // real run yet; it still has to return at least one account.
  if (bank.expectedAccounts === null ? collected === 0 : collected !== bank.expectedAccounts) {
    throw new Error(`${bank.bankName} 계좌 수 검증이 통과하지 않았어요: ${collected}개`)
  }
  if (transactionPayload.account_count !== collected) {
    throw new Error(`${bank.bankName} 거래내역 계좌 수가 잔액 조회와 달라요.`)
  }
  if (transactionPayload.transactions.some(row => row.organization !== bank.organization)) {
    throw new Error(`${bank.bankName} 기관코드 검증이 통과하지 않았어요.`)
  }
  return { bank, transactionPayload, accountPayload }
}

async function run() {
  const company = argument('company') ?? 'tensw'
  const config = financeCompany(company)
  const artifactDir = path.join(os.homedir(), 'logs', `${company}-local-finance`)

  const payloads = await Promise.all(config.banks.map(bank => readBank(artifactDir, bank)))

  const rows = payloads.flatMap(({ bank, transactionPayload, accountPayload }) => (
    transactionPayload.transactions.map(transaction => ({
      ...transaction,
      account_label: accountLabelForTransaction(transaction, accountPayload.accounts),
      raw: { source: bank.source },
      fingerprint: wooriTransactionFingerprint(transaction),
    }))
  ))

  if (DRY_RUN) {
    const balanceCount = payloads.reduce((sum, payload) => sum + payload.accountPayload.accounts.length, 0)
    console.log(`[local-bank-import] dry run: company=${company}, transactions=${rows.length}, balances=${balanceCount}`)
    return
  }

  const sb = supabaseClient()
  const newRows = await excludeExistingTransactions(sb, config.tables.transactions, rows)
  let inserted = 0
  if (newRows.length > 0) {
    const { data, error } = await sb
      .from(config.tables.transactions)
      .upsert(newRows, { onConflict: 'fingerprint', ignoreDuplicates: true })
      .select('id')
    if (error) throw error
    inserted = data?.length ?? 0
  }

  console.log(
    `[local-bank-import] company=${company}, transactions=${rows.length}, `
    + `existing=${rows.length - newRows.length}, newly_inserted=${inserted}`,
  )
  for (const { bank, transactionPayload, accountPayload } of payloads) {
    const balances = await upsertBalances(
      sb,
      config.tables.bankBalances,
      bank.bankName,
      accountPayload.accounts,
      transactionPayload.end_date,
    )
    console.log(`[local-bank-import] ${bank.bankName} balances updated=${balances.updated}, inserted=${balances.inserted}`)
  }
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : JSON.stringify(error))
  process.exitCode = 1
})
