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
      .maybeSingle()

    if (analysisError) {
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

    console.log(`[Analysis POST] Processing label: ${label}, categories count: ${analysisData.categories?.length || 0}`)
    if (analysisData.categories?.[0]) {
      const firstCat = analysisData.categories[0]
      console.log(`[Analysis POST] First category: ${firstCat.category}, todos: ${firstCat.todos?.length || 0}`)
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

    console.log(`[Analysis POST] Analysis saved with id: ${analysis?.id}`)

    // 기존 todos 조회 (완료된 것 포함) - 유사도 검사를 위해
    const { data: existingTodos } = await supabase
      .from('email_todos')
      .select('task, category')
      .eq('user_id', userId)
      .eq('label', label)

    const existingTasksByCategory = new Map<string, string[]>()
    for (const todo of existingTodos || []) {
      const tasks = existingTasksByCategory.get(todo.category) || []
      tasks.push(todo.task)
      existingTasksByCategory.set(todo.category, tasks)
    }

    // 새 todos 추가 (유사한 것은 제외)
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

    let skippedCount = 0

    for (const category of analysisData.categories || []) {
      const existingTasks = existingTasksByCategory.get(category.category) || []

      for (const todo of category.todos || []) {
        // 기존 todo들과 유사도 검사
        const hasSimilar = existingTasks.some(existingTask =>
          isSimilarTask(todo.task, existingTask)
        )

        if (hasSimilar) {
          skippedCount++
          continue // 유사한 것이 있으면 건너뜀
        }

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

        // 새로 추가할 것도 비교 대상에 추가 (중복 방지)
        existingTasks.push(todo.task)
      }
    }

    console.log(`[Analysis POST] Todos processing: ${newTodos.length} new, ${skippedCount} skipped for label: ${label}`)

    if (newTodos.length > 0) {
      console.log(`[Analysis POST] Inserting ${newTodos.length} todos...`)
      // ON CONFLICT DO NOTHING - 완전히 동일한 task는 무시
      const { error: todosError } = await supabase
        .from('email_todos')
        .upsert(newTodos, {
          onConflict: 'user_id,label,category,task',
          ignoreDuplicates: true,
        })

      if (todosError) {
        console.error('[Analysis POST] Error saving todos:', todosError)
        // todos 저장 실패해도 analysis는 저장됨
      } else {
        console.log(`[Analysis POST] Successfully saved ${newTodos.length} todos`)
      }
    } else {
      console.log(`[Analysis POST] No new todos to insert`)
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
