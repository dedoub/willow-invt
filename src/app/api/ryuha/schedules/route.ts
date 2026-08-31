import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export async function GET(request: Request) {
  try {
    const supabase = getServiceSupabase()
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    let query = supabase
      .from('ryuha_schedules')
      .select('*, homework_items:ryuha_homework_items(*)')
      .order('schedule_date')
      .order('start_time')

    if (startDate) {
      query = query.gte('schedule_date', startDate)
    }
    if (endDate) {
      query = query.lte('schedule_date', endDate)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json(data || [])
  } catch (error) {
    console.error('Error fetching schedules:', error)
    return NextResponse.json({ error: 'Failed to fetch schedules' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getServiceSupabase()
    const body = await request.json()
    // Strip homework_items (separate table) and convert empty strings to null
    const { homework_items: hwItems, ...raw } = body
    const insertData = Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, v === '' ? null : v])
    )

    const { data, error } = await supabase
      .from('ryuha_schedules')
      .insert(insertData)
      .select('*, homework_items:ryuha_homework_items(*)')
      .single()

    if (error) throw error


    return NextResponse.json(data)
  } catch (error) {
    console.error('Error creating schedule:', error)
    return NextResponse.json({ error: 'Failed to create schedule' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = getServiceSupabase()
    const body = await request.json()
    // Strip homework_items (separate table) to avoid Supabase column error
    const { id, homework_items, ...raw } = body

    // Convert empty strings to null for nullable fields
    const updates = Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, v === '' ? null : v])
    )

    const { data, error } = await supabase
      .from('ryuha_schedules')
      .update(updates)
      .eq('id', id)
      .select('*, homework_items:ryuha_homework_items(*)')
      .single()

    if (error) throw error

    // Sync homework items if provided
    if (homework_items && Array.isArray(homework_items)) {
      // Delete existing items
      await supabase.from('ryuha_homework_items').delete().eq('schedule_id', id)
      // Insert new items
      const validItems = homework_items.filter((item: { content: string }) => item.content?.trim())
      if (validItems.length > 0) {
        await supabase.from('ryuha_homework_items').insert(
          validItems.map((item: { content: string; deadline: string }) => ({
            schedule_id: id, content: item.content, deadline: item.deadline,
          }))
        )
      }
    }


    return NextResponse.json(data)
  } catch (error) {
    console.error('Error updating schedule:', error)
    return NextResponse.json({ error: 'Failed to update schedule' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = getServiceSupabase()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('ryuha_schedules')
      .delete()
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting schedule:', error)
    return NextResponse.json({ error: 'Failed to delete schedule' }, { status: 500 })
  }
}
