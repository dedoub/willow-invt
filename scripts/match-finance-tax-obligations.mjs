#!/usr/bin/env node

import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { findPaymentMatch, obligationStatus } from './lib/tax-obligation-matcher.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true })

const COMPANY_TABLES = {
  tensw: 'tensw_mgmt_cash',
  willow: 'willow_mgmt_cash',
}

function supabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('Supabase 환경변수가 없어요.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function matchCompany(sb, company) {
  const cashTable = COMPANY_TABLES[company]
  const [{ data: obligations, error: obligationError }, { data: cashRows, error: cashError }] = await Promise.all([
    sb.from('finance_tax_obligations')
      .select('id, company, source, obligation_type, title, agency, amount, issued_date, due_date, status')
      .eq('company', company)
      .in('status', ['unpaid', 'overdue'])
      .is('matched_cash_id', null),
    sb.from(cashTable)
      .select('id, type, counterparty, description, notes, amount, payment_date')
      .eq('type', 'expense')
      .not('payment_date', 'is', null)
      .gte('payment_date', new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10)),
  ])
  if (obligationError) throw obligationError
  if (cashError) throw cashError

  let matched = 0
  let overdue = 0
  for (const obligation of obligations || []) {
    const payment = findPaymentMatch(obligation, cashRows || [])
    const nextStatus = payment ? 'paid' : obligationStatus(obligation)
    const values = payment
      ? {
          status: 'paid',
          paid_at: payment.payment_date,
          matched_cash_id: payment.id,
          matched_cash_table: cashTable,
          match_confidence: 'exact',
          updated_at: new Date().toISOString(),
        }
      : { status: nextStatus, updated_at: new Date().toISOString() }

    if (process.argv.includes('--dry')) {
      if (payment) matched += 1
      else if (nextStatus === 'overdue' && obligation.status !== 'overdue') overdue += 1
      continue
    }

    const { error } = await sb.from('finance_tax_obligations').update(values).eq('id', obligation.id)
    if (error) throw error
    if (payment) matched += 1
    else if (nextStatus === 'overdue' && obligation.status !== 'overdue') overdue += 1
  }

  console.log(`[tax-obligation-match] company=${company}, candidates=${obligations?.length ?? 0}, matched=${matched}, newly_overdue=${overdue}`)
}

async function run() {
  const sb = supabaseClient()
  for (const company of Object.keys(COMPANY_TABLES)) await matchCompany(sb, company)
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : JSON.stringify(error))
  process.exitCode = 1
})
