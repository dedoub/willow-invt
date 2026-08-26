#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import {
  accountLabelForTransaction,
  transactionIdentity,
  wooriTransactionFingerprint,
} from './lib/tensw-local-finance.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HOME = process.env.HOME || '/Users/dongwookkim'
const ARTIFACT_DIR = path.join(HOME, 'logs', 'tensw-local-finance')
const BANK_INPUTS = [
  {
    bankName: '우리은행',
    source: 'woori-local-chrome',
    organization: '0020',
    expectedAccounts: 8,
    transactionsPath: path.join(ARTIFACT_DIR, 'latest-woori-transactions.json'),
    accountsPath: path.join(ARTIFACT_DIR, 'latest-woori-accounts.json'),
  },
  {
    bankName: '신한은행',
    source: 'shinhan-local-chrome',
    organization: '0088',
    expectedAccounts: 1,
    transactionsPath: path.join(ARTIFACT_DIR, 'latest-shinhan-transactions.json'),
    accountsPath: path.join(ARTIFACT_DIR, 'latest-shinhan-accounts.json'),
  },
]
const DRY_RUN = process.argv.includes('--dry')

dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true })

function supabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('Supabase 환경변수가 없어요.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function upsertBalances(sb, bankName, accounts, balanceDate) {
  let updated = 0
  let inserted = 0
  for (const account of accounts) {
    const { data: existing, error: findError } = await sb
      .from('tensw_mgmt_bank_balances')
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
      ? sb.from('tensw_mgmt_bank_balances').update(values).eq('id', existing.id)
      : sb.from('tensw_mgmt_bank_balances').insert(values)
    const { error } = await query
    if (error) throw error
    if (existing) updated += 1
    else inserted += 1
  }
  return { updated, inserted }
}

async function excludeExistingTransactions(sb, rows) {
  const existingIdentities = new Set()
  for (const organization of [...new Set(rows.map(row => row.organization))]) {
    const bankRows = rows.filter(row => row.organization === organization)
    const accounts = [...new Set(bankRows.map(row => row.account))]
    const dates = bankRows.map(row => row.tr_date).sort()
    const { data, error } = await sb
      .from('tensw_codef_transactions')
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

async function run() {
  const payloads = await Promise.all(BANK_INPUTS.map(async input => {
    const [transactionPayload, accountPayload] = await Promise.all([
      fs.readFile(input.transactionsPath, 'utf8').then(JSON.parse),
      fs.readFile(input.accountsPath, 'utf8').then(JSON.parse),
    ])
    if (
      transactionPayload.account_count !== input.expectedAccounts
      || accountPayload.accounts?.length !== input.expectedAccounts
    ) {
      throw new Error(`${input.bankName} ${input.expectedAccounts}개 계좌 검증이 통과하지 않았어요.`)
    }
    if (transactionPayload.transactions.some(row => row.organization !== input.organization)) {
      throw new Error(`${input.bankName} 기관코드 검증이 통과하지 않았어요.`)
    }
    return { input, transactionPayload, accountPayload }
  }))

  const rows = payloads.flatMap(({ input, transactionPayload, accountPayload }) => (
    transactionPayload.transactions.map(transaction => ({
      ...transaction,
      account_label: accountLabelForTransaction(transaction, accountPayload.accounts),
      raw: { source: input.source },
      fingerprint: wooriTransactionFingerprint(transaction),
    }))
  ))
  if (DRY_RUN) {
    const balanceCount = payloads.reduce((sum, payload) => sum + payload.accountPayload.accounts.length, 0)
    console.log(`[local-bank-import] dry run: transactions=${rows.length}, balances=${balanceCount}`)
    return
  }

  const sb = supabaseClient()
  const newRows = await excludeExistingTransactions(sb, rows)
  let inserted = 0
  if (newRows.length > 0) {
    const { data, error } = await sb
      .from('tensw_codef_transactions')
      .upsert(newRows, { onConflict: 'fingerprint', ignoreDuplicates: true })
      .select('id')
    if (error) throw error
    inserted = data?.length ?? 0
  }

  console.log(`[local-bank-import] transactions=${rows.length}, existing=${rows.length - newRows.length}, newly_inserted=${inserted}`)
  for (const { input, transactionPayload, accountPayload } of payloads) {
    const balances = await upsertBalances(
      sb,
      input.bankName,
      accountPayload.accounts,
      transactionPayload.end_date,
    )
    console.log(`[local-bank-import] ${input.bankName} balances updated=${balances.updated}, inserted=${balances.inserted}`)
  }
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : JSON.stringify(error))
  process.exitCode = 1
})
