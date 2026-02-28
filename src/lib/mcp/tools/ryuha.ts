import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getUserFromAuthInfo } from '../auth'
import { checkToolPermission } from '../permissions'
import { logMcpAction } from '../audit'
import { getServiceSupabase } from '@/lib/supabase'

export function registerRyuhaTools(server: McpServer) {
  // =============================================
  // 과목 (Subjects)
  // =============================================

  server.registerTool('ryuha_list_subjects', {
    description: '류하 과목 목록을 조회합니다',
    inputSchema: z.object({}),
  }, async (_input, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('ryuha_list_subjects', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('ryuha_subjects')
      .select('*')
      .order('order_index')

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'ryuha_list_subjects' })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('ryuha_create_subject', {
    description: '류하 과목을 생성합니다',
    inputSchema: z.object({
      name: z.string().describe('과목명'),
      color: z.string().optional().describe('색상 코드 (예: #3B82F6)'),
      icon: z.string().optional().describe('아이콘명'),
      order_index: z.number().optional().describe('정렬 순서'),
    }),
  }, async (input, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('ryuha_create_subject', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('ryuha_subjects')
      .insert(input)
      .select()
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'ryuha_create_subject', inputParams: input })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('ryuha_update_subject', {
    description: '류하 과목을 수정합니다',
    inputSchema: z.object({
      id: z.string().describe('과목 ID'),
      name: z.string().optional().describe('과목명'),
      color: z.string().optional().describe('색상 코드'),
      icon: z.string().optional().describe('아이콘명'),
      order_index: z.number().optional().describe('정렬 순서'),
    }),
  }, async ({ id, ...updates }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('ryuha_update_subject', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('ryuha_subjects')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'ryuha_update_subject', inputParams: { id, ...updates } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('ryuha_delete_subject', {
    description: '류하 과목을 삭제합니다',
    inputSchema: z.object({
      id: z.string().describe('과목 ID'),
    }),
  }, async ({ id }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('ryuha_delete_subject', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { error } = await supabase
      .from('ryuha_subjects')
      .delete()
      .eq('id', id)

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'ryuha_delete_subject', inputParams: { id } })
    return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, deleted_id: id }) }] }
  })

  // =============================================
  // 교재 (Textbooks)
  // =============================================

  server.registerTool('ryuha_list_textbooks', {
    description: '류하 교재 목록을 조회합니다',
    inputSchema: z.object({
      subject_id: z.string().optional().describe('과목 ID로 필터'),
    }),
  }, async ({ subject_id }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('ryuha_list_textbooks', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    let query = supabase
      .from('ryuha_textbooks')
      .select('*, subject:ryuha_subjects(*), chapters:ryuha_chapters(count)')
      .order('order_index')

    if (subject_id) query = query.eq('subject_id', subject_id)

    const { data, error } = await query

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'ryuha_list_textbooks', inputParams: { subject_id } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('ryuha_create_textbook', {
    description: '류하 교재를 생성합니다',
    inputSchema: z.object({
      subject_id: z.string().describe('과목 ID'),
      name: z.string().describe('교재명'),
      publisher: z.string().optional().describe('출판사'),
      description: z.string().optional().describe('설명'),
      order_index: z.number().optional().describe('정렬 순서'),
    }),
  }, async (input, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('ryuha_create_textbook', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('ryuha_textbooks')
      .insert(input)
      .select()
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'ryuha_create_textbook', inputParams: input })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('ryuha_update_textbook', {
    description: '류하 교재를 수정합니다',
    inputSchema: z.object({
      id: z.string().describe('교재 ID'),
      name: z.string().optional().describe('교재명'),
      publisher: z.string().optional().describe('출판사'),
      description: z.string().optional().describe('설명'),
      order_index: z.number().optional().describe('정렬 순서'),
    }),
  }, async ({ id, ...updates }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('ryuha_update_textbook', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('ryuha_textbooks')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'ryuha_update_textbook', inputParams: { id, ...updates } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('ryuha_delete_textbook', {
    description: '류하 교재를 삭제합니다',
    inputSchema: z.object({
      id: z.string().describe('교재 ID'),
    }),
  }, async ({ id }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('ryuha_delete_textbook', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { error } = await supabase
      .from('ryuha_textbooks')
      .delete()
      .eq('id', id)

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'ryuha_delete_textbook', inputParams: { id } })
    return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, deleted_id: id }) }] }
  })

  // =============================================
  // 챕터 (Chapters)
  // =============================================

  server.registerTool('ryuha_list_chapters', {
    description: '류하 챕터 목록을 조회합니다',
    inputSchema: z.object({
      textbook_id: z.string().optional().describe('교재 ID로 필터'),
    }),
  }, async ({ textbook_id }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('ryuha_list_chapters', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    let query = supabase
      .from('ryuha_chapters')
      .select('*, textbook:ryuha_textbooks(*, subject:ryuha_subjects(*))')
      .order('order_index')

    if (textbook_id) query = query.eq('textbook_id', textbook_id)

    const { data, error } = await query

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'ryuha_list_chapters', inputParams: { textbook_id } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('ryuha_create_chapter', {
    description: '류하 챕터를 생성합니다',
    inputSchema: z.object({
      textbook_id: z.string().describe('교재 ID'),
      name: z.string().describe('챕터명'),
      description: z.string().optional().describe('설명'),
      order_index: z.number().optional().describe('정렬 순서'),
      status: z.enum(['pending', 'in_progress', 'review_notes_pending', 'completed']).optional().describe('상태'),
      target_date: z.string().optional().describe('목표일 (YYYY-MM-DD)'),
    }),
  }, async (input, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('ryuha_create_chapter', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('ryuha_chapters')
      .insert(input)
      .select('*, textbook:ryuha_textbooks(*, subject:ryuha_subjects(*))')
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'ryuha_create_chapter', inputParams: input })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('ryuha_update_chapter', {
    description: '류하 챕터를 수정합니다',
    inputSchema: z.object({
      id: z.string().describe('챕터 ID'),
      name: z.string().optional().describe('챕터명'),
      description: z.string().optional().describe('설명'),
      order_index: z.number().optional().describe('정렬 순서'),
      status: z.enum(['pending', 'in_progress', 'review_notes_pending', 'completed']).optional().describe('상태'),
      target_date: z.string().optional().describe('목표일 (YYYY-MM-DD)'),
      review_completed: z.boolean().optional().describe('복습 완료 여부'),
    }),
  }, async ({ id, ...updates }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('ryuha_update_chapter', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const updateData: Record<string, unknown> = { ...updates }
    if (updates.status === 'completed') {
      updateData.completed_at = new Date().toISOString()
    }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('ryuha_chapters')
      .update(updateData)
      .eq('id', id)
      .select('*, textbook:ryuha_textbooks(*, subject:ryuha_subjects(*))')
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'ryuha_update_chapter', inputParams: { id, ...updates } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('ryuha_delete_chapter', {
    description: '류하 챕터를 삭제합니다',
    inputSchema: z.object({
      id: z.string().describe('챕터 ID'),
    }),
  }, async ({ id }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('ryuha_delete_chapter', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { error } = await supabase
      .from('ryuha_chapters')
      .delete()
      .eq('id', id)

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'ryuha_delete_chapter', inputParams: { id } })
    return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, deleted_id: id }) }] }
  })

  // =============================================
  // 스케줄 (Schedules)
  // =============================================

  server.registerTool('ryuha_list_schedules', {
    description: '류하 학습 스케줄 목록을 조회합니다',
    inputSchema: z.object({
      start_date: z.string().optional().describe('시작일 필터 (YYYY-MM-DD)'),
      end_date: z.string().optional().describe('종료일 필터 (YYYY-MM-DD)'),
      subject_id: z.string().optional().describe('과목 ID로 필터'),
    }),
  }, async ({ start_date, end_date, subject_id }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('ryuha_list_schedules', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    let query = supabase
      .from('ryuha_schedules')
      .select('*, subject:ryuha_subjects(*), chapter:ryuha_chapters(*, textbook:ryuha_textbooks(*)), homework_items:ryuha_homework_items(*)')
      .order('schedule_date')
      .order('start_time')

    if (start_date) query = query.gte('schedule_date', start_date)
    if (end_date) query = query.lte('schedule_date', end_date)
    if (subject_id) query = query.eq('subject_id', subject_id)

    const { data, error } = await query

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    // Fetch chapters for chapter_ids arrays
    const allChapterIds = new Set<string>()
    for (const schedule of data || []) {
      if (schedule.chapter_ids?.length > 0) {
        schedule.chapter_ids.forEach((id: string) => allChapterIds.add(id))
      }
    }

    let chaptersMap: Record<string, unknown> = {}
    if (allChapterIds.size > 0) {
      const { data: chapters } = await supabase
        .from('ryuha_chapters')
        .select('*, textbook:ryuha_textbooks(*, subject:ryuha_subjects(*))')
        .in('id', Array.from(allChapterIds))

      if (chapters) {
        chaptersMap = Object.fromEntries(chapters.map(ch => [ch.id, ch]))
      }
    }

    const schedulesWithChapters = (data || []).map(schedule => ({
      ...schedule,
      chapters: schedule.chapter_ids?.length > 0
        ? schedule.chapter_ids.map((id: string) => chaptersMap[id]).filter(Boolean)
        : [],
    }))

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'ryuha_list_schedules', inputParams: { start_date, end_date, subject_id } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(schedulesWithChapters, null, 2) }] }
  })

  server.registerTool('ryuha_create_schedule', {
    description: '류하 학습 스케줄을 생성합니다',
    inputSchema: z.object({
      title: z.string().describe('스케줄 제목'),
      schedule_date: z.string().describe('날짜 (YYYY-MM-DD)'),
      end_date: z.string().optional().describe('종료일 (YYYY-MM-DD)'),
      start_time: z.string().optional().describe('시작 시간 (HH:MM)'),
      end_time: z.string().optional().describe('종료 시간 (HH:MM)'),
      type: z.enum(['homework', 'self_study']).optional().describe('유형'),
      subject_id: z.string().optional().describe('과목 ID'),
      chapter_id: z.string().optional().describe('챕터 ID'),
      chapter_ids: z.array(z.string()).optional().describe('챕터 ID 배열'),
      description: z.string().optional().describe('설명'),
      color: z.string().optional().describe('색상 코드'),
      homework_content: z.string().optional().describe('숙제 내용'),
      homework_deadline: z.string().optional().describe('숙제 마감일'),
    }),
  }, async (input, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('ryuha_create_schedule', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('ryuha_schedules')
      .insert(input)
      .select('*, subject:ryuha_subjects(*), chapter:ryuha_chapters(*, textbook:ryuha_textbooks(*)), homework_items:ryuha_homework_items(*)')
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'ryuha_create_schedule', inputParams: input })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('ryuha_update_schedule', {
    description: '류하 학습 스케줄을 수정합니다',
    inputSchema: z.object({
      id: z.string().describe('스케줄 ID'),
      title: z.string().optional().describe('제목'),
      schedule_date: z.string().optional().describe('날짜 (YYYY-MM-DD)'),
      end_date: z.string().optional().describe('종료일 (YYYY-MM-DD)'),
      start_time: z.string().optional().describe('시작 시간 (HH:MM)'),
      end_time: z.string().optional().describe('종료 시간 (HH:MM)'),
      type: z.enum(['homework', 'self_study']).optional().describe('유형'),
      subject_id: z.string().optional().describe('과목 ID'),
      chapter_id: z.string().optional().describe('챕터 ID'),
      chapter_ids: z.array(z.string()).optional().describe('챕터 ID 배열'),
      description: z.string().optional().describe('설명'),
      color: z.string().optional().describe('색상 코드'),
      is_completed: z.boolean().optional().describe('완료 여부'),
      homework_content: z.string().optional().describe('숙제 내용'),
      homework_deadline: z.string().optional().describe('숙제 마감일'),
      homework_completed: z.boolean().optional().describe('숙제 완료 여부'),
    }),
  }, async ({ id, ...updates }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('ryuha_update_schedule', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('ryuha_schedules')
      .update(updates)
      .eq('id', id)
      .select('*, subject:ryuha_subjects(*), chapter:ryuha_chapters(*, textbook:ryuha_textbooks(*)), homework_items:ryuha_homework_items(*)')
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'ryuha_update_schedule', inputParams: { id, ...updates } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('ryuha_delete_schedule', {
    description: '류하 학습 스케줄을 삭제합니다',
    inputSchema: z.object({
      id: z.string().describe('스케줄 ID'),
    }),
  }, async ({ id }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('ryuha_delete_schedule', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { error } = await supabase
      .from('ryuha_schedules')
      .delete()
      .eq('id', id)

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'ryuha_delete_schedule', inputParams: { id } })
    return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, deleted_id: id }) }] }
  })

  // =============================================
  // 숙제 (Homework Items)
  // =============================================

  server.registerTool('ryuha_list_homework', {
    description: '류하 숙제 목록을 조회합니다',
    inputSchema: z.object({
      schedule_id: z.string().optional().describe('스케줄 ID로 필터'),
    }),
  }, async ({ schedule_id }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('ryuha_list_homework', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    let query = supabase
      .from('ryuha_homework_items')
      .select('*')
      .order('deadline')
      .order('order_index')

    if (schedule_id) query = query.eq('schedule_id', schedule_id)

    const { data, error } = await query

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'ryuha_list_homework', inputParams: { schedule_id } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('ryuha_create_homework', {
    description: '류하 숙제를 생성합니다',
    inputSchema: z.object({
      schedule_id: z.string().describe('스케줄 ID'),
      content: z.string().describe('숙제 내용'),
      deadline: z.string().describe('마감일 (YYYY-MM-DD)'),
      order_index: z.number().optional().describe('정렬 순서'),
    }),
  }, async (input, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('ryuha_create_homework', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('ryuha_homework_items')
      .insert(input)
      .select()
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'ryuha_create_homework', inputParams: input })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('ryuha_update_homework', {
    description: '류하 숙제를 수정합니다',
    inputSchema: z.object({
      id: z.string().describe('숙제 ID'),
      content: z.string().optional().describe('숙제 내용'),
      deadline: z.string().optional().describe('마감일 (YYYY-MM-DD)'),
      is_completed: z.boolean().optional().describe('완료 여부'),
      order_index: z.number().optional().describe('정렬 순서'),
    }),
  }, async ({ id, ...updates }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('ryuha_update_homework', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const updateData: Record<string, unknown> = { ...updates }
    if (updates.is_completed !== undefined) {
      updateData.completed_at = updates.is_completed ? new Date().toISOString() : null
    }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('ryuha_homework_items')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'ryuha_update_homework', inputParams: { id, ...updates } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('ryuha_delete_homework', {
    description: '류하 숙제를 삭제합니다',
    inputSchema: z.object({
      id: z.string().describe('숙제 ID'),
    }),
  }, async ({ id }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('ryuha_delete_homework', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { error } = await supabase
      .from('ryuha_homework_items')
      .delete()
      .eq('id', id)

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'ryuha_delete_homework', inputParams: { id } })
    return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, deleted_id: id }) }] }
  })

  // =============================================
  // 메모 (Daily Memos)
  // =============================================

  server.registerTool('ryuha_list_memos', {
    description: '류하 일일 메모 목록을 조회합니다',
    inputSchema: z.object({
      start_date: z.string().optional().describe('시작일 필터 (YYYY-MM-DD)'),
      end_date: z.string().optional().describe('종료일 필터 (YYYY-MM-DD)'),
    }),
  }, async ({ start_date, end_date }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('ryuha_list_memos', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    let query = supabase
      .from('ryuha_daily_memos')
      .select('*')
      .order('memo_date')

    if (start_date) query = query.gte('memo_date', start_date)
    if (end_date) query = query.lte('memo_date', end_date)

    const { data, error } = await query

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'ryuha_list_memos', inputParams: { start_date, end_date } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('ryuha_upsert_memo', {
    description: '류하 일일 메모를 생성하거나 수정합니다 (날짜 기준 upsert)',
    inputSchema: z.object({
      memo_date: z.string().describe('메모 날짜 (YYYY-MM-DD)'),
      content: z.string().describe('메모 내용'),
    }),
  }, async (input, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('ryuha_upsert_memo', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('ryuha_daily_memos')
      .upsert(
        { memo_date: input.memo_date, content: input.content },
        { onConflict: 'memo_date' }
      )
      .select()
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'ryuha_upsert_memo', inputParams: input })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('ryuha_delete_memo', {
    description: '류하 일일 메모를 삭제합니다',
    inputSchema: z.object({
      date: z.string().describe('메모 날짜 (YYYY-MM-DD)'),
    }),
  }, async ({ date }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('ryuha_delete_memo', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { error } = await supabase
      .from('ryuha_daily_memos')
      .delete()
      .eq('memo_date', date)

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'ryuha_delete_memo', inputParams: { date } })
    return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, deleted_date: date }) }] }
  })

  // =============================================
  // 신체기록 (Body Records)
  // =============================================

  server.registerTool('ryuha_list_body_records', {
    description: '류하 신체기록 목록을 조회합니다',
    inputSchema: z.object({
      start_date: z.string().optional().describe('시작일 필터 (YYYY-MM-DD)'),
      end_date: z.string().optional().describe('종료일 필터 (YYYY-MM-DD)'),
    }),
  }, async ({ start_date, end_date }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('ryuha_list_body_records', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    let query = supabase
      .from('ryuha_body_records')
      .select('*')
      .order('record_date', { ascending: false })

    if (start_date) query = query.gte('record_date', start_date)
    if (end_date) query = query.lte('record_date', end_date)

    const { data, error } = await query

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'ryuha_list_body_records', inputParams: { start_date, end_date } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('ryuha_create_body_record', {
    description: '류하 신체기록을 생성합니다',
    inputSchema: z.object({
      record_date: z.string().describe('기록 날짜 (YYYY-MM-DD)'),
      height_cm: z.number().optional().describe('키 (cm)'),
      weight_kg: z.number().optional().describe('몸무게 (kg)'),
      notes: z.string().optional().describe('메모'),
    }),
  }, async (input, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('ryuha_create_body_record', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('ryuha_body_records')
      .insert(input)
      .select()
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'ryuha_create_body_record', inputParams: input })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('ryuha_update_body_record', {
    description: '류하 신체기록을 수정합니다',
    inputSchema: z.object({
      id: z.string().describe('기록 ID'),
      record_date: z.string().optional().describe('기록 날짜 (YYYY-MM-DD)'),
      height_cm: z.number().optional().describe('키 (cm)'),
      weight_kg: z.number().optional().describe('몸무게 (kg)'),
      notes: z.string().optional().describe('메모'),
    }),
  }, async ({ id, ...updates }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('ryuha_update_body_record', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('ryuha_body_records')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'ryuha_update_body_record', inputParams: { id, ...updates } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('ryuha_delete_body_record', {
    description: '류하 신체기록을 삭제합니다',
    inputSchema: z.object({
      id: z.string().describe('기록 ID'),
    }),
  }, async ({ id }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('ryuha_delete_body_record', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { error } = await supabase
      .from('ryuha_body_records')
      .delete()
      .eq('id', id)

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'ryuha_delete_body_record', inputParams: { id } })
    return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, deleted_id: id }) }] }
  })
}
