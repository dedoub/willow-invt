import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export async function GET(request: Request) {
  try {
    const supabase = getServiceSupabase()
    const { searchParams } = new URL(request.url)
    const subjectId = searchParams.get('subjectId')

    let query = supabase
      .from('ryuha_textbooks')
      .select('*, subject:ryuha_subjects(*), chapters:ryuha_chapters(count)')
      .order('order_index')

    if (subjectId) {
      query = query.eq('subject_id', subjectId)
    }

    const { data, error } = await query

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching textbooks:', error)
    return NextResponse.json({ error: 'Failed to fetch textbooks' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getServiceSupabase()
    const body = await request.json()

    const { data, error } = await supabase
      .from('ryuha_textbooks')
      .insert(body)
      .select('*, subject:ryuha_subjects(*)')
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error creating textbook:', error)
    return NextResponse.json({ error: 'Failed to create textbook' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = getServiceSupabase()
    const body = await request.json()
    const { id, ...updates } = body

    const { data, error } = await supabase
      .from('ryuha_textbooks')
      .update(updates)
      .eq('id', id)
      .select('*, subject:ryuha_subjects(*)')
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error updating textbook:', error)
    return NextResponse.json({ error: 'Failed to update textbook' }, { status: 500 })
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
      .from('ryuha_textbooks')
      .delete()
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting textbook:', error)
    return NextResponse.json({ error: 'Failed to delete textbook' }, { status: 500 })
  }
}
