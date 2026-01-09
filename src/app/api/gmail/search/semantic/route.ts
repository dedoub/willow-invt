// 시맨틱 이메일 검색 API
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getServiceSupabase } from '@/lib/supabase'
import {
  semanticSearch,
  type SemanticSearchResult,
} from '@/lib/email-analysis'

// 현재 사용자 ID 가져오기
async function getCurrentUserId(): Promise<string | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) return null

  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    return payload.email || payload.sub || null
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()
    const { query, filters, limit } = body as {
      query: string
      filters?: {
        category?: string
        dateRange?: { start: string; end: string }
        direction?: 'inbound' | 'outbound'
      }
      limit?: number
    }

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'query string is required' },
        { status: 400 }
      )
    }

    console.log(`[SemanticSearch] Query: "${query}", Filters:`, filters)

    // 시맨틱 검색 실행
    const similarEmails = await semanticSearch(userId, query, {
      threshold: 0.5,
      limit: limit || 20,
      category: filters?.category,
      dateRange: filters?.dateRange,
    })

    // direction 필터가 있으면 추가 필터링
    let filteredEmails = similarEmails
    if (filters?.direction && similarEmails.length > 0) {
      const supabase = getServiceSupabase()
      const messageIds = similarEmails.map(e => e.messageId)

      const { data: directionData } = await supabase
        .from('email_metadata')
        .select('gmail_message_id, direction')
        .eq('user_id', userId)
        .eq('direction', filters.direction)
        .in('gmail_message_id', messageIds)

      const validIds = new Set((directionData || []).map(d => d.gmail_message_id))
      filteredEmails = similarEmails.filter(e => validIds.has(e.messageId))
    }

    // summary를 snippet으로 사용
    const supabase = getServiceSupabase()
    const messageIds = filteredEmails.map(e => e.messageId)
    let snippetMap = new Map<string, string>()

    if (messageIds.length > 0) {
      const { data: summaryData } = await supabase
        .from('email_metadata')
        .select('gmail_message_id, summary')
        .eq('user_id', userId)
        .in('gmail_message_id', messageIds)

      snippetMap = new Map(
        (summaryData || []).map(d => [d.gmail_message_id, d.summary || ''])
      )
    }

    const result: SemanticSearchResult = {
      results: filteredEmails.map(email => ({
        id: email.messageId,
        subject: email.subject || '',
        snippet: snippetMap.get(email.messageId) || '',
        similarity: email.similarity,
        category: email.category,
        date: email.date,
      })),
      totalCount: filteredEmails.length,
    }

    console.log(`[SemanticSearch] Found ${result.totalCount} results`)

    return NextResponse.json(result)
  } catch (error) {
    console.error('[SemanticSearch] Error:', error)
    return NextResponse.json(
      { error: 'Failed to search emails', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
