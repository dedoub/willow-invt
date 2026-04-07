// Ryuha Learning Management — Shared Query Module
// MCP tools + Chat Agent 공통 사용. auth-free, 순수 비즈니스 로직.

import { getServiceSupabase } from '@/lib/supabase'

// ============================================================
// Subjects
// ============================================================

export async function ryuhaListSubjects() {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('ryuha_subjects')
    .select('*')
    .order('order_index')
  if (error) return { error: error.message }
  return { data: data || [] }
}

export async function ryuhaCreateSubject(params: {
  name: string
  color?: string
  icon?: string
  order_index?: number
}) {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('ryuha_subjects')
    .insert(params)
    .select()
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function ryuhaUpdateSubject(params: {
  id: string
  name?: string
  color?: string
  icon?: string
  order_index?: number
}) {
  const { id, ...updates } = params
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('ryuha_subjects')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function ryuhaDeleteSubject(id: string) {
  const sb = getServiceSupabase()
  const { error } = await sb.from('ryuha_subjects').delete().eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

// ============================================================
// Textbooks
// ============================================================

export async function ryuhaListTextbooks(params?: { subject_id?: string }) {
  const sb = getServiceSupabase()
  let query = sb
    .from('ryuha_textbooks')
    .select('*, subject:ryuha_subjects(id, name, color, icon)')
    .order('order_index')
  if (params?.subject_id) query = query.eq('subject_id', params.subject_id)
  const { data, error } = await query
  if (error) return { error: error.message }
  return { data: data || [] }
}

export async function ryuhaCreateTextbook(params: {
  subject_id: string
  name: string
  publisher?: string
  description?: string
  order_index?: number
}) {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('ryuha_textbooks')
    .insert(params)
    .select('*, subject:ryuha_subjects(id, name, color, icon)')
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function ryuhaUpdateTextbook(params: {
  id: string
  name?: string
  publisher?: string
  description?: string
  order_index?: number
}) {
  const { id, ...updates } = params
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('ryuha_textbooks')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*, subject:ryuha_subjects(id, name, color, icon)')
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function ryuhaDeleteTextbook(id: string) {
  const sb = getServiceSupabase()
  const { error } = await sb.from('ryuha_textbooks').delete().eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

// ============================================================
// Chapters
// ============================================================

export async function ryuhaListChapters(params?: { textbook_id?: string }) {
  const sb = getServiceSupabase()
  let query = sb
    .from('ryuha_chapters')
    .select('*, textbook:ryuha_textbooks(id, name, subject:ryuha_subjects(id, name, color))')
    .order('order_index')
  if (params?.textbook_id) query = query.eq('textbook_id', params.textbook_id)
  const { data, error } = await query
  if (error) return { error: error.message }
  return { data: data || [] }
}

export async function ryuhaCreateChapter(params: {
  textbook_id: string
  name: string
  description?: string
  order_index?: number
  status?: string
  target_date?: string
}) {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('ryuha_chapters')
    .insert(params)
    .select('*, textbook:ryuha_textbooks(id, name, subject:ryuha_subjects(id, name, color))')
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function ryuhaUpdateChapter(params: {
  id: string
  name?: string
  description?: string
  order_index?: number
  status?: string
  target_date?: string
  review_completed?: boolean
}) {
  const { id, ...updates } = params
  // Business logic: set completed_at when status becomes 'completed'
  const enriched: Record<string, unknown> = { ...updates, updated_at: new Date().toISOString() }
  if (updates.status === 'completed') {
    enriched.completed_at = new Date().toISOString()
  }
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('ryuha_chapters')
    .update(enriched)
    .eq('id', id)
    .select('*, textbook:ryuha_textbooks(id, name, subject:ryuha_subjects(id, name, color))')
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function ryuhaDeleteChapter(id: string) {
  const sb = getServiceSupabase()
  const { error } = await sb.from('ryuha_chapters').delete().eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

// ============================================================
// Schedules
// ============================================================

export async function ryuhaListSchedules(params?: {
  start_date?: string
  end_date?: string
  subject_id?: string
}) {
  const sb = getServiceSupabase()
  let query = sb
    .from('ryuha_schedules')
    .select('*, subject:ryuha_subjects(id, name, color, icon), homework_items:ryuha_homework_items(*)')
    .order('schedule_date')
    .order('start_time')

  if (params?.start_date) query = query.gte('schedule_date', params.start_date)
  if (params?.end_date) query = query.lte('schedule_date', params.end_date)
  if (params?.subject_id) query = query.eq('subject_id', params.subject_id)

  const { data, error } = await query
  if (error) return { error: error.message }
  return { data: data || [] }
}

export async function ryuhaCreateSchedule(params: {
  title: string
  schedule_date: string
  end_date?: string
  start_time?: string
  end_time?: string
  type?: string
  subject_id?: string
  chapter_ids?: string[]
  description?: string
  color?: string
  homework_content?: string
  homework_deadline?: string
}) {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('ryuha_schedules')
    .insert(params)
    .select('*, subject:ryuha_subjects(id, name, color, icon)')
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function ryuhaUpdateSchedule(params: {
  id: string
  title?: string
  schedule_date?: string
  end_date?: string
  start_time?: string
  end_time?: string
  type?: string
  subject_id?: string
  chapter_ids?: string[]
  description?: string
  color?: string
  is_completed?: boolean
  homework_content?: string
  homework_deadline?: string
  homework_completed?: boolean
}) {
  const { id, ...updates } = params
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('ryuha_schedules')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*, subject:ryuha_subjects(id, name, color, icon)')
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function ryuhaDeleteSchedule(id: string) {
  const sb = getServiceSupabase()
  const { error } = await sb.from('ryuha_schedules').delete().eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

// ============================================================
// Homework
// ============================================================

export async function ryuhaListHomework(params?: { schedule_id?: string }) {
  const sb = getServiceSupabase()
  let query = sb
    .from('ryuha_homework_items')
    .select('*')
    .order('deadline', { ascending: true, nullsFirst: false })
    .order('order_index')
  if (params?.schedule_id) query = query.eq('schedule_id', params.schedule_id)
  const { data, error } = await query
  if (error) return { error: error.message }
  return { data: data || [] }
}

export async function ryuhaCreateHomework(params: {
  schedule_id: string
  content: string
  deadline?: string
  order_index?: number
}) {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('ryuha_homework_items')
    .insert(params)
    .select()
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function ryuhaUpdateHomework(params: {
  id: string
  content?: string
  deadline?: string
  is_completed?: boolean
  order_index?: number
}) {
  const { id, ...updates } = params
  // Business logic: set/clear completed_at
  const enriched: Record<string, unknown> = { ...updates, updated_at: new Date().toISOString() }
  if (updates.is_completed === true) {
    enriched.completed_at = new Date().toISOString()
  } else if (updates.is_completed === false) {
    enriched.completed_at = null
  }
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('ryuha_homework_items')
    .update(enriched)
    .eq('id', id)
    .select()
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function ryuhaDeleteHomework(id: string) {
  const sb = getServiceSupabase()
  const { error } = await sb.from('ryuha_homework_items').delete().eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

// ============================================================
// Memos
// ============================================================

export async function ryuhaListMemos(params?: { start_date?: string; end_date?: string }) {
  const sb = getServiceSupabase()
  let query = sb.from('ryuha_daily_memos').select('*').order('memo_date', { ascending: false })
  if (params?.start_date) query = query.gte('memo_date', params.start_date)
  if (params?.end_date) query = query.lte('memo_date', params.end_date)
  const { data, error } = await query
  if (error) return { error: error.message }
  return { data: data || [] }
}

export async function ryuhaUpsertMemo(params: { memo_date: string; content: string }) {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('ryuha_daily_memos')
    .upsert(params, { onConflict: 'memo_date' })
    .select()
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function ryuhaDeleteMemo(date: string) {
  const sb = getServiceSupabase()
  const { error } = await sb.from('ryuha_daily_memos').delete().eq('memo_date', date)
  if (error) return { error: error.message }
  return { success: true }
}

// ============================================================
// Body Records
// ============================================================

export async function ryuhaListBodyRecords(params?: { start_date?: string; end_date?: string }) {
  const sb = getServiceSupabase()
  let query = sb.from('ryuha_body_records').select('*').order('record_date', { ascending: false })
  if (params?.start_date) query = query.gte('record_date', params.start_date)
  if (params?.end_date) query = query.lte('record_date', params.end_date)
  const { data, error } = await query
  if (error) return { error: error.message }
  return { data: data || [] }
}

export async function ryuhaCreateBodyRecord(params: {
  record_date: string
  height_cm?: number
  weight_kg?: number
  notes?: string
}) {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('ryuha_body_records')
    .insert(params)
    .select()
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function ryuhaUpdateBodyRecord(params: {
  id: string
  record_date?: string
  height_cm?: number
  weight_kg?: number
  notes?: string
}) {
  const { id, ...updates } = params
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('ryuha_body_records')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function ryuhaDeleteBodyRecord(id: string) {
  const sb = getServiceSupabase()
  const { error } = await sb.from('ryuha_body_records').delete().eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

// ============================================================
// Notes
// ============================================================

export async function ryuhaListNotes(params?: { category?: string; search?: string }) {
  const sb = getServiceSupabase()
  let query = sb
    .from('ryuha_notes')
    .select('*')
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
  if (params?.category) query = query.eq('category', params.category)
  if (params?.search) {
    query = query.or(`title.ilike.%${params.search}%,content.ilike.%${params.search}%`)
  }
  const { data, error } = await query
  if (error) return { error: error.message }
  return { data: data || [] }
}

export async function ryuhaCreateNote(params: {
  title: string
  content: string
  category?: string
  is_pinned?: boolean
}) {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('ryuha_notes')
    .insert(params)
    .select()
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function ryuhaUpdateNote(params: {
  id: string
  title?: string
  content?: string
  category?: string
  is_pinned?: boolean
}) {
  const { id, ...updates } = params
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('ryuha_notes')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function ryuhaDeleteNote(id: string) {
  const sb = getServiceSupabase()
  const { error } = await sb.from('ryuha_notes').delete().eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

// ============================================================
// Dashboard Summary
// ============================================================

export async function ryuhaGetDashboard() {
  const sb = getServiceSupabase()
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const nextWeek = new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0]

  const [schedRes, homeworkRes, bodyRes, subjectRes] = await Promise.all([
    sb.from('ryuha_schedules')
      .select('id, title, schedule_date, start_time, end_time, type, is_completed, subject:ryuha_subjects(id, name, color, icon)')
      .gte('schedule_date', today)
      .lte('schedule_date', nextWeek)
      .order('schedule_date')
      .order('start_time'),
    sb.from('ryuha_homework_items')
      .select('*')
      .eq('is_completed', false)
      .order('deadline', { ascending: true, nullsFirst: false })
      .limit(10),
    sb.from('ryuha_body_records')
      .select('*')
      .order('record_date', { ascending: false })
      .limit(1),
    sb.from('ryuha_subjects')
      .select('id', { count: 'exact', head: true }),
  ])

  return {
    upcoming_schedules: schedRes.data || [],
    pending_homework: homeworkRes.data || [],
    latest_body_record: bodyRes.data?.[0] || null,
    subject_count: subjectRes.count || 0,
    as_of: today,
  }
}
