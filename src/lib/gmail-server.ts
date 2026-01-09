// Gmail API 서버사이드 유틸리티
// 이 파일은 API 라우트에서만 사용됩니다

import { google } from 'googleapis'
import { cookies } from 'next/headers'

const GMAIL_TOKEN_COOKIE = 'gmail_tokens'
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.labels',
]

// OAuth2 클라이언트 생성
export function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
}

// 인증 URL 생성
export function getAuthUrl(): string {
  const oauth2Client = getOAuth2Client()
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  })
}

// 토큰 저장 (쿠키에 암호화하여 저장)
export async function saveTokens(tokens: {
  access_token: string
  refresh_token?: string
  expiry_date?: number
}) {
  const cookieStore = await cookies()
  const tokenData = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expiry_date || Date.now() + 3600 * 1000,
  }

  cookieStore.set(GMAIL_TOKEN_COOKIE, JSON.stringify(tokenData), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30일
    path: '/',
  })
}

// 토큰 조회
export async function getTokens(): Promise<{
  access_token: string
  refresh_token: string
  expires_at: number
} | null> {
  const cookieStore = await cookies()
  const tokenCookie = cookieStore.get(GMAIL_TOKEN_COOKIE)

  if (!tokenCookie) return null

  try {
    return JSON.parse(tokenCookie.value)
  } catch {
    return null
  }
}

// 토큰 삭제
export async function deleteTokens() {
  const cookieStore = await cookies()
  cookieStore.delete(GMAIL_TOKEN_COOKIE)
}

// 인증된 Gmail 클라이언트 가져오기
export async function getGmailClient() {
  const tokens = await getTokens()
  if (!tokens) return null

  const oauth2Client = getOAuth2Client()
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
      })
    } catch (error) {
      console.error('Failed to refresh token:', error)
      await deleteTokens()
      return null
    }
  }

  return google.gmail({ version: 'v1', auth: oauth2Client })
}

// 이메일 파싱 유틸리티
export function parseEmail(message: {
  id?: string | null
  threadId?: string | null
  labelIds?: string[] | null
  payload?: {
    headers?: Array<{ name?: string | null; value?: string | null }> | null
    mimeType?: string | null
    body?: { data?: string | null; size?: number | null } | null
    parts?: Array<{
      mimeType?: string | null
      body?: { data?: string | null; size?: number | null; attachmentId?: string | null } | null
      filename?: string | null
      headers?: Array<{ name?: string | null; value?: string | null }> | null
    }> | null
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

  // 메시지 본문 파싱
  if (message.payload?.parts) {
    for (const part of message.payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        body = Buffer.from(part.body.data, 'base64').toString('utf-8')
      } else if (part.mimeType === 'text/html' && part.body?.data) {
        bodyHtml = Buffer.from(part.body.data, 'base64').toString('utf-8')
      } else if (part.filename && part.body?.attachmentId) {
        attachments.push({
          filename: part.filename,
          mimeType: part.mimeType || 'application/octet-stream',
          size: part.body.size || 0,
          attachmentId: part.body.attachmentId,
        })
      }
    }
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
}): string {
  const boundary = `boundary_${Date.now()}`

  let message = ''
  message += `From: ${params.from || 'me'}\r\n`
  message += `To: ${params.to}\r\n`
  if (params.cc) message += `Cc: ${params.cc}\r\n`
  if (params.bcc) message += `Bcc: ${params.bcc}\r\n`
  if (params.replyTo) message += `Reply-To: ${params.replyTo}\r\n`
  message += `Subject: =?UTF-8?B?${Buffer.from(params.subject).toString('base64')}?=\r\n`
  message += `MIME-Version: 1.0\r\n`

  if (params.bodyHtml) {
    message += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`
    message += `--${boundary}\r\n`
    message += `Content-Type: text/plain; charset="UTF-8"\r\n\r\n`
    message += `${params.body}\r\n\r\n`
    message += `--${boundary}\r\n`
    message += `Content-Type: text/html; charset="UTF-8"\r\n\r\n`
    message += `${params.bodyHtml}\r\n\r\n`
    message += `--${boundary}--`
  } else {
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
