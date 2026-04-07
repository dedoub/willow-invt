// Tensoftworks Management — Shared Query Module
// MCP tools + Chat Agent 공통 사용. auth-free, 순수 비즈니스 로직.

import { getServiceSupabase } from '@/lib/supabase'

// ============================================================
// Clients
// ============================================================

export async function tenswListClients() {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('tensw_mgmt_clients')
    .select('*')
    .order('order_index')
  if (error) return { error: error.message }
  return { data: data || [] }
}

export async function tenswCreateClient(params: {
  name: string
  color?: string
  icon?: string
  order_index?: number
}) {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('tensw_mgmt_clients')
    .insert(params)
    .select()
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function tenswUpdateClient(params: {
  id: string
  name?: string
  color?: string
  icon?: string
  order_index?: number
}) {
  const { id, ...updates } = params
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('tensw_mgmt_clients')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function tenswDeleteClient(id: string) {
  const sb = getServiceSupabase()
  const { error } = await sb.from('tensw_mgmt_clients').delete().eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

// ============================================================
// Projects
// ============================================================

export async function tenswListProjects(params?: { client_id?: string }) {
  const sb = getServiceSupabase()
  let query = sb
    .from('tensw_mgmt_projects')
    .select('*, client:tensw_mgmt_clients(id, name, color, icon)')
    .order('order_index')
  if (params?.client_id) query = query.eq('client_id', params.client_id)
  const { data, error } = await query
  if (error) return { error: error.message }
  return { data: data || [] }
}

export async function tenswCreateProject(params: {
  client_id: string
  name: string
  description?: string
  status?: string
  order_index?: number
}) {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('tensw_mgmt_projects')
    .insert(params)
    .select('*, client:tensw_mgmt_clients(id, name, color, icon)')
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function tenswUpdateProject(params: {
  id: string
  name?: string
  description?: string
  status?: string
  order_index?: number
}) {
  const { id, ...updates } = params
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('tensw_mgmt_projects')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*, client:tensw_mgmt_clients(id, name, color, icon)')
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function tenswDeleteProject(id: string) {
  const sb = getServiceSupabase()
  const { error } = await sb.from('tensw_mgmt_projects').delete().eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

// ============================================================
// Milestones
// ============================================================

export async function tenswListMilestones(params?: { project_id?: string }) {
  const sb = getServiceSupabase()
  let query = sb
    .from('tensw_mgmt_milestones')
    .select('*, project:tensw_mgmt_projects(id, name, client:tensw_mgmt_clients(id, name, color))')
    .order('order_index')
  if (params?.project_id) query = query.eq('project_id', params.project_id)
  const { data, error } = await query
  if (error) return { error: error.message }
  return { data: data || [] }
}

export async function tenswCreateMilestone(params: {
  project_id: string
  name: string
  description?: string
  status?: string
  target_date?: string
  order_index?: number
}) {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('tensw_mgmt_milestones')
    .insert(params)
    .select('*, project:tensw_mgmt_projects(id, name, client:tensw_mgmt_clients(id, name, color))')
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function tenswUpdateMilestone(params: {
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
    .from('tensw_mgmt_milestones')
    .update(enriched)
    .eq('id', id)
    .select('*, project:tensw_mgmt_projects(id, name, client:tensw_mgmt_clients(id, name, color))')
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function tenswDeleteMilestone(id: string) {
  const sb = getServiceSupabase()
  const { error } = await sb.from('tensw_mgmt_milestones').delete().eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

// ============================================================
// Schedules
// ============================================================

export async function tenswListSchedules(params?: {
  start_date?: string
  end_date?: string
  client_id?: string
}) {
  const sb = getServiceSupabase()
  let query = sb
    .from('tensw_mgmt_schedules')
    .select('*, client:tensw_mgmt_clients(id, name, color, icon), tasks:tensw_mgmt_tasks(*)')
    .order('schedule_date')
    .order('start_time')

  if (params?.start_date) query = query.gte('schedule_date', params.start_date)
  if (params?.end_date) query = query.lte('schedule_date', params.end_date)
  if (params?.client_id) query = query.eq('client_id', params.client_id)

  const { data, error } = await query
  if (error) return { error: error.message }
  return { data: data || [] }
}

export async function tenswCreateSchedule(params: {
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
    .from('tensw_mgmt_schedules')
    .insert(params)
    .select('*, client:tensw_mgmt_clients(id, name, color, icon)')
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function tenswUpdateSchedule(params: {
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
    .from('tensw_mgmt_schedules')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*, client:tensw_mgmt_clients(id, name, color, icon)')
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function tenswDeleteSchedule(id: string) {
  const sb = getServiceSupabase()
  const { error } = await sb.from('tensw_mgmt_schedules').delete().eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

export async function tenswToggleScheduleDate(params: {
  schedule_id: string
  date: string
}) {
  const sb = getServiceSupabase()
  const { data: schedule, error: fetchErr } = await sb
    .from('tensw_mgmt_schedules')
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
    .from('tensw_mgmt_schedules')
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

export async function tenswListTasks(params?: { schedule_id?: string }) {
  const sb = getServiceSupabase()
  let query = sb
    .from('tensw_mgmt_tasks')
    .select('*')
    .order('deadline', { ascending: true, nullsFirst: false })
    .order('order_index')
  if (params?.schedule_id) query = query.eq('schedule_id', params.schedule_id)
  const { data, error } = await query
  if (error) return { error: error.message }
  return { data: data || [] }
}

export async function tenswCreateTask(params: {
  schedule_id: string
  content: string
  deadline?: string
  order_index?: number
}) {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('tensw_mgmt_tasks')
    .insert(params)
    .select()
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function tenswUpdateTask(params: {
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
    .from('tensw_mgmt_tasks')
    .update(enriched)
    .eq('id', id)
    .select()
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function tenswDeleteTask(id: string) {
  const sb = getServiceSupabase()
  const { error } = await sb.from('tensw_mgmt_tasks').delete().eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

// ============================================================
// Memos
// ============================================================

export async function tenswListMemos(params?: { start_date?: string; end_date?: string }) {
  const sb = getServiceSupabase()
  let query = sb.from('tensw_mgmt_daily_memos').select('*').order('memo_date', { ascending: false })
  if (params?.start_date) query = query.gte('memo_date', params.start_date)
  if (params?.end_date) query = query.lte('memo_date', params.end_date)
  const { data, error } = await query
  if (error) return { error: error.message }
  return { data: data || [] }
}

export async function tenswUpsertMemo(params: { memo_date: string; content: string }) {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('tensw_mgmt_daily_memos')
    .upsert(params, { onConflict: 'memo_date' })
    .select()
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function tenswDeleteMemo(date: string) {
  const sb = getServiceSupabase()
  const { error } = await sb.from('tensw_mgmt_daily_memos').delete().eq('memo_date', date)
  if (error) return { error: error.message }
  return { success: true }
}

// ============================================================
// Cash Management (Invoices)
// ============================================================

export async function tenswListCash(params?: { type?: string; status?: string }) {
  const sb = getServiceSupabase()
  let query = sb.from('tensw_mgmt_cash').select('*').order('created_at', { ascending: false })
  if (params?.type) query = query.eq('type', params.type)
  if (params?.status) query = query.eq('status', params.status)
  const { data, error } = await query
  if (error) return { error: error.message }
  // Convert amount to number
  const converted = (data || []).map(r => ({ ...r, amount: Number(r.amount) }))
  return { data: converted }
}

export async function tenswCreateCash(params: {
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
    .from('tensw_mgmt_cash')
    .insert({ ...params, attachments: [] })
    .select()
    .single()
  if (error) return { error: error.message }
  return { success: true, data: { ...data, amount: Number(data.amount) } }
}

export async function tenswUpdateCash(params: {
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
    .from('tensw_mgmt_cash')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) return { error: error.message }
  return { success: true, data: { ...data, amount: Number(data.amount) } }
}

export async function tenswDeleteCash(id: string) {
  const sb = getServiceSupabase()
  const { error } = await sb.from('tensw_mgmt_cash').delete().eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

export async function tenswGetCashSummary(params?: { start_date?: string; end_date?: string }) {
  const sb = getServiceSupabase()
  let query = sb.from('tensw_mgmt_cash').select('*').order('issue_date', { ascending: false })
  if (params?.start_date) query = query.gte('issue_date', params.start_date)
  if (params?.end_date) query = query.lte('issue_date', params.end_date)
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
// Sales (세금계산서 매출관리)
// ============================================================

export async function tenswListSales(params?: { status?: string }) {
  const sb = getServiceSupabase()
  let query = sb.from('tensw_mgmt_sales').select('*').order('invoice_date', { ascending: false })
  if (params?.status) query = query.eq('status', params.status)
  const { data, error } = await query
  if (error) return { error: error.message }
  const converted = (data || []).map(r => ({
    ...r,
    supply_amount: Number(r.supply_amount),
    tax_amount: Number(r.tax_amount),
    total_amount: Number(r.total_amount),
  }))
  return { data: converted }
}

export async function tenswCreateSales(params: {
  invoice_date: string
  company: string
  description?: string
  supply_amount: number
  tax_amount?: number
  total_amount?: number
  status?: string
  items?: Record<string, unknown>[]
  notes?: string
}) {
  // Auto-calculate tax_amount and total_amount if not provided
  const supply = params.supply_amount
  const tax = params.tax_amount ?? Math.round(supply * 0.1)
  const total = params.total_amount ?? (supply + tax)
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('tensw_mgmt_sales')
    .insert({ ...params, supply_amount: supply, tax_amount: tax, total_amount: total, status: params.status || 'pending' })
    .select()
    .single()
  if (error) return { error: error.message }
  return {
    success: true,
    data: {
      ...data,
      supply_amount: Number(data.supply_amount),
      tax_amount: Number(data.tax_amount),
      total_amount: Number(data.total_amount),
    },
  }
}

export async function tenswUpdateSales(params: {
  id: string
  invoice_date?: string
  company?: string
  description?: string
  supply_amount?: number
  tax_amount?: number
  total_amount?: number
  status?: string
  items?: Record<string, unknown>[]
  notes?: string
}) {
  const { id, ...updates } = params
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('tensw_mgmt_sales')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) return { error: error.message }
  return {
    success: true,
    data: {
      ...data,
      supply_amount: Number(data.supply_amount),
      tax_amount: Number(data.tax_amount),
      total_amount: Number(data.total_amount),
    },
  }
}

export async function tenswDeleteSales(id: string) {
  const sb = getServiceSupabase()
  const { error } = await sb.from('tensw_mgmt_sales').delete().eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

// ============================================================
// Loans (차입금 관리)
// ============================================================

export async function tenswListLoans(params?: { status?: string }) {
  const sb = getServiceSupabase()
  let query = sb.from('tensw_mgmt_loans').select('*').order('start_date')
  if (params?.status) query = query.eq('status', params.status)
  const { data, error } = await query
  if (error) return { error: error.message }
  const converted = (data || []).map(r => ({
    ...r,
    principal: Number(r.principal),
    interest_rate: Number(r.interest_rate),
  }))
  return { data: converted }
}

export async function tenswCreateLoan(params: {
  lender: string
  loan_type: string
  principal: number
  interest_rate: number
  start_date: string
  end_date?: string
  repayment_type?: string
  interest_payment_day?: number
  status?: string
  notes?: string
}) {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('tensw_mgmt_loans')
    .insert({ ...params, status: params.status || 'active' })
    .select()
    .single()
  if (error) return { error: error.message }
  return {
    success: true,
    data: {
      ...data,
      principal: Number(data.principal),
      interest_rate: Number(data.interest_rate),
    },
  }
}

export async function tenswUpdateLoan(params: {
  id: string
  lender?: string
  loan_type?: string
  principal?: number
  interest_rate?: number
  start_date?: string
  end_date?: string
  repayment_type?: string
  interest_payment_day?: number
  status?: string
  notes?: string
}) {
  const { id, ...updates } = params
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('tensw_mgmt_loans')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) return { error: error.message }
  return {
    success: true,
    data: {
      ...data,
      principal: Number(data.principal),
      interest_rate: Number(data.interest_rate),
    },
  }
}

export async function tenswDeleteLoan(id: string) {
  const sb = getServiceSupabase()
  const { error } = await sb.from('tensw_mgmt_loans').delete().eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

// ============================================================
// Dashboard Summary (complex aggregation)
// ============================================================

export async function tenswGetDashboard() {
  const sb = getServiceSupabase()
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const thisMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const nextWeek = new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0]

  const [cashRes, schedRes, projRes, milestoneRes, salesRes, loansRes] = await Promise.all([
    sb.from('tensw_mgmt_cash').select('type, amount, status'),
    sb.from('tensw_mgmt_schedules')
      .select('id, title, schedule_date, type, is_completed, client:tensw_mgmt_clients(name, color)')
      .gte('schedule_date', today)
      .lte('schedule_date', nextWeek)
      .order('schedule_date'),
    sb.from('tensw_mgmt_projects')
      .select('id, name, status, client:tensw_mgmt_clients(name)')
      .eq('status', 'active'),
    sb.from('tensw_mgmt_milestones')
      .select('id, name, status, target_date, project:tensw_mgmt_projects(name)')
      .in('status', ['pending', 'in_progress'])
      .order('target_date'),
    sb.from('tensw_mgmt_sales').select('supply_amount, tax_amount, total_amount, status'),
    sb.from('tensw_mgmt_loans').select('principal, interest_rate, status'),
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

  // Sales summary
  const salesItems = salesRes.data || []
  const salesSummary = {
    total_amount: 0,
    completed_amount: 0,
    pending_amount: 0,
    count: salesItems.length,
  }
  for (const item of salesItems) {
    const amt = Number(item.total_amount)
    salesSummary.total_amount += amt
    if (item.status === 'completed') salesSummary.completed_amount += amt
    else salesSummary.pending_amount += amt
  }

  // Loan summary
  const loanItems = loansRes.data || []
  const loanSummary = {
    total_principal: 0,
    active_count: 0,
    count: loanItems.length,
  }
  for (const item of loanItems) {
    loanSummary.total_principal += Number(item.principal)
    if (item.status === 'active') loanSummary.active_count++
  }

  return {
    cash: cashSummary,
    sales: salesSummary,
    loans: loanSummary,
    upcoming_schedules: (schedRes.data || []).slice(0, 10),
    active_projects: projRes.data || [],
    pending_milestones: (milestoneRes.data || []).slice(0, 10),
    as_of: today,
    period: `${thisMonthStart} ~ ${today}`,
  }
}

// ============================================================
// Tensw-Todo Projects (개발 프로젝트 현황 — tensw_projects 테이블)
// ============================================================

export async function tenswTodoListProjects(params?: { status?: string }) {
  const sb = getServiceSupabase()
  let query = sb.from('tensw_projects').select('*').order('status').order('updated_at', { ascending: false })
  if (params?.status) query = query.eq('status', params.status)
  const { data: projects, error } = await query
  if (error) return { error: error.message }
  if (!projects || projects.length === 0) return { data: [], count: 0 }

  const projectIds = projects.map(p => p.id)

  // Get todo counts per project
  const { data: todos } = await sb
    .from('tensw_todos')
    .select('id, project_id, status')
    .in('project_id', projectIds)

  // Get latest AI analysis scores
  const { data: analyses } = await sb
    .from('tensw_project_analyses')
    .select('project_id, progress_score, created_at')
    .in('project_id', projectIds)
    .order('created_at', { ascending: false })

  const aiScoreMap = new Map<string, number>()
  if (analyses) {
    for (const a of analyses) {
      if (!aiScoreMap.has(a.project_id) && a.progress_score != null) {
        aiScoreMap.set(a.project_id, a.progress_score)
      }
    }
  }

  const enriched = projects.map(p => {
    const projectTodos = (todos || []).filter(t => t.project_id === p.id)
    const stats = {
      total: projectTodos.length,
      pending: projectTodos.filter(t => t.status === 'pending').length,
      assigned: projectTodos.filter(t => t.status === 'assigned').length,
      in_progress: projectTodos.filter(t => t.status === 'in_progress').length,
      completed: projectTodos.filter(t => t.status === 'completed').length,
      discarded: projectTodos.filter(t => t.status === 'discarded').length,
    }
    const active = stats.assigned + stats.in_progress
    const done = stats.completed
    const progress = stats.total > 0 ? Math.round((done / (stats.total - stats.discarded)) * 100) : 0

    return {
      id: p.id,
      name: p.name,
      description: p.description,
      status: p.status,
      icon: p.icon,
      todo_stats: stats,
      progress_pct: progress,
      ai_progress_score: aiScoreMap.get(p.id) ?? null,
      updated_at: p.updated_at,
    }
  })

  // Group by status
  const grouped = {
    active: enriched.filter(p => p.status === 'active'),
    managed: enriched.filter(p => p.status === 'managed'),
    completed: enriched.filter(p => p.status === 'completed'),
    poc: enriched.filter(p => p.status === 'poc'),
  }

  return { data: enriched, grouped, count: enriched.length }
}

export async function tenswTodoGetProject(projectId: string) {
  const sb = getServiceSupabase()

  const [projRes, todosRes, schedRes, membersRes] = await Promise.all([
    sb.from('tensw_projects').select('*').eq('id', projectId).single(),
    sb.from('tensw_todos')
      .select('id, title, status, priority, due_date, readable_id, completed_at, assignees:tensw_todo_assignees(member:tensw_project_members!tensw_todo_assignees_member_id_fkey(id, name))')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
    sb.from('tensw_project_schedules')
      .select('id, title, start_date, end_date, milestone_type, status')
      .eq('project_id', projectId)
      .order('start_date'),
    sb.from('tensw_project_members')
      .select('id, name, role, is_manager')
      .eq('project_id', projectId)
      .order('is_manager', { ascending: false }),
  ])

  if (projRes.error) return { error: projRes.error.message }

  return {
    project: projRes.data,
    todos: todosRes.data || [],
    schedules: schedRes.data || [],
    members: membersRes.data || [],
  }
}
