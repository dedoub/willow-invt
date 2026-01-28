import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export async function GET(request: Request) {
  try {
    const supabase = getServiceSupabase()
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    let query = supabase
      .from('willow_mgmt_milestones')
      .select('*, project:willow_mgmt_projects(*, client:willow_mgmt_clients(*))')
      .order('order_index')

    if (projectId) {
      query = query.eq('project_id', projectId)
    }

    const { data, error } = await query

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching milestones:', error)
    return NextResponse.json({ error: 'Failed to fetch milestones' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getServiceSupabase()
    const body = await request.json()

    const isArray = Array.isArray(body)
    const items = isArray ? body : [body]

    const { data, error } = await supabase
      .from('willow_mgmt_milestones')
      .insert(items)
      .select('*, project:willow_mgmt_projects(*, client:willow_mgmt_clients(*))')

    if (error) throw error
    return NextResponse.json(isArray ? data : data[0])
  } catch (error) {
    console.error('Error creating milestone:', error)
    return NextResponse.json({ error: 'Failed to create milestone' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = getServiceSupabase()
    const body = await request.json()
    const { id, ...updates } = body

    const { data, error } = await supabase
      .from('willow_mgmt_milestones')
      .update(updates)
      .eq('id', id)
      .select('*, project:willow_mgmt_projects(*, client:willow_mgmt_clients(*))')
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error updating milestone:', error)
    return NextResponse.json({ error: 'Failed to update milestone' }, { status: 500 })
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
      .from('willow_mgmt_milestones')
      .delete()
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting milestone:', error)
    return NextResponse.json({ error: 'Failed to delete milestone' }, { status: 500 })
  }
}
