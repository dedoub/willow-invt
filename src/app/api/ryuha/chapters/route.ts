import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export async function GET(request: Request) {
  try {
    const supabase = getServiceSupabase()
    const { searchParams } = new URL(request.url)
    const textbookId = searchParams.get('textbookId')

    let query = supabase
      .from('ryuha_chapters')
      .select('*, textbook:ryuha_textbooks(*, subject:ryuha_subjects(*))')
      .order('order_index')

    if (textbookId) {
      query = query.eq('textbook_id', textbookId)
    }

    const { data, error } = await query

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching chapters:', error)
    return NextResponse.json({ error: 'Failed to fetch chapters' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getServiceSupabase()
    const body = await request.json()

    // 여러 챕터를 한번에 추가할 수 있도록 배열도 지원
    const isArray = Array.isArray(body)
    const items = isArray ? body : [body]

    const { data, error } = await supabase
      .from('ryuha_chapters')
      .insert(items)
      .select('*, textbook:ryuha_textbooks(*, subject:ryuha_subjects(*))')

    if (error) throw error
    return NextResponse.json(isArray ? data : data[0])
  } catch (error) {
    console.error('Error creating chapter:', error)
    return NextResponse.json({ error: 'Failed to create chapter' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = getServiceSupabase()
    const body = await request.json()
    const { id, ...updates } = body

    const { data, error } = await supabase
      .from('ryuha_chapters')
      .update(updates)
      .eq('id', id)
      .select('*, textbook:ryuha_textbooks(*, subject:ryuha_subjects(*))')
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error updating chapter:', error)
    return NextResponse.json({ error: 'Failed to update chapter' }, { status: 500 })
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
      .from('ryuha_chapters')
      .delete()
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting chapter:', error)
    return NextResponse.json({ error: 'Failed to delete chapter' }, { status: 500 })
  }
}
