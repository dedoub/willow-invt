import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export async function GET(request: Request) {
  try {
    const supabase = getServiceSupabase()
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const clientId = searchParams.get('clientId')

    let query = supabase
      .from('willow_mgmt_schedules')
      .select('*, client:willow_mgmt_clients(*), milestone:willow_mgmt_milestones(*, project:willow_mgmt_projects(*)), tasks:willow_mgmt_tasks(*)')
      .order('schedule_date')
      .order('start_time')

    if (startDate) {
      query = query.gte('schedule_date', startDate)
    }
    if (endDate) {
      query = query.lte('schedule_date', endDate)
    }
    if (clientId) {
      query = query.eq('client_id', clientId)
    }

    const { data, error } = await query

    if (error) throw error

    // Fetch milestones for milestone_ids arrays
    const allMilestoneIds = new Set<string>()
    for (const schedule of data || []) {
      if (schedule.milestone_ids?.length > 0) {
        schedule.milestone_ids.forEach((id: string) => allMilestoneIds.add(id))
      }
    }

    let milestonesMap: Record<string, unknown> = {}
    if (allMilestoneIds.size > 0) {
      const { data: milestones } = await supabase
        .from('willow_mgmt_milestones')
        .select('*, project:willow_mgmt_projects(*, client:willow_mgmt_clients(*))')
        .in('id', Array.from(allMilestoneIds))

      if (milestones) {
        milestonesMap = Object.fromEntries(milestones.map(m => [m.id, m]))
      }
    }

    // Merge milestones into schedules
    const schedulesWithMilestones = (data || []).map(schedule => ({
      ...schedule,
      milestones: schedule.milestone_ids?.length > 0
        ? schedule.milestone_ids.map((id: string) => milestonesMap[id]).filter(Boolean)
        : [],
    }))

    return NextResponse.json(schedulesWithMilestones)
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
      .from('willow_mgmt_schedules')
      .insert(body)
      .select('*, client:willow_mgmt_clients(*), milestone:willow_mgmt_milestones(*, project:willow_mgmt_projects(*)), tasks:willow_mgmt_tasks(*)')
      .single()

    if (error) throw error

    // Fetch milestones for milestone_ids
    let milestones: unknown[] = []
    if (data.milestone_ids?.length > 0) {
      const { data: milestoneData } = await supabase
        .from('willow_mgmt_milestones')
        .select('*, project:willow_mgmt_projects(*, client:willow_mgmt_clients(*))')
        .in('id', data.milestone_ids)
      milestones = milestoneData || []
    }

    return NextResponse.json({ ...data, milestones })
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
      .from('willow_mgmt_schedules')
      .update(updates)
      .eq('id', id)
      .select('*, client:willow_mgmt_clients(*), milestone:willow_mgmt_milestones(*, project:willow_mgmt_projects(*)), tasks:willow_mgmt_tasks(*)')
      .single()

    if (error) throw error

    // Fetch milestones for milestone_ids
    let milestones: unknown[] = []
    if (data.milestone_ids?.length > 0) {
      const { data: milestoneData } = await supabase
        .from('willow_mgmt_milestones')
        .select('*, project:willow_mgmt_projects(*, client:willow_mgmt_clients(*))')
        .in('id', data.milestone_ids)
      milestones = milestoneData || []
    }

    return NextResponse.json({ ...data, milestones })
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
      .from('willow_mgmt_schedules')
      .delete()
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting schedule:', error)
    return NextResponse.json({ error: 'Failed to delete schedule' }, { status: 500 })
  }
}
