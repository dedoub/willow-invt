import { NextResponse } from 'next/server'
import { getGmailClient, GmailContext } from '@/lib/gmail-server'

// ============================================================
// 규칙 기반 이메일 자동 라벨 분류
// 발신자 도메인/이름 패턴으로 라벨 매칭
// ============================================================

interface LabelRule {
  label: string
  patterns: {
    from?: RegExp[]
    to?: RegExp[]
    subject?: RegExp[]
  }
}

const RULES: LabelRule[] = [
  // Akros
  {
    label: 'Akros',
    patterns: {
      from: [/akros/i, /아크로스/],
      subject: [/akros/i, /아크로스/, /KRX/i, /한국거래소/],
    },
  },
  {
    label: 'Akros/PR지원',
    patterns: {
      subject: [/PR.*아크로스/i, /아크로스.*PR/i, /보도자료.*아크로스/i, /아크로스.*보도/i, /press.*akros/i],
      from: [/pr@.*akros/i],
    },
  },
  {
    label: 'Akros/미국ETF',
    patterns: {
      subject: [/미국\s?ETF/i, /US.*ETF/i, /NYSE/i, /NASDAQ/i],
    },
  },
  // ETC - 하위 라벨 (구체적 → 일반 순서)
  {
    label: 'ETC/Core16',
    patterns: {
      from: [/coresixteen\.com/i, /core16/i, /코어16/],
      subject: [/core\s?16/i, /코어16/, /BOBP/i],
    },
  },
  {
    label: 'ETC/Kiwoom',
    patterns: {
      from: [/kiwoom/i, /키움/],
      subject: [/kiwoom/i, /키움/],
    },
  },
  {
    label: 'ETC/Hanwha',
    patterns: {
      from: [/hanwha/i, /한화/],
      subject: [/한화.*자산/i, /hanwha.*asset/i],
    },
  },
  {
    label: 'ETC/Assetplus',
    patterns: {
      from: [/assetplus/i, /에셋플러스/],
      subject: [/assetplus/i, /에셋플러스/],
    },
  },
  {
    label: 'ETC/Fee',
    patterns: {
      subject: [/수수료/, /보수.*지급/, /운용보수/, /fee.*payment/i, /management.*fee/i],
    },
  },
  // ETC - Archive
  {
    label: 'ETC - Archive/Fount ETFs',
    patterns: {
      from: [/fount/i, /파운트/],
      subject: [/fount/i, /파운트/],
    },
  },
  {
    label: 'ETC - Archive/Toss',
    patterns: {
      from: [/toss/i, /토스/],
      subject: [/toss.*증권/i, /토스.*증권/],
    },
  },
  {
    label: 'ETC - Archive/KPOP ETF',
    patterns: {
      subject: [/KPOP.*ETF/i, /K-POP.*ETF/i],
    },
  },
  // Willow
  {
    label: 'Willow',
    patterns: {
      from: [/willowinvt\.com/i, /윌로우/],
      to: [/willowinvt\.com/i],
      subject: [/윌로우/, /willow.*invest/i],
    },
  },
]

function classifyEmail(from: string, to: string, subject: string): string | null {
  // 구체적 라벨 먼저 매칭 (하위 → 상위 순서로 배열됨)
  for (const rule of RULES) {
    const { patterns } = rule
    const fromMatch = patterns.from?.some(p => p.test(from))
    const toMatch = patterns.to?.some(p => p.test(to))
    const subjectMatch = patterns.subject?.some(p => p.test(subject))

    if (fromMatch || toMatch || subjectMatch) {
      return rule.label
    }
  }
  return null
}

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const context = (searchParams.get('context') || 'default') as GmailContext
    const timeRange = searchParams.get('range') || '1d' // 기본 1일

    const gmail = await getGmailClient(context)
    if (!gmail) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // 1. 라벨 목록 조회
    const labelsRes = await gmail.users.labels.list({ userId: 'me' })
    const allLabels = (labelsRes.data.labels || []).filter(l => l.type === 'user' && l.id && l.name)
    const labelMap = new Map(allLabels.map(l => [l.name!, l.id!]))

    // 2. 미분류 이메일 조회
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: `newer_than:${timeRange} {in:inbox in:sent} -label:Akros -label:ETC -label:Willow`,
      maxResults: 50,
    })

    const messages = res.data.messages || []
    if (messages.length === 0) {
      return NextResponse.json({ labeled: 0, total: 0, results: [] })
    }

    // 3. 각 이메일 분류 + 라벨 적용
    const results: Array<{ id: string; from: string; subject: string; label: string | null; applied: boolean }> = []
    let labeled = 0

    for (const msg of messages) {
      if (!msg.id) continue

      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject'],
      })

      const headers = detail.data.payload?.headers || []
      const from = headers.find(h => h.name === 'From')?.value || ''
      const to = headers.find(h => h.name === 'To')?.value || ''
      const subject = headers.find(h => h.name === 'Subject')?.value || ''

      // 자동 발송 메일 제외
      if (from.includes('TENSW Todo')) continue

      const label = classifyEmail(from, to, subject)

      if (label) {
        const labelId = labelMap.get(label)
        if (labelId) {
          try {
            await gmail.users.messages.modify({
              userId: 'me',
              id: msg.id,
              requestBody: { addLabelIds: [labelId] },
            })
            labeled++
            results.push({ id: msg.id, from, subject, label, applied: true })
          } catch {
            results.push({ id: msg.id, from, subject, label, applied: false })
          }
        }
      } else {
        results.push({ id: msg.id, from, subject, label: null, applied: false })
      }
    }

    return NextResponse.json({ labeled, total: messages.length, results })
  } catch (error) {
    console.error('Auto-label error:', error)
    return NextResponse.json({ error: 'Failed to auto-label' }, { status: 500 })
  }
}
