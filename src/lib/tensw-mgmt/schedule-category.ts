// 텐소 일정 분류 — 돈이 들어오는 일(매출), 나가는 일(비용), 나머지(기타거래). CEO 2026-09-10.
export type ScheduleCategory = 'revenue' | 'expense' | 'other'

export const SCHEDULE_CATEGORY_LABEL: Record<ScheduleCategory, string> = {
  revenue: '매출',
  expense: '비용',
  other: '기타거래',
}

export const SCHEDULE_CATEGORIES: ScheduleCategory[] = ['revenue', 'expense', 'other']

// 매출: 돈이 들어오는 일 — 매출대금 입금·수금·매출 세금계산서
const REVENUE_TITLE = /매출|입금|수금|정산금|매출대금/
// 비용: 돈이 나가는 일 — 매입·이체·세금·보험·급여·카드·이자
const EXPENSE_TITLE = /매입|이체|납부|세금계산서|급여|상여|부가세|부가가치세|법인세|소득세|지방세|원천징수|국세|세금|4대보험|국민연금|건강보험|고용보험|산재보험|법인카드|카드.*(?:대금|결제)|대출.*이자|대여금.*이자|이자.*상환/

/** 제목만으로 분류한다(저장된 값이 없거나 구버전 'finance'일 때). */
export function classifyScheduleTitle(title: string): ScheduleCategory {
  if (REVENUE_TITLE.test(title)) return 'revenue'
  if (EXPENSE_TITLE.test(title)) return 'expense'
  return 'other'
}

export function getScheduleCategory(schedule: { category?: string | null; title: string }): ScheduleCategory {
  const c = schedule.category
  if (c === 'revenue' || c === 'expense' || c === 'other') return c
  // 구버전 'finance'·null: 제목으로 매출/비용을 가른다
  return classifyScheduleTitle(schedule.title)
}
