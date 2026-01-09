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

  // JWT에서 사용자 정보 추출 (간단히 base64 디코딩)
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    return payload.email || payload.sub || null
  } catch {
    return null
  }
}

// GET: 저장된 분석 결과 조회
export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const label = searchParams.get('label')

    if (!label) {
      return NextResponse.json({ error: 'Label is required' }, { status: 400 })
    }

    // 분석 결과 조회
    const { data: analysis, error: analysisError } = await supabase
      .from('email_analysis')
      .select('*')
      .eq('user_id', userId)
      .eq('label', label)
      .single()

    if (analysisError && analysisError.code !== 'PGRST116') {
      console.error('Error fetching analysis:', analysisError)
      return NextResponse.json({ error: 'Failed to fetch analysis' }, { status: 500 })
    }

    // 해당 라벨의 모든 todos 조회
    const { data: todos, error: todosError } = await supabase
      .from('email_todos')
      .select('*')
      .eq('user_id', userId)
      .eq('label', label)
      .order('created_at', { ascending: false })

    if (todosError) {
      console.error('Error fetching todos:', todosError)
      return NextResponse.json({ error: 'Failed to fetch todos' }, { status: 500 })
    }

    return NextResponse.json({
      analysis: analysis || null,
      todos: todos || [],
    })
  } catch (error) {
    console.error('Error in GET /api/gmail/analysis:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST: 분석 결과 저장 (기존 분석 업데이트 또는 새로 생성)
export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()
    const { label, analysisData } = body

    if (!label || !analysisData) {
      return NextResponse.json({ error: 'Label and analysisData are required' }, { status: 400 })
    }

    // 분석 결과 upsert (user_id, label이 unique)
    const { data: analysis, error: analysisError } = await supabase
      .from('email_analysis')
      .upsert({
        user_id: userId,
        label,
        analysis_data: analysisData,
        generated_at: analysisData.generatedAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,label',
      })
      .select()
      .single()

    if (analysisError) {
      console.error('Error saving analysis:', analysisError)
      return NextResponse.json({ error: 'Failed to save analysis' }, { status: 500 })
    }

    // 새 todos 추가 (중복은 무시)
    const newTodos: Array<{
      user_id: string
      label: string
      category: string
      task: string
      due_date: string | null
      priority: string
      related_email_ids: string[]
      source_analysis_id: string
    }> = []

    for (const category of analysisData.categories || []) {
      for (const todo of category.todos || []) {
        newTodos.push({
          user_id: userId,
          label,
          category: category.category,
          task: todo.task,
          due_date: todo.dueDate || null,
          priority: todo.priority,
          related_email_ids: todo.relatedEmailIds || [],
          source_analysis_id: analysis.id,
        })
      }
    }

    if (newTodos.length > 0) {
      // ON CONFLICT DO NOTHING - 중복된 task는 무시
      const { error: todosError } = await supabase
        .from('email_todos')
        .upsert(newTodos, {
          onConflict: 'user_id,label,category,task',
          ignoreDuplicates: true,
        })

      if (todosError) {
        console.error('Error saving todos:', todosError)
        // todos 저장 실패해도 analysis는 저장됨
      }
    }

    // 저장된 todos 다시 조회
    const { data: todos } = await supabase
      .from('email_todos')
      .select('*')
      .eq('user_id', userId)
      .eq('label', label)
      .order('created_at', { ascending: false })

    return NextResponse.json({
      analysis,
      todos: todos || [],
    })
  } catch (error) {
    console.error('Error in POST /api/gmail/analysis:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
