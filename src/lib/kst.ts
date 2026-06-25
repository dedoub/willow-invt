// 한국시간(KST, Asia/Seoul) 기준 날짜 유틸. 대시보드의 "오늘/어제/최근 N일" 컷오프와
// 일별 버킷팅·표시를 전부 KST로 통일하기 위해 사용. (UTC/브라우저로컬 혼용 방지)

// ISO 문자열/Date → KST 날짜키 'YYYY-MM-DD'
export function kstDateKey(d: string | number | Date): string {
  return new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
}

// 오늘(KST) 'YYYY-MM-DD'
export function kstToday(): string {
  return kstDateKey(new Date())
}

// N일 전(KST) 'YYYY-MM-DD'. (KST는 DST 없으므로 24h*N 시프트 후 KST 날짜 변환으로 안전)
export function kstDaysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return kstDateKey(d)
}

// 이번 달 1일(KST) 'YYYY-MM-DD'
export function kstMonthStart(): string {
  return kstToday().slice(0, 8) + '01'
}

// KST 날짜 표시 'YYYY년 M월 D일'
export function kstDisplayDate(d?: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'short', day: 'numeric' })
}

// KST 짧은 날짜 'YY.MM.DD'
export function kstShortDate(d?: string | null): string {
  if (!d) return '—'
  const key = kstDateKey(d) // YYYY-MM-DD
  return `${key.slice(2, 4)}.${key.slice(5, 7)}.${key.slice(8, 10)}`
}
