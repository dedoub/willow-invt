// 이메일 유사도 검색 및 벡터 연산

import { getServiceSupabase } from '@/lib/supabase'
import {
  generateEmbedding,
  createEmailEmbeddingText,
} from '@/lib/gemini-embeddings'
import type {
  SingleEmailAnalysis,
  EmailEmbedding,
  SimilarEmail,
  EmailMetadataRow,
  EmailEmbeddingRow,
} from './types'

// 문자열 길이 제한 (varchar(255) 대응)
function truncate(str: string | undefined | null, maxLen: number = 250): string | undefined {
  if (!str) return undefined
  return str.length > maxLen ? str.substring(0, maxLen) + '...' : str
}

// Gmail 날짜 형식을 ISO 형식으로 변환
// 예: "Mon, 5 Jan 2026 16:11:24 +0900 (KST)" -> "2026-01-05T16:11:24+09:00"
function normalizeDate(dateStr: string | undefined | null): string {
  if (!dateStr) return new Date().toISOString()

  try {
    // 괄호 안의 시간대 이름 제거 (예: "(KST)", "(PST)")
    const cleanedDate = dateStr.replace(/\s*\([A-Z]{2,5}\)\s*$/, '').trim()

    // Date 객체로 파싱
    const parsed = new Date(cleanedDate)

    // 유효한 날짜인지 확인
    if (isNaN(parsed.getTime())) {
      console.warn('[Similarity] Invalid date, using current time:', dateStr)
      return new Date().toISOString()
    }

    return parsed.toISOString()
  } catch {
    console.warn('[Similarity] Failed to parse date, using current time:', dateStr)
    return new Date().toISOString()
  }
}

/**
 * 이메일 메타데이터 저장
 */
export async function saveEmailMetadata(
  userId: string,
  analysis: SingleEmailAnalysis,
  emailData: {
    subject: string
    fromEmail: string
    fromName?: string
    toEmail: string
    date: string
    direction: 'inbound' | 'outbound'
    labels?: string[]
  }
): Promise<void> {
  const supabase = getServiceSupabase()

  const row: EmailMetadataRow = {
    user_id: userId,
    gmail_message_id: analysis.messageId,
    gmail_thread_id: analysis.threadId,
    subject: truncate(emailData.subject, 250),
    from_email: truncate(emailData.fromEmail, 250),
    from_name: truncate(emailData.fromName, 100),
    to_email: truncate(emailData.toEmail, 250),
    date: normalizeDate(emailData.date),
    direction: emailData.direction,
    gmail_labels: emailData.labels,
    category: analysis.category,
    sentiment: analysis.sentiment,
    sentiment_score: analysis.sentimentScore,
    urgency_score: analysis.urgencyScore,
    intent: analysis.intent,
    requires_reply: analysis.requiresReply,
    keywords: Array.isArray(analysis.keywords) ? analysis.keywords.slice(0, 20) : undefined,
    entities: analysis.entities,
    topics: Array.isArray(analysis.topics) ? analysis.topics.slice(0, 10) : undefined,
    action_items: Array.isArray(analysis.actionItems) ? analysis.actionItems.slice(0, 10) : undefined,
    summary: truncate(analysis.summary, 250),
    product_type: analysis.productType,
    counterparty_type: analysis.counterpartyType,
    priority: analysis.priority,
    is_analyzed: true,
    analyzed_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('email_metadata')
    .upsert(row, { onConflict: 'user_id,gmail_message_id' })

  if (error) {
    console.error('[Similarity] Failed to save metadata:', error)
    throw error
  }
}

/**
 * 이메일 임베딩 생성 및 저장
 */
export async function saveEmailEmbedding(
  userId: string,
  analysis: SingleEmailAnalysis,
  emailData: {
    subject: string
    fromName?: string
    fromEmail: string
  }
): Promise<EmailEmbedding> {
  const supabase = getServiceSupabase()

  // 임베딩 텍스트 생성
  const embeddingText = createEmailEmbeddingText({
    subject: emailData.subject,
    fromName: emailData.fromName,
    fromEmail: emailData.fromEmail,
    intent: analysis.intent,
    topics: analysis.topics,
    keywords: analysis.keywords,
    summary: analysis.summary,
  })

  // 임베딩 생성
  const { embedding, model } = await generateEmbedding(embeddingText)

  const row: EmailEmbeddingRow = {
    user_id: userId,
    gmail_message_id: analysis.messageId,
    gmail_thread_id: analysis.threadId,
    embedding,
    embedding_text: embeddingText,
    embedding_model: model,
  }

  const { error } = await supabase
    .from('email_embeddings')
    .upsert(row, { onConflict: 'user_id,gmail_message_id' })

  if (error) {
    console.error('[Similarity] Failed to save embedding:', error)
    throw error
  }

  return {
    messageId: analysis.messageId,
    threadId: analysis.threadId,
    embedding,
    embeddingText,
    model,
  }
}

/**
 * 유사 이메일 검색 (벡터 유사도 기반)
 */
export async function findSimilarEmails(
  userId: string,
  messageId: string,
  options?: {
    threshold?: number
    limit?: number
  }
): Promise<SimilarEmail[]> {
  const supabase = getServiceSupabase()
  const threshold = options?.threshold || 0.7
  const limit = options?.limit || 10

  // 소스 이메일의 임베딩 조회
  const { data: sourceEmbedding, error: sourceError } = await supabase
    .from('email_embeddings')
    .select('embedding')
    .eq('user_id', userId)
    .eq('gmail_message_id', messageId)
    .single()

  if (sourceError || !sourceEmbedding) {
    console.error('[Similarity] Source embedding not found:', sourceError)
    return []
  }

  // RPC 함수로 유사 이메일 검색
  const { data: similarEmails, error: searchError } = await supabase
    .rpc('match_similar_emails', {
      query_embedding: sourceEmbedding.embedding,
      user_id_filter: userId,
      match_threshold: threshold,
      match_count: limit + 1, // 자기 자신 제외를 위해 +1
    })

  if (searchError) {
    console.error('[Similarity] Search failed:', searchError)
    return []
  }

  // 자기 자신 제외
  const filtered = (similarEmails || [])
    .filter((e: { gmail_message_id: string }) => e.gmail_message_id !== messageId)
    .slice(0, limit)

  // 메타데이터 조회
  if (filtered.length === 0) {
    return []
  }

  const messageIds = filtered.map((e: { gmail_message_id: string }) => e.gmail_message_id)

  const { data: metadata } = await supabase
    .from('email_metadata')
    .select('gmail_message_id, gmail_thread_id, subject, date, category')
    .eq('user_id', userId)
    .in('gmail_message_id', messageIds)

  const metadataMap = new Map(
    (metadata || []).map(m => [m.gmail_message_id, m])
  )

  return filtered.map((e: { gmail_message_id: string; gmail_thread_id: string; similarity: number }) => {
    const meta = metadataMap.get(e.gmail_message_id)
    return {
      messageId: e.gmail_message_id,
      threadId: e.gmail_thread_id,
      similarity: e.similarity,
      subject: meta?.subject,
      date: meta?.date,
      category: meta?.category,
    }
  })
}

/**
 * 쿼리 텍스트로 시맨틱 검색
 */
export async function semanticSearch(
  userId: string,
  query: string,
  options?: {
    threshold?: number
    limit?: number
    category?: string
    dateRange?: { start: string; end: string }
  }
): Promise<SimilarEmail[]> {
  const supabase = getServiceSupabase()
  const threshold = options?.threshold || 0.5
  const limit = options?.limit || 20

  // 쿼리 텍스트의 임베딩 생성
  const { embedding: queryEmbedding } = await generateEmbedding(query)

  // RPC 함수로 유사 이메일 검색
  const { data: results, error } = await supabase
    .rpc('match_similar_emails', {
      query_embedding: queryEmbedding,
      user_id_filter: userId,
      match_threshold: threshold,
      match_count: limit * 2, // 필터링 고려
    })

  if (error) {
    console.error('[Similarity] Semantic search failed:', error)
    return []
  }

  if (!results || results.length === 0) {
    return []
  }

  // 메타데이터 조회
  const messageIds = results.map((e: { gmail_message_id: string }) => e.gmail_message_id)

  let metadataQuery = supabase
    .from('email_metadata')
    .select('gmail_message_id, gmail_thread_id, subject, date, category')
    .eq('user_id', userId)
    .in('gmail_message_id', messageIds)

  // 필터 적용
  if (options?.category) {
    metadataQuery = metadataQuery.eq('category', options.category)
  }

  if (options?.dateRange) {
    metadataQuery = metadataQuery
      .gte('date', options.dateRange.start)
      .lte('date', options.dateRange.end)
  }

  const { data: metadata } = await metadataQuery

  const metadataMap = new Map(
    (metadata || []).map(m => [m.gmail_message_id, m])
  )

  // 메타데이터가 있는 결과만 반환
  return results
    .filter((e: { gmail_message_id: string }) => metadataMap.has(e.gmail_message_id))
    .slice(0, limit)
    .map((e: { gmail_message_id: string; gmail_thread_id: string; similarity: number }) => {
      const meta = metadataMap.get(e.gmail_message_id)!
      return {
        messageId: e.gmail_message_id,
        threadId: e.gmail_thread_id,
        similarity: e.similarity,
        subject: meta.subject,
        date: meta.date,
        category: meta.category,
      }
    })
}

/**
 * 이메일이 이미 분석되었는지 확인
 */
export async function isEmailAnalyzed(
  userId: string,
  messageId: string
): Promise<boolean> {
  const supabase = getServiceSupabase()

  const { data } = await supabase
    .from('email_metadata')
    .select('is_analyzed')
    .eq('user_id', userId)
    .eq('gmail_message_id', messageId)
    .single()

  return data?.is_analyzed === true
}

/**
 * 분석되지 않은 이메일 ID 필터링
 */
export async function filterUnanalyzedEmails(
  userId: string,
  messageIds: string[]
): Promise<string[]> {
  if (messageIds.length === 0) return []

  const supabase = getServiceSupabase()

  const { data } = await supabase
    .from('email_metadata')
    .select('gmail_message_id')
    .eq('user_id', userId)
    .eq('is_analyzed', true)
    .in('gmail_message_id', messageIds)

  const analyzedIds = new Set((data || []).map(d => d.gmail_message_id))

  return messageIds.filter(id => !analyzedIds.has(id))
}
