import { NextRequest, NextResponse } from 'next/server'
import { getGmailClient, parseEmail } from '@/lib/gmail-server'

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
