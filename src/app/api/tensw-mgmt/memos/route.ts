import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export async function GET(request: Request) {
  try {
    const supabase = getServiceSupabase()
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    let query = supabase
      .from('tensw_mgmt_daily_memos')
      .select('*')
      .order('memo_date')

    if (startDate) {
      query = query.gte('memo_date', startDate)
    }
    if (endDate) {
      query = query.lte('memo_date', endDate)
    }

    const { data, error } = await query

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching memos:', error)
    return NextResponse.json({ error: 'Failed to fetch memos' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getServiceSupabase()
    const body = await request.json()
    const { memo_date, content } = body

    // Upsert - update if exists, insert if not
    const { data, error } = await supabase
      .from('tensw_mgmt_daily_memos')
      .upsert(
        { memo_date, content, updated_at: new Date().toISOString() },
        { onConflict: 'memo_date' }
      )
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error saving memo:', error)
    return NextResponse.json({ error: 'Failed to save memo' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = getServiceSupabase()
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')

    if (!date) {
      return NextResponse.json({ error: 'Date required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('tensw_mgmt_daily_memos')
      .delete()
      .eq('memo_date', date)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting memo:', error)
    return NextResponse.json({ error: 'Failed to delete memo' }, { status: 500 })
  }
}
