// 한국시간(KST, Asia/Seoul) 기준 날짜 유틸. 대시보드의 "오늘/어제/최근 N일" 컷오프와
// 일별 버킷팅·표시를 전부 KST로 통일하기 위해 사용. (UTC/브라우저로컬 혼용 방지)

// Postgres `timestamp without time zone`는 UTC 값을 타임존 표시 없는 문자열로 반환한다
// (예: "2026-07-20 07:30:00" — Z도 offset도 없음). 이런 naive 문자열을 그대로 new Date()에
// 넘기면 브라우저는 "로컬 시간(KST)"으로 파싱해 +9h 변환을 건너뛴다 → 자정~오전 9시 KST에
// 생성된 레코드가 하루 이전 날짜로 버킷팅된다. 그래서 naive 문자열은 UTC로 명시(Z 부착)한 뒤 파싱한다.
function asUtcInstant(d: string | number | Date): string | number | Date {
  if (typeof d !== 'string') return d
  const s = d.trim()
  const hasTime = s.includes(':')
  const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)
  if (hasTime && !hasTz) return s.replace(' ', 'T') + 'Z'
  return s
}

// ISO 문자열/Date → KST 날짜키 'YYYY-MM-DD'
export function kstDateKey(d: string | number | Date): string {
  return new Date(asUtcInstant(d)).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
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
  return new Date(asUtcInstant(d)).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'short', day: 'numeric' })
}

// KST 짧은 날짜 'YY.MM.DD'
export function kstShortDate(d?: string | null): string {
  if (!d) return '—'
  const key = kstDateKey(d) // YYYY-MM-DD
  return `${key.slice(2, 4)}.${key.slice(5, 7)}.${key.slice(8, 10)}`
}

// KST 요일 '월'/'화'...
export function kstWeekday(d?: string | null): string {
  if (!d) return ''
  return new Date(asUtcInstant(d)).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', weekday: 'short' })
}

// KST 시각 'HH:mm'
export function kstTime(d?: string | null): string {
  if (!d) return ''
  return new Date(asUtcInstant(d)).toLocaleTimeString('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })
}
