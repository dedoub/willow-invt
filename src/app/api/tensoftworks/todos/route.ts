import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

// POST /api/tensoftworks/todos - Create a new todo
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { project_id, title, priority = 'medium', due_date = null, description = null } = body

    if (!project_id || !title) {
      return NextResponse.json(
        { error: 'project_id and title are required' },
        { status: 400 }
      )
    }

    const supabase = getServiceSupabase()

    // Get next readable_id for this project
    const { data: maxReadableId } = await supabase
      .from('tensw_todos')
      .select('readable_id')
      .eq('project_id', project_id)
      .not('readable_id', 'is', null)
      .order('readable_id', { ascending: false })
      .limit(1)
      .single()

    let nextReadableId = 1
    if (maxReadableId?.readable_id) {
      const match = maxReadableId.readable_id.match(/\d+$/)
      if (match) {
        nextReadableId = parseInt(match[0], 10) + 1
      }
    }

    // Get project slug for readable_id prefix
    const { data: project } = await supabase
      .from('tensw_projects')
      .select('slug')
      .eq('id', project_id)
      .single()

    const prefix = project?.slug?.substring(0, 3).toUpperCase() || 'TSK'
    const readable_id = `${prefix}-${nextReadableId.toString().padStart(4, '0')}`

    // Create the todo
    const { data: todo, error } = await supabase
      .from('tensw_todos')
      .insert({
        project_id,
        title,
        description,
        priority,
        due_date,
        status: 'pending',
        readable_id,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating todo:', error)
      return NextResponse.json({ error: 'Failed to create todo' }, { status: 500 })
    }

    // Create activity log
    await supabase
      .from('tensw_todo_logs')
      .insert({
        todo_id: todo.id,
        action: 'created',
        changed_by: null, // 추후 인증 추가 시 사용자 ID
      })

    return NextResponse.json({ todo })
  } catch (error) {
    console.error('Tensoftworks todos POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
