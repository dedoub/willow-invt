import { NextRequest, NextResponse } from 'next/server'
import { getGmailClient, createMimeMessage, EmailAttachmentData, GmailContext } from '@/lib/gmail-server'

export async function POST(request: NextRequest) {
  try {
    const context = (request.nextUrl.searchParams.get('context') || 'default') as GmailContext
    const gmail = await getGmailClient(context)

    if (!gmail) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const formData = await request.formData()

    const to = formData.get('to') as string
    const subject = formData.get('subject') as string
    const body = formData.get('body') as string
    const bodyHtml = formData.get('bodyHtml') as string | null
    const cc = formData.get('cc') as string | null
    const bcc = formData.get('bcc') as string | null
    const replyTo = formData.get('replyTo') as string | null

    // 첨부파일 처리
    const attachments: EmailAttachmentData[] = []
    const files = formData.getAll('attachments') as File[]

    for (const file of files) {
      if (file && file.size > 0) {
        const arrayBuffer = await file.arrayBuffer()
        const base64Data = Buffer.from(arrayBuffer).toString('base64')
        attachments.push({
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          data: base64Data,
        })
      }
    }

    if (!to || !subject || !body) {
      return NextResponse.json(
        { error: 'Missing required fields: to, subject, body' },
        { status: 400 }
      )
    }

    // 발신자 이메일 조회
    const profile = await gmail.users.getProfile({ userId: 'me' })
    const from = profile.data.emailAddress

    // MIME 메시지 생성
    const raw = createMimeMessage({
      to,
      subject,
      body,
      bodyHtml: bodyHtml || undefined,
      cc: cc || undefined,
      bcc: bcc || undefined,
      replyTo: replyTo || undefined,
      from: from || undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
    })

    // 이메일 발송
    const sendRes = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    })

    return NextResponse.json({
      success: true,
      messageId: sendRes.data.id,
      threadId: sendRes.data.threadId,
    })
  } catch (error) {
    console.error('Error sending email:', error)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
