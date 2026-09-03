import { NextResponse } from 'next/server'
import { denyUnlessDashboardAccess } from '@/lib/api-auth'
import { getServiceSupabase } from '@/lib/supabase'
import type {
  B2bAgreement, B2bCashRow, B2bDocumentRef, B2bEngagement, B2bInvoice, B2bPricing,
  B2bReconciliation, B2bSettlement, B2bWorkEvidence, B2bWorkRecordDetail,
} from '@/types/b2b'

export const dynamic = 'force-dynamic'

const INVOICE_COLUMNS = 'approval_no, issue_date, supply_amount, tax_amount, total_amount'
const CASH_COLUMNS = 'id, payment_date, amount, counterparty, description'
const DOC_COLUMNS = 'doc_no, title, status, doc_type'

type Supabase = ReturnType<typeof getServiceSupabase>

async function docRef(supabase: Supabase, docNo: string | null): Promise<B2bDocumentRef | null> {
  if (!docNo) return null
  const { data, error } = await supabase.from('willow_corp_documents').select(DOC_COLUMNS).eq('doc_no', docNo).maybeSingle()
  if (error || !data) return null
  return data as B2bDocumentRef
}

// 정산 상세: 약정 + 업무기록(증거·산정) + 문서 3종 + 세금계산서 2건 + 현금 행 + 대사 결과. 읽기 전용.
export async function GET(request: Request, ctx: { params: Promise<{ ref: string }> }) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied
  try {
    const { ref } = await ctx.params
    const supabase = getServiceSupabase()

    const { data: settlementRow, error: sErr } = await supabase.from('b2b_settlements').select('*').eq('ref_no', ref).maybeSingle()
    if (sErr) throw sErr
    if (!settlementRow) return NextResponse.json({ error: 'Settlement not found' }, { status: 404 })
    const settlement = settlementRow as B2bSettlement

    const { data: agreementRow, error: aErr } = await supabase.from('b2b_agreements').select('*').eq('id', settlement.agreement_id).maybeSingle()
    if (aErr) throw aErr
    if (!agreementRow) return NextResponse.json({ error: 'Agreement not found' }, { status: 404 })
    const agreement = agreementRow as B2bAgreement

    let engagement: B2bEngagement | null = null
    if (settlement.engagement_id) {
      const { data, error } = await supabase.from('b2b_engagements').select('*').eq('id', settlement.engagement_id).maybeSingle()
      if (error) throw error
      engagement = (data ?? null) as B2bEngagement | null
    }

    const { data: workRows, error: wErr } = await supabase
      .from('b2b_work_records').select('*').eq('settlement_id', settlement.id).order('created_at')
    if (wErr) throw wErr

    const works: B2bWorkRecordDetail[] = await Promise.all((workRows ?? []).map(async (w) => {
      const [evidenceRes, pricingRes] = await Promise.all([
        supabase.from('b2b_work_evidence').select('*').eq('work_record_id', w.id).order('created_at'),
        supabase.from('b2b_pricings').select('*').eq('work_record_id', w.id).limit(1),
      ])
      if (evidenceRes.error) throw evidenceRes.error
      if (pricingRes.error) throw pricingRes.error
      return {
        ...(w as B2bWorkRecordDetail),
        evidence: (evidenceRes.data ?? []) as B2bWorkEvidence[],
        pricing: (pricingRes.data?.[0] ?? null) as B2bPricing | null,
      }
    }))

    const [confirmation, statement, bundle] = await Promise.all([
      docRef(supabase, settlement.confirmation_doc_no),
      docRef(supabase, settlement.statement_doc_no),
      docRef(supabase, settlement.bundle_doc_no),
    ])

    const [invoiceWillowRes, invoiceTenswRes] = await Promise.all([
      settlement.tax_invoice_willow_id
        ? supabase.from('willow_finance_tax_invoices').select(INVOICE_COLUMNS).eq('id', settlement.tax_invoice_willow_id).maybeSingle()
        : Promise.resolve({ data: null as B2bInvoice | null, error: null }),
      settlement.tax_invoice_tensw_id
        ? supabase.from('tensw_codef_tax_invoices').select(INVOICE_COLUMNS).eq('id', settlement.tax_invoice_tensw_id).maybeSingle()
        : Promise.resolve({ data: null as B2bInvoice | null, error: null }),
    ])
    if (invoiceWillowRes.error) throw invoiceWillowRes.error
    if (invoiceTenswRes.error) throw invoiceTenswRes.error

    const [cashWillowRes, cashTenswRes] = await Promise.all([
      settlement.cash_willow_ids?.length
        ? supabase.from('willow_mgmt_cash').select(CASH_COLUMNS).in('id', settlement.cash_willow_ids)
        : Promise.resolve({ data: [] as B2bCashRow[], error: null }),
      settlement.cash_tensw_ids?.length
        ? supabase.from('tensw_mgmt_cash').select(CASH_COLUMNS).in('id', settlement.cash_tensw_ids)
        : Promise.resolve({ data: [] as B2bCashRow[], error: null }),
    ])
    if (cashWillowRes.error) throw cashWillowRes.error
    if (cashTenswRes.error) throw cashTenswRes.error

    // 마감된 정산은 마감 시점에 얼린 대사 결과가 정본이다. 열려 있는 정산만 지금 값으로 다시 계산한다.
    let reconciliation = settlement.reconciliation as B2bReconciliation | null
    if (settlement.status !== 'closed') {
      const { data: reconData, error: reconErr } = await supabase.rpc('b2b_reconcile', { p_settlement: settlement.id })
      if (!reconErr) reconciliation = reconData as B2bReconciliation | null
    }

    return NextResponse.json({
      settlement: { ...settlement, reconciliation },
      agreement,
      engagement,
      works,
      documents: { confirmation, statement, bundle },
      invoices: {
        willow: (invoiceWillowRes.data ?? null) as B2bInvoice | null,
        tensw: (invoiceTenswRes.data ?? null) as B2bInvoice | null,
      },
      cash: {
        willow: (cashWillowRes.data ?? []) as B2bCashRow[],
        tensw: (cashTenswRes.data ?? []) as B2bCashRow[],
      },
    })
  } catch (error) {
    console.error('b2b settlement detail:', error)
    return NextResponse.json({ error: 'Failed to fetch settlement' }, { status: 500 })
  }
}
