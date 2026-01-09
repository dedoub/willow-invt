// 이메일 분석 시스템 타입 정의

// 미국 상장 ETF 특화 카테고리
export type EmailCategory =
  | 'SETTLEMENT'      // 결제, 정산, 수수료
  | 'TRADE'           // Creation/Redemption, 거래
  | 'COMPLIANCE'      // SEC, 규제, 컴플라이언스
  | 'PRODUCT'         // ETF 상품 정보, 신규 출시
  | 'CLIENT_SERVICE'  // 투자자/고객 문의
  | 'MARKET_RESEARCH' // 시장 동향, 리서치
  | 'REPORT'          // 보고서, Fact Sheet
  | 'MEETING'         // 미팅, 컨퍼런스콜
  | 'ACTION_REQUIRED' // 즉시 조치/승인 필요
  | 'GENERAL'         // 기타 일반 업무

// 부가 속성
export type ProductType =
  | 'Equity ETF'
  | 'Fixed Income ETF'
  | 'Commodity ETF'
  | 'Thematic ETF'
  | 'Leveraged-Inverse'
  | 'Unknown'

export type CounterpartyType =
  | 'Custodian'
  | 'Administrator'
  | 'Transfer Agent'
  | 'AP'              // Authorized Participant
  | 'Index Provider'
  | 'Exchange'
  | 'Regulator'
  | 'Internal'
  | 'Client'
  | 'Unknown'

export type Priority = 'Low' | 'Medium' | 'High' | 'Critical'

export type Sentiment = 'positive' | 'neutral' | 'negative'

export type EmailIntent =
  | 'request'    // 요청
  | 'inform'     // 정보 전달
  | 'confirm'    // 확인
  | 'inquiry'    // 문의
  | 'follow_up'  // 후속 조치
  | 'response'   // 답변
  | 'alert'      // 알림/경고
  | 'unknown'

// 추출된 엔티티
export interface ExtractedEntities {
  people: string[]
  companies: string[]
  products: string[]
  tickers: string[]
  amounts: string[]
  dates: string[]
}

// 액션 아이템
export interface ActionItem {
  task: string
  dueDate?: string
  priority: Priority
  owner?: string
}

// 이메일 분석 입력
export interface EmailForAnalysis {
  id: string
  threadId?: string
  from: string
  fromName?: string
  to: string
  subject: string
  body: string
  date: string
  direction: 'inbound' | 'outbound'
  labels?: string[]
}

// 단일 이메일 분석 결과
export interface SingleEmailAnalysis {
  messageId: string
  threadId?: string

  // 분류
  category: EmailCategory
  subCategory?: string
  intent: EmailIntent

  // 감정/긴급도
  sentiment: Sentiment
  sentimentScore: number  // 0-1
  urgencyScore: number    // 1-5

  // 추출 데이터
  keywords: string[]
  entities: ExtractedEntities
  topics: string[]
  actionItems: ActionItem[]
  summary: string

  // 부가 속성
  productType?: ProductType
  counterpartyType?: CounterpartyType
  priority: Priority
  requiresReply: boolean
}

// 임베딩 결과
export interface EmailEmbedding {
  messageId: string
  threadId?: string
  embedding: number[]
  embeddingText: string
  model: string
}

// 유사 이메일 결과
export interface SimilarEmail {
  messageId: string
  threadId?: string
  similarity: number
  subject?: string
  date?: string
  category?: EmailCategory
}

// 이메일 클러스터
export interface EmailCluster {
  id: string
  name: string
  type: 'thread' | 'topic' | 'entity' | 'similarity' | 'auto'
  description?: string
  emailIds: string[]
  centroid?: number[]
  contextSummary?: string
  insights?: ClusterInsights
}

// 클러스터 인사이트
export interface ClusterInsights {
  situation: string
  timeline: Array<{ date: string; event: string }>
  stakeholders: Array<{ name: string; role: string; sentiment?: Sentiment }>
  openIssues: string[]
  actionItems: ActionItem[]
  suggestedNextSteps: string[]
}

// DB 저장용 메타데이터
export interface EmailMetadataRow {
  id?: string
  user_id: string
  gmail_message_id: string
  gmail_thread_id?: string
  subject?: string
  from_email?: string
  from_name?: string
  to_email?: string
  date?: string
  direction?: 'inbound' | 'outbound'
  gmail_labels?: string[]
  category?: EmailCategory
  sub_category?: string
  sentiment?: Sentiment
  sentiment_score?: number
  urgency_score?: number
  intent?: EmailIntent
  requires_reply?: boolean
  keywords?: string[]
  entities?: ExtractedEntities
  topics?: string[]
  action_items?: ActionItem[]
  summary?: string
  product_type?: ProductType
  counterparty_type?: CounterpartyType
  priority?: Priority
  is_analyzed?: boolean
  analyzed_at?: string
}

// DB 저장용 임베딩
export interface EmailEmbeddingRow {
  id?: string
  user_id: string
  gmail_message_id: string
  gmail_thread_id?: string
  embedding: number[]
  embedding_text: string
  embedding_model?: string
}

// API 응답 타입
export interface IngestResult {
  processed: number
  skipped: number
  errors: Array<{ messageId: string; error: string }>
  results: SingleEmailAnalysis[]
}

export interface RelatedEmailsResult {
  sourceEmail: {
    id: string
    subject: string
    category?: EmailCategory
  }
  relatedEmails: SimilarEmail[]
  sharedTopics: string[]
  sharedEntities: string[]
}

export interface SemanticSearchResult {
  results: Array<{
    id: string
    subject: string
    snippet: string
    similarity: number
    category?: EmailCategory
    date?: string
  }>
  totalCount: number
}
