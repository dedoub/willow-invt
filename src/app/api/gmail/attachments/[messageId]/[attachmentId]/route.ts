import { NextRequest, NextResponse } from 'next/server'
import { getGmailClient, GmailContext } from '@/lib/gmail-server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string; attachmentId: string }> }
) {
  try {
    const context = (request.nextUrl.searchParams.get('context') || 'default') as GmailContext
    const gmail = await getGmailClient(context)

    if (!gmail) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { messageId, attachmentId } = await params
    const filename = request.nextUrl.searchParams.get('filename') || 'attachment'
    const mimeType = request.nextUrl.searchParams.get('mimeType') || 'application/octet-stream'

    const attachment = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId,
      id: attachmentId,
    })

    if (!attachment.data.data) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
    }

    // Base64 디코딩 (URL-safe base64)
    const data = Buffer.from(
      attachment.data.data.replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    )

    return new NextResponse(data, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'Content-Length': String(data.length),
      },
    })
  } catch (error) {
    console.error('Error fetching attachment:', error)
    return NextResponse.json({ error: 'Failed to fetch attachment' }, { status: 500 })
  }
}
