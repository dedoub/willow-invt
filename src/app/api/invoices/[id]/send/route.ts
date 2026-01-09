import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { getAuthUser } from '@/lib/auth'
import { getGmailClient, createMimeMessage, EmailAttachmentData } from '@/lib/gmail-server'
import { generateInvoicePdf, generatePdfFilename, DEFAULT_CLIENT, formatCurrency } from '@/lib/invoice'
import type { Invoice } from '@/lib/invoice'

// POST /api/invoices/[id]/send - Send invoice via Gmail
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await getAuthUser()
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { id } = await params

    // Parse request body
    const body = await request.json().catch(() => ({})) as {
      to?: string
      subject?: string
      body?: string
    }

    const supabase = getServiceSupabase()

    // Fetch invoice
    const { data, error } = await supabase
      .from('willow_invoices')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const invoice = data as Invoice

    // Get Gmail client
    const gmail = await getGmailClient()
    if (!gmail) {
      return NextResponse.json({ error: 'Gmail not authenticated' }, { status: 401 })
    }

    // Generate PDF
    const pdfBytes = await generateInvoicePdf(invoice)
    const pdfFilename = generatePdfFilename(invoice)
    const pdfBase64 = Buffer.from(pdfBytes).toString('base64')

    // Prepare email
    const to = body.to || DEFAULT_CLIENT.email
    const subject = body.subject || `Invoice ${invoice.invoice_no} - Willow Investments`
    const emailBody = body.body || generateDefaultEmailBody(invoice)

    // Get sender email
    const profile = await gmail.users.getProfile({ userId: 'me' })
    const from = profile.data.emailAddress

    // Create attachment
    const attachments: EmailAttachmentData[] = [{
      filename: pdfFilename,
      mimeType: 'application/pdf',
      data: pdfBase64,
    }]

    // Create MIME message
    const raw = createMimeMessage({
      to,
      subject,
      body: emailBody,
      from: from || undefined,
      attachments,
    })

    // Send email
    const sendRes = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    })

    // Update invoice status
    const { error: updateError } = await supabase
      .from('willow_invoices')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        sent_to_email: to,
        gmail_message_id: sendRes.data.id,
      })
      .eq('id', id)

    if (updateError) {
      console.error('[Invoices] Failed to update invoice status:', updateError)
    }

    return NextResponse.json({
      success: true,
      messageId: sendRes.data.id,
      threadId: sendRes.data.threadId,
      sentTo: to,
    })
  } catch (error) {
    console.error('[Invoices] Send error:', error)
    return NextResponse.json(
      { error: 'Failed to send invoice', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// Generate default email body
function generateDefaultEmailBody(invoice: Invoice): string {
  const totalFormatted = formatCurrency(invoice.total_amount, invoice.currency)

  return `Dear ${invoice.attention},

Please find attached invoice ${invoice.invoice_no} for ${totalFormatted}.

If you have any questions, please don't hesitate to contact us.

Best regards,
Willow Investments, Inc.`
}
