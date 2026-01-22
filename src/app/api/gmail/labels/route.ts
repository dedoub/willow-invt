import { NextResponse } from 'next/server'
import { getGmailClient, GmailContext } from '@/lib/gmail-server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const context = (searchParams.get('context') || 'default') as GmailContext
    const gmail = await getGmailClient(context)

    if (!gmail) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const labelsRes = await gmail.users.labels.list({ userId: 'me' })
    const allLabels = labelsRes.data.labels || []

    // 사용자가 만든 라벨만 필터링 (시스템 라벨 제외)
    const userLabels = allLabels.filter(l => l.type === 'user')
    const systemLabels = allLabels.filter(l => l.type === 'system')

    // 부모-자식 관계로 그룹화
    const labelTree: Record<string, string[]> = {}

    for (const label of userLabels) {
      if (!label.name) continue

      if (label.name.includes('/')) {
        // 하위 라벨
        const parentName = label.name.split('/')[0]
        if (!labelTree[parentName]) {
          labelTree[parentName] = []
        }
        labelTree[parentName].push(label.name)
      } else {
        // 부모 라벨
        if (!labelTree[label.name]) {
          labelTree[label.name] = []
        }
      }
    }

    return NextResponse.json({
      userLabels: userLabels.map(l => ({ id: l.id, name: l.name, type: l.type })),
      systemLabels: systemLabels.map(l => ({ id: l.id, name: l.name, type: l.type })),
      labelTree,
      hint: '하위 라벨 분류를 사용하려면 Gmail에서 "ETC/수수료", "ETC/상품" 형태의 라벨을 만들어주세요.',
    })
  } catch (error) {
    console.error('Error fetching labels:', error)
    return NextResponse.json({ error: 'Failed to fetch labels' }, { status: 500 })
  }
}
