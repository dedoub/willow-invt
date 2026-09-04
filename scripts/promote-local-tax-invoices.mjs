#!/usr/bin/env node

import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import {
  buildLinkedSalesPatch,
  buildNewSalesRow,
  choosePromotionCandidate,
  findExistingPromotion,
  formatBusinessNumber,
} from './lib/tax-invoice-promotion.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true })

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('Supabase 환경변수가 없어요.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function party(invoice) {
  return invoice.transe_type === 'purchase'
    ? { company: invoice.supplier_company, regNo: invoice.supplier_reg_number, representative: null }
    : { company: invoice.contractor_company, regNo: invoice.contractor_reg_number, representative: invoice.contractor_name }
}

function detailNote(invoice) {
  const kind = invoice.transe_type === 'purchase' ? '매입' : '매출'
  return `홈택스 ${kind} ${invoice.invoice_kind ?? ''} ${invoice.receipt_or_charge ?? ''} · ${invoice.issue_form ?? ''} · 승인 ${invoice.approval_no ?? '-'} · 발급 ${invoice.issue_date ?? '-'} · 전송 ${invoice.send_date ?? '-'}`
    .replace(/\s+/g, ' ')
    .trim()
}

async function run() {
  const sb = client()
  const { data: pending, error: pendingError } = await sb
    .from('tensw_codef_tax_invoices')
    .select('*')
    .eq('status', 'new')
    .order('reporting_date')
  if (pendingError) throw pendingError

  if (!pending?.length) {
    console.log('[tax-promote] 신규 발행내역 없음')
    return
  }

  const { data: linked, error: linkedError } = await sb
    .from('tensw_codef_tax_invoices')
    .select('id, approval_no, status, sales_id')
  if (linkedError) throw linkedError
  const takenIds = new Set((linked ?? []).map(row => row.sales_id).filter(Boolean))

  let linkedCount = 0
  let insertedCount = 0
  let reviewCount = 0

  for (const invoice of pending) {
    const existing = findExistingPromotion(invoice, linked ?? [])
    if (existing) {
      const { error } = await sb
        .from('tensw_codef_tax_invoices')
        .update({ status: 'ignored' })
        .eq('id', invoice.id)
      if (error) throw error
      console.log(`  = ${invoice.reporting_date} 승인번호 ${invoice.approval_no} 기존 발행내역과 중복`)
      continue
    }

    if (Number(invoice.total_amount) <= 0) {
      const { error } = await sb
        .from('tensw_codef_tax_invoices')
        .update({ status: 'review' })
        .eq('id', invoice.id)
      if (error) throw error
      reviewCount++
      continue
    }

    const date = new Date(`${invoice.reporting_date}T00:00:00Z`)
    const from = new Date(date)
    const to = new Date(date)
    from.setUTCDate(from.getUTCDate() - 45)
    to.setUTCDate(to.getUTCDate() + 45)

    const { data: candidates, error: candidateError } = await sb
      .from('tensw_mgmt_sales')
      .select('id, invoice_type, issue_date, counterparty, business_number, representative, total_amount, payment_status, items, notes')
      .eq('total_amount', invoice.total_amount)
      .gte('issue_date', from.toISOString().slice(0, 10))
      .lte('issue_date', to.toISOString().slice(0, 10))
    if (candidateError) throw candidateError

    const candidate = choosePromotionCandidate(invoice, candidates ?? [], takenIds)
    let salesId

    if (candidate) {
      const invoiceParty = party(invoice)
      const patch = buildLinkedSalesPatch(invoice, candidate)
      patch.counterparty = invoiceParty.company || invoiceParty.regNo || candidate.counterparty
      patch.business_number = formatBusinessNumber(invoiceParty.regNo)
      if (invoiceParty.representative) patch.representative = invoiceParty.representative
      if (!(candidate.items ?? []).length && invoice.rep_items) {
        patch.items = [{ description: invoice.rep_items }]
      }
      const note = detailNote(invoice)
      if (!String(candidate.notes ?? '').includes(invoice.approval_no ?? '__missing__')) {
        patch.notes = candidate.notes ? `${candidate.notes}\n${note}` : note
      }
      patch.updated_at = new Date().toISOString()

      const { error } = await sb.from('tensw_mgmt_sales').update(patch).eq('id', candidate.id)
      if (error) throw error
      salesId = candidate.id
      linkedCount++
      console.log(`  ~ ${invoice.reporting_date} ${invoiceParty.company} ${Number(invoice.total_amount).toLocaleString()}원 기존 매출 연결`)
    } else {
      const { data: created, error } = await sb
        .from('tensw_mgmt_sales')
        .insert(buildNewSalesRow(invoice))
        .select('id')
        .single()
      if (error) throw error
      salesId = created.id
      insertedCount++
      console.log(`  + ${invoice.reporting_date} ${party(invoice).company} ${Number(invoice.total_amount).toLocaleString()}원 신규 매출 생성`)
    }

    const { error: promoteError } = await sb
      .from('tensw_codef_tax_invoices')
      .update({ status: 'promoted', sales_id: salesId })
      .eq('id', invoice.id)
    if (promoteError) throw promoteError
    takenIds.add(salesId)
  }

  console.log(`[tax-promote] 기존 연결 ${linkedCount}건, 신규 입력 ${insertedCount}건, 검토 ${reviewCount}건`)
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
