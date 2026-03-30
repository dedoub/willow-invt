import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { getServiceSupabase } from '@/lib/supabase'

const MAX_RETRIES = 3

// ---- Gmail OAuth (DB-based token lookup) ----
function getOAuth2Client(context: string = 'default') {
  const isTensw = context === 'tensoftworks'
  return new google.auth.OAuth2(
    isTensw ? process.env.GOOGLE_CLIENT_ID_TENSW : process.env.GOOGLE_CLIENT_ID,
    isTensw ? process.env.GOOGLE_CLIENT_SECRET_TENSW : process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
}

async function getGmailClient(supabase: ReturnType<typeof getServiceSupabase>, context: string = 'default') {
  const { data, error } = await supabase
    .from('gmail_tokens')
    .select('*')
    .eq('context', context)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) return null

  const oauth2Client = getOAuth2Client(context)
  oauth2Client.setCredentials({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expiry_date: data.token_expiry ? new Date(data.token_expiry).getTime() : undefined,
  })

  // Refresh if expiring soon
  const expiryTime = data.token_expiry ? new Date(data.token_expiry).getTime() : 0
  if (expiryTime < Date.now() + 5 * 60 * 1000) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken()
      oauth2Client.setCredentials(credentials)
      await supabase
        .from('gmail_tokens')
        .update({
          access_token: credentials.access_token,
          refresh_token: credentials.refresh_token || data.refresh_token,
          token_expiry: credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', data.user_id)
        .eq('context', context)
    } catch {
      return null
    }
  }

  return google.gmail({ version: 'v1', auth: oauth2Client })
}

// ---- MIME message builder ----
interface AttachmentData { filename: string; mimeType: string; data: string }

function createMimeMessage(params: {
  to: string; subject: string; body: string; bodyHtml?: string
  cc?: string; bcc?: string; replyTo?: string; from?: string
  attachments?: AttachmentData[]
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

// ---- Main handler ----
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServiceSupabase()

  const { data: dueEmails, error } = await supabase
    .from('gmail_scheduled_emails')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!dueEmails || dueEmails.length === 0) {
    return NextResponse.json({ sent: 0 })
  }

  let sentCount = 0
  const results: string[] = []

  for (const email of dueEmails) {
    try {
      await supabase
        .from('gmail_scheduled_emails')
        .update({ status: 'sending', updated_at: new Date().toISOString() })
        .eq('id', email.id)

      const gmail = await getGmailClient(supabase, email.gmail_context)
      if (!gmail) throw new Error(`Gmail client unavailable: ${email.gmail_context}`)

      const profile = await gmail.users.getProfile({ userId: 'me' })
      const from = profile.data.emailAddress

      // Download attachments
      const attachments: AttachmentData[] = []
      const attPaths = (email.attachment_paths as { path: string; name: string; mimeType: string }[]) || []
      for (const att of attPaths) {
        const { data: fileData, error: dlError } = await supabase.storage
          .from('scheduled-email-attachments')
          .download(att.path)
        if (dlError || !fileData) continue
        const arrayBuffer = await fileData.arrayBuffer()
        attachments.push({
          filename: att.name,
          mimeType: att.mimeType,
          data: Buffer.from(arrayBuffer).toString('base64'),
        })
      }

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

      sentCount++
      results.push(`✅ ${email.to_recipients}: ${email.subject}`)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      const newRetryCount = (email.retry_count || 0) + 1

      await supabase
        .from('gmail_scheduled_emails')
        .update({
          status: newRetryCount >= MAX_RETRIES ? 'failed' : 'pending',
          error_message: errorMsg,
          retry_count: newRetryCount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', email.id)

      results.push(`❌ ${email.to_recipients}: ${errorMsg}`)
    }
  }

  return NextResponse.json({ sent: sentCount, total: dueEmails.length, results })
}
