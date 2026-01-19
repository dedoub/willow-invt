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

    // Fetch chapters for chapter_ids arrays
    const allChapterIds = new Set<string>()
    for (const schedule of data || []) {
      if (schedule.chapter_ids?.length > 0) {
        schedule.chapter_ids.forEach((id: string) => allChapterIds.add(id))
      }
    }

    let chaptersMap: Record<string, unknown> = {}
    if (allChapterIds.size > 0) {
      const { data: chapters } = await supabase
        .from('ryuha_chapters')
        .select('*, textbook:ryuha_textbooks(*, subject:ryuha_subjects(*))')
        .in('id', Array.from(allChapterIds))

      if (chapters) {
        chaptersMap = Object.fromEntries(chapters.map(ch => [ch.id, ch]))
      }
    }

    // Merge chapters into schedules
    const schedulesWithChapters = (data || []).map(schedule => ({
      ...schedule,
      chapters: schedule.chapter_ids?.length > 0
        ? schedule.chapter_ids.map((id: string) => chaptersMap[id]).filter(Boolean)
        : [],
    }))

    return NextResponse.json(schedulesWithChapters)
  } catch (error) {
    console.error('Error fetching schedules:', error)
    return NextResponse.json({ error: 'Failed to fetch schedules' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getServiceSupabase()
    const body = await request.json()

    const { data, error } = await supabase
      .from('ryuha_schedules')
      .insert(body)
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
    const { id, ...updates } = body

    const { data, error } = await supabase
      .from('ryuha_schedules')
      .update(updates)
      .eq('id', id)
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
