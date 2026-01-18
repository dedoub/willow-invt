import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export async function GET(request: Request) {
  try {
    const supabase = getServiceSupabase()
    const { searchParams } = new URL(request.url)
    const subjectId = searchParams.get('subjectId')

    let query = supabase
      .from('ryuha_study_ranges')
      .select('*, subject:ryuha_subjects(*)')
      .order('order_index')

    if (subjectId) {
      query = query.eq('subject_id', subjectId)
    }

    const { data, error } = await query

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching study ranges:', error)
    return NextResponse.json({ error: 'Failed to fetch study ranges' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getServiceSupabase()
    const body = await request.json()

    const { data, error } = await supabase
      .from('ryuha_study_ranges')
      .insert(body)
      .select('*, subject:ryuha_subjects(*)')
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error creating study range:', error)
    return NextResponse.json({ error: 'Failed to create study range' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = getServiceSupabase()
    const body = await request.json()
    const { id, ...updates } = body

    const { data, error } = await supabase
      .from('ryuha_study_ranges')
      .update(updates)
      .eq('id', id)
      .select('*, subject:ryuha_subjects(*)')
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error updating study range:', error)
    return NextResponse.json({ error: 'Failed to update study range' }, { status: 500 })
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
      .from('ryuha_study_ranges')
      .delete()
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting study range:', error)
    return NextResponse.json({ error: 'Failed to delete study range' }, { status: 500 })
  }
}
