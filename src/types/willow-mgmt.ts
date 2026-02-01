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
