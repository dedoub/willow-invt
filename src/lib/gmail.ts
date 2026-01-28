// Gmail API 서비스 라이브러리

// ============ 타입 정의 ============

export interface ParsedEmail {
  id: string
  threadId: string
  from: string
  fromName: string
  to: string
  cc: string  // 참조
  subject: string
  snippet: string
  body: string
  bodyHtml: string
  date: string
  labels: string[]
  isRead: boolean
  hasAttachments: boolean
  attachments: EmailAttachment[]
  // 추가 필드
  category: string | null  // 하위 라벨 기반 카테고리 (예: "키움", "삼성") - 첫 번째 카테고리
  categories?: string[]  // 모든 하위 라벨 기반 카테고리 목록
  direction: 'inbound' | 'outbound'  // 수신/발신
}

export interface EmailFetchResult {
  emails: ParsedEmail[]
  categories: string[]  // 사용 가능한 카테고리 목록
  parentLabel: string
}

export interface EmailAttachment {
  filename: string
  mimeType: string
  size: number
  attachmentId: string
}

export interface EmailSyncStatus {
  lastSyncAt: string | null
  totalEmails: number
  newEmailsCount: number
  isConnected: boolean
}

export interface SendEmailParams {
  to: string
  subject: string
  body: string
  bodyHtml?: string
  cc?: string
  bcc?: string
  replyTo?: string
  attachments?: File[]
  context?: 'default' | 'tensoftworks' | 'willow'
}

export interface GmailTokens {
  access_token: string
  refresh_token: string
  expires_at: number
}

// AI 분석 결과 타입
export interface EmailAnalysisResult {
  category: string
  summary: string
  recentTopics: string[]
  issues: Array<{
    title: string
    description: string
    priority: 'high' | 'medium' | 'low'
    relatedEmailIds: string[]
  }>
  todos: Array<{
    task: string
    dueDate?: string
    priority: 'high' | 'medium' | 'low'
    relatedEmailIds: string[]
  }>
  emailCount: number
}

export interface OverallAnalysisResult {
  generatedAt: string
  categories: EmailAnalysisResult[]
  overallSummary: string
}

// DB에 저장된 Todo 타입
export interface SavedTodo {
  id: string
  user_id: string
  label: string
  category: string
  task: string
  due_date: string | null
  priority: 'high' | 'medium' | 'low'
  related_email_ids: string[]
  completed: boolean
  source_analysis_id: string | null
  created_at: string
  completed_at: string | null
}

// DB에서 가져온 분석 결과
export interface SavedAnalysis {
  id: string
  user_id: string
  label: string
  analysis_data: OverallAnalysisResult
  generated_at: string
  created_at: string
  updated_at: string
}

export interface AnalysisResponse {
  analysis: SavedAnalysis | null
  todos: SavedTodo[]
}

// ============ Gmail Service Class ============

class GmailService {
  private syncStatus: EmailSyncStatus = {
    lastSyncAt: null,
    totalEmails: 0,
    newEmailsCount: 0,
    isConnected: false,
  }
  private pollingInterval: NodeJS.Timeout | null = null

  // 연결 상태 확인
  async checkConnection(): Promise<boolean> {
    try {
      const res = await fetch('/api/gmail/status')
      if (res.ok) {
        const data = await res.json()
        this.syncStatus.isConnected = data.isConnected
        return data.isConnected
      }
      return false
    } catch {
      this.syncStatus.isConnected = false
      return false
    }
  }

  // OAuth 인증 시작
  async startAuth(): Promise<string> {
    const res = await fetch('/api/gmail/auth')
    if (!res.ok) throw new Error('Failed to get auth URL')
    const data = await res.json()
    return data.authUrl
  }

  // 라벨별 이메일 조회 (기본: 무제한, 1년치)
  async fetchEmailsByLabel(label: string, maxResults = 0, daysBack = 365): Promise<EmailFetchResult> {
    try {
      const res = await fetch(`/api/gmail/emails?label=${encodeURIComponent(label)}&maxResults=${maxResults}&daysBack=${daysBack}`)
      if (!res.ok) {
        if (res.status === 401) {
          this.syncStatus.isConnected = false
          throw new Error('Not authenticated')
        }
        const errorData = await res.json().catch(() => ({}))
        console.error('Email fetch error response:', errorData)
        throw new Error(errorData.details || 'Failed to fetch emails')
      }
      const data = await res.json()
      this.syncStatus.lastSyncAt = new Date().toISOString()
      this.syncStatus.totalEmails = data.emails.length
      this.syncStatus.isConnected = true
      return {
        emails: data.emails,
        categories: data.categories || [],
        parentLabel: data.parentLabel || label,
      }
    } catch (error) {
      console.error('Error fetching emails:', error)
      throw error
    }
  }

  // 이메일 발송
  async sendEmail(params: SendEmailParams): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const formData = new FormData()
      formData.append('to', params.to)
      formData.append('subject', params.subject)
      formData.append('body', params.body)
      if (params.bodyHtml) formData.append('bodyHtml', params.bodyHtml)
      if (params.cc) formData.append('cc', params.cc)
      if (params.bcc) formData.append('bcc', params.bcc)
      if (params.replyTo) formData.append('replyTo', params.replyTo)

      if (params.attachments) {
        params.attachments.forEach((file) => {
          formData.append('attachments', file)
        })
      }

      const url = params.context ? `/api/gmail/send?context=${params.context}` : '/api/gmail/send'
      const res = await fetch(url, {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to send email' }
      }
      return { success: true, messageId: data.messageId }
    } catch (error) {
      console.error('Error sending email:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  // 이메일 상세 조회
  async getEmail(messageId: string): Promise<ParsedEmail | null> {
    try {
      const res = await fetch(`/api/gmail/emails/${messageId}`)
      if (!res.ok) return null
      return await res.json()
    } catch {
      return null
    }
  }

  // 폴링 시작
  startPolling(label: string, intervalMs = 5 * 60 * 1000) {
    this.stopPolling()
    this.pollingInterval = setInterval(async () => {
      try {
        await this.fetchEmailsByLabel(label)
      } catch (error) {
        console.error('Polling error:', error)
      }
    }, intervalMs)
  }

  // 폴링 중지
  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }
  }

  // 동기화 상태 반환
  getSyncStatus(): EmailSyncStatus {
    return { ...this.syncStatus }
  }

  // 연결 해제
  async disconnect(): Promise<boolean> {
    try {
      const res = await fetch('/api/gmail/disconnect', { method: 'POST' })
      if (res.ok) {
        this.syncStatus.isConnected = false
        this.stopPolling()
        return true
      }
      return false
    } catch {
      return false
    }
  }

  // AI 이메일 분석
  async analyzeEmails(label: string, daysBack = 30): Promise<OverallAnalysisResult | null> {
    try {
      const res = await fetch('/api/gmail/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, daysBack }),
      })

      if (!res.ok) {
        if (res.status === 401) {
          this.syncStatus.isConnected = false
          throw new Error('Not authenticated')
        }
        const error = await res.json()
        throw new Error(error.error || 'Failed to analyze emails')
      }

      return await res.json()
    } catch (error) {
      console.error('Error analyzing emails:', error)
      throw error
    }
  }

  // 저장된 분석 결과 가져오기
  async getSavedAnalysis(label: string): Promise<AnalysisResponse | null> {
    try {
      const res = await fetch(`/api/gmail/analysis?label=${encodeURIComponent(label)}`)

      if (!res.ok) {
        if (res.status === 401) {
          return null
        }
        const error = await res.json()
        throw new Error(error.error || 'Failed to fetch analysis')
      }

      return await res.json()
    } catch (error) {
      console.error('Error fetching saved analysis:', error)
      return null
    }
  }

  // 분석 결과 저장하기
  async saveAnalysis(label: string, analysisData: OverallAnalysisResult): Promise<AnalysisResponse | null> {
    try {
      const res = await fetch('/api/gmail/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, analysisData }),
      })

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Not authenticated')
        }
        const error = await res.json()
        throw new Error(error.error || 'Failed to save analysis')
      }

      return await res.json()
    } catch (error) {
      console.error('Error saving analysis:', error)
      throw error
    }
  }

  // Todo 완료 상태 토글
  async toggleTodoCompleted(todoId: string, completed: boolean): Promise<SavedTodo | null> {
    try {
      const res = await fetch(`/api/gmail/todos/${todoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update todo')
      }

      return await res.json()
    } catch (error) {
      console.error('Error updating todo:', error)
      throw error
    }
  }
}

// 싱글톤 인스턴스
export const gmailService = new GmailService()
