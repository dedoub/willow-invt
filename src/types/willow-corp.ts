// 법인 서류함 읽기 모델. 쓰기는 scripts/corp-records.ts(CLI)만 한다.
export type CorpCompany = 'willow' | 'tensw'

export interface CorpDocumentVersion {
  id: string
  version_no: number
  kind: 'draft' | 'final_signed' | 'reissue'
  mime: string
  size_bytes: number
  sha256: string
  note: string | null
  generated_by: 'agent' | 'upload'
  created_at: string
}

export interface CorpDocument {
  id: string
  company: CorpCompany
  doc_no: string
  decision_id: string | null
  doc_type: string
  category: string
  title: string
  status: 'draft' | 'final'
  current_version_id: string | null
  issued_by: string | null
  issued_at: string | null
  valid_from: string | null
  valid_to: string | null
  counterparty: string | null
  contract_start: string | null
  contract_end: string | null
  tags: string[]
  created_at: string
  versions: CorpDocumentVersion[]
}

export interface CorpRuleArticle {
  no: string
  title: string
  text: string
}

export interface CorpRule {
  id: string
  company: CorpCompany
  rule_type: string
  title: string
  version_no: number
  effective_from: string
  effective_to: string | null
  parent_rule_id: string | null
  document_id: string | null
  note: string | null
  articles: CorpRuleArticle[]
  created_at: string
}

export interface CorpAction {
  id: string
  company: CorpCompany
  decision_id: string | null
  document_id: string | null
  kind: 'confirm' | 'sign' | 'provide'
  description: string
  status: 'pending' | 'done' | 'skipped'
  due_at: string | null
  done_at: string | null
  created_at: string
}

export interface CorpEvent {
  id: number
  company: CorpCompany
  entity_type: string
  entity_id: string
  event: string
  actor: string
  payload: Record<string, unknown>
  at: string
}

export const CORP_COMPANY_LABEL: Record<CorpCompany, string> = {
  willow: '윌로우인베스트먼트',
  tensw: '텐소프트웍스',
}

export const CORP_DOC_TYPE_LABEL: Record<string, string> = {
  minutes_shareholders: '주총 의사록',
  written_resolution_shareholders: '주주 서면결의',
  waiver_notice: '소집 생략 동의',
  minutes_board: '이사회 의사록',
  resolution_board: '이사회 결의',
  compensation_notice: '보수 결정 통지',
  bonus_payment_resolution: '상여 지급 결의',
  exec_contract: '임원 계약',
  audit_notice: '감사 통지',
  regulation: '정관·규정',
  registry_extract: '등기부등본',
  business_registration: '사업자등록증',
  license_permit: '인허가·신고',
  shareholder_list: '주주명부',
  contract: '계약서',
  tax_filing: '세무 신고',
  tax_payment_proof: '납부 증빙',
  evidence_bundle: '증빙 묶음',
  other: '기타',
}

export const CORP_RULE_TYPE_LABEL: Record<string, string> = {
  articles: '정관',
  retirement_regulation: '임원퇴직금규정',
  bonus_regulation: '임원상여금규정',
  survivor_regulation: '유족보상금규정',
  other: '기타 규정',
}

export const CORP_ACTION_KIND_LABEL: Record<CorpAction['kind'], string> = {
  confirm: '확인',
  sign: '서명',
  provide: '제출',
}

export const CORP_VERSION_KIND_LABEL: Record<CorpDocumentVersion['kind'], string> = {
  draft: '초안',
  final_signed: '확정본',
  reissue: '재발급',
}
