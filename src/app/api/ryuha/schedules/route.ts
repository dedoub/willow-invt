import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export async function GET(request: Request) {
  try {
    const supabase = getServiceSupabase()
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const subjectId = searchParams.get('subjectId')

    let query = supabase
      .from('ryuha_schedules')
      .select('*, subject:ryuha_subjects(*), chapter:ryuha_chapters(*, textbook:ryuha_textbooks(*)), homework_items:ryuha_homework_items(*)')
      .order('schedule_date')
      .order('start_time')

    if (startDate) {
      query = query.gte('schedule_date', startDate)
    }
    if (endDate) {
      query = query.lte('schedule_date', endDate)
    }
    if (subjectId) {
      query = query.eq('subject_id', subjectId)
    }

    const { data, error } = await query

    if (error) throw error

    // chapter_ids are resolved client-side against already-loaded chapters
    // (see ryuha/page.tsx), so no extra chapter hydration query is needed here.
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
      .select('*, subject:ryuha_subjects(*), chapter:ryuha_chapters(*, textbook:ryuha_textbooks(*)), homework_items:ryuha_homework_items(*)')
      .single()

    if (error) throw error

    // Fetch chapters for chapter_ids
    let chapters: unknown[] = []
    if (data.chapter_ids?.length > 0) {
      const { data: chapterData } = await supabase
        .from('ryuha_chapters')
        .select('*, textbook:ryuha_textbooks(*, subject:ryuha_subjects(*))')
        .in('id', data.chapter_ids)
      chapters = chapterData || []
    }

    return NextResponse.json({ ...data, chapters })
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
      .select('*, subject:ryuha_subjects(*), chapter:ryuha_chapters(*, textbook:ryuha_textbooks(*)), homework_items:ryuha_homework_items(*)')
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

    // Fetch chapters for chapter_ids
    let chapters: unknown[] = []
    if (data.chapter_ids?.length > 0) {
      const { data: chapterData } = await supabase
        .from('ryuha_chapters')
        .select('*, textbook:ryuha_textbooks(*, subject:ryuha_subjects(*))')
        .in('id', data.chapter_ids)
      chapters = chapterData || []
    }

    return NextResponse.json({ ...data, chapters })
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
