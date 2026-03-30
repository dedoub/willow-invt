import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const context = request.nextUrl.searchParams.get('context') || 'default'
    const supabase = getServiceSupabase()

    const formData = await request.formData()
    const to = formData.get('to') as string
    const subject = formData.get('subject') as string
    const body = formData.get('body') as string
    const bodyHtml = formData.get('bodyHtml') as string | null
    const cc = formData.get('cc') as string | null
    const bcc = formData.get('bcc') as string | null
    const replyTo = formData.get('replyTo') as string | null
    const scheduledAt = formData.get('scheduledAt') as string

    if (!to || !subject || !body || !scheduledAt) {
      return NextResponse.json(
        { error: 'Missing required fields: to, subject, body, scheduledAt' },
        { status: 400 }
      )
    }

    // Validate scheduled time is in the future
    if (new Date(scheduledAt) <= new Date()) {
      return NextResponse.json(
        { error: 'Scheduled time must be in the future' },
        { status: 400 }
      )
    }

    // Upload attachments to Storage
    const files = formData.getAll('attachments') as File[]
    const attachmentPaths: { path: string; name: string; size: number; mimeType: string }[] = []
    const emailId = crypto.randomUUID()

    for (const file of files) {
      if (file && file.size > 0) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `${emailId}/${Date.now()}_${safeName}`
        const arrayBuffer = await file.arrayBuffer()
        const { error: uploadError } = await supabase.storage
          .from('scheduled-email-attachments')
          .upload(path, Buffer.from(arrayBuffer), { contentType: file.type || 'application/octet-stream' })
        if (uploadError) {
          console.error('Attachment upload error:', uploadError)
          continue
        }
        attachmentPaths.push({ path, name: file.name, size: file.size, mimeType: file.type || 'application/octet-stream' })
      }
    }

    const { data, error } = await supabase
      .from('gmail_scheduled_emails')
      .insert({
        id: emailId,
        gmail_context: context,
        to_recipients: to,
        cc_recipients: cc || null,
        bcc_recipients: bcc || null,
        subject,
        body,
        body_html: bodyHtml || null,
        reply_to: replyTo || null,
        scheduled_at: scheduledAt,
        attachment_paths: attachmentPaths,
        status: 'pending',
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, id: data.id, scheduled_at: data.scheduled_at })
  } catch (error) {
    console.error('Error scheduling email:', error)
    return NextResponse.json({ error: 'Failed to schedule email' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getServiceSupabase()
    const status = request.nextUrl.searchParams.get('status')
    const context = request.nextUrl.searchParams.get('context')

    let query = supabase
      .from('gmail_scheduled_emails')
      .select('*')
      .order('scheduled_at', { ascending: true })

    if (status) query = query.eq('status', status)
    if (context) query = query.eq('gmail_context', context)

    const { data, error } = await query.limit(50)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ emails: data || [] })
  } catch (error) {
    console.error('Error fetching scheduled emails:', error)
    return NextResponse.json({ error: 'Failed to fetch scheduled emails' }, { status: 500 })
  }
}
