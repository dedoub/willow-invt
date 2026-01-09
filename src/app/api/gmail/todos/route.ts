import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

// 현재 사용자 ID 가져오기
async function getCurrentUserId(): Promise<string | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) return null

  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    return payload.email || payload.sub || null
  } catch {
    return null
  }
}

// POST: 새 todo 생성
export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()
    const { label, category, task, due_date, priority, related_email_ids, completed } = body

    if (!label || !category || !task || !priority) {
      return NextResponse.json({ error: 'label, category, task, and priority are required' }, { status: 400 })
    }

    // 중복 체크 후 생성 또는 기존 것 반환
    const { data: existing } = await supabase
      .from('email_todos')
      .select('*')
      .eq('user_id', userId)
      .eq('label', label)
      .eq('category', category)
      .eq('task', task)
      .single()

    if (existing) {
      // 이미 존재하면 완료 상태 업데이트
      const { data: updated, error: updateError } = await supabase
        .from('email_todos')
        .update({
          completed: completed ?? true,
          completed_at: (completed ?? true) ? new Date().toISOString() : null,
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (updateError) {
        console.error('Error updating existing todo:', updateError)
        return NextResponse.json({ error: 'Failed to update todo' }, { status: 500 })
      }

      return NextResponse.json(updated)
    }

    // 새로 생성 (기본값: completed = false)
    const isCompleted = completed ?? false
    const { data, error } = await supabase
      .from('email_todos')
      .insert({
        user_id: userId,
        label,
        category,
        task,
        due_date: due_date || null,
        priority,
        related_email_ids: related_email_ids || [],
        completed: isCompleted,
        completed_at: isCompleted ? new Date().toISOString() : null,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating todo:', error)
      return NextResponse.json({ error: 'Failed to create todo' }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/gmail/todos:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
