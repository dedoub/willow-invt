// Gmail API 서버사이드 유틸리티
// 이 파일은 API 라우트에서만 사용됩니다

import { google } from 'googleapis'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

const GMAIL_TOKEN_COOKIE = 'gmail_tokens'
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.labels',
]

// Gmail context types for multi-account support
export type GmailContext = 'default' | 'tensoftworks' | 'willow'

// Supabase 클라이언트
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

// OAuth2 클라이언트 생성 (context별 GCP 프로젝트 분리)
export function getOAuth2Client(context: GmailContext = 'default') {
  const isTensw = context === 'tensoftworks'
  return new google.auth.OAuth2(
    isTensw ? process.env.GOOGLE_CLIENT_ID_TENSW : process.env.GOOGLE_CLIENT_ID,
    isTensw ? process.env.GOOGLE_CLIENT_SECRET_TENSW : process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
}

// 인증 URL 생성
export function getAuthUrl(context: GmailContext = 'default'): string {
  const oauth2Client = getOAuth2Client(context)
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'select_account consent', // 항상 계정 선택 화면 표시
    state: context, // context를 state로 전달하여 callback에서 사용
  })
}

// 토큰 저장 (데이터베이스에 저장) - returns true on success
export async function saveTokens(tokens: {
  access_token: string
  refresh_token?: string
  expiry_date?: number
  gmail_email?: string
  context?: GmailContext
}): Promise<{ success: boolean; error?: string }> {
  const userId = await getCurrentUserId()
  if (!userId) {
    console.error('Cannot save tokens: No user logged in (auth_token cookie missing)')
    return { success: false, error: 'no_user_session' }
  }

  const context = tokens.context || 'default'
  const tokenData = {
    user_id: userId,
    context,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || '',
    token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    gmail_email: tokens.gmail_email || null,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('gmail_tokens')
    .upsert(tokenData, { onConflict: 'user_id,context' })

  if (error) {
    console.error('Error saving Gmail tokens:', error)
    return { success: false, error: `db_error: ${error.message}` }
  }

  // 쿠키에도 저장 (현재 세션용) - context별로 별도 쿠키
  try {
    const cookieName = context === 'default' ? GMAIL_TOKEN_COOKIE : `${GMAIL_TOKEN_COOKIE}_${context}`
    const cookieStore = await cookies()
    cookieStore.set(cookieName, JSON.stringify({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expiry_date || Date.now() + 3600 * 1000,
    }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30일
      path: '/',
    })
  } catch (cookieError) {
    // Cookie setting may fail in redirect context, but DB save succeeded
    console.warn('Failed to set Gmail cookie (non-critical):', cookieError)
  }

  return { success: true }
}

// 토큰 조회 (DB 우선, 쿠키 폴백)
export async function getTokens(context: GmailContext = 'default'): Promise<{
  access_token: string
  refresh_token: string
  expires_at: number
} | null> {
  const userId = await getCurrentUserId()

  // 1. DB에서 토큰 조회 시도
  if (userId) {
    const { data, error } = await supabase
      .from('gmail_tokens')
      .select('*')
      .eq('user_id', userId)
      .eq('context', context)
      .single()

    if (!error && data) {
      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.token_expiry ? new Date(data.token_expiry).getTime() : Date.now() + 3600 * 1000,
      }
    }
  }

  // 2. 쿠키에서 폴백 (기존 연결 호환성)
  const cookieName = context === 'default' ? GMAIL_TOKEN_COOKIE : `${GMAIL_TOKEN_COOKIE}_${context}`
  const cookieStore = await cookies()
  const tokenCookie = cookieStore.get(cookieName)

  if (!tokenCookie) return null

  try {
    const cookieTokens = JSON.parse(tokenCookie.value)

    // 쿠키에 토큰이 있으면 DB로 마이그레이션
    if (userId && cookieTokens.access_token) {
      await saveTokens({
        access_token: cookieTokens.access_token,
        refresh_token: cookieTokens.refresh_token,
        expiry_date: cookieTokens.expires_at,
        context,
      })
    }

    return cookieTokens
  } catch {
    return null
  }
}

// 토큰 삭제
export async function deleteTokens(context: GmailContext = 'default') {
  const userId = await getCurrentUserId()

  // DB에서 삭제
  if (userId) {
    await supabase
      .from('gmail_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('context', context)
  }

  // 쿠키에서도 삭제
  const cookieName = context === 'default' ? GMAIL_TOKEN_COOKIE : `${GMAIL_TOKEN_COOKIE}_${context}`
  const cookieStore = await cookies()
  cookieStore.delete(cookieName)
}

// 인증된 Gmail 클라이언트 가져오기
export async function getGmailClient(context: GmailContext = 'default') {
  const tokens = await getTokens(context)
  if (!tokens) return null

  const oauth2Client = getOAuth2Client(context)
  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expires_at,
  })

  // 토큰 갱신 필요시 자동 갱신
  if (tokens.expires_at < Date.now() + 5 * 60 * 1000) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken()
      await saveTokens({
        access_token: credentials.access_token!,
        refresh_token: credentials.refresh_token || tokens.refresh_token,
        expiry_date: credentials.expiry_date!,
        context,
      })
      // 갱신된 토큰으로 credentials 업데이트
      oauth2Client.setCredentials({
        access_token: credentials.access_token,
        refresh_token: credentials.refresh_token || tokens.refresh_token,
        expiry_date: credentials.expiry_date,
      })
    } catch (error) {
      console.error(`Failed to refresh Gmail token for context=${context}:`, error)
      // invalid_grant = refresh token이 무효화됨 → 토큰 삭제 필요
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (errorMessage.includes('invalid_grant') || errorMessage.includes('Token has been expired or revoked')) {
        console.error(`Refresh token revoked for context=${context}, deleting tokens`)
        await deleteTokens(context)
        return null
      }
      // 일시적 오류 (네트워크 등)는 기존 토큰으로 시도
      console.warn(`Temporary refresh failure for context=${context}, trying with existing token`)
    }
  }

  return google.gmail({ version: 'v1', auth: oauth2Client })
}

// 이메일 파트 타입 (재귀 구조)
interface EmailPart {
  mimeType?: string | null
  body?: { data?: string | null; size?: number | null; attachmentId?: string | null } | null
  filename?: string | null
  headers?: Array<{ name?: string | null; value?: string | null }> | null
  parts?: EmailPart[] | null
}

// 이메일 파싱 유틸리티
export function parseEmail(message: {
  id?: string | null
  threadId?: string | null
  labelIds?: string[] | null
  payload?: EmailPart & {
    headers?: Array<{ name?: string | null; value?: string | null }> | null
  } | null
  snippet?: string | null
}) {
  const headers = message.payload?.headers || []
  const getHeader = (name: string) =>
    headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || ''

  const from = getHeader('from')
  const fromMatch = from.match(/^(.+?)\s*<(.+?)>$/)

  let body = ''
  let bodyHtml = ''
  const attachments: Array<{
    filename: string
    mimeType: string
    size: number
    attachmentId: string
  }> = []

  // 재귀적으로 파트 파싱
  function parseParts(parts: EmailPart[] | null | undefined) {
    if (!parts) return

    for (const part of parts) {
      const mimeType = part.mimeType || ''

      // 중첩된 multipart 처리
      if (mimeType.startsWith('multipart/') && part.parts) {
        parseParts(part.parts)
      }
      // 텍스트 본문
      else if (mimeType === 'text/plain' && part.body?.data && !body) {
        body = Buffer.from(part.body.data, 'base64').toString('utf-8')
      }
      // HTML 본문
      else if (mimeType === 'text/html' && part.body?.data && !bodyHtml) {
        bodyHtml = Buffer.from(part.body.data, 'base64').toString('utf-8')
      }
      // 첨부파일
      else if (part.filename && part.body?.attachmentId) {
        attachments.push({
          filename: part.filename,
          mimeType: mimeType || 'application/octet-stream',
          size: part.body.size || 0,
          attachmentId: part.body.attachmentId,
        })
      }
    }
  }

  // 메시지 본문 파싱
  if (message.payload?.parts) {
    parseParts(message.payload.parts)
  } else if (message.payload?.body?.data) {
    const content = Buffer.from(message.payload.body.data, 'base64').toString('utf-8')
    if (message.payload.mimeType === 'text/html') {
      bodyHtml = content
    } else {
      body = content
    }
  }

  return {
    id: message.id || '',
    threadId: message.threadId || '',
    from: fromMatch ? fromMatch[2] : from,
    fromName: fromMatch ? fromMatch[1].replace(/"/g, '') : from.split('@')[0],
    to: getHeader('to'),
    cc: getHeader('cc'),
    subject: getHeader('subject'),
    snippet: message.snippet || '',
    body,
    bodyHtml,
    date: getHeader('date'),
    labels: message.labelIds || [],
    isRead: !message.labelIds?.includes('UNREAD'),
    hasAttachments: attachments.length > 0,
    attachments,
  }
}

// 첨부 파일 타입
export interface EmailAttachmentData {
  filename: string
  mimeType: string
  data: string // base64 encoded
}

// MIME 메시지 생성 (이메일 발송용)
export function createMimeMessage(params: {
  to: string
  subject: string
  body: string
  bodyHtml?: string
  cc?: string
  bcc?: string
  replyTo?: string
  from?: string
  attachments?: EmailAttachmentData[]
}): string {
  const boundary = `boundary_${Date.now()}`
  const altBoundary = `alt_boundary_${Date.now()}`
  const hasAttachments = params.attachments && params.attachments.length > 0

  let message = ''
  message += `From: ${params.from || 'me'}\r\n`
  message += `To: ${params.to}\r\n`
  if (params.cc) message += `Cc: ${params.cc}\r\n`
  if (params.bcc) message += `Bcc: ${params.bcc}\r\n`
  if (params.replyTo) message += `Reply-To: ${params.replyTo}\r\n`
  message += `Subject: =?UTF-8?B?${Buffer.from(params.subject).toString('base64')}?=\r\n`
  message += `MIME-Version: 1.0\r\n`

  if (hasAttachments) {
    // 첨부파일이 있는 경우: multipart/mixed
    message += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`

    // 본문 파트
    message += `--${boundary}\r\n`
    if (params.bodyHtml) {
      message += `Content-Type: multipart/alternative; boundary="${altBoundary}"\r\n\r\n`
      message += `--${altBoundary}\r\n`
      message += `Content-Type: text/plain; charset="UTF-8"\r\n\r\n`
      message += `${params.body}\r\n\r\n`
      message += `--${altBoundary}\r\n`
      message += `Content-Type: text/html; charset="UTF-8"\r\n\r\n`
      message += `${params.bodyHtml}\r\n\r\n`
      message += `--${altBoundary}--\r\n`
    } else {
      message += `Content-Type: text/plain; charset="UTF-8"\r\n\r\n`
      message += `${params.body}\r\n\r\n`
    }

    // 첨부파일 파트들
    for (const attachment of params.attachments!) {
      message += `--${boundary}\r\n`
      message += `Content-Type: ${attachment.mimeType}; name="=?UTF-8?B?${Buffer.from(attachment.filename).toString('base64')}?="\r\n`
      message += `Content-Disposition: attachment; filename="=?UTF-8?B?${Buffer.from(attachment.filename).toString('base64')}?="\r\n`
      message += `Content-Transfer-Encoding: base64\r\n\r\n`
      message += `${attachment.data}\r\n`
    }
    message += `--${boundary}--`
  } else if (params.bodyHtml) {
    // HTML 본문만 있는 경우: multipart/alternative
    message += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`
    message += `--${boundary}\r\n`
    message += `Content-Type: text/plain; charset="UTF-8"\r\n\r\n`
    message += `${params.body}\r\n\r\n`
    message += `--${boundary}\r\n`
    message += `Content-Type: text/html; charset="UTF-8"\r\n\r\n`
    message += `${params.bodyHtml}\r\n\r\n`
    message += `--${boundary}--`
  } else {
    // 텍스트만 있는 경우
    message += `Content-Type: text/plain; charset="UTF-8"\r\n\r\n`
    message += params.body
  }

  // URL-safe Base64 인코딩
  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}
