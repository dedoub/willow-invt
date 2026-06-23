import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

/**
 * Consolidated page-load endpoint for the 류하(ryuha) dashboard.
 *
 * Runs the SAME queries that the page previously fired as 7 separate GETs
 * (subjects, textbooks, chapters, schedules, memos, notes, body-records)
 * in a single serverless invocation via Promise.all. Each field's select /
 * filter / order is byte-identical to the corresponding individual route so
 * the page receives the exact same shapes.
 *
 * The individual routes remain intact and are still used for mutations and
 * refresh. This endpoint is GET-only (read).
 */
export async function GET() {
  try {
    const supabase = getServiceSupabase()

    const [subjects, textbooks, chapters, schedules, memos, notes, bodyRecords] = await Promise.all([
      // subjects route GET: ryuha/subjects
      supabase
        .from('ryuha_subjects')
        .select('*')
        .order('order_index'),

      // textbooks route GET (no subjectId): ryuha/textbooks
      supabase
        .from('ryuha_textbooks')
        .select('*, subject:ryuha_subjects(*), chapters:ryuha_chapters(count)')
        .order('order_index'),

      // chapters route GET (no textbookId): ryuha/chapters
      supabase
        .from('ryuha_chapters')
        .select('*, textbook:ryuha_textbooks(*, subject:ryuha_subjects(*))')
        .order('order_index'),

      // schedules route GET (no startDate/endDate/subjectId): ryuha/schedules
      supabase
        .from('ryuha_schedules')
        .select('*, subject:ryuha_subjects(*), chapter:ryuha_chapters(*, textbook:ryuha_textbooks(*)), homework_items:ryuha_homework_items(*)')
        .order('schedule_date')
        .order('start_time'),

      // memos route GET (no startDate/endDate): ryuha/memos
      supabase
        .from('ryuha_daily_memos')
        .select('*')
        .order('memo_date'),

      // notes route GET (no search): ryuha/notes
      supabase
        .from('ryuha_notes')
        .select('*')
        .order('is_pinned', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(200),

      // body-records route GET (limit=50, matching the page's request): ryuha/body-records?limit=50
      supabase
        .from('ryuha_body_records')
        .select('*')
        .order('record_date', { ascending: false })
        .limit(50),
    ])

    // Surface the first error (if any) the same way the individual routes do.
    const firstError =
      subjects.error || textbooks.error || chapters.error ||
      schedules.error || memos.error || notes.error || bodyRecords.error
    if (firstError) throw firstError

    return NextResponse.json({
      subjects: subjects.data ?? [],
      textbooks: textbooks.data ?? [],
      chapters: chapters.data ?? [],
      schedules: schedules.data ?? [],
      memos: memos.data ?? [],
      notes: notes.data ?? [],
      bodyRecords: bodyRecords.data ?? [],
    })
  } catch (error) {
    console.error('Error fetching ryuha bootstrap data:', error)
    return NextResponse.json({ error: 'Failed to fetch ryuha bootstrap data' }, { status: 500 })
  }
}
