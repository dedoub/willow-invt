// Willow Management — Shared Query Module
// MCP tools + Chat Agent 공통 사용. auth-free, 순수 비즈니스 로직.

import { getServiceSupabase } from '@/lib/supabase'

// ============================================================
// Clients
// ============================================================

export async function willowListClients() {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('willow_mgmt_clients')
    .select('*')
    .order('order_index')
  if (error) return { error: error.message }
  return { data: data || [] }
}

export async function willowCreateClient(params: {
  name: string
  color?: string
  icon?: string
  order_index?: number
}) {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('willow_mgmt_clients')
    .insert(params)
    .select()
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function willowUpdateClient(params: {
  id: string
  name?: string
  color?: string
  icon?: string
  order_index?: number
}) {
  const { id, ...updates } = params
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('willow_mgmt_clients')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function willowDeleteClient(id: string) {
  const sb = getServiceSupabase()
  const { error } = await sb.from('willow_mgmt_clients').delete().eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

// ============================================================
// Projects
// ============================================================

export async function willowListProjects(params?: { client_id?: string }) {
  const sb = getServiceSupabase()
  let query = sb
    .from('willow_mgmt_projects')
    .select('*, client:willow_mgmt_clients(id, name, color, icon)')
    .order('order_index')
  if (params?.client_id) query = query.eq('client_id', params.client_id)
  const { data, error } = await query
  if (error) return { error: error.message }
  return { data: data || [] }
}

export async function willowCreateProject(params: {
  client_id: string
  name: string
  description?: string
  status?: string
  order_index?: number
}) {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('willow_mgmt_projects')
    .insert(params)
    .select('*, client:willow_mgmt_clients(id, name, color, icon)')
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function willowUpdateProject(params: {
  id: string
  name?: string
  description?: string
  status?: string
  order_index?: number
}) {
  const { id, ...updates } = params
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('willow_mgmt_projects')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*, client:willow_mgmt_clients(id, name, color, icon)')
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function willowDeleteProject(id: string) {
  const sb = getServiceSupabase()
  const { error } = await sb.from('willow_mgmt_projects').delete().eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

// ============================================================
// Milestones
// ============================================================

export async function willowListMilestones(params?: { project_id?: string }) {
  const sb = getServiceSupabase()
  let query = sb
    .from('willow_mgmt_milestones')
    .select('*, project:willow_mgmt_projects(id, name, client:willow_mgmt_clients(id, name, color))')
    .order('order_index')
  if (params?.project_id) query = query.eq('project_id', params.project_id)
  const { data, error } = await query
  if (error) return { error: error.message }
  return { data: data || [] }
}

export async function willowCreateMilestone(params: {
  project_id: string
  name: string
  description?: string
  status?: string
  target_date?: string
  order_index?: number
}) {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('willow_mgmt_milestones')
    .insert(params)
    .select('*, project:willow_mgmt_projects(id, name, client:willow_mgmt_clients(id, name, color))')
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function willowUpdateMilestone(params: {
  id: string
  name?: string
  description?: string
  status?: string
  target_date?: string
  order_index?: number
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
    .from('willow_mgmt_milestones')
    .update(enriched)
    .eq('id', id)
    .select('*, project:willow_mgmt_projects(id, name, client:willow_mgmt_clients(id, name, color))')
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function willowDeleteMilestone(id: string) {
  const sb = getServiceSupabase()
  const { error } = await sb.from('willow_mgmt_milestones').delete().eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

// ============================================================
// Schedules
// ============================================================

export async function willowListSchedules(params?: {
  start_date?: string
  end_date?: string
  client_id?: string
}) {
  const sb = getServiceSupabase()
  let query = sb
    .from('willow_mgmt_schedules')
    .select('*, client:willow_mgmt_clients(id, name, color, icon), tasks:willow_mgmt_tasks(*)')
    .order('schedule_date')
    .order('start_time')

  if (params?.start_date) query = query.gte('schedule_date', params.start_date)
  if (params?.end_date) query = query.lte('schedule_date', params.end_date)
  if (params?.client_id) query = query.eq('client_id', params.client_id)

  const { data, error } = await query
  if (error) return { error: error.message }
  return { data: data || [] }
}

export async function willowCreateSchedule(params: {
  title: string
  schedule_date: string
  end_date?: string
  start_time?: string
  end_time?: string
  type?: string
  client_id?: string
  milestone_ids?: string[]
  description?: string
  color?: string
  task_content?: string
  task_deadline?: string
}) {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('willow_mgmt_schedules')
    .insert(params)
    .select('*, client:willow_mgmt_clients(id, name, color, icon)')
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function willowUpdateSchedule(params: {
  id: string
  title?: string
  schedule_date?: string
  end_date?: string
  start_time?: string
  end_time?: string
  type?: string
  client_id?: string
  milestone_ids?: string[]
  description?: string
  color?: string
  is_completed?: boolean
  task_content?: string
  task_completed?: boolean
  task_deadline?: string
}) {
  const { id, ...updates } = params
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('willow_mgmt_schedules')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*, client:willow_mgmt_clients(id, name, color, icon)')
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function willowDeleteSchedule(id: string) {
  const sb = getServiceSupabase()
  const { error } = await sb.from('willow_mgmt_schedules').delete().eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

export async function willowToggleScheduleDate(params: {
  schedule_id: string
  date: string
}) {
  const sb = getServiceSupabase()
  const { data: schedule, error: fetchErr } = await sb
    .from('willow_mgmt_schedules')
    .select('schedule_date, end_date, completed_dates')
    .eq('id', params.schedule_id)
    .single()
  if (fetchErr || !schedule) return { error: fetchErr?.message || '일정을 찾을 수 없습니다' }

  const completedDates: string[] = schedule.completed_dates || []
  const idx = completedDates.indexOf(params.date)
  if (idx >= 0) {
    completedDates.splice(idx, 1)
  } else {
    completedDates.push(params.date)
  }

  // Check if all dates are completed
  const start = new Date(schedule.schedule_date)
  const end = schedule.end_date ? new Date(schedule.end_date) : start
  let allDone = true
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const ds = d.toISOString().split('T')[0]
    if (!completedDates.includes(ds)) { allDone = false; break }
  }

  const { data, error } = await sb
    .from('willow_mgmt_schedules')
    .update({ completed_dates: completedDates, is_completed: allDone, updated_at: new Date().toISOString() })
    .eq('id', params.schedule_id)
    .select()
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

// ============================================================
// Tasks
// ============================================================

export async function willowListTasks(params?: { schedule_id?: string }) {
  const sb = getServiceSupabase()
  let query = sb
    .from('willow_mgmt_tasks')
    .select('*')
    .order('deadline', { ascending: true, nullsFirst: false })
    .order('order_index')
  if (params?.schedule_id) query = query.eq('schedule_id', params.schedule_id)
  const { data, error } = await query
  if (error) return { error: error.message }
  return { data: data || [] }
}

export async function willowCreateTask(params: {
  schedule_id: string
  content: string
  deadline?: string
  order_index?: number
}) {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('willow_mgmt_tasks')
    .insert(params)
    .select()
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function willowUpdateTask(params: {
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
    .from('willow_mgmt_tasks')
    .update(enriched)
    .eq('id', id)
    .select()
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function willowDeleteTask(id: string) {
  const sb = getServiceSupabase()
  const { error } = await sb.from('willow_mgmt_tasks').delete().eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

// ============================================================
// Memos
// ============================================================

export async function willowListMemos(params?: { start_date?: string; end_date?: string }) {
  const sb = getServiceSupabase()
  let query = sb.from('willow_mgmt_daily_memos').select('*').order('memo_date', { ascending: false })
  if (params?.start_date) query = query.gte('memo_date', params.start_date)
  if (params?.end_date) query = query.lte('memo_date', params.end_date)
  const { data, error } = await query
  if (error) return { error: error.message }
  return { data: data || [] }
}

export async function willowUpsertMemo(params: { memo_date: string; content: string }) {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('willow_mgmt_daily_memos')
    .upsert(params, { onConflict: 'memo_date' })
    .select()
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function willowDeleteMemo(date: string) {
  const sb = getServiceSupabase()
  const { error } = await sb.from('willow_mgmt_daily_memos').delete().eq('memo_date', date)
  if (error) return { error: error.message }
  return { success: true }
}

// ============================================================
// Cash Management (Invoices)
// ============================================================

export async function willowListCash(params?: { type?: string; status?: string }) {
  const sb = getServiceSupabase()
  let query = sb.from('willow_mgmt_cash').select('*').order('created_at', { ascending: false })
  if (params?.type) query = query.eq('type', params.type)
  if (params?.status) query = query.eq('status', params.status)
  const { data, error } = await query
  if (error) return { error: error.message }
  // Convert amount to number
  const converted = (data || []).map(r => ({ ...r, amount: Number(r.amount) }))
  return { data: converted }
}

export async function willowCreateCash(params: {
  type: string
  counterparty: string
  amount: number
  description?: string
  issue_date?: string
  payment_date?: string
  status?: string
  notes?: string
  account_number?: string
}) {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('willow_mgmt_cash')
    .insert({ ...params, attachments: [] })
    .select()
    .single()
  if (error) return { error: error.message }
  return { success: true, data: { ...data, amount: Number(data.amount) } }
}

export async function willowUpdateCash(params: {
  id: string
  type?: string
  counterparty?: string
  amount?: number
  description?: string
  issue_date?: string
  payment_date?: string
  status?: string
  notes?: string
  account_number?: string
}) {
  const { id, ...updates } = params
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('willow_mgmt_cash')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) return { error: error.message }
  return { success: true, data: { ...data, amount: Number(data.amount) } }
}

export async function willowDeleteCash(id: string) {
  const sb = getServiceSupabase()
  const { error } = await sb.from('willow_mgmt_cash').delete().eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

// ============================================================
// Dashboard Summary (complex aggregation)
// ============================================================

export async function willowGetDashboard() {
  const sb = getServiceSupabase()
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const thisMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const nextWeek = new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0]

  const [cashRes, schedRes, projRes, milestoneRes] = await Promise.all([
    sb.from('willow_mgmt_cash').select('type, amount, status'),
    sb.from('willow_mgmt_schedules')
      .select('id, title, schedule_date, type, is_completed, client:willow_mgmt_clients(name, color)')
      .gte('schedule_date', today)
      .lte('schedule_date', nextWeek)
      .order('schedule_date'),
    sb.from('willow_mgmt_projects')
      .select('id, name, status, client:willow_mgmt_clients(name)')
      .eq('status', 'active'),
    sb.from('willow_mgmt_milestones')
      .select('id, name, status, target_date, project:willow_mgmt_projects(name)')
      .in('status', ['pending', 'in_progress'])
      .order('target_date'),
  ])

  // Cash summary
  const cashItems = cashRes.data || []
  const cashSummary = {
    revenue_total: 0, expense_total: 0,
    receivable: 0, payable: 0,
    revenue_completed: 0, expense_completed: 0,
  }
  for (const item of cashItems) {
    const amt = Number(item.amount)
    if (item.type === 'revenue') {
      cashSummary.revenue_total += amt
      if (item.status === 'completed') cashSummary.revenue_completed += amt
      else cashSummary.receivable += amt
    } else if (item.type === 'expense') {
      cashSummary.expense_total += amt
      if (item.status === 'completed') cashSummary.expense_completed += amt
      else cashSummary.payable += amt
    }
  }

  return {
    cash: cashSummary,
    upcoming_schedules: (schedRes.data || []).slice(0, 10),
    active_projects: projRes.data || [],
    pending_milestones: (milestoneRes.data || []).slice(0, 10),
    as_of: today,
    period: `${thisMonthStart} ~ ${today}`,
  }
}

export async function willowGetCashSummary(params?: { start_date?: string; end_date?: string }) {
  const sb = getServiceSupabase()
  let query = sb.from('willow_mgmt_cash').select('*').order('payment_date', { ascending: false })
  if (params?.start_date) query = query.gte('payment_date', params.start_date)
  if (params?.end_date) query = query.lte('payment_date', params.end_date)
  const { data, error } = await query
  if (error) return { error: error.message }

  const items = (data || []).map(r => ({ ...r, amount: Number(r.amount) }))
  const summary = {
    revenue: { total: 0, completed: 0, pending: 0, count: 0 },
    expense: { total: 0, completed: 0, pending: 0, count: 0 },
    asset: { total: 0, count: 0 },
    liability: { total: 0, count: 0 },
  }

  for (const item of items) {
    const t = item.type as keyof typeof summary
    if (t === 'revenue' || t === 'expense') {
      summary[t].total += item.amount
      summary[t].count++
      if (item.status === 'completed') summary[t].completed += item.amount
      else summary[t].pending += item.amount
    } else if (t === 'asset' || t === 'liability') {
      summary[t].total += item.amount
      summary[t].count++
    }
  }

  return { summary, items, count: items.length }
}

// ============================================================
// Bank Balances
// ============================================================

export async function willowListBankBalances() {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('willow_mgmt_bank_balances')
    .select('*')
    .order('updated_at', { ascending: false })
  if (error) return { error: error.message }
  return { data: (data || []).map(r => ({ ...r, balance: Number(r.balance) })) }
}

export async function willowUpsertBankBalance(params: {
  bank_name: string
  account_number?: string | null
  balance: number
  balance_date?: string | null
}) {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('willow_mgmt_bank_balances')
    .upsert({
      bank_name: params.bank_name,
      account_number: params.account_number || null,
      balance: params.balance,
      balance_date: params.balance_date || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'bank_name,account_number' })
    .select()
  if (error) return { error: error.message }
  return { data }
}
