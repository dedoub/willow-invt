// Gmail API 서비스
// 실제 구현 시 googleapis 패키지 사용
// npm install googleapis

import { ParsedEmail, EmailSyncStatus, GmailLabel } from './types'

// 현재는 Mock 데이터 사용 - 추후 실제 Gmail API로 교체
const MOCK_EMAILS: ParsedEmail[] = [
  {
    id: '1',
    threadId: 't1',
    subject: '12월 수수료 인보이스 발송',
    from: 'willow@willow.com',
    to: 'etc@etcbank.com',
    date: '2025-01-05T10:30:00Z',
    snippet: '안녕하세요, 12월 수수료 인보이스를 발송드립니다...',
    labels: ['ETC-Bank', 'SENT'],
    type: 'fee',
    direction: 'outbound',
  },
  {
    id: '2',
    threadId: 't2',
    subject: 'RE: KODEX 200 상품 문의',
    from: 'etc@etcbank.com',
    to: 'willow@willow.com',
    date: '2025-01-03T14:20:00Z',
    snippet: '문의하신 KODEX 200 상품 관련하여 답변드립니다...',
    labels: ['ETC-Bank', 'INBOX'],
    type: 'product',
    direction: 'inbound',
  },
  {
    id: '3',
    threadId: 't2',
    subject: 'KODEX 200 상품 문의',
    from: 'willow@willow.com',
    to: 'etc@etcbank.com',
    date: '2025-01-02T09:15:00Z',
    snippet: 'KODEX 200 상품 관련하여 문의드립니다...',
    labels: ['ETC-Bank', 'SENT'],
    type: 'product',
    direction: 'outbound',
  },
  {
    id: '4',
    threadId: 't3',
    subject: '11월 수수료 입금 완료',
    from: 'etc@etcbank.com',
    to: 'willow@willow.com',
    date: '2024-12-10T11:00:00Z',
    snippet: '11월 수수료가 입금 완료되었습니다...',
    labels: ['ETC-Bank', 'INBOX'],
    type: 'fee',
    direction: 'inbound',
  },
  {
    id: '5',
    threadId: 't4',
    subject: '신규 ETF 출시 안내',
    from: 'willow@willow.com',
    to: 'etc@etcbank.com',
    date: '2024-12-01T16:45:00Z',
    snippet: '새로운 ETF 상품 출시를 안내드립니다...',
    labels: ['ETC-Bank', 'SENT'],
    type: 'product',
    direction: 'outbound',
  },
]

class GmailService {
  private syncStatus: EmailSyncStatus = {
    lastSyncAt: null,
    totalEmails: 0,
    newEmailsCount: 0,
    isConnected: false,
  }

  private emails: ParsedEmail[] = []
  private pollingInterval: NodeJS.Timeout | null = null

  // OAuth 인증 URL 생성
  getAuthUrl(): string {
    // 실제 구현:
    // const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri)
    // return oauth2Client.generateAuthUrl({ scope: ['https://www.googleapis.com/auth/gmail.readonly'] })
    return '/api/gmail/auth'
  }

  // 연결 상태 확인
  async checkConnection(): Promise<boolean> {
    // 실제 구현: OAuth 토큰 유효성 확인
    // Mock: 항상 연결됨
    this.syncStatus.isConnected = true
    return true
  }

  // 라벨 목록 가져오기
  async getLabels(): Promise<GmailLabel[]> {
    // 실제 구현:
    // const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
    // const res = await gmail.users.labels.list({ userId: 'me' })
    return [
      { id: 'Label_1', name: 'ETC-Bank', type: 'user' },
      { id: 'Label_2', name: 'Akros', type: 'user' },
      { id: 'INBOX', name: 'INBOX', type: 'system' },
      { id: 'SENT', name: 'SENT', type: 'system' },
    ]
  }

  // 특정 라벨의 이메일 가져오기
  async fetchEmailsByLabel(labelName: string): Promise<ParsedEmail[]> {
    // 실제 구현:
    // const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
    // const labelRes = await gmail.users.labels.list({ userId: 'me' })
    // const label = labelRes.data.labels?.find(l => l.name === labelName)
    // const messagesRes = await gmail.users.messages.list({ userId: 'me', labelIds: [label.id] })
    // ... 메시지 상세 조회 및 파싱

    // Mock: 라벨로 필터링
    const filtered = MOCK_EMAILS.filter((email) => email.labels.includes(labelName))
    this.emails = filtered
    this.syncStatus.totalEmails = filtered.length
    this.syncStatus.lastSyncAt = new Date().toISOString()

    return filtered
  }

  // 새 이메일 확인 (마지막 동기화 이후)
  async checkNewEmails(labelName: string, since?: string): Promise<ParsedEmail[]> {
    const allEmails = await this.fetchEmailsByLabel(labelName)

    if (!since) {
      return allEmails
    }

    const sinceDate = new Date(since)
    const newEmails = allEmails.filter((email) => new Date(email.date) > sinceDate)
    this.syncStatus.newEmailsCount = newEmails.length

    return newEmails
  }

  // 동기화 상태 가져오기
  getSyncStatus(): EmailSyncStatus {
    return { ...this.syncStatus }
  }

  // 폴링 시작
  startPolling(labelName: string, intervalMs: number = 5 * 60 * 1000): void {
    if (this.pollingInterval) {
      this.stopPolling()
    }

    // 즉시 한 번 실행
    this.fetchEmailsByLabel(labelName)

    // 주기적으로 실행
    this.pollingInterval = setInterval(() => {
      this.checkNewEmails(labelName, this.syncStatus.lastSyncAt || undefined)
    }, intervalMs)

    console.log(`Gmail polling started for label: ${labelName}, interval: ${intervalMs}ms`)
  }

  // 폴링 중지
  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
      console.log('Gmail polling stopped')
    }
  }

  // 캐시된 이메일 가져오기
  getCachedEmails(): ParsedEmail[] {
    return [...this.emails]
  }

  // 이메일 타입 분류 (제목/내용 기반)
  classifyEmailType(subject: string, body?: string): 'fee' | 'product' | 'general' {
    const lowerSubject = subject.toLowerCase()
    const lowerBody = (body || '').toLowerCase()

    const feeKeywords = ['수수료', '인보이스', 'invoice', 'fee', '입금', '정산']
    const productKeywords = ['상품', 'etf', '출시', '문의', 'product', 'kodex', 'tiger']

    if (feeKeywords.some((kw) => lowerSubject.includes(kw) || lowerBody.includes(kw))) {
      return 'fee'
    }
    if (productKeywords.some((kw) => lowerSubject.includes(kw) || lowerBody.includes(kw))) {
      return 'product'
    }
    return 'general'
  }
}

// 싱글톤 인스턴스
export const gmailService = new GmailService()
