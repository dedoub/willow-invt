// Gemini Embedding API 래퍼
// gemini-embedding-001 모델 사용 (768 dimensions)

import { GoogleGenerativeAI } from '@google/generative-ai'

const EMBEDDING_MODEL = 'gemini-embedding-001'

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set')
  }
  return new GoogleGenerativeAI(apiKey)
}

export interface EmbeddingResult {
  embedding: number[]
  model: string
}

/**
 * 단일 텍스트에 대한 임베딩 생성
 */
export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
  const genAI = getGeminiClient()
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL })

  const result = await model.embedContent(text)

  return {
    embedding: result.embedding.values,
    model: EMBEDDING_MODEL,
  }
}

/**
 * 여러 텍스트에 대한 배치 임베딩 생성
 * 병렬 처리로 효율성 향상
 */
export async function generateBatchEmbeddings(
  texts: string[],
  batchSize: number = 10
): Promise<EmbeddingResult[]> {
  const genAI = getGeminiClient()
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL })

  const results: EmbeddingResult[] = []

  // 배치 단위로 처리
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)

    const batchResults = await Promise.all(
      batch.map(async (text) => {
        try {
          const result = await model.embedContent(text)
          return {
            embedding: result.embedding.values,
            model: EMBEDDING_MODEL,
          }
        } catch (error) {
          console.error(`[Embedding] Failed to generate embedding:`, error)
          // 실패한 경우 빈 배열 반환
          return {
            embedding: [],
            model: EMBEDDING_MODEL,
          }
        }
      })
    )

    results.push(...batchResults)

    // Rate limiting: 배치 간 짧은 딜레이
    if (i + batchSize < texts.length) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  return results
}

/**
 * 이메일용 임베딩 텍스트 생성
 * 제목, 발신자, 의도, 토픽, 키워드, 요약을 조합
 */
export function createEmailEmbeddingText(params: {
  subject: string
  fromName?: string
  fromEmail?: string
  intent?: string
  topics?: string[]
  keywords?: string[]
  summary?: string
}): string {
  const parts: string[] = []

  if (params.subject) {
    parts.push(`[SUBJECT]: ${params.subject}`)
  }

  if (params.fromName || params.fromEmail) {
    const from = params.fromName
      ? `${params.fromName} <${params.fromEmail || ''}>`
      : params.fromEmail || ''
    parts.push(`[FROM]: ${from}`)
  }

  if (params.intent) {
    parts.push(`[INTENT]: ${params.intent}`)
  }

  if (params.topics && params.topics.length > 0) {
    parts.push(`[TOPICS]: ${params.topics.join(', ')}`)
  }

  if (params.keywords && params.keywords.length > 0) {
    parts.push(`[KEYWORDS]: ${params.keywords.join(', ')}`)
  }

  if (params.summary) {
    parts.push(`[SUMMARY]: ${params.summary}`)
  }

  return parts.join('\n')
}

/**
 * 코사인 유사도 계산 (클라이언트 사이드 비교용)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB)

  if (magnitude === 0) {
    return 0
  }

  return dotProduct / magnitude
}
