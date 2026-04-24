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
  invoice_type: string
  issue_date: string
  counterparty: string
  business_number: string | null
  representative: string | null
  supply_amount: number
  tax_amount: number
  total_amount: number
  items: Array<{ description: string; quantity: number; unit_price: number; supply_amount: number; tax_amount: number }>
  expected_payment_date: string | null
  paid_at: string | null
  payment_status: string
  paid_amount: number | null
  bank_ref: string | null
  notes: string | null
  file_url: string | null
  created_at: string
  updated_at: string
}

export interface TenswLoan {
  id: string
  bank: string
  account_number: string
  loan_type: string
  principal: number
  interest_rate: number | null
  monthly_interest_avg: number | null
  annual_interest_2025: number | null
  loan_date: string | null
  maturity_date: string | null
  last_extension_date: string | null
  next_interest_date: string | null
  interest_payment_day: number | null
  repayment_type: string
  status: string
  memo: string | null
  attachments: Array<{ name: string; url: string; size: number; type: string }>
  created_at: string
  updated_at: string
}
