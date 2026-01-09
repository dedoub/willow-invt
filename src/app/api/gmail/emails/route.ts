import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getGmailClient, parseEmail } from '@/lib/gmail-server'
import { analyzeEmails as analyzeEmailsSummary, type EmailForAnalysis as GeminiEmailForAnalysis } from '@/lib/gemini-server'
import {
  filterUnanalyzedEmails,
  analyzeEmail,
  saveEmailMetadata,
  saveEmailEmbedding,
  type EmailForAnalysis,
} from '@/lib/email-analysis'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

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

// 전체 요약 분석 재생성 및 저장
async function regenerateOverallSummary(
  userId: string,
  label: string,
  emails: Array<{
    id: string
    from: string
    fromName?: string
    to: string
    subject: string
    body: string
    date: string
    direction: 'inbound' | 'outbound'
    category?: string | null
  }>
) {
  try {
    if (emails.length === 0) {
      console.log('[Gmail] No emails to generate summary')
      return
    }

    console.log(`[Gmail] Regenerating overall summary for ${emails.length} emails`)

    // Gemini용 이메일 데이터 변환
    const emailsForSummary: GeminiEmailForAnalysis[] = emails.slice(0, 100).map(email => ({
      id: email.id,
      from: email.from,
      fromName: email.fromName,
      to: email.to,
      subject: email.subject,
      body: email.body,
      date: email.date,
      category: email.category,
      direction: email.direction,
    }))

    // Gemini로 전체 요약 분석
    const summaryResult = await analyzeEmailsSummary(emailsForSummary, label)

    // DB에 저장
    const { error: analysisError } = await supabase
      .from('email_analysis')
      .upsert({
        user_id: userId,
        label,
        analysis_data: summaryResult,
        generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,label',
      })

    if (analysisError) {
      console.error('[Gmail] Failed to save summary:', analysisError)
      return
    }

    console.log('[Gmail] Overall summary regenerated and saved')
  } catch (error) {
    console.error('[Gmail] Summary regeneration error:', error)
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

// 백그라운드 분석 함수 (비동기로 실행, 응답을 기다리지 않음)
async function triggerBackgroundAnalysis(
  userId: string,
  label: string,
  emails: Array<{
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
    category?: string | null
  }>
) {
  try {
    // 최근 30일 이메일만 분석 대상으로 필터링
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const recentEmails = emails.filter(e => new Date(e.date) >= thirtyDaysAgo)

    if (recentEmails.length === 0) {
      console.log('[Gmail] No recent emails (within 30 days) to analyze')
      return
    }

    const messageIds = recentEmails.map(e => e.id)
    const unanalyzedIds = await filterUnanalyzedEmails(userId, messageIds)

    if (unanalyzedIds.length === 0) {
      console.log('[Gmail] All recent emails already analyzed')
      return
    }

    console.log(`[Gmail] Found ${unanalyzedIds.length} unanalyzed emails (from ${recentEmails.length} recent emails)`)

    // 최근 이메일부터 정렬 후 최대 10개만 분석 (유료 플랜)
    const emailsToAnalyze = recentEmails
      .filter(e => unanalyzedIds.includes(e.id))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10)

    let analyzedCount = 0
    let rateLimited = false

    for (const email of emailsToAnalyze) {
      if (rateLimited) break

      try {
        const emailForAnalysis: EmailForAnalysis = {
          id: email.id,
          threadId: email.threadId,
          from: email.from,
          fromName: email.fromName,
          to: email.to,
          subject: email.subject,
          body: email.body,
          date: email.date,
          direction: email.direction,
          labels: email.labels,
        }

        const analysis = await analyzeEmail(emailForAnalysis)

        // 분석 결과 유효성 검사
        if (!analysis || !analysis.messageId || !analysis.summary) {
          console.warn(`[Gmail] Invalid analysis result for email ${email.id}, skipping`)
          continue
        }

        await saveEmailMetadata(userId, analysis, {
          subject: email.subject,
          fromEmail: email.from,
          fromName: email.fromName,
          toEmail: email.to,
          date: email.date,
          direction: email.direction,
          labels: email.labels,
        })

        await saveEmailEmbedding(userId, analysis, {
          subject: email.subject,
          fromName: email.fromName,
          fromEmail: email.from,
        })

        console.log(`[Gmail] Analyzed email: ${email.id}`)
        analyzedCount++

        // Rate limit 방지를 위한 딜레이 (유료 플랜: 1초)
        if (analyzedCount < emailsToAnalyze.length) {
          await delay(1000)
        }
      } catch (error) {
        if (isRateLimitError(error)) {
          console.warn('[Gmail] Rate limit hit, stopping analysis')
          rateLimited = true
        } else {
          console.error(`[Gmail] Failed to analyze email ${email.id}:`, error)
        }
      }
    }

    console.log(`[Gmail] Background analysis completed (${analyzedCount} emails)`)

    // 새로운 이메일이 분석되었으면 전체 요약도 갱신 (rate limit 안 걸렸을 때만)
    if (analyzedCount > 0 && !rateLimited) {
      // 요약 생성도 rate limit 될 수 있으므로 딜레이 추가 (유료 플랜: 2초)
      await delay(2000)
      await regenerateOverallSummary(userId, label, emails)
    }
  } catch (error) {
    console.error('[Gmail] Background analysis error:', error)
  }
}

export async function GET(request: NextRequest) {
  try {
    const gmail = await getGmailClient()

    if (!gmail) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const label = searchParams.get('label') || 'INBOX'
    const maxResults = parseInt(searchParams.get('maxResults') || '100')
    const daysBack = parseInt(searchParams.get('daysBack') || '365') // 기본 1년

    // 날짜 필터 계산 (YYYY/MM/DD 형식)
    const afterDate = new Date()
    afterDate.setDate(afterDate.getDate() - daysBack)
    const afterDateStr = `${afterDate.getFullYear()}/${String(afterDate.getMonth() + 1).padStart(2, '0')}/${String(afterDate.getDate()).padStart(2, '0')}`

    console.log(`[Gmail] Fetching emails from last ${daysBack} days (after: ${afterDateStr})`)

    // 모든 라벨 조회
    const labelsRes = await gmail.users.labels.list({ userId: 'me' })
    const allLabels = labelsRes.data.labels || []

    // 부모 라벨과 하위 라벨 ID 매핑
    const labelMap = new Map<string, { id: string; name: string }>()
    let parentLabelId: string | null = null
    const subLabelIds: string[] = []

    for (const l of allLabels) {
      if (!l.name || !l.id) continue
      labelMap.set(l.id, { id: l.id, name: l.name })

      // 부모 라벨 찾기
      if (l.name.toLowerCase() === label.toLowerCase()) {
        parentLabelId = l.id
      }
      // 하위 라벨 찾기 (예: ETC-Bank/수수료, ETC-Bank/상품)
      if (l.name.toLowerCase().startsWith(label.toLowerCase() + '/')) {
        subLabelIds.push(l.id)
      }
    }

    // 디버깅 로그
    console.log('[Gmail] Searching for label:', label)
    console.log('[Gmail] Found parent label ID:', parentLabelId)
    console.log('[Gmail] Found sub-label IDs:', subLabelIds)
    console.log('[Gmail] All labels:', allLabels.map(l => ({ id: l.id, name: l.name })))

    // 부모 라벨 + 하위 라벨 모두에서 이메일 조회
    const labelIdsToSearch = parentLabelId ? [parentLabelId, ...subLabelIds] : subLabelIds

    if (labelIdsToSearch.length === 0) {
      console.log('[Gmail] No labels found to search')
      return NextResponse.json({ emails: [], labels: [], debug: { searchedLabel: label, allLabels: allLabels.map(l => l.name) } })
    }

    // 각 라벨에서 메시지 조회 후 합침 (페이지네이션으로 모든 이메일 수집)
    const messageMap = new Map<string, string[]>() // messageId -> labelIds

    console.log('[Gmail] Searching in labels:', labelIdsToSearch.map(id => labelMap.get(id)?.name))

    for (const labelId of labelIdsToSearch) {
      const labelName = labelMap.get(labelId)?.name || labelId
      let pageToken: string | null = null
      let totalForLabel = 0

      console.log(`[Gmail] Fetching from label "${labelName}"`)

      // 페이지네이션으로 모든 이메일 수집
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
            totalForLabel++
          }
        }

        if (listRes.data.nextPageToken) {
          pageToken = listRes.data.nextPageToken
        } else {
          hasMore = false
        }
      }

      console.log(`[Gmail] Found ${totalForLabel} messages in "${labelName}"`)
    }

    console.log(`[Gmail] Total unique messages found: ${messageMap.size}`)

    // 메시지 상세 조회 및 타입 결정 (maxResults로 제한 가능, 0이면 무제한)
    const allMessageIds = Array.from(messageMap.keys())
    const messageIds = maxResults > 0 ? allMessageIds.slice(0, maxResults) : allMessageIds

    console.log(`[Gmail] Processing ${messageIds.length} messages`)

    const emails = await Promise.all(
      messageIds.map(async msgId => {
        const msgRes = await gmail.users.messages.get({
          userId: 'me',
          id: msgId,
          format: 'full',
        })

        const parsed = parseEmail(msgRes.data)

        // 하위 라벨 기반 카테고리 결정 (예: ETC/키움 -> 키움)
        const msgLabels = msgRes.data.labelIds || []
        let category: string | null = null

        // 디버깅: 이메일별 라벨 확인
        const msgLabelNames = msgLabels.map(id => labelMap.get(id)?.name).filter(Boolean)
        console.log(`[Gmail] Email "${parsed.subject?.substring(0, 30)}..." has labels:`, msgLabelNames)

        // 하위 라벨에서 카테고리 추출 (예: "ETC/키움" -> "키움")
        for (const lblId of msgLabels) {
          const lblInfo = labelMap.get(lblId)
          if (lblInfo && lblInfo.name.toLowerCase().startsWith(label.toLowerCase() + '/')) {
            // 부모 라벨 이름 제거하여 카테고리 추출
            category = lblInfo.name.substring(label.length + 1)
            console.log(`[Gmail] -> Category: ${category} (from label: ${lblInfo.name})`)
            break
          }
        }

        if (!category) {
          console.log(`[Gmail] -> No sub-label category found`)
        }

        // 발신/수신 결정 (SENT 라벨 또는 from 주소로 판단)
        const isSent = msgLabels.includes('SENT')
        const direction: 'inbound' | 'outbound' = isSent ? 'outbound' : 'inbound'

        return {
          ...parsed,
          threadId: msgRes.data.threadId || undefined,
          labels: msgLabels,
          category,
          direction,
        }
      })
    )

    // 날짜순 정렬 (최신순)
    emails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    // 사용 가능한 카테고리 목록 반환 (하위 라벨에서 부모 라벨 제거)
    const availableCategories = subLabelIds
      .map(id => {
        const name = labelMap.get(id)?.name
        if (name && name.toLowerCase().startsWith(label.toLowerCase() + '/')) {
          return name.substring(label.length + 1)
        }
        return null
      })
      .filter((c): c is string => c !== null)

    console.log('[Gmail] Available categories:', availableCategories)

    // 자동 분석 트리거 (백그라운드에서 실행)
    const autoAnalyze = searchParams.get('autoAnalyze') !== 'false'
    const userId = await getCurrentUserId()

    if (autoAnalyze && userId && emails.length > 0) {
      // 분석용 데이터 준비
      const emailsForAnalysis = emails.map(email => ({
        id: email.id,
        threadId: email.threadId,
        from: email.from || '',
        fromName: email.fromName || undefined,
        to: email.to || '',
        subject: email.subject || '',
        body: email.body || '',
        date: email.date || new Date().toISOString(),
        direction: email.direction as 'inbound' | 'outbound',
        labels: email.labels,
        category: email.category,
      }))

      // 백그라운드 분석 트리거 (응답을 기다리지 않음)
      triggerBackgroundAnalysis(userId, label, emailsForAnalysis).catch(err => {
        console.error('[Gmail] Background analysis trigger failed:', err)
      })
    }

    return NextResponse.json({
      emails,
      categories: availableCategories,
      parentLabel: label,
    })
  } catch (error) {
    console.error('Error fetching emails:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const errorStack = error instanceof Error ? error.stack : ''
    console.error('Error details:', { message: errorMessage, stack: errorStack })
    return NextResponse.json({
      error: 'Failed to fetch emails',
      details: errorMessage
    }, { status: 500 })
  }
}
