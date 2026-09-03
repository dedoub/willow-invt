export const COMPANY_INITIAL = { willow: 'W', tensw: 'T', biblo: 'B' }

export const COMPANIES = Object.keys(COMPANY_INITIAL)

export const REF_KINDS = { work: '', engagement: 'E', settlement: 'S' }

export const FEE_BASIS = ['fixed', 'percent_of_contract', 'rate_card']

export const PRICING_METHODS = ['rate_card', 'comparable', 'lump_sum']

export const SETTLEMENT_STATUSES = [
  'open', 'evidence_drafted', 'confirmed', 'documents_ready', 'paid', 'closed', 'disputed',
]

export const WORK_STATUSES = ['draft', 'confirmed', 'priced', 'settled']

export const EVIDENCE_KINDS = [
  'todo', 'comment', 'wiki', 'email', 'file', 'commit', 'meeting', 'doc', 'other',
]

export const FORBIDDEN_BASIS = ['이익', '잉여', '현금 잔', '남은 돈', '배분']
