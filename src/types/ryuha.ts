export interface RyuhaSubject {
  id: string
  name: string
  color: string
  icon: string
  order_index: number
  created_at: string
}

export interface RyuhaTextbook {
  id: string
  subject_id: string
  name: string
  publisher: string | null
  description: string | null
  order_index: number
  created_at: string
  subject?: RyuhaSubject
  chapters?: { count: number }[]
}

export interface RyuhaChapter {
  id: string
  textbook_id: string
  name: string
  description: string | null
  order_index: number
  status: 'pending' | 'in_progress' | 'completed'
  target_date: string | null
  completed_at: string | null
  review_completed: boolean
  created_at: string
  textbook?: RyuhaTextbook
}

export interface RyuhaSchedule {
  id: string
  title: string
  description: string | null
  schedule_date: string
  start_time: string | null
  end_time: string | null
  type: 'homework' | 'self_study'
  subject_id: string | null
  chapter_id: string | null
  is_completed: boolean
  email_reminder: boolean
  reminder_sent: boolean
  created_at: string
  subject?: RyuhaSubject
  chapter?: RyuhaChapter
}

// Legacy - 기존 호환성 유지
export interface RyuhaStudyRange {
  id: string
  subject_id: string
  name: string
  description: string | null
  order_index: number
  status: 'pending' | 'in_progress' | 'completed'
  target_date: string | null
  completed_at: string | null
  created_at: string
  subject?: RyuhaSubject
}
