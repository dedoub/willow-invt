#!/usr/bin/env node
// 아크로스 인보이스 화면(/akros)의 세금계산서 목록을 홈택스 수집분과 계좌 입금으로
// 채운다.
//
//   node scripts/sync-akros-invoices.mjs [--dry]
//
// 발행은 홈택스에서 수집한 매출 계산서가, 수금은 현금관리에 분류된 입금이 말해 준다.
// 둘 다 이미 자동으로 들어오므로 이 화면만 손으로 남을 이유가 없다.
//
// 사람이 맞춰 둔 값은 덮어쓰지 않는다 — 비어 있는 수금일만 채우고, 아예 없는 건만
// 새로 넣는다.

import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { planAkrosSync } from './lib/akros-invoice-sync.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true })

const DRY_RUN = process.argv.includes('--dry')

function log(message) {
  console.log(`[akros-invoice-sync] ${message}`)
}

function supabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('Supabase 환경변수가 없어요.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function run() {
  const sb = supabaseClient()

  const [invoicesRes, rowsRes, paymentsRes] = await Promise.all([
    sb.from('willow_finance_tax_invoices')
      .select('transe_type, reporting_date, issue_date, contractor_company, contractor_reg_number, total_amount, rep_items')
      .eq('transe_type', 'sales'),
    sb.from('akros_tax_invoices').select('id, invoice_date, amount, issued_at, paid_at'),
    // 아크로스 입금은 현금관리에서 이미 매출로 분류돼 있다.
    sb.from('willow_mgmt_cash')
      .select('payment_date, amount, counterparty')
      .eq('type', 'revenue')
      .ilike('counterparty', '%아크로스%'),
  ])

  for (const [name, result] of [['세금계산서', invoicesRes], ['아크로스 인보이스', rowsRes], ['입금', paymentsRes]]) {
    if (result.error) throw new Error(`${name} 조회 실패: ${result.error.message}`)
  }

  const payments = (paymentsRes.data ?? [])
    .filter(row => row.payment_date)
    .map(row => ({ payment_date: row.payment_date, amount: Number(row.amount) }))

  const plan = planAkrosSync(invoicesRes.data ?? [], rowsRes.data ?? [], payments)

  for (const row of plan.insert) {
    log(`추가: ${row.invoice_date} ${row.amount.toLocaleString()}원 발행 ${row.issued_at} 수금 ${row.paid_at ?? '미수'}`)
  }
  for (const row of plan.updatePaid) {
    log(`수금일 채움: ${row.amount.toLocaleString()}원 → ${row.paid_at}`)
  }
  if (plan.insert.length === 0 && plan.updatePaid.length === 0) {
    log('바뀔 내용 없음')
    return
  }
  if (DRY_RUN) {
    log(`dry run: 추가 ${plan.insert.length}건, 수금일 ${plan.updatePaid.length}건`)
    return
  }

  if (plan.insert.length > 0) {
    const { error } = await sb.from('akros_tax_invoices').insert(plan.insert)
    if (error) throw new Error(`추가 실패: ${error.message}`)
  }
  for (const row of plan.updatePaid) {
    const { error } = await sb.from('akros_tax_invoices')
      .update({ paid_at: row.paid_at, updated_at: new Date().toISOString() })
      .eq('id', row.id)
    if (error) throw new Error(`수금일 갱신 실패: ${error.message}`)
  }

  log(`반영 완료: 추가 ${plan.insert.length}건, 수금일 ${plan.updatePaid.length}건`)
}

run().catch(error => {
  console.error(`[akros-invoice-sync] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
