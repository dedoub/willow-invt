import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

// 텍스트 정규화 (비교용)
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s가-힣]/g, '') // 특수문자 제거 (한글 유지)
    .replace(/\s+/g, ' ')
    .trim()
}

// 단어 집합 추출
function getWords(text: string): Set<string> {
  return new Set(normalizeText(text).split(' ').filter(w => w.length > 1))
}

// Jaccard 유사도 계산
function jaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
  const intersection = new Set([...set1].filter(x => set2.has(x)))
  const union = new Set([...set1, ...set2])
  return union.size === 0 ? 0 : intersection.size / union.size
}

// 두 작업이 유사한지 확인 (임계값: 0.6)
function isSimilarTask(task1: string, task2: string, threshold = 0.6): boolean {
  const norm1 = normalizeText(task1)
  const norm2 = normalizeText(task2)

  // 정규화된 텍스트가 동일하면 중복
  if (norm1 === norm2) return true

  // 한 쪽이 다른 쪽을 포함하면 중복
  if (norm1.includes(norm2) || norm2.includes(norm1)) return true

  // Jaccard 유사도가 임계값 이상이면 중복
  const words1 = getWords(task1)
  const words2 = getWords(task2)
  return jaccardSimilarity(words1, words2) >= threshold
}

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

// GET: 특정 label의 todos 조회
export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const label = searchParams.get('label') || searchParams.get('section')

    if (!label) {
      return NextResponse.json({ error: 'label is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('email_todos')
      .select('*')
      .eq('user_id', userId)
      .eq('label', label)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching todos:', error)
      return NextResponse.json({ error: 'Failed to fetch todos' }, { status: 500 })
    }

    return NextResponse.json({ todos: data || [] })
  } catch (error) {
    console.error('Error in GET /api/gmail/todos:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
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

    // 동일 카테고리의 기존 todos 조회 (유사도 검사용, 완료된 것 포함)
    const { data: existingTodos } = await supabase
      .from('email_todos')
      .select('*')
      .eq('user_id', userId)
      .eq('label', label)
      .eq('category', category)

    // 유사한 기존 todo 찾기
    const similarTodo = (existingTodos || []).find(existing =>
      isSimilarTask(task, existing.task)
    )

    if (similarTodo) {
      // 유사한 것이 있으면 완료 상태 업데이트
      const { data: updated, error: updateError } = await supabase
        .from('email_todos')
        .update({
          completed: completed ?? true,
          completed_at: (completed ?? true) ? new Date().toISOString() : null,
        })
        .eq('id', similarTodo.id)
        .select()
        .single()

      if (updateError) {
        console.error('Error updating existing todo:', updateError)
        return NextResponse.json({ error: 'Failed to update todo' }, { status: 500 })
      }

      return NextResponse.json(updated)
    }

    // 유사한 것이 없으면 새로 생성 (기본값: completed = false)
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
