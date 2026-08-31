import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

/**
 * Consolidated page-load endpoint for the 류하(ryuha) dashboard.
 *
 * Runs the SAME queries that the page previously fired as 7 separate GETs
 * (schedules, memos, notes, body-records)
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

    const [schedules, memos, notes, bodyRecords] = await Promise.all([
      // schedules route GET (no startDate/endDate): ryuha/schedules
      supabase
        .from('ryuha_schedules')
        .select('*, homework_items:ryuha_homework_items(*)')
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
      schedules.error || memos.error || notes.error || bodyRecords.error
    if (firstError) throw firstError

    return NextResponse.json({
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
