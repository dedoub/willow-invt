// 관련 이메일 검색 API (벡터 유사도 기반)
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getServiceSupabase } from '@/lib/supabase'
import {
  findSimilarEmails,
  type RelatedEmailsResult,
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

export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const messageId = searchParams.get('messageId')
    const limit = parseInt(searchParams.get('limit') || '10')
    const threshold = parseFloat(searchParams.get('threshold') || '0.7')

    if (!messageId) {
      return NextResponse.json(
        { error: 'messageId query parameter is required' },
        { status: 400 }
      )
    }

    // 소스 이메일 정보 조회
    const supabase = getServiceSupabase()
    const { data: sourceEmail } = await supabase
      .from('email_metadata')
      .select('gmail_message_id, subject, category, topics, entities')
      .eq('user_id', userId)
      .eq('gmail_message_id', messageId)
      .single()

    if (!sourceEmail) {
      return NextResponse.json(
        { error: 'Source email not found or not analyzed' },
        { status: 404 }
      )
    }

    // 유사 이메일 검색
    const relatedEmails = await findSimilarEmails(userId, messageId, {
      threshold,
      limit,
    })

    // 공유 토픽/엔티티 추출
    const sourceTopics = sourceEmail.topics || []
    const sourceEntities = sourceEmail.entities || {}

    // 관련 이메일들의 토픽/엔티티 조회
    const relatedIds = relatedEmails.map(e => e.messageId)
    let sharedTopics: string[] = []
    let sharedEntities: string[] = []

    if (relatedIds.length > 0) {
      const { data: relatedMetadata } = await supabase
        .from('email_metadata')
        .select('topics, entities')
        .eq('user_id', userId)
        .in('gmail_message_id', relatedIds)

      if (relatedMetadata) {
        // 모든 토픽 수집
        const allTopics = relatedMetadata.flatMap(m => m.topics || [])
        // 소스와 겹치는 토픽 찾기
        sharedTopics = [...new Set(allTopics.filter(t => sourceTopics.includes(t)))]

        // 모든 회사/제품 엔티티 수집
        const allCompanies = relatedMetadata.flatMap(m => m.entities?.companies || [])
        const allProducts = relatedMetadata.flatMap(m => m.entities?.products || [])
        const sourceCompanies = sourceEntities.companies || []
        const sourceProducts = sourceEntities.products || []

        sharedEntities = [
          ...new Set([
            ...allCompanies.filter((c: string) => sourceCompanies.includes(c)),
            ...allProducts.filter((p: string) => sourceProducts.includes(p)),
          ]),
        ]
      }
    }

    const result: RelatedEmailsResult = {
      sourceEmail: {
        id: sourceEmail.gmail_message_id,
        subject: sourceEmail.subject || '',
        category: sourceEmail.category,
      },
      relatedEmails,
      sharedTopics,
      sharedEntities,
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[Related] Error:', error)
    return NextResponse.json(
      { error: 'Failed to find related emails', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
