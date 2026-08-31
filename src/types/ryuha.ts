export interface RyuhaSchedule {
  id: string
  title: string
  description: string | null
  schedule_date: string
  end_date: string | null
  start_time: string | null
  end_time: string | null
  type: 'school' | 'academy' | 'arts' | 'homework' | 'etc'
  color: string | null
  is_completed: boolean
  completed_dates: string[]
  email_reminder: boolean
  reminder_sent: boolean
  homework_content: string | null
  homework_deadline: string | null
  homework_completed: boolean
  created_at: string
  homework_items?: RyuhaHomeworkItem[]
}

export interface RyuhaDailyMemo {
  id: string
  memo_date: string
  content: string
  created_at: string
  updated_at: string
}

export interface RyuhaHomeworkItem {
  id: string
  schedule_id: string
  content: string
  deadline: string
  is_completed: boolean
  completed_at: string | null
  order_index: number
  created_at: string
}

export interface RyuhaBodyRecord {
  id: string
  record_date: string
  height_cm: number | null
  weight_kg: number | null
  notes: string | null
  created_at: string
  updated_at: string
}


