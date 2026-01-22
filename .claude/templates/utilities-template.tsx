/**
 * 유틸리티 함수 템플릿 모음
 *
 * 사용법:
 * 필요한 유틸리티를 복사하여 사용
 *
 * 포함된 패턴:
 * 1. 숫자 포맷 (천 단위 콤마)
 * 2. 통화 포맷
 * 3. 큰 숫자 축약
 * 4. 파일 크기 포맷
 * 5. 날짜 포맷
 * 6. 입력 핸들러
 */

// ============================================
// 1. 숫자 포맷 (천 단위 콤마)
// ============================================

// 기본 천 단위 콤마
export function formatNumber(value: number): string {
  return value.toLocaleString()
}

// 소수점 포함 포맷
export function formatNumberWithDecimals(value: number, decimals = 2): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

// 예시: 1234567 → "1,234,567"
// 예시: 1234.56 → "1,234.56"

// ============================================
// 2. 통화 포맷
// ============================================

// 원화 포맷
export function formatKRW(value: number): string {
  return `₩${value.toLocaleString()}`
}

// 달러 포맷
export function formatUSD(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}

// 범용 통화 포맷
export function formatCurrency(value: number, currency: 'KRW' | 'USD' | 'EUR' = 'KRW'): string {
  const locale = currency === 'KRW' ? 'ko-KR' : currency === 'EUR' ? 'de-DE' : 'en-US'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'KRW' ? 0 : 2,
  }).format(value)
}

// ============================================
// 3. 큰 숫자 축약
// ============================================

// 달러 축약 (K, M, B)
export function formatLargeUSD(value: number): string {
  if (value >= 1000000000) return `$${(value / 1000000000).toFixed(1)}B`
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`
  return `$${value.toLocaleString()}`
}

// 원화 축약 (만, 억)
export function formatLargeKRW(value: number): string {
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)}억원`
  if (value >= 10000) return `${(value / 10000).toFixed(0)}만원`
  return `${value.toLocaleString()}원`
}

// 범용 축약 (K, M)
export function formatCompact(value: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact' }).format(value)
}

// 예시: 1500000 → "1.5M"
// 예시: 150000000 → "1.5억원"

// ============================================
// 4. 파일 크기 포맷
// ============================================

export function formatFileSize(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

// 예시: 1536000 → "1.5 MB"

// ============================================
// 5. 날짜 포맷
// ============================================

// 기본 날짜 포맷 (YYYY-MM-DD)
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toISOString().split('T')[0]
}

// 한국어 날짜 포맷
export function formatDateKR(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// 상대 시간 (N분 전, N시간 전, N일 전)
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diff = now.getTime() - d.getTime()

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  if (hours < 24) return `${hours}시간 전`
  if (days < 7) return `${days}일 전`
  return formatDate(d)
}

// 예시: "2025년 1월 22일"
// 예시: "5분 전", "3시간 전", "2일 전"

// ============================================
// 6. 입력 핸들러 (React용)
// ============================================

// 금액 입력 핸들러 (콤마 자동 추가)
export function handleAmountChange(
  e: React.ChangeEvent<HTMLInputElement>,
  setValue: (value: string) => void
) {
  const value = e.target.value.replace(/[^\d]/g, '')
  setValue(value ? parseInt(value).toLocaleString() : '')
}

// 금액 문자열을 숫자로 변환
export function parseAmount(amountString: string): number {
  return parseInt(amountString.replace(/,/g, ''), 10) || 0
}

// 사용 예시:
/*
const [amount, setAmount] = useState('')

<Input
  value={amount}
  onChange={(e) => handleAmountChange(e, setAmount)}
  placeholder="0"
  className="text-right"
/>

// 저장 시
const numericValue = parseAmount(amount)
*/

// ============================================
// 7. 퍼센트 포맷
// ============================================

export function formatPercent(value: number, decimals = 0): string {
  return `${value.toFixed(decimals)}%`
}

// 증감률 (+ 또는 - 표시)
export function formatChange(value: number, decimals = 1): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals)}%`
}

// 예시: 15.5 → "15.5%"
// 예시: -3.2 → "-3.2%", 5.1 → "+5.1%"

// ============================================
// 8. 문자열 유틸리티
// ============================================

// 텍스트 잘라내기 (말줄임)
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

// 복수형 처리
export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : plural || `${singular}s`
}

// 예시: truncate("긴 텍스트입니다", 5) → "긴 텍스..."
