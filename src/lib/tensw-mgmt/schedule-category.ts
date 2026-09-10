export type ScheduleCategory = 'finance' | 'other'

const FINANCE_TITLE = /세금계산서|급여|부가세|부가가치세|법인세|소득세|지방세|원천징수|국세|세금|4대보험|국민연금|건강보험|고용보험|산재보험|법인카드|카드.*(?:대금|결제)|대출.*이자|대여금.*이자|수금/

export function getScheduleCategory(schedule: { category?: string | null; title: string }): ScheduleCategory {
  if (schedule.category === 'finance') return 'finance'
  if (schedule.category === 'other') return 'other'
  return FINANCE_TITLE.test(schedule.title) ? 'finance' : 'other'
}
