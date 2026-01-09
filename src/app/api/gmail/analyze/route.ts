import { NextRequest, NextResponse } from 'next/server'
import { getGmailClient, parseEmail } from '@/lib/gmail-server'
import { analyzeEmails, EmailForAnalysis } from '@/lib/gemini-server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

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

// AI 컨텍스트 설정 조회
async function getAIContextSettings(): Promise<{ context_text: string; is_enabled: boolean } | null> {
  const userId = await getCurrentUserId()
  if (!userId) return null

  const { data } = await supabase
    .from('ai_context_settings')
    .select('context_text, is_enabled')
    .eq('user_id', userId)
    .single()

  return data
}

export async function POST(request: NextRequest) {
  try {
    // Gemini API 키 확인
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 })
    }

    const gmail = await getGmailClient()

    if (!gmail) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // AI 컨텍스트 설정 조회
    const contextSettings = await getAIContextSettings()
    const customContext = contextSettings?.is_enabled && contextSettings?.context_text
      ? contextSettings.context_text
      : undefined

    const body = await request.json()
    const label = body.label || 'INBOX'
    const daysBack = body.daysBack || 30 // 분석은 기본 30일

    // 날짜 필터 계산
    const afterDate = new Date()
    afterDate.setDate(afterDate.getDate() - daysBack)
    const afterDateStr = `${afterDate.getFullYear()}/${String(afterDate.getMonth() + 1).padStart(2, '0')}/${String(afterDate.getDate()).padStart(2, '0')}`

    // 모든 라벨 조회
    const labelsRes = await gmail.users.labels.list({ userId: 'me' })
    const allLabels = labelsRes.data.labels || []

    // 라벨 매핑
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

    // 각 라벨에서 메시지 수집
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

    // 최대 100개 이메일만 분석 (API 제한 고려)
    const allMessageIds = Array.from(messageMap.keys())
    const messageIds = allMessageIds.slice(0, 100)

    // 이메일 상세 조회
    const emailsForAnalysis: EmailForAnalysis[] = await Promise.all(
      messageIds.map(async msgId => {
        const msgRes = await gmail.users.messages.get({
          userId: 'me',
          id: msgId,
          format: 'full',
        })

        const parsed = parseEmail(msgRes.data)
        const msgLabels = msgRes.data.labelIds || []

        // 카테고리 추출
        let category: string | null = null
        for (const lblId of msgLabels) {
          const lblInfo = labelMap.get(lblId)
          if (lblInfo && lblInfo.name.toLowerCase().startsWith(label.toLowerCase() + '/')) {
            category = lblInfo.name.substring(label.length + 1)
            break
          }
        }

        // 발신/수신 결정
        const isSent = msgLabels.includes('SENT')
        const direction: 'inbound' | 'outbound' = isSent ? 'outbound' : 'inbound'

        return {
          id: parsed.id,
          from: parsed.from,
          fromName: parsed.fromName,
          to: parsed.to,
          subject: parsed.subject,
          body: parsed.body || parsed.snippet,
          date: parsed.date,
          category,
          direction,
        }
      })
    )

    // Gemini로 분석 수행 (커스텀 컨텍스트 전달)
    const analysisResult = await analyzeEmails(emailsForAnalysis, label, customContext)

    return NextResponse.json(analysisResult)
  } catch (error) {
    console.error('Error analyzing emails:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to analyze emails' },
      { status: 500 }
    )
  }
}
