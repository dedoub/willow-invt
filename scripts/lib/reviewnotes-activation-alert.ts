type ActivationRow = { first_problem_at: string }

function kstDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function countKstDailyReviewnotesActivations(rows: ActivationRow[], now = new Date()): number {
  const today = kstDateKey(now)
  return rows.filter(row => {
    const activatedAt = new Date(row.first_problem_at)
    return !Number.isNaN(activatedAt.getTime()) && kstDateKey(activatedAt) === today
  }).length
}
