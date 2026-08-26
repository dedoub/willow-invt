export interface WillowMgmtClient {
  id: string
  name: string
  color: string
  icon: string
  order_index: number
  created_at: string
}

export interface WillowMgmtProject {
  id: string
  client_id: string
  name: string
  description: string | null
  status: 'active' | 'completed' | 'on_hold' | 'cancelled'
  order_index: number
  created_at: string
  client?: WillowMgmtClient
  milestones?: { count: number }[]
}

export interface WillowMgmtMilestone {
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
  project?: WillowMgmtProject
}

export interface WillowMgmtSchedule {
  id: string
  title: string
  description: string | null
  schedule_date: string
  end_date: string | null
  start_time: string | null
  end_time: string | null
  type: 'task' | 'meeting' | 'deadline'
  category: 'willow-mgmt' | 'tensw-mgmt' | 'etf-etc' | 'akros' | 'other'
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
  client?: WillowMgmtClient
  milestone?: WillowMgmtMilestone
  milestones?: WillowMgmtMilestone[]
  tasks?: WillowMgmtTask[]
}

export interface WillowMgmtDailyMemo {
  id: string
  memo_date: string
  content: string
  created_at: string
  updated_at: string
}

export interface WillowMgmtTask {
  id: string
  schedule_id: string
  content: string
  deadline: string | null
  is_completed: boolean
  completed_at: string | null
  order_index: number
  created_at: string
}

/** 홈택스에서 수집한 전자세금계산서. 윌로우는 수금상태를 사람이 관리하는 매출관리
 *  테이블이 없어 이 수집분이 그대로 정본이다. */
export interface WillowTaxInvoice {
  id: string
  transe_type: 'sales' | 'purchase'
  reporting_date: string
  issue_date: string | null
  supplier_company: string | null
  supplier_reg_number: string | null
  contractor_company: string | null
  contractor_reg_number: string | null
  rep_items: string | null
  supply_amount: number
  tax_amount: number
  total_amount: number
  invoice_kind: string | null
  receipt_or_charge: string | null
  approval_no: string | null
  /** 매출이면 공급받는자, 매입이면 공급자. API에서 채워 준다. */
  counterparty: string | null
  counterparty_reg_number: string | null
}

/** ETC(Exchange Traded Concepts)에 발행하는 해외 인보이스. /etc 페이지에서 만들고
 *  경영관리 매출관리에서 국내 세금계산서와 함께 본다. */
export interface WillowInvoice {
  id: string
  invoice_no: string
  invoice_date: string
  bill_to_company: string
  attention: string | null
  line_items: Array<{ description: string; amount: number }> | null
  total_amount: number
  currency: string
  status: string
  paid_at: string | null
}
