import { NextRequest, NextResponse } from 'next/server'
import { getGmailClient, createMimeMessage } from '@/lib/gmail-server'

export async function POST(request: NextRequest) {
  try {
    const gmail = await getGmailClient()

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
