import { createCorpDb } from '../corp-records/db.mjs'
import { COMPANIES, FEE_BASIS, PRICING_METHODS, SETTLEMENT_STATUSES, EVIDENCE_KINDS } from './constants.mjs'
import { computeFee, computePricing, assertBasisAllowed } from './pricing.mjs'
import { reconcile } from './reconcile.mjs'

function assertIn(list, value, label) {
  if (!list.includes(value)) throw new Error(`${label} must be one of ${list.join(', ')} (got ${value})`)
}

function unwrap({ data, error }, what) {
  if (error) throw new Error(`${what}: ${error.message}`)
  return data
}

const INVOICE_COLUMNS = 'approval_no, issue_date, supply_amount, tax_amount, total_amount'
const CASH_COLUMNS = 'id, payment_date, amount, counterparty, description'

export function createB2bDb({ url, key, actor = 'cli' }) {
  const corp = createCorpDb({ url, key, actor })
  const sb = corp.client

  async function nextRef(provider, client, kind, year) {
    return unwrap(await sb.rpc('b2b_next_ref_no', { p_provider: provider, p_client: client, p_kind: kind, p_year: year }), 'next_ref_no')
  }

  async function getAgreementOrThrow(id) {
    const rows = unwrap(await sb.from('b2b_agreements').select('*').eq('id', id).limit(1), 'agreement')
    if (!rows[0]) throw new Error(`agreement not found: ${id}`)
    return rows[0]
  }

  async function getWorkOrThrow(ref) {
    const rows = unwrap(await sb.from('b2b_work_records').select('*').eq('ref_no', ref).limit(1), 'work')
    if (!rows[0]) throw new Error(`work not found: ${ref}`)
    return rows[0]
  }

  async function getSettlementRow(ref) {
    const rows = unwrap(await sb.from('b2b_settlements').select('*').eq('ref_no', ref).limit(1), 'settlement')
    if (!rows[0]) throw new Error(`settlement not found: ${ref}`)
    return rows[0]
  }

  async function getDocOrNull(docNo) {
    if (!docNo) return null
    const rows = unwrap(await sb.from('willow_corp_documents').select('*').eq('doc_no', docNo).limit(1), 'document')
    return rows[0] ?? null
  }

  // ── 기본 용역계약 ──
  async function createAgreement({ provider, client, title, scope = [], rateCard = {}, effectiveFrom = null, effectiveTo = null, documentDocNo = null, approvalDecisionRef = null, sourceKey = null }) {
    assertIn(COMPANIES, provider, 'provider')
    assertIn(COMPANIES, client, 'client')
    if (!title) throw new Error('title required')
    const rows = unwrap(await sb.from('b2b_agreements').insert({
      provider_company: provider, client_company: client, title, scope, rate_card: rateCard,
      effective_from: effectiveFrom, effective_to: effectiveTo, document_doc_no: documentDocNo,
      approval_decision_ref: approvalDecisionRef, source_key: sourceKey,
    }).select(), 'insert agreement')
    const agreement = rows[0]
    await corp.appendEvent({ company: provider, entityType: 'b2b_agreement', entityId: agreement.id, event: 'created', payload: { title, client, source_key: sourceKey } })
    return agreement
  }

  async function activateAgreement(id) {
    const rows = unwrap(await sb.from('b2b_agreements').update({ status: 'active' }).eq('id', id).select(), 'activate agreement')
    if (!rows[0]) throw new Error(`agreement not found: ${id}`)
    await corp.appendEvent({ company: rows[0].provider_company, entityType: 'b2b_agreement', entityId: rows[0].id, event: 'activated', payload: {} })
    return rows[0]
  }

  async function listAgreements({ provider, client } = {}) {
    let q = sb.from('b2b_agreements').select('*').order('created_at', { ascending: false })
    if (provider) q = q.eq('provider_company', provider)
    if (client) q = q.eq('client_company', client)
    return unwrap(await q, 'list agreements')
  }

  // ── 프로젝트별 개별 약정 ──
  async function createEngagement({ agreementId, projectId = null, clientContractId = null, roleScope = [], feeBasis, feePercent = null, feeAmount = null, basisText, billingPlan = [], agreedAt = null, documentDocNo = null, sourceKey = null }) {
    assertIn(FEE_BASIS, feeBasis, 'fee_basis')
    const agreement = await getAgreementOrThrow(agreementId)
    assertBasisAllowed(basisText, { roleScope })
    let resolvedFeeAmount = feeAmount
    if (feeBasis === 'percent_of_contract') {
      if (!clientContractId) throw new Error('clientContractId required for percent_of_contract')
      const contractRows = unwrap(await sb.from('tensw_project_contracts').select('total_amount').eq('id', clientContractId).limit(1), 'contract')
      if (!contractRows[0]) throw new Error(`contract not found: ${clientContractId}`)
      resolvedFeeAmount = computeFee({ basis: feeBasis, percent: feePercent, contractAmount: Number(contractRows[0].total_amount), amount: feeAmount })
    }
    const year = new Date(agreedAt ?? Date.now()).getUTCFullYear()
    const ref = await nextRef(agreement.provider_company, agreement.client_company, 'engagement', year)
    const rows = unwrap(await sb.from('b2b_engagements').insert({
      ref_no: ref, agreement_id: agreementId, project_id: projectId, client_contract_id: clientContractId,
      provider_company: agreement.provider_company, client_company: agreement.client_company,
      role_scope: roleScope, fee_basis: feeBasis, fee_percent: feePercent, fee_amount: resolvedFeeAmount,
      basis_text: basisText, billing_plan: billingPlan, agreed_at: agreedAt, document_doc_no: documentDocNo, source_key: sourceKey,
    }).select(), 'insert engagement')
    const engagement = rows[0]
    await corp.appendEvent({ company: agreement.provider_company, entityType: 'b2b_engagement', entityId: engagement.ref_no, event: 'created', payload: { agreement_id: agreementId, fee_basis: feeBasis, fee_amount: resolvedFeeAmount, source_key: sourceKey } })
    return engagement
  }

  async function listEngagements({ agreementId } = {}) {
    let q = sb.from('b2b_engagements').select('*').order('created_at', { ascending: false })
    if (agreementId) q = q.eq('agreement_id', agreementId)
    return unwrap(await q, 'list engagements')
  }

  async function getEngagement(ref) {
    const rows = unwrap(await sb.from('b2b_engagements').select('*').eq('ref_no', ref).limit(1), 'engagement')
    if (!rows[0]) throw new Error(`engagement not found: ${ref}`)
    return rows[0]
  }

  // ── 업무기록 ──
  async function createWork({ agreementId, engagementId = null, projectId = null, title, requestedAt = null, periodFrom = null, periodTo = null, requestText = null, performedText = null, purpose = null, contacts = [], sourceKey = null }) {
    if (!title) throw new Error('title required')
    const agreement = await getAgreementOrThrow(agreementId)
    const year = new Date(requestedAt ?? periodFrom ?? Date.now()).getUTCFullYear()
    const ref = await nextRef(agreement.provider_company, agreement.client_company, 'work', year)
    const rows = unwrap(await sb.from('b2b_work_records').insert({
      ref_no: ref, agreement_id: agreementId, engagement_id: engagementId, project_id: projectId,
      provider_company: agreement.provider_company, client_company: agreement.client_company,
      title, requested_at: requestedAt, period_from: periodFrom, period_to: periodTo,
      request_text: requestText, performed_text: performedText, purpose, contacts, source_key: sourceKey,
    }).select(), 'insert work')
    const work = rows[0]
    await corp.appendEvent({ company: agreement.provider_company, entityType: 'b2b_work', entityId: work.ref_no, event: 'created', payload: { agreement_id: agreementId, engagement_id: engagementId, title, source_key: sourceKey } })
    return work
  }

  async function confirmWork(ref) {
    const work = await getWorkOrThrow(ref)
    const rows = unwrap(await sb.from('b2b_work_records').update({ status: 'confirmed' }).eq('id', work.id).select(), 'confirm work')
    await corp.appendEvent({ company: work.provider_company, entityType: 'b2b_work', entityId: ref, event: 'confirmed', payload: {} })
    return rows[0]
  }

  async function addEvidence({ workRef, kind, sourceTable = null, sourceId = null, title = null, url = null, occurredAt = null, docNo = null }) {
    assertIn(EVIDENCE_KINDS, kind, 'kind')
    const work = await getWorkOrThrow(workRef)
    const rows = unwrap(await sb.from('b2b_work_evidence').insert({
      work_record_id: work.id, provider_company: work.provider_company, client_company: work.client_company,
      kind, source_table: sourceTable, source_id: sourceId, title, url, occurred_at: occurredAt, doc_no: docNo,
    }).select(), 'insert evidence')
    await corp.appendEvent({ company: work.provider_company, entityType: 'b2b_work', entityId: workRef, event: 'evidence_added', payload: { kind, source_table: sourceTable, source_id: sourceId, doc_no: docNo } })
    return rows[0]
  }

  async function priceWork({ workRef, method, factors = {}, basisText, computedAmount = null, agreedAmount, decidedBy = null }) {
    assertIn(PRICING_METHODS, method, 'method')
    assertBasisAllowed(basisText, factors)
    if (agreedAmount == null) throw new Error('agreedAmount required')
    const work = await getWorkOrThrow(workRef)
    let resolvedComputed = computedAmount
    if (resolvedComputed == null && method === 'rate_card') {
      const agreement = await getAgreementOrThrow(work.agreement_id)
      const rateCard = agreement.rate_card
      if (rateCard && Object.keys(rateCard).length) {
        resolvedComputed = computePricing({ method, factors, rateCard })
      }
    }
    const existing = unwrap(await sb.from('b2b_pricings').select('id').eq('work_record_id', work.id).limit(1), 'existing pricing')
    const payload = {
      work_record_id: work.id, provider_company: work.provider_company, client_company: work.client_company,
      method, factors, basis_text: basisText, computed_amount: resolvedComputed, agreed_amount: agreedAmount,
      decided_by: decidedBy, decided_at: new Date().toISOString().slice(0, 10),
    }
    const pricingRows = existing[0]
      ? unwrap(await sb.from('b2b_pricings').update(payload).eq('id', existing[0].id).select(), 'update pricing')
      : unwrap(await sb.from('b2b_pricings').insert(payload).select(), 'insert pricing')
    unwrap(await sb.from('b2b_work_records').update({ status: 'priced' }).eq('id', work.id).select(), 'update work status')
    await corp.appendEvent({ company: work.provider_company, entityType: 'b2b_work', entityId: workRef, event: 'priced', payload: { method, agreed_amount: agreedAmount, computed_amount: resolvedComputed } })
    return pricingRows[0]
  }

  // ── 정산(청구) 단위 ──
  async function openSettlement({ agreementId, engagementId = null, periodLabel = null, supplyAmount, vatAmount, totalAmount = null, openedFrom, taxInvoiceWillowId = null, taxInvoiceTenswId = null, sourceKey = null }) {
    if (!['tax_invoice', 'work_records'].includes(openedFrom)) throw new Error(`openedFrom must be tax_invoice or work_records (got ${openedFrom})`)
    const agreement = await getAgreementOrThrow(agreementId)
    const resolvedTotal = totalAmount == null ? Number(supplyAmount) + Number(vatAmount) : totalAmount
    const year = new Date().getUTCFullYear()
    const ref = await nextRef(agreement.provider_company, agreement.client_company, 'settlement', year)
    const rows = unwrap(await sb.from('b2b_settlements').insert({
      ref_no: ref, agreement_id: agreementId, engagement_id: engagementId,
      provider_company: agreement.provider_company, client_company: agreement.client_company,
      period_label: periodLabel, supply_amount: supplyAmount, vat_amount: vatAmount, total_amount: resolvedTotal,
      opened_from: openedFrom, tax_invoice_willow_id: taxInvoiceWillowId, tax_invoice_tensw_id: taxInvoiceTenswId,
      source_key: sourceKey,
    }).select(), 'insert settlement')
    const settlement = rows[0]
    await corp.appendEvent({ company: agreement.provider_company, entityType: 'b2b_settlement', entityId: settlement.ref_no, event: 'opened', payload: { agreement_id: agreementId, engagement_id: engagementId, period_label: periodLabel, supply_amount: supplyAmount, source_key: sourceKey } })
    return settlement
  }

  async function attachWork(settlementRef, workRefs = []) {
    if (!workRefs.length) throw new Error('workRefs required')
    const settlement = await getSettlementRow(settlementRef)
    const rows = unwrap(await sb.from('b2b_work_records').update({ settlement_id: settlement.id, status: 'settled' }).in('ref_no', workRefs).select(), 'attach work')
    if (rows.length !== workRefs.length) {
      const found = new Set(rows.map((r) => r.ref_no))
      const missing = workRefs.filter((r) => !found.has(r))
      throw new Error(`work records not found: ${missing.join(', ')}`)
    }
    await corp.appendEvent({ company: settlement.provider_company, entityType: 'b2b_settlement', entityId: settlementRef, event: 'work_attached', payload: { work_refs: workRefs } })
    return rows
  }

  async function setDocuments(settlementRef, { confirmationDocNo, statementDocNo } = {}) {
    const settlement = await getSettlementRow(settlementRef)
    const patch = {}
    if (confirmationDocNo !== undefined) patch.confirmation_doc_no = confirmationDocNo
    if (statementDocNo !== undefined) patch.statement_doc_no = statementDocNo
    if (!Object.keys(patch).length) throw new Error('confirmationDocNo or statementDocNo required')
    const rows = unwrap(await sb.from('b2b_settlements').update(patch).eq('id', settlement.id).select(), 'set documents')
    await corp.appendEvent({ company: settlement.provider_company, entityType: 'b2b_settlement', entityId: settlementRef, event: 'documents_set', payload: { confirmation_doc_no: confirmationDocNo, statement_doc_no: statementDocNo } })
    return rows[0]
  }

  async function linkInvoices(settlementRef, { willowId, tenswId } = {}) {
    const settlement = await getSettlementRow(settlementRef)
    const patch = {}
    if (willowId !== undefined) patch.tax_invoice_willow_id = willowId
    if (tenswId !== undefined) patch.tax_invoice_tensw_id = tenswId
    if (!Object.keys(patch).length) throw new Error('willowId or tenswId required')
    const rows = unwrap(await sb.from('b2b_settlements').update(patch).eq('id', settlement.id).select(), 'link invoices')
    await corp.appendEvent({ company: settlement.provider_company, entityType: 'b2b_settlement', entityId: settlementRef, event: 'invoices_linked', payload: { willow_id: willowId, tensw_id: tenswId } })
    return rows[0]
  }

  async function linkCash(settlementRef, { willowIds, tenswIds } = {}) {
    const settlement = await getSettlementRow(settlementRef)
    const patch = {}
    if (willowIds !== undefined) patch.cash_willow_ids = willowIds
    if (tenswIds !== undefined) patch.cash_tensw_ids = tenswIds
    if (!Object.keys(patch).length) throw new Error('willowIds or tenswIds required')
    const rows = unwrap(await sb.from('b2b_settlements').update(patch).eq('id', settlement.id).select(), 'link cash')
    await corp.appendEvent({ company: settlement.provider_company, entityType: 'b2b_settlement', entityId: settlementRef, event: 'cash_linked', payload: { willow_ids: willowIds, tensw_ids: tenswIds } })
    return rows[0]
  }

  async function reconcileSettlement(ref) {
    const settlement = await getSettlementRow(ref)
    const result = unwrap(await sb.rpc('b2b_reconcile', { p_settlement: settlement.id }), 'reconcile')
    unwrap(await sb.from('b2b_settlements').update({ reconciliation: result }).eq('id', settlement.id).select(), 'store reconciliation')
    await corp.appendEvent({ company: settlement.provider_company, entityType: 'b2b_settlement', entityId: ref, event: 'reconciled', payload: result })
    return result
  }

  async function setStatus(ref, status) {
    assertIn(SETTLEMENT_STATUSES, status, 'status')
    const settlement = await getSettlementRow(ref)
    if (status === 'closed') {
      const result = await reconcileSettlement(ref)
      if (!result.ok) throw new Error(`settlement ${ref} cannot close: ${result.diffs.join(', ')}`)
    }
    const rows = unwrap(await sb.from('b2b_settlements').update({ status }).eq('id', settlement.id).select(), 'set status')
    await corp.appendEvent({ company: settlement.provider_company, entityType: 'b2b_settlement', entityId: ref, event: 'status_changed', payload: { from: settlement.status, to: status } })
    return rows[0]
  }

  async function setBundle(settlementRef, docNo) {
    const settlement = await getSettlementRow(settlementRef)
    const rows = unwrap(await sb.from('b2b_settlements').update({ bundle_doc_no: docNo }).eq('id', settlement.id).select(), 'set bundle')
    await corp.appendEvent({ company: settlement.provider_company, entityType: 'b2b_settlement', entityId: settlementRef, event: 'bundle_set', payload: { doc_no: docNo } })
    return rows[0]
  }

  async function listSettlements({ provider, client, status } = {}) {
    let q = sb.from('b2b_settlements').select('*').order('created_at', { ascending: false })
    if (provider) q = q.eq('provider_company', provider)
    if (client) q = q.eq('client_company', client)
    if (status) q = q.eq('status', status)
    return unwrap(await q, 'list settlements')
  }

  async function getSettlement(ref) {
    const settlement = await getSettlementRow(ref)
    const agreement = await getAgreementOrThrow(settlement.agreement_id)
    const engagement = settlement.engagement_id
      ? unwrap(await sb.from('b2b_engagements').select('*').eq('id', settlement.engagement_id).limit(1), 'engagement')[0] ?? null
      : null

    const workRows = unwrap(await sb.from('b2b_work_records').select('*').eq('settlement_id', settlement.id).order('created_at'), 'works')
    const works = []
    for (const w of workRows) {
      const evidence = unwrap(await sb.from('b2b_work_evidence').select('*').eq('work_record_id', w.id).order('created_at'), 'evidence')
      const pricingRows = unwrap(await sb.from('b2b_pricings').select('*').eq('work_record_id', w.id).limit(1), 'pricing')
      works.push({ ...w, evidence, pricing: pricingRows[0] ?? null })
    }

    const documents = {
      confirmation: await getDocOrNull(settlement.confirmation_doc_no),
      statement: await getDocOrNull(settlement.statement_doc_no),
      bundle: await getDocOrNull(settlement.bundle_doc_no),
    }

    const invoiceWillowRows = settlement.tax_invoice_willow_id
      ? unwrap(await sb.from('willow_finance_tax_invoices').select(INVOICE_COLUMNS).eq('id', settlement.tax_invoice_willow_id).limit(1), 'invoice willow')
      : []
    const invoiceTenswRows = settlement.tax_invoice_tensw_id
      ? unwrap(await sb.from('tensw_codef_tax_invoices').select(INVOICE_COLUMNS).eq('id', settlement.tax_invoice_tensw_id).limit(1), 'invoice tensw')
      : []
    const invoices = { willow: invoiceWillowRows[0] ?? null, tensw: invoiceTenswRows[0] ?? null }

    const cashWillow = settlement.cash_willow_ids?.length
      ? unwrap(await sb.from('willow_mgmt_cash').select(CASH_COLUMNS).in('id', settlement.cash_willow_ids), 'cash willow')
      : []
    const cashTensw = settlement.cash_tensw_ids?.length
      ? unwrap(await sb.from('tensw_mgmt_cash').select(CASH_COLUMNS).in('id', settlement.cash_tensw_ids), 'cash tensw')
      : []
    const cash = { willow: cashWillow, tensw: cashTensw }

    return { settlement, agreement, engagement, works, documents, invoices, cash }
  }

  // 대사 미리보기: 저장하지 않고 getSettlement의 데이터로 JS reconcile()을 돌린다 (CLI diff 미리보기용)
  async function previewReconcile(ref) {
    const bundle = await getSettlement(ref)
    const { settlement, engagement, works, documents, invoices, cash } = bundle

    const workSum = works.reduce((sum, w) => sum + Number(w.pricing?.agreed_amount ?? 0), 0)
    const cashProviderIn = cash.willow.reduce((sum, r) => sum + Number(r.amount), 0)
    const cashClientOut = Math.abs(cash.tensw.reduce((sum, r) => sum + Number(r.amount), 0))
    const documentsFinal = Boolean(
      documents.confirmation && documents.confirmation.status === 'final' &&
      documents.statement && documents.statement.status === 'final',
    )

    let engagementSettledBefore = 0
    if (engagement) {
      const rows = unwrap(await sb.from('b2b_settlements').select('supply_amount').eq('engagement_id', engagement.id).neq('id', settlement.id).in('status', ['paid', 'closed']), 'engagement settled before')
      engagementSettledBefore = rows.reduce((sum, r) => sum + Number(r.supply_amount), 0)
    }

    return reconcile({
      workSum,
      supplyAmount: Number(settlement.supply_amount),
      vatAmount: Number(settlement.vat_amount),
      totalAmount: Number(settlement.total_amount),
      invoiceProviderSupply: invoices.willow ? Number(invoices.willow.supply_amount) : null,
      invoiceClientSupply: invoices.tensw ? Number(invoices.tensw.supply_amount) : null,
      cashProviderIn,
      cashClientOut,
      engagementFee: engagement?.fee_amount != null ? Number(engagement.fee_amount) : null,
      engagementSettledBefore,
      documentsFinal,
    })
  }

  return {
    corp,
    nextRef,
    createAgreement, activateAgreement, listAgreements,
    createEngagement, listEngagements, getEngagement,
    createWork, confirmWork, addEvidence, priceWork,
    openSettlement, attachWork, setDocuments, linkInvoices, linkCash,
    setStatus, reconcileSettlement, previewReconcile, getSettlement, listSettlements, setBundle,
  }
}
