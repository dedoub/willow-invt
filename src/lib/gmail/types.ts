// Gmail API 관련 타입 정의

export interface GmailMessage {
  id: string
  threadId: string
  labelIds: string[]
  snippet: string
  payload: {
    headers: GmailHeader[]
    body?: {
      data?: string
    }
    parts?: GmailPart[]
  }
  internalDate: string
}

export interface GmailHeader {
  name: string
  value: string
}

export interface GmailPart {
  mimeType: string
  body: {
    data?: string
  }
}

export interface ParsedEmail {
  id: string
  threadId: string
  subject: string
  from: string
  to: string
  date: string
  snippet: string
  body?: string
  labels: string[]
  type: 'fee' | 'product' | 'general'
  direction: 'inbound' | 'outbound'
}

export interface GmailLabel {
  id: string
  name: string
  type: 'system' | 'user'
}

export interface GmailConfig {
  clientId: string
  clientSecret: string
  refreshToken: string
  labelName: string // 감시할 라벨 이름 (예: "ETC-Bank")
  pollingIntervalMs: number // 폴링 주기 (밀리초)
}

export interface EmailSyncStatus {
  lastSyncAt: string | null
  totalEmails: number
  newEmailsCount: number
  isConnected: boolean
  error?: string
}
