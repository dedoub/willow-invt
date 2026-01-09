// 이메일 카테고리 분류기
// 미국 상장 ETF 특화 키워드 기반 분류

import type {
  EmailCategory,
  CounterpartyType,
  ProductType,
} from './types'

// 카테고리별 감지 키워드 (대소문자 무시)
const CATEGORY_KEYWORDS: Record<EmailCategory, string[]> = {
  SETTLEMENT: [
    'custody fee', 'admin fee', 'transfer agent', 'wire', 'invoice',
    'dtcc', 'settlement', 'payment', 'billing', 'fee schedule',
    'expense', 'reconciliation', 'fund accounting',
    '정산', '수수료', '청구', '입금',
  ],
  TRADE: [
    'creation', 'redemption', 'basket', 'authorized participant',
    'in-kind', 'cash creation', 'pcf', 'nav', 'trade',
    'order', 'execution', 'ap', 'creation unit',
    '설정', '환매', '매매',
  ],
  COMPLIANCE: [
    'sec', '1940 act', 'prospectus', 'sai', 'n-port', 'n-cen',
    'form filing', 'finra', 'compliance', 'regulatory', 'audit',
    'disclosure', 'registration', 'exemption', 'rule',
    '컴플라이언스', '규정', '준법', '감사',
  ],
  PRODUCT: [
    'ticker', 'expense ratio', 'aum', 'launch', 'listing',
    'index', 'benchmark', 'rebalance', 'reconstitution',
    'etf', 'fund', 'strategy', 'factsheet',
    '상품', '출시', '신규', 'ETF',
  ],
  CLIENT_SERVICE: [
    'rfp', 'due diligence', 'inquiry', 'client', 'investor',
    'request', 'question', 'support', 'service',
    '문의', '고객', '투자자',
  ],
  MARKET_RESEARCH: [
    'market outlook', 'flows', 'performance', 'commentary',
    'research', 'analysis', 'outlook', 'forecast', 'trend',
    '시장', '전망', '분석', '리서치',
  ],
  REPORT: [
    'fact sheet', 'monthly report', 'holdings', 'attribution',
    'quarterly', 'annual report', 'performance report',
    'board', 'trustee', 'minutes',
    '보고서', '리포트', '실적',
  ],
  MEETING: [
    'meeting', 'call', 'conference', 'schedule', 'calendar',
    'zoom', 'teams', 'invite', 'agenda',
    '미팅', '회의', '일정', '콜',
  ],
  ACTION_REQUIRED: [
    'urgent', 'asap', 'approval', 'review required',
    'action needed', 'deadline', 'immediate', 'priority',
    'please confirm', 'please review', 'please approve',
    '긴급', '승인', '검토', '확인요청',
  ],
  GENERAL: [],
}

// 상대방 유형별 키워드
const COUNTERPARTY_KEYWORDS: Record<CounterpartyType, string[]> = {
  Custodian: ['custodian', 'custody', 'bny mellon', 'state street', 'jpmorgan', 'citi'],
  Administrator: ['administrator', 'fund admin', 'nav calculation', 'fund accounting'],
  'Transfer Agent': ['transfer agent', 'shareholder services', 'ta'],
  AP: ['authorized participant', 'market maker', 'liquidity provider', 'citadel', 'jane street', 'virtu'],
  'Index Provider': ['index provider', 's&p', 'msci', 'ftse', 'bloomberg', 'ice', 'solactive'],
  Exchange: ['nyse', 'nasdaq', 'cboe', 'exchange', 'listing'],
  Regulator: ['sec', 'finra', 'cftc', 'regulator', 'examiner'],
  Internal: ['internal', '@company'],
  Client: ['investor', 'client', 'advisor', 'ria', 'broker'],
  Unknown: [],
}

// 상품 유형별 키워드
const PRODUCT_TYPE_KEYWORDS: Record<ProductType, string[]> = {
  'Equity ETF': ['equity', 'stock', 's&p', 'nasdaq', 'russell', 'growth', 'value', 'dividend'],
  'Fixed Income ETF': ['fixed income', 'bond', 'treasury', 'corporate bond', 'high yield', 'investment grade', 'duration'],
  'Commodity ETF': ['commodity', 'gold', 'silver', 'oil', 'natural gas', 'agriculture'],
  'Thematic ETF': ['thematic', 'sector', 'esg', 'clean energy', 'ai', 'tech', 'healthcare'],
  'Leveraged-Inverse': ['leveraged', 'inverse', '2x', '3x', '-1x', 'ultra', 'short'],
  Unknown: [],
}

/**
 * 텍스트에서 키워드 매칭 점수 계산
 */
function calculateKeywordScore(text: string, keywords: string[]): number {
  const lowerText = text.toLowerCase()
  let score = 0

  for (const keyword of keywords) {
    if (lowerText.includes(keyword.toLowerCase())) {
      // 더 긴 키워드에 더 높은 가중치
      score += 1 + (keyword.length > 10 ? 1 : 0)
    }
  }

  return score
}

/**
 * 이메일 카테고리 분류
 */
export function classifyEmailCategory(
  subject: string,
  body: string
): { category: EmailCategory; confidence: number } {
  const combinedText = `${subject} ${body}`
  const scores: Record<EmailCategory, number> = {
    SETTLEMENT: 0,
    TRADE: 0,
    COMPLIANCE: 0,
    PRODUCT: 0,
    CLIENT_SERVICE: 0,
    MARKET_RESEARCH: 0,
    REPORT: 0,
    MEETING: 0,
    ACTION_REQUIRED: 0,
    GENERAL: 0,
  }

  // 각 카테고리별 점수 계산
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    scores[category as EmailCategory] = calculateKeywordScore(combinedText, keywords)
  }

  // 가장 높은 점수의 카테고리 선택
  let maxCategory: EmailCategory = 'GENERAL'
  let maxScore = 0

  for (const [category, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score
      maxCategory = category as EmailCategory
    }
  }

  // 신뢰도 계산 (0-1)
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0)
  const confidence = totalScore > 0 ? maxScore / totalScore : 0

  // 점수가 너무 낮으면 GENERAL로 분류
  if (maxScore < 2) {
    return { category: 'GENERAL', confidence: 0.5 }
  }

  return { category: maxCategory, confidence: Math.min(confidence, 1) }
}

/**
 * 상대방 유형 추론
 */
export function inferCounterpartyType(
  fromEmail: string,
  fromName: string,
  body: string
): CounterpartyType {
  const combinedText = `${fromEmail} ${fromName} ${body}`.toLowerCase()

  for (const [type, keywords] of Object.entries(COUNTERPARTY_KEYWORDS)) {
    if (type === 'Unknown') continue

    for (const keyword of keywords) {
      if (combinedText.includes(keyword.toLowerCase())) {
        return type as CounterpartyType
      }
    }
  }

  return 'Unknown'
}

/**
 * 상품 유형 추론
 */
export function inferProductType(
  subject: string,
  body: string
): ProductType {
  const combinedText = `${subject} ${body}`.toLowerCase()

  const scores: Partial<Record<ProductType, number>> = {}

  for (const [type, keywords] of Object.entries(PRODUCT_TYPE_KEYWORDS)) {
    if (type === 'Unknown') continue
    scores[type as ProductType] = calculateKeywordScore(combinedText, keywords)
  }

  let maxType: ProductType = 'Unknown'
  let maxScore = 0

  for (const [type, score] of Object.entries(scores)) {
    if (score && score > maxScore) {
      maxScore = score
      maxType = type as ProductType
    }
  }

  return maxScore > 0 ? maxType : 'Unknown'
}

/**
 * 긴급도 점수 계산 (1-5)
 */
export function calculateUrgencyScore(
  subject: string,
  body: string
): number {
  const combinedText = `${subject} ${body}`.toLowerCase()

  let score = 2 // 기본 점수

  // 긴급 키워드
  const urgentKeywords = ['urgent', 'asap', 'immediate', 'critical', 'deadline', '긴급']
  const highKeywords = ['important', 'priority', 'please confirm', 'action required', '중요']
  const lowKeywords = ['fyi', 'for your information', 'no action', 'just wanted to share']

  for (const keyword of urgentKeywords) {
    if (combinedText.includes(keyword)) {
      score = Math.max(score, 5)
      break
    }
  }

  for (const keyword of highKeywords) {
    if (combinedText.includes(keyword)) {
      score = Math.max(score, 4)
    }
  }

  for (const keyword of lowKeywords) {
    if (combinedText.includes(keyword)) {
      score = Math.min(score, 1)
    }
  }

  // 제목에 "RE:" 또는 "FW:"가 있으면 약간 높임 (진행 중인 대화)
  if (subject.toLowerCase().startsWith('re:') || subject.toLowerCase().startsWith('fw:')) {
    score = Math.max(score, 3)
  }

  return score
}

/**
 * 답장 필요 여부 판단
 */
export function requiresReply(
  subject: string,
  body: string,
  direction: 'inbound' | 'outbound'
): boolean {
  // 발신 메일은 답장 불필요
  if (direction === 'outbound') {
    return false
  }

  const combinedText = `${subject} ${body}`.toLowerCase()

  // 질문이 포함된 경우
  if (combinedText.includes('?')) {
    return true
  }

  // 요청 키워드
  const requestKeywords = [
    'please', 'could you', 'can you', 'would you',
    'let me know', 'confirm', 'approve', 'review',
    'respond', 'reply', 'get back',
    '부탁', '확인', '요청', '회신',
  ]

  for (const keyword of requestKeywords) {
    if (combinedText.includes(keyword)) {
      return true
    }
  }

  // FYI 성격의 이메일은 답장 불필요
  const noReplyKeywords = ['no reply needed', 'fyi', 'for your information', 'no action required']

  for (const keyword of noReplyKeywords) {
    if (combinedText.includes(keyword)) {
      return false
    }
  }

  return false
}
