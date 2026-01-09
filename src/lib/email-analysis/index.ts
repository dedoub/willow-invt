// 이메일 분석 모듈 메인 export

// Types
export type {
  EmailCategory,
  ProductType,
  CounterpartyType,
  Priority,
  Sentiment,
  EmailIntent,
  ExtractedEntities,
  ActionItem,
  EmailForAnalysis,
  SingleEmailAnalysis,
  EmailEmbedding,
  SimilarEmail,
  EmailCluster,
  ClusterInsights,
  EmailMetadataRow,
  EmailEmbeddingRow,
  IngestResult,
  RelatedEmailsResult,
  SemanticSearchResult,
} from './types'

// Classifier functions
export {
  classifyEmailCategory,
  inferCounterpartyType,
  inferProductType,
  calculateUrgencyScore,
  requiresReply,
} from './classifier'

// Analyzer functions
export {
  analyzeEmail,
  analyzeEmails,
} from './analyzer'

// Similarity functions
export {
  saveEmailMetadata,
  saveEmailEmbedding,
  findSimilarEmails,
  semanticSearch,
  isEmailAnalyzed,
  filterUnanalyzedEmails,
} from './similarity'
