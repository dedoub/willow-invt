export const COMPANY_PREFIX = { willow: 'WI', tensw: 'TS' }

export const CATEGORIES = [
  'shareholders_meeting', 'board', 'exec_compensation', 'articles_rules',
  'registration', 'tax', 'contract', 'other',
]

export const DOC_TYPES = [
  // 결의계
  'minutes_shareholders', 'written_resolution_shareholders', 'waiver_notice',
  'minutes_board', 'resolution_board', 'compensation_notice', 'bonus_payment_resolution',
  'exec_contract', 'audit_notice', 'regulation',
  // 상시계
  'registry_extract', 'business_registration', 'license_permit', 'shareholder_list',
  'contract', 'tax_filing', 'tax_payment_proof', 'other',
  // b2b 용역 거래 원장
  'evidence_bundle',
]

export const RULE_TYPES = ['articles', 'retirement_regulation', 'bonus_regulation', 'survivor_regulation', 'other']

export const VERSION_KINDS = ['draft', 'final_signed', 'reissue']
export const IMMUTABLE_VERSION_KINDS = ['final_signed', 'reissue']

export const DECISION_STATUSES = ['draft', 'awaiting_signature', 'finalized', 'superseded', 'void']
export const ACTION_KINDS = ['confirm', 'sign', 'provide']

export const EVENT_TYPES = [
  'created', 'plan_recorded', 'draft_generated', 'action_done', 'version_added',
  'finalized', 'superseded', 'void', 'rule_registered', 'profile_snapshot',
]

export const GENESIS_HASH = '0'.repeat(64)
export const BUCKET = 'corp-records'
