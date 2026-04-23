export interface TenswMgmtClient {
  id: string
  name: string
  color: string
  icon: string
  order_index: number
  created_at: string
}

export interface TenswMgmtProject {
  id: string
  client_id: string
  name: string
  description: string | null
  status: 'active' | 'completed' | 'on_hold' | 'cancelled'
  order_index: number
  created_at: string
  client?: TenswMgmtClient
  milestones?: { count: number }[]
}

export interface TenswMgmtMilestone {
  id: string
  project_id: string
  name: string
  description: string | null
  order_index: number
  status: 'pending' | 'in_progress' | 'review_pending' | 'completed'
  target_date: string | null
  completed_at: string | null
  review_completed: boolean
  created_at: string
  project?: TenswMgmtProject
}

export interface TenswMgmtSchedule {
  id: string
  title: string
  description: string | null
  schedule_date: string
  end_date: string | null
  start_time: string | null
  end_time: string | null
  type: 'task' | 'meeting' | 'deadline'
  color: string | null
  client_id: string | null
  milestone_id: string | null
  milestone_ids: string[]
  is_completed: boolean
  completed_dates: string[]
  email_reminder: boolean
  reminder_sent: boolean
  task_content: string | null
  task_deadline: string | null
  task_completed: boolean
  created_at: string
  client?: TenswMgmtClient
  milestone?: TenswMgmtMilestone
  milestones?: TenswMgmtMilestone[]
  tasks?: TenswMgmtTask[]
}

export interface TenswMgmtDailyMemo {
  id: string
  memo_date: string
  content: string
  created_at: string
  updated_at: string
}

export interface TenswMgmtTask {
  id: string
  schedule_id: string
  content: string
  deadline: string | null
  is_completed: boolean
  completed_at: string | null
  order_index: number
  created_at: string
}

export interface TenswCashItem {
  id: string
  type: 'revenue' | 'expense' | 'asset' | 'liability'
  counterparty: string
  description: string | null
  amount: number
  issue_date: string | null
  payment_date: string | null
  status: string
  notes: string | null
  account_number: string | null
  created_at: string
  updated_at: string
}

export interface TenswTaxInvoice {
  id: string
  invoice_date: string
  company: string
  description: string | null
  supply_amount: number
  tax_amount: number
  total_amount: number
  status: string
  items: Array<{ description: string; quantity: number; unit_price: number; supply_amount: number; tax_amount: number }>
  notes: string | null
  created_at: string
  updated_at: string
}

export interface TenswLoan {
  id: string
  lender: string
  loan_type: string
  principal: number
  interest_rate: number
  start_date: string
  end_date: string | null
  repayment_type: string
  interest_payment_day: number | null
  status: string
  notes: string | null
  created_at: string
  updated_at: string
}
