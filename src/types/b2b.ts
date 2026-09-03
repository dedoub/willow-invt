// B2B 용역 거래 원장 읽기 모델. 쓰기는 scripts/b2b-ledger.ts(CLI)만 한다.
// 스펙: docs/superpowers/specs/2026-09-03-b2b-service-ledger-design.md §5(데이터 모델)·§6(체인)

export type B2bCompany = 'willow' | 'tensw' | 'biblo'

export type B2bAgreementStatus = 'draft' | 'active' | 'terminated'
export type B2bEngagementStatus = 'draft' | 'active' | 'completed' | 'cancelled'
export type B2bFeeBasis = 'fixed' | 'percent_of_contract' | 'rate_card'
export type B2bWorkStatus = 'draft' | 'confirmed' | 'priced' | 'settled'
export type B2bEvidenceKind = 'todo' | 'comment' | 'wiki' | 'email' | 'file' | 'commit' | 'meeting' | 'doc' | 'other'
export type B2bPricingMethod = 'rate_card' | 'comparable' | 'lump_sum'
export type B2bSettlementStatus =
  | 'open' | 'evidence_drafted' | 'confirmed' | 'documents_ready' | 'paid' | 'closed' | 'disputed'
export type B2bOpenedFrom = 'tax_invoice' | 'work_records'

export interface B2bAgreement {
  id: string
  provider_company: B2bCompany
  client_company: B2bCompany
  title: string
  scope: unknown[]
  rate_card: unknown
  effective_from: string | null
  effective_to: string | null
  document_doc_no: string | null
  approval_decision_ref: string | null
  status: B2bAgreementStatus
  source_key: string | null
  created_at: string
  updated_at: string
}

export interface B2bEngagement {
  id: string
  ref_no: string
  agreement_id: string
  project_id: string | null
  client_contract_id: string | null
  provider_company: B2bCompany
  client_company: B2bCompany
  role_scope: unknown[]
  fee_basis: B2bFeeBasis
  fee_percent: number | null
  fee_amount: number | null
  basis_text: string | null
  billing_plan: unknown[]
  agreed_at: string | null
  document_doc_no: string | null
  status: B2bEngagementStatus
  source_key: string | null
  created_at: string
  updated_at: string
}

export interface B2bWorkEvidence {
  id: string
  work_record_id: string
  provider_company: B2bCompany
  client_company: B2bCompany
  kind: B2bEvidenceKind
  source_table: string | null
  source_id: string | null
  title: string | null
  url: string | null
  occurred_at: string | null
  doc_no: string | null
  created_at: string
}

export interface B2bPricing {
  id: string
  work_record_id: string
  provider_company: B2bCompany
  client_company: B2bCompany
  method: B2bPricingMethod
  factors: unknown
  basis_text: string
  computed_amount: number | null
  agreed_amount: number
  decided_at: string | null
  decided_by: string | null
  created_at: string
}

export interface B2bWorkRecord {
  id: string
  ref_no: string
  agreement_id: string
  engagement_id: string | null
  project_id: string | null
  provider_company: B2bCompany
  client_company: B2bCompany
  title: string
  requested_at: string | null
  period_from: string | null
  period_to: string | null
  request_text: string | null
  performed_text: string | null
  purpose: string | null
  contacts: unknown[]
  status: B2bWorkStatus
  settlement_id: string | null
  created_at: string
  updated_at: string
}

export interface B2bWorkRecordDetail extends B2bWorkRecord {
  evidence: B2bWorkEvidence[]
  pricing: B2bPricing | null
}

export interface B2bReconciliation {
  ok: boolean
  diffs: string[]
  figures: {
    work_sum: number
    supply_amount: number
    vat_amount: number
    total_amount: number
    invoice_provider_supply: number | null
    invoice_client_supply: number | null
    cash_provider_in: number
    cash_client_out: number
    engagement_fee: number | null
    engagement_settled_before: number | null
    engagement_remaining: number | null
    documents_final: boolean
  }
}

export interface B2bSettlement {
  id: string
  ref_no: string
  agreement_id: string
  engagement_id: string | null
  provider_company: B2bCompany
  client_company: B2bCompany
  period_label: string | null
  supply_amount: number
  vat_amount: number
  total_amount: number
  confirmation_doc_no: string | null
  statement_doc_no: string | null
  tax_invoice_willow_id: string | null
  tax_invoice_tensw_id: string | null
  cash_willow_ids: string[]
  cash_tensw_ids: string[]
  reconciliation: B2bReconciliation | null
  status: B2bSettlementStatus
  opened_from: B2bOpenedFrom | null
  bundle_doc_no: string | null
  source_key: string | null
  created_at: string
  updated_at: string
}

export interface B2bSettlementListItem extends B2bSettlement {
  agreement_title: string
  engagement_ref: string | null
  work_count: number
}

export interface B2bDocumentRef {
  doc_no: string
  title: string
  status: 'draft' | 'final'
  doc_type: string
}

export interface B2bInvoice {
  approval_no: string | null
  issue_date: string | null
  supply_amount: number
  tax_amount: number
  total_amount: number
}

export interface B2bCashRow {
  id: string
  payment_date: string
  amount: number
  counterparty: string | null
  description: string | null
}

export interface B2bSettlementDetail {
  settlement: B2bSettlement
  agreement: B2bAgreement
  engagement: B2bEngagement | null
  works: B2bWorkRecordDetail[]
  documents: {
    confirmation: B2bDocumentRef | null
    statement: B2bDocumentRef | null
    bundle: B2bDocumentRef | null
  }
  invoices: {
    willow: B2bInvoice | null
    tensw: B2bInvoice | null
  }
  cash: {
    willow: B2bCashRow[]
    tensw: B2bCashRow[]
  }
}

export const B2B_COMPANY_LABEL: Record<B2bCompany, string> = {
  willow: '윌로우',
  tensw: '텐소',
  biblo: '비블로',
}

export const B2B_SETTLEMENT_STATUS_LABEL: Record<B2bSettlementStatus, string> = {
  open: '개시',
  evidence_drafted: '증빙 초안',
  confirmed: '확인됨',
  documents_ready: '문서 완료',
  paid: '입금 완료',
  closed: '닫힘',
  disputed: '불일치',
}

/** 대사 diff 코드 → 한글 라벨. reconcile.mjs / b2b_reconcile()과 코드가 일치해야 한다. */
export const B2B_DIFF_LABEL: Record<string, string> = {
  work_sum_mismatch: '업무기록 합계 불일치',
  invoice_provider_missing: '공급자 세금계산서 없음',
  invoice_client_missing: '공급받는자 세금계산서 없음',
  invoice_provider_mismatch: '공급자 세금계산서 금액 불일치',
  invoice_client_mismatch: '공급받는자 세금계산서 금액 불일치',
  total_mismatch: '합계 불일치',
  cash_provider_mismatch: '수취 금액 불일치',
  cash_client_mismatch: '지급 금액 불일치',
  engagement_cap_exceeded: '약정 상한 초과',
  documents_not_final: '문서 미확정',
}
