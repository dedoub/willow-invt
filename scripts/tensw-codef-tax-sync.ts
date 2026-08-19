#!/usr/bin/env npx tsx
/**
 * tensw-codef-tax-sync.ts
 *
 * 홈택스 전자세금계산서 발행내역을 CODEF로 끌어와
 * tensw_codef_tax_invoices(스테이징)에 적재한다.
 *
 * 은행 거래와 달리 세금계산서는 항목이 이미 구조화돼 있어 분류 판단이 거의 없다.
 * 다만 tensw_mgmt_sales 는 수금상태(payment_status)·입금예정일 같은 운영 정보를
 * 사람이 관리하므로, 자동 반영은 --promote 를 줬을 때만 한다.
 *
 *   npx tsx scripts/tensw-codef-tax-sync.ts                    # 최근 90일 매출
 *   npx tsx scripts/tensw-codef-tax-sync.ts --from 20260101 --to 20260819
 *   npx tsx scripts/tensw-codef-tax-sync.ts --purchase         # 매입까지 함께
 *   npx tsx scripts/tensw-codef-tax-sync.ts --dry
 *   npx tsx scripts/tensw-codef-tax-sync.ts --promote          # 신규분을 tensw_mgmt_sales 로 승격
 */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import crypto from 'node:crypto'
import { codefService } from '../src/lib/codef/client'
import { hometaxCertFromEnv, listTaxInvoices, splitQuarterly, type TaxInvoiceRow, type TranseType } from '../src/lib/codef/hometax'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const argv = process.argv.slice(2)
const flag = (n: string) => argv.includes(`--${n}`)
const arg = (n: string) => {
  const i = argv.indexOf(`--${n}`)
  return i >= 0 ? argv[i + 1] : undefined
}

const DRY = flag('dry')
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY!

const ymd = (d: Date) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`

function dateRange() {
  const from = arg('from')
  if (from) return { startDate: from, endDate: arg('to') ?? ymd(new Date()) }
  const days = Number(arg('days') ?? 90)
  const end = new Date()
  const start = new Date(end.getTime() - days * 86400000)
  return { startDate: ymd(start), endDate: ymd(end) }
}

const num = (v?: string) => {
  if (!v) return 0
  const n = Number(String(v).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}
const isoDate = (v?: string) => (v && /^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : null)

/** 승인번호가 유일키지만 마스킹되어 올 수 있어 주요 필드까지 묶어 지문을 만든다. */
function fingerprint(transeType: TranseType, r: TaxInvoiceRow): string {
  const parts = [
    transeType,
    r.resApprovalNo ?? '',
    r.resReportingDate ?? '',
    r.resIssueDate ?? '',
    r.resSupplyValue ?? '',
    r.resTaxAmt ?? '',
    r.resContractorRegNumber ?? '',
    r.resContractorCompanyName ?? '',
    r.resRepItems ?? '',
  ]
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex')
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('[tax-sync] Supabase env(.env.local) 누락')
    process.exit(1)
  }
  const cert = hometaxCertFromEnv()
  const { startDate, endDate } = dateRange()
  const chunks = splitQuarterly(startDate, endDate)
  const kinds: Array<{ transeType: TranseType; label: string }> = [{ transeType: '01', label: '매출' }]
  if (flag('purchase')) kinds.push({ transeType: '02', label: '매입' })

  console.log(`[tax-sync] service=${codefService()} 기간 ${startDate} ~ ${endDate} (${chunks.length}구간)`)

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let totalNew = 0
  for (const kind of kinds) {
    for (const chunk of chunks) {
      let list: TaxInvoiceRow[]
      try {
        list = await listTaxInvoices({ cert, transeType: kind.transeType, ...chunk })
      } catch (err) {
        console.error(`  ✗ ${kind.label} ${chunk.startDate}~${chunk.endDate}: ${err instanceof Error ? err.message : err}`)
        continue
      }

      const rows = list
        .map(r => {
          const reportingDate = isoDate(r.resReportingDate) ?? isoDate(r.resIssueDate)
          if (!reportingDate) return null
          return {
            transe_type: kind.transeType === '01' ? 'sales' : 'purchase',
            approval_no: r.resApprovalNo || null,
            reporting_date: reportingDate,
            issue_date: isoDate(r.resIssueDate),
            send_date: isoDate(r.resSendDate),
            supplier_reg_number: r.resSupplierRegNumber || null,
            supplier_company: r.resSupplierCompanyName || null,
            contractor_reg_number: r.resContractorRegNumber || null,
            contractor_company: r.resContractorCompanyName || null,
            contractor_name: r.resContractorName || null,
            supply_amount: num(r.resSupplyValue),
            tax_amount: num(r.resTaxAmt),
            total_amount: num(r.resTotalAmount),
            invoice_kind: r.resETaxInvoiceType || null,
            issue_form: r.resIssueNm || null,
            receipt_or_charge: r.resReceiptOrCharge || null,
            rep_items: r.resRepItems || null,
            note: r.resNote || null,
            raw: r,
            fingerprint: fingerprint(kind.transeType, r),
          }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)

      if (DRY) {
        console.log(`  · ${kind.label} ${chunk.startDate}~${chunk.endDate}: ${rows.length}건 (dry)`)
        for (const r of rows.slice(0, 5)) {
          console.log(`      ${r.reporting_date} ${r.contractor_company ?? r.contractor_reg_number ?? ''} 공급가 ${r.supply_amount.toLocaleString()} 세액 ${r.tax_amount.toLocaleString()} / ${r.rep_items ?? ''}`)
        }
        continue
      }

      const { data, error } = await sb
        .from('tensw_codef_tax_invoices')
        .upsert(rows, { onConflict: 'fingerprint', ignoreDuplicates: true })
        .select('id')
      if (error) {
        console.error(`  ✗ ${kind.label} ${chunk.startDate}~${chunk.endDate}: ${error.message}`)
        continue
      }
      const added = data?.length ?? 0
      totalNew += added
      console.log(`  · ${kind.label} ${chunk.startDate}~${chunk.endDate}: 조회 ${rows.length}건, 신규 ${added}건`)
    }
  }

  if (DRY) return
  console.log(`\n[tax-sync] 신규 ${totalNew}건 적재 완료.`)

  if (!flag('promote')) {
    if (totalNew) console.log('  tensw_mgmt_sales 반영은 --promote 또는 수동 확인 후 진행하세요.')
    return
  }

  // 홈택스 작성일자와 수기 입력 발행일이 며칠씩 어긋나는 경우가 많아
  // 이름이 아니라 (합계금액 + 발행일 ±10일)로 기존 행을 찾아 연결한다. 못 찾은 것만 새로 넣는다.
  // 매입은 수기로 관리하던 이력이 없어 사실상 전부 신규 입력이 된다.
  const { data: pending, error: pendErr } = await sb
    .from('tensw_codef_tax_invoices')
    .select('*')
    .eq('status', 'new')
    .in('transe_type', kinds.map(k => (k.transeType === '01' ? 'sales' : 'purchase')))
    .order('reporting_date')
  if (pendErr) { console.error(pendErr.message); return }

  let linked = 0
  let inserted = 0
  let dateFixed = 0
  const skipped: string[] = []

  const rows = pending ?? []

  // 매출은 공급받는자, 매입은 공급자가 거래처다.
  const party = (r: (typeof rows)[number]) =>
    r.transe_type === 'purchase'
      ? { company: r.supplier_company as string | null, regNo: r.supplier_reg_number as string | null, name: null as string | null }
      : { company: r.contractor_company as string | null, regNo: r.contractor_reg_number as string | null, name: r.contractor_name as string | null }

  const label = (r: (typeof rows)[number]) =>
    `${r.reporting_date} ${party(r).company ?? party(r).regNo ?? ''} ${Number(r.total_amount).toLocaleString()}`

  // 취소(마이너스) 계산서와 그 원발행분을 먼저 짝지어 둘 다 제외한다.
  // 수정세금계산서는 취소 후 재발행되므로, 재발행분만 매출로 남으면 된다.
  const cancelled = new Set<string>()
  const needsReview = new Set<string>()
  for (const neg of rows.filter(r => Number(r.total_amount) < 0)) {
    const candidates = rows.filter(
      r =>
        !cancelled.has(r.id) &&
        Number(r.total_amount) === -Number(neg.total_amount) &&
        r.transe_type === neg.transe_type &&
        party(r).regNo === party(neg).regNo &&
        r.reporting_date <= neg.reporting_date
    )
    // 같은 거래처에 같은 금액이 여러 건 있을 수 있다(임차료 vs 라이선스 선금).
    // 품목까지 같아야 같은 건으로 본다. 품목이 다르면 짐작하지 않고 사람에게 넘긴다.
    const origin =
      candidates.find(r => r.rep_items === neg.rep_items) ??
      candidates.find(r => r.reporting_date === neg.reporting_date)

    if (origin) {
      cancelled.add(neg.id)
      cancelled.add(origin.id)
      skipped.push(`${label(origin)} → ${neg.reporting_date} 취소 (원발행분·취소분 모두 제외)`)
    } else {
      needsReview.add(neg.id)
      skipped.push(`${label(neg)} (취소분 — 짝이 될 원발행분을 못 찾음, 확인 필요)`)
    }
  }
  if (cancelled.size) {
    await sb.from('tensw_codef_tax_invoices').update({ status: 'ignored' }).in('id', [...cancelled])
  }
  if (needsReview.size) {
    await sb.from('tensw_codef_tax_invoices').update({ status: 'review' }).in('id', [...needsReview])
  }

  for (const row of rows) {
    if (cancelled.has(row.id) || needsReview.has(row.id)) continue

    const isPurchase = row.transe_type === 'purchase'
    const p = party(row)

    // 매입은 수기 이력이 없어 매칭할 대상이 없다. 스테이징 fingerprint가 중복을 막는다.
    if (isPurchase) {
      const { data: created, error } = await sb
        .from('tensw_mgmt_sales')
        .insert({
          invoice_type: 'purchase',
          issue_date: row.reporting_date,
          counterparty: p.company || p.regNo || '미상',
          business_number: formatBizNo(p.regNo),
          representative: null,
          supply_amount: row.supply_amount,
          tax_amount: row.tax_amount,
          total_amount: row.total_amount,
          items: row.rep_items ? [{ description: row.rep_items }] : [],
          payment_status: 'pending', // 계산서수취
          notes: `홈택스 매입 자동수집 (승인번호 ${row.approval_no ?? '-'})`,
        })
        .select('id')
        .single()
      if (error) { console.error(`  ✗ ${label(row)}: ${error.message}`); continue }
      await sb
        .from('tensw_codef_tax_invoices')
        .update({ status: 'promoted', sales_id: created.id })
        .eq('id', row.id)
      inserted++
      continue
    }

    const from = new Date(row.reporting_date)
    from.setDate(from.getDate() - 10)
    const to = new Date(row.reporting_date)
    to.setDate(to.getDate() + 10)
    const iso = (d: Date) => d.toISOString().slice(0, 10)

    const { data: candidates } = await sb
      .from('tensw_mgmt_sales')
      .select('id, issue_date, counterparty, total_amount')
      .eq('total_amount', row.total_amount)
      .gte('issue_date', iso(from))
      .lte('issue_date', iso(to))

    // 이미 다른 스테이징 행이 물고 있는 매출 행은 후보에서 뺀다.
    // 수정세금계산서(취소 후 재발행)처럼 같은 금액이 두 번 잡히면 원발행분이 남는데,
    // 이 경우 매출 행은 하나뿐이므로 둘 다 연결하면 이력이 틀어진다.
    let free = candidates ?? []
    if (free.length) {
      const { data: taken } = await sb
        .from('tensw_codef_tax_invoices')
        .select('sales_id')
        .in('sales_id', free.map(c => c.id))
      const takenIds = new Set((taken ?? []).map(t => t.sales_id))
      free = free.filter(c => !takenIds.has(c.id))
    }

    if (free.length) {
      await sb
        .from('tensw_codef_tax_invoices')
        .update({ status: 'promoted', sales_id: free[0].id })
        .eq('id', row.id)
      linked++
      // 홈택스 작성일자가 정본이다. 기록 발행일이 다르면 항상 홈택스 기준으로 맞춘다.
      if (free[0].issue_date !== row.reporting_date) {
        await sb
          .from('tensw_mgmt_sales')
          .update({ issue_date: row.reporting_date, updated_at: new Date().toISOString() })
          .eq('id', free[0].id)
        dateFixed++
        console.log(`  ~ ${label(row)}: 발행일 ${free[0].issue_date} → ${row.reporting_date} (홈택스 작성일자 기준)`)
      }
      continue
    }

    // 같은 금액의 매출 행이 이미 다른 계산서에 물려 있으면 사람이 봐야 한다.
    if ((candidates ?? []).length) {
      await sb.from('tensw_codef_tax_invoices').update({ status: 'review' }).eq('id', row.id)
      skipped.push(`${label(row)} (같은 금액 매출 행이 이미 연결됨 — 확인 필요)`)
      continue
    }

    const { data: created, error } = await sb
      .from('tensw_mgmt_sales')
      .insert({
        invoice_type: 'sales',
        issue_date: row.reporting_date,
        counterparty: p.company || p.regNo || '미상',
        business_number: formatBizNo(p.regNo),
        representative: p.name,
        supply_amount: row.supply_amount,
        tax_amount: row.tax_amount,
        total_amount: row.total_amount,
        items: row.rep_items ? [{ description: row.rep_items }] : [],
        payment_status: 'pending',
        notes: `홈택스 자동수집 (승인번호 ${row.approval_no ?? '-'})`,
      })
      .select('id')
      .single()
    if (error) { console.error(`  ✗ ${label(row)}: ${error.message}`); continue }
    await sb
      .from('tensw_codef_tax_invoices')
      .update({ status: 'promoted', sales_id: created.id })
      .eq('id', row.id)
    inserted++
    console.log(`  + ${label(row)}: 신규 매출 행 생성`)
  }

  console.log(`[tax-sync] 기존 연결 ${linked}건 (발행일 정정 ${dateFixed}건), 신규 입력 ${inserted}건, 제외 ${skipped.length}건`)
  for (const msg of skipped) console.log(`  - ${msg}`)

  await enrichLinked(sb)
}

/** 사업자번호 10자리를 3-2-5 로 끊는다. */
function formatBizNo(v?: string | null): string | null {
  if (!v) return null
  const d = v.replace(/\D/g, '')
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : v
}

/**
 * 발행이 확인된 계산서의 상세 정보를 홈택스 값으로 맞춘다.
 * 홈택스가 정본이므로 상호·사업자번호·대표자는 덮어쓴다. 품목은 사람이 쪼개 적은 경우가 있어
 * (유지보수 + 클라우드 엔지니어링처럼) 비어 있을 때만 대표품목으로 채운다.
 */
async function enrichLinked(sb: ReturnType<typeof createClient>) {
  const { data: rows, error } = await sb
    .from('tensw_codef_tax_invoices')
    .select('sales_id, transe_type, supplier_reg_number, supplier_company, contractor_reg_number, contractor_company, contractor_name, rep_items, approval_no, invoice_kind, issue_form, receipt_or_charge, issue_date, send_date')
    .eq('status', 'promoted')
    .not('sales_id', 'is', null)
  if (error) { console.error(error.message); return }

  let touched = 0
  const changes: string[] = []

  for (const t of rows ?? []) {
    const { data: inv } = await sb
      .from('tensw_mgmt_sales')
      .select('id, counterparty, business_number, representative, items, notes, payment_status')
      .eq('id', t.sales_id as string)
      .single()
    if (!inv) continue
    if (!['pending', 'paid'].includes(inv.payment_status as string)) continue

    const patch: Record<string, unknown> = {}
    const purchase = t.transe_type === 'purchase'
    const company = (purchase ? t.supplier_company : t.contractor_company) as string | null
    const regNo = (purchase ? t.supplier_reg_number : t.contractor_reg_number) as string | null
    const repName = (purchase ? null : t.contractor_name) as string | null
    const bizNo = formatBizNo(regNo)

    if (company && inv.counterparty !== company) {
      patch.counterparty = company
      changes.push(`  ~ 상호 "${inv.counterparty}" → "${company}"`)
    }
    if (bizNo && inv.business_number !== bizNo) {
      patch.business_number = bizNo
      changes.push(`  ~ ${company ?? bizNo} 사업자번호 ${inv.business_number ?? '(없음)'} → ${bizNo}`)
    }
    if (repName && inv.representative !== repName) {
      patch.representative = repName
      changes.push(`  ~ ${company} 대표자 ${inv.representative ?? '(없음)'} → ${repName}`)
    }

    const items = (inv.items as unknown[]) ?? []
    if (!items.length && t.rep_items) {
      patch.items = [{ description: t.rep_items }]
    }

    // 승인번호·발급 정보는 메모에 한 줄로 남긴다. 이미 있으면 건드리지 않는다.
    const approval = t.approval_no as string | null
    const notes = (inv.notes as string | null) ?? ''
    if (approval && !notes.includes(approval)) {
      const line = `홈택스 ${purchase ? '매입' : '매출'} ${t.invoice_kind ?? ''} ${t.receipt_or_charge ?? ''} · ${t.issue_form ?? ''} · 승인 ${approval} · 발급 ${t.issue_date ?? '-'} · 전송 ${t.send_date ?? '-'}`
        .replace(/\s+/g, ' ')
        .trim()
      patch.notes = notes ? `${notes}\n${line}` : line
    }

    if (!Object.keys(patch).length) continue
    patch.updated_at = new Date().toISOString()
    const { error: upErr } = await sb.from('tensw_mgmt_sales').update(patch).eq('id', inv.id as string)
    if (upErr) { console.error(`  ✗ ${inv.counterparty}: ${upErr.message}`); continue }
    touched++
  }

  for (const c of changes) console.log(c)
  console.log(`[tax-sync] 상세정보 보완 ${touched}건`)
}


main().catch(err => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
