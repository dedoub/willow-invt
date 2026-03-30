import { config } from 'dotenv'
config({ path: '.env.local' })

import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

// ============================================================
// Gmail Scheduled Send — 예약된 이메일을 지정 시간에 자동 발송
// ============================================================
// 1분 간격 launchd로 실행
// 1. DB에서 발송 시간이 도래한 pending 이메일 조회
// 2. Storage에서 첨부파일 다운로드
// 3. Gmail API로 발송
// 4. 상태 업데이트 + 첨부파일 정리
// ============================================================

const LOG_PREFIX = '[gmail-scheduled-send]'
const LOCK_FILE = path.join(__dirname, 'logs/gmail-scheduled-send.lock')
const MAX_RETRIES = 3

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

function log(msg: string) {
  console.log(`${LOG_PREFIX} [${new Date().toISOString()}] ${msg}`)
}

// ---- Lock ----
function acquireLock(): boolean {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const lockPid = fs.readFileSync(LOCK_FILE, 'utf-8').trim()
      try {
        process.kill(Number(lockPid), 0)
        return false // still running
      } catch {
        fs.unlinkSync(LOCK_FILE) // stale lock
      }
    }
    fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true })
    fs.writeFileSync(LOCK_FILE, String(process.pid))
    return true
  } catch {
    return false
  }
}

function releaseLock() {
  try { fs.unlinkSync(LOCK_FILE) } catch { /* ignore */ }
}

// ---- Gmail OAuth (same pattern as gmail-auto-label.ts) ----
interface TokenData {
  user_id: string
  access_token: string
  refresh_token: string
  token_expiry: string | null
  context: string
}

function getOAuth2Client(context: string = 'default') {
  const isTensw = context === 'tensoftworks'
  return new google.auth.OAuth2(
    isTensw ? process.env.GOOGLE_CLIENT_ID_TENSW : process.env.GOOGLE_CLIENT_ID,
    isTensw ? process.env.GOOGLE_CLIENT_SECRET_TENSW : process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
}

async function getGmailClientForScript(context: string = 'default') {
  const { data, error } = await supabase
    .from('gmail_tokens')
    .select('*')
    .eq('context', context)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) {
    log(`❌ ${context} 컨텍스트 토큰 없음: ${error?.message}`)
    return null
  }

  const token = data as TokenData
  const oauth2Client = getOAuth2Client(context)
  oauth2Client.setCredentials({
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expiry_date: token.token_expiry ? new Date(token.token_expiry).getTime() : undefined,
  })

  // 토큰 만료 임박 시 갱신
  const expiryTime = token.token_expiry ? new Date(token.token_expiry).getTime() : 0
  if (expiryTime < Date.now() + 5 * 60 * 1000) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken()
      oauth2Client.setCredentials(credentials)
      await supabase
        .from('gmail_tokens')
        .update({
          access_token: credentials.access_token,
          refresh_token: credentials.refresh_token || token.refresh_token,
          token_expiry: credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', data.user_id)
        .eq('context', context)
      log(`🔄 ${context} 토큰 갱신 완료`)
    } catch (err) {
      log(`⚠️ ${context} 토큰 갱신 실패: ${err}`)
      return null
    }
  }

  return google.gmail({ version: 'v1', auth: oauth2Client })
}

// ---- MIME message builder (copied from gmail-server.ts to avoid Next.js deps) ----
interface EmailAttachmentData {
  filename: string
  mimeType: string
  data: string // base64
}

function createMimeMessage(params: {
  to: string; subject: string; body: string; bodyHtml?: string
  cc?: string; bcc?: string; replyTo?: string; from?: string
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
    message += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`
    message += `--${boundary}\r\n`
    if (params.bodyHtml) {
      message += `Content-Type: multipart/alternative; boundary="${altBoundary}"\r\n\r\n`
      message += `--${altBoundary}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${params.body}\r\n\r\n`
      message += `--${altBoundary}\r\nContent-Type: text/html; charset="UTF-8"\r\n\r\n${params.bodyHtml}\r\n\r\n`
      message += `--${altBoundary}--\r\n`
    } else {
      message += `Content-Type: text/plain; charset="UTF-8"\r\n\r\n${params.body}\r\n\r\n`
    }
    for (const att of params.attachments!) {
      message += `--${boundary}\r\n`
      message += `Content-Type: ${att.mimeType}; name="=?UTF-8?B?${Buffer.from(att.filename).toString('base64')}?="\r\n`
      message += `Content-Disposition: attachment; filename="=?UTF-8?B?${Buffer.from(att.filename).toString('base64')}?="\r\n`
      message += `Content-Transfer-Encoding: base64\r\n\r\n${att.data}\r\n`
    }
    message += `--${boundary}--`
  } else if (params.bodyHtml) {
    message += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`
    message += `--${boundary}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${params.body}\r\n\r\n`
    message += `--${boundary}\r\nContent-Type: text/html; charset="UTF-8"\r\n\r\n${params.bodyHtml}\r\n\r\n`
    message += `--${boundary}--`
  } else {
    message += `Content-Type: text/plain; charset="UTF-8"\r\n\r\n${params.body}`
  }

  return Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// ---- Main ----
async function main() {
  if (!acquireLock()) {
    log('⏳ 이미 실행 중 (lock exists)')
    return
  }

  try {
    // 발송 시간이 도래한 pending 이메일 조회
    const { data: dueEmails, error } = await supabase
      .from('gmail_scheduled_emails')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })

    if (error) {
      log(`❌ DB 조회 실패: ${error.message}`)
      return
    }

    if (!dueEmails || dueEmails.length === 0) {
      return // nothing to send
    }

    log(`📬 발송 대기 이메일 ${dueEmails.length}건`)

    for (const email of dueEmails) {
      try {
        // Mark as sending
        await supabase
          .from('gmail_scheduled_emails')
          .update({ status: 'sending', updated_at: new Date().toISOString() })
          .eq('id', email.id)

        // Get Gmail client
        const gmail = await getGmailClientForScript(email.gmail_context)
        if (!gmail) {
          throw new Error(`Gmail client unavailable for context: ${email.gmail_context}`)
        }

        // Get sender email
        const profile = await gmail.users.getProfile({ userId: 'me' })
        const from = profile.data.emailAddress

        // Download attachments from Storage
        const attachments: EmailAttachmentData[] = []
        const attPaths = (email.attachment_paths as { path: string; name: string; mimeType: string }[]) || []
        for (const att of attPaths) {
          const { data: fileData, error: dlError } = await supabase.storage
            .from('scheduled-email-attachments')
            .download(att.path)
          if (dlError || !fileData) {
            log(`⚠️ 첨부파일 다운로드 실패: ${att.name} - ${dlError?.message}`)
            continue
          }
          const arrayBuffer = await fileData.arrayBuffer()
          attachments.push({
            filename: att.name,
            mimeType: att.mimeType,
            data: Buffer.from(arrayBuffer).toString('base64'),
          })
        }

        // Build MIME and send
        const raw = createMimeMessage({
          to: email.to_recipients,
          subject: email.subject,
          body: email.body,
          bodyHtml: email.body_html || undefined,
          cc: email.cc_recipients || undefined,
          bcc: email.bcc_recipients || undefined,
          replyTo: email.reply_to || undefined,
          from: from || undefined,
          attachments: attachments.length > 0 ? attachments : undefined,
        })

        const sendRes = await gmail.users.messages.send({
          userId: 'me',
          requestBody: { raw },
        })

        // Success
        await supabase
          .from('gmail_scheduled_emails')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            gmail_message_id: sendRes.data.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', email.id)

        // Clean up attachments
        if (attPaths.length > 0) {
          await supabase.storage
            .from('scheduled-email-attachments')
            .remove(attPaths.map(p => p.path))
        }

        // Update linked invoice timestamps
        const { data: linkedInvoices } = await supabase
          .from('willow_invoices')
          .select('id, scheduled_etc_email_id, scheduled_bank_email_id')
          .or(`scheduled_etc_email_id.eq.${email.id},scheduled_bank_email_id.eq.${email.id}`)

        if (linkedInvoices && linkedInvoices.length > 0) {
          for (const inv of linkedInvoices) {
            const invUpdate: Record<string, string | null> = {}
            if (inv.scheduled_etc_email_id === email.id) {
              invUpdate.sent_to_etc_at = new Date().toISOString()
              invUpdate.scheduled_etc_email_id = null
            }
            if (inv.scheduled_bank_email_id === email.id) {
              invUpdate.sent_to_bank_at = new Date().toISOString()
              invUpdate.scheduled_bank_email_id = null
            }
            await supabase.from('willow_invoices').update(invUpdate).eq('id', inv.id)
          }
        }

        log(`✅ ${email.id} → ${email.to_recipients} (${email.subject})`)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        const newRetryCount = (email.retry_count || 0) + 1
        const newStatus = newRetryCount >= MAX_RETRIES ? 'failed' : 'pending'

        await supabase
          .from('gmail_scheduled_emails')
          .update({
            status: newStatus,
            error_message: errorMsg,
            retry_count: newRetryCount,
            updated_at: new Date().toISOString(),
          })
          .eq('id', email.id)

        log(`❌ ${email.id} 발송 실패 (${newRetryCount}/${MAX_RETRIES}): ${errorMsg}`)
      }
    }

    log(`📊 처리 완료: ${dueEmails.length}건`)
  } finally {
    releaseLock()
  }
}

main().catch(err => {
  log(`❌ Fatal error: ${err}`)
  releaseLock()
  process.exit(1)
})
