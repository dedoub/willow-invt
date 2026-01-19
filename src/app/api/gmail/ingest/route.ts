// 이메일 분석 및 벡터 임베딩 저장 API
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getGmailClient, parseEmail } from '@/lib/gmail-server'
import {
  analyzeEmail,
  saveEmailMetadata,
  saveEmailEmbedding,
  filterUnanalyzedEmails,
  type EmailForAnalysis,
  type IngestResult,
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

// 딜레이 함수
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Rate limit 에러 확인
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('429') || error.message.includes('Too Many Requests') || error.message.includes('quota')
  }
  return false
}

// GET: 라벨 기반 전체 일괄 처리 (과거 이메일 모두 분석)
export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const gmail = await getGmailClient()
    if (!gmail) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const label = searchParams.get('label') || 'ETC'
    const daysBack = parseInt(searchParams.get('daysBack') || '365')

    console.log(`[Ingest] Starting bulk analysis for label: ${label}, daysBack: ${daysBack}`)

    // 날짜 필터
    const afterDate = new Date()
    afterDate.setDate(afterDate.getDate() - daysBack)
    const afterDateStr = `${afterDate.getFullYear()}/${String(afterDate.getMonth() + 1).padStart(2, '0')}/${String(afterDate.getDate()).padStart(2, '0')}`

    // 라벨 조회
    const labelsRes = await gmail.users.labels.list({ userId: 'me' })
    const allLabels = labelsRes.data.labels || []

    const labelMap = new Map<string, { id: string; name: string }>()
    let parentLabelId: string | null = null
    const subLabelIds: string[] = []

    for (const l of allLabels) {
      if (!l.name || !l.id) continue
      labelMap.set(l.id, { id: l.id, name: l.name })

      if (l.name.toLowerCase() === label.toLowerCase()) {
        parentLabelId = l.id
      }
      if (l.name.toLowerCase().startsWith(label.toLowerCase() + '/')) {
        subLabelIds.push(l.id)
      }
    }

    const labelIdsToSearch = parentLabelId ? [parentLabelId, ...subLabelIds] : subLabelIds

    if (labelIdsToSearch.length === 0) {
      return NextResponse.json({ error: 'Label not found' }, { status: 404 })
    }

    // 모든 메시지 ID 수집
    const messageMap = new Map<string, string[]>()

    for (const labelId of labelIdsToSearch) {
      let pageToken: string | null = null
      let hasMore = true

      while (hasMore) {
        const listParams: { userId: string; labelIds: string[]; maxResults: number; q: string; pageToken?: string } = {
          userId: 'me',
          labelIds: [labelId],
          maxResults: 100,
          q: `after:${afterDateStr}`,
        }
        if (pageToken) {
          listParams.pageToken = pageToken
        }

        const listRes = await gmail.users.messages.list(listParams)

        for (const msg of listRes.data.messages || []) {
          if (msg.id) {
            const existing = messageMap.get(msg.id) || []
            existing.push(labelId)
            messageMap.set(msg.id, existing)
          }
        }

        if (listRes.data.nextPageToken) {
          pageToken = listRes.data.nextPageToken
        } else {
          hasMore = false
        }
      }
    }

    const allMessageIds = Array.from(messageMap.keys())
    console.log(`[Ingest] Found ${allMessageIds.length} total emails`)

    // 미분석 이메일 필터링
    const unanalyzedIds = await filterUnanalyzedEmails(userId, allMessageIds)
    console.log(`[Ingest] Found ${unanalyzedIds.length} unanalyzed emails`)

    if (unanalyzedIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All emails already analyzed',
        total: allMessageIds.length,
        analyzed: 0,
      })
    }

    // 이메일 상세 조회 및 분석
    let analyzedCount = 0
    let errorCount = 0
    let rateLimited = false

    for (const msgId of unanalyzedIds) {
      if (rateLimited) break

      try {
        // 이메일 상세 조회
        const msgRes = await gmail.users.messages.get({
          userId: 'me',
          id: msgId,
          format: 'full',
        })

        const parsed = parseEmail(msgRes.data)
        const msgLabels = msgRes.data.labelIds || []

        // 발신/수신 결정
        const isSent = msgLabels.includes('SENT')
        const direction: 'inbound' | 'outbound' = isSent ? 'outbound' : 'inbound'

        const emailForAnalysis: EmailForAnalysis = {
          id: parsed.id,
          threadId: msgRes.data.threadId || undefined,
          from: parsed.from || '',
          fromName: parsed.fromName || undefined,
          to: parsed.to || '',
          subject: parsed.subject || '',
          body: parsed.body || '',
          date: parsed.date || new Date().toISOString(),
          direction,
          labels: msgLabels,
        }

        // Gemini 분석
        const analysis = await analyzeEmail(emailForAnalysis)

        if (!analysis || !analysis.messageId || !analysis.summary) {
          console.warn(`[Ingest] Invalid analysis for ${msgId}, skipping`)
          errorCount++
          continue
        }

        // DB 저장
        await saveEmailMetadata(userId, analysis, {
          subject: parsed.subject || '',
          fromEmail: parsed.from || '',
          fromName: parsed.fromName,
          toEmail: parsed.to || '',
          date: parsed.date || new Date().toISOString(),
          direction,
          labels: msgLabels,
        }, 'manual')

        await saveEmailEmbedding(userId, analysis, {
          subject: parsed.subject || '',
          fromName: parsed.fromName,
          fromEmail: parsed.from || '',
        })

        analyzedCount++
        console.log(`[Ingest] Analyzed ${analyzedCount}/${unanalyzedIds.length}: ${parsed.subject?.substring(0, 50)}`)

        // 유료 플랜: 1초 딜레이
        await delay(1000)

      } catch (error) {
        if (isRateLimitError(error)) {
          console.warn('[Ingest] Rate limit hit, stopping')
          rateLimited = true
        } else {
          console.error(`[Ingest] Error processing ${msgId}:`, error)
          errorCount++
        }
      }
    }

    return NextResponse.json({
      success: true,
      total: allMessageIds.length,
      unanalyzed: unanalyzedIds.length,
      analyzed: analyzedCount,
      errors: errorCount,
      rateLimited,
    })

  } catch (error) {
    console.error('[Ingest] GET Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to ingest emails' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const gmail = await getGmailClient()
    if (!gmail) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 401 })
    }

    const body = await request.json()
    const { messageIds, options } = body as {
      messageIds: string[]
      options?: { forceReanalyze?: boolean }
    }

    if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
      return NextResponse.json(
        { error: 'messageIds array is required' },
        { status: 400 }
      )
    }

    // 이미 분석된 이메일 필터링 (forceReanalyze가 아닌 경우)
    let idsToProcess = messageIds
    if (!options?.forceReanalyze) {
      idsToProcess = await filterUnanalyzedEmails(userId, messageIds)
    }

    console.log(`[Ingest] Processing ${idsToProcess.length} of ${messageIds.length} emails`)

    const result: IngestResult = {
      processed: 0,
      skipped: messageIds.length - idsToProcess.length,
      errors: [],
      results: [],
    }

    // 각 이메일 처리
    for (const msgId of idsToProcess) {
      try {
        // Gmail에서 이메일 상세 조회
        const msgRes = await gmail.users.messages.get({
          userId: 'me',
          id: msgId,
          format: 'full',
        })

        const parsed = parseEmail(msgRes.data)
        const msgLabels = msgRes.data.labelIds || []
        const isSent = msgLabels.includes('SENT')
        const direction: 'inbound' | 'outbound' = isSent ? 'outbound' : 'inbound'

        // 분석용 데이터 준비
        const emailForAnalysis: EmailForAnalysis = {
          id: msgId,
          threadId: msgRes.data.threadId || undefined,
          from: parsed.from || '',
          fromName: parsed.fromName || undefined,
          to: parsed.to || '',
          subject: parsed.subject || '',
          body: parsed.body || '',
          date: parsed.date || new Date().toISOString(),
          direction,
          labels: msgLabels,
        }

        // AI 분석 수행
        const analysis = await analyzeEmail(emailForAnalysis)

        // 메타데이터 저장
        await saveEmailMetadata(userId, analysis, {
          subject: parsed.subject || '',
          fromEmail: parsed.from || '',
          fromName: parsed.fromName || undefined,
          toEmail: parsed.to || '',
          date: parsed.date || new Date().toISOString(),
          direction,
          labels: msgLabels,
        }, 'manual')

        // 임베딩 저장
        await saveEmailEmbedding(userId, analysis, {
          subject: parsed.subject || '',
          fromName: parsed.fromName || undefined,
          fromEmail: parsed.from || '',
        })

        result.processed++
        result.results.push(analysis)

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 100))
      } catch (error) {
        console.error(`[Ingest] Failed to process email ${msgId}:`, error)
        result.errors.push({
          messageId: msgId,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    console.log(`[Ingest] Completed: ${result.processed} processed, ${result.skipped} skipped, ${result.errors.length} errors`)

    return NextResponse.json(result)
  } catch (error) {
    console.error('[Ingest] Error:', error)
    return NextResponse.json(
      { error: 'Failed to ingest emails', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
