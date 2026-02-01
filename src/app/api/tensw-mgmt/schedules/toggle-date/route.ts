import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export async function POST(request: Request) {
  try {
    const supabase = getServiceSupabase()
    const body = await request.json()
    const { schedule_id, date } = body

    if (!schedule_id || !date) {
      return NextResponse.json({ error: 'schedule_id and date are required' }, { status: 400 })
    }

    // Get current schedule
    const { data: schedule, error: fetchError } = await supabase
      .from('tensw_mgmt_schedules')
      .select('completed_dates, schedule_date, end_date')
      .eq('id', schedule_id)
      .single()

    if (fetchError) throw fetchError

    const completedDates: string[] = schedule.completed_dates || []
    const isCompleted = completedDates.includes(date)

    // Toggle the date
    const newCompletedDates = isCompleted
      ? completedDates.filter((d: string) => d !== date)
      : [...completedDates, date]

    // Calculate if all dates are completed
    const startDate = new Date(schedule.schedule_date)
    const endDate = schedule.end_date ? new Date(schedule.end_date) : startDate
    const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
    const allCompleted = newCompletedDates.length >= totalDays

    // Update schedule
    const { data, error } = await supabase
      .from('tensw_mgmt_schedules')
      .update({
        completed_dates: newCompletedDates,
        is_completed: allCompleted,
      })
      .eq('id', schedule_id)
      .select('*, client:tensw_mgmt_clients(*), milestone:tensw_mgmt_milestones(*, project:tensw_mgmt_projects(*)), tasks:tensw_mgmt_tasks(*)')
      .single()

    if (error) throw error

    // Fetch milestones for milestone_ids
    let milestones: unknown[] = []
    if (data.milestone_ids?.length > 0) {
      const { data: milestoneData } = await supabase
        .from('tensw_mgmt_milestones')
        .select('*, project:tensw_mgmt_projects(*, client:tensw_mgmt_clients(*))')
        .in('id', data.milestone_ids)
      milestones = milestoneData || []
    }

    return NextResponse.json({ ...data, milestones })
  } catch (error) {
    console.error('Error toggling date completion:', error)
    return NextResponse.json({ error: 'Failed to toggle date completion' }, { status: 500 })
  }
}
