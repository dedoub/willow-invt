import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = getServiceSupabase()
    const body = await request.json()

    if (body.status === 'cancelled') {
      // Only allow cancellation of pending emails
      const { data: existing } = await supabase
        .from('gmail_scheduled_emails')
        .select('status, attachment_paths')
        .eq('id', id)
        .single()

      if (!existing) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      if (existing.status !== 'pending') {
        return NextResponse.json({ error: 'Can only cancel pending emails' }, { status: 400 })
      }

      // Clean up attachments from Storage
      const paths = (existing.attachment_paths as { path: string }[]) || []
      if (paths.length > 0) {
        await supabase.storage
          .from('scheduled-email-attachments')
          .remove(paths.map(p => p.path))
      }

      const { data, error } = await supabase
        .from('gmail_scheduled_emails')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ success: true, email: data })
    }

    return NextResponse.json({ error: 'Invalid update' }, { status: 400 })
  } catch (error) {
    console.error('Error updating scheduled email:', error)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
