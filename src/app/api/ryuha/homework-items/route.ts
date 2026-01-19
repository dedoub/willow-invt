import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

// GET - Get homework items for a schedule
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const scheduleId = searchParams.get('scheduleId')

  const supabase = getServiceSupabase()

  let query = supabase
    .from('ryuha_homework_items')
    .select('*')
    .order('deadline', { ascending: true })
    .order('order_index', { ascending: true })

  if (scheduleId) {
    query = query.eq('schedule_id', scheduleId)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// POST - Create a homework item
export async function POST(request: Request) {
  const body = await request.json()
  const { schedule_id, content, deadline, order_index = 0 } = body

  if (!schedule_id || !content || !deadline) {
    return NextResponse.json(
      { error: 'schedule_id, content, and deadline are required' },
      { status: 400 }
    )
  }

  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from('ryuha_homework_items')
    .insert({ schedule_id, content, deadline, order_index })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// PUT - Update a homework item
export async function PUT(request: Request) {
  const body = await request.json()
  const { id, ...updates } = body

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  // Handle completion status
  if (updates.is_completed !== undefined) {
    updates.completed_at = updates.is_completed ? new Date().toISOString() : null
  }

  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from('ryuha_homework_items')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// DELETE - Delete a homework item
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const supabase = getServiceSupabase()

  const { error } = await supabase
    .from('ryuha_homework_items')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
