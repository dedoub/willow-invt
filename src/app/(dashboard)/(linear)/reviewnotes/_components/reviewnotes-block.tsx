'use client'

import { useMemo, useState } from 'react'
import { t, tonePalettes, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead, LHeadBtn } from '@/app/(dashboard)/_components/linear-section-head'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { DistributionPie } from '@/app/(dashboard)/_components/distribution-pie'
import type { CreditSalesStats } from '@/lib/lemonsqueezy'
import { isExcludedReviewNotesUser, RN_AI_FEATURE_LABELS } from '@/lib/reviewnotes-types'
import type { RnAiFeatureUse } from '@/lib/reviewnotes-types'
import { kstDateKey, kstToday, kstDaysAgo, kstWeekday, kstTime } from '@/lib/kst'
import type { ReviewNotesUserStats, ReviewNotesTrafficStats, ReviewNotesContentStats } from '@/lib/reviewnotes-types'
import { formatCountryName, codeToFlag, COUNTRY_NAMES } from '@/lib/country-format'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReviewnotesBlockProps {
  loading: boolean
  sales: CreditSalesStats | null
  userStats: ReviewNotesUserStats | null
  trafficStats: ReviewNotesTrafficStats | null
  contentStats: ReviewNotesContentStats | null
  onRefresh: () => void
  refreshing: boolean
  error: string | null
  cols: 1 | 2 // 레이아웃 열 수 (1=wide). 단일 앱 페이지는 1 고정.
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(value / 100)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`
}

// ─── User table (VoiceCards 사용자 테이블과 동일 스타일) ─────────────────────────

// 테이블 셀용 짧은 날짜 — 연월일 모두 표시 (YY.MM.DD), KST 기준
// createdAt은 timestamp-without-tz(=UTC naive)라 반드시 kstDateKey로 UTC 명시 후 변환한다.
function formatDateShort(dateString?: string | null): string {
  if (!dateString) return '—'
  const key = kstDateKey(dateString) // YYYY-MM-DD
  return `${key.slice(2, 4)}.${key.slice(5, 7)}.${key.slice(8, 10)}`
}

// 요일 (월)/(화)... + 시간 HH:mm — 보이스카드 사용자 테이블과 동일 (KST)
function formatWeekdayShort(dateString?: string | null): string {
  return kstWeekday(dateString)
}
function formatTimeShort(dateString?: string | null): string {
  return kstTime(dateString)
}

type UserSortKey = 'created' | 'active' | 'name' | 'email' | 'country' | 'notes' | 'problems' | 'sets' | 'solves' | 'balance' | 'spent' | 'role' | 'ai' | 'storage'

// 국가코드(EventLog↔PageView first-touch IP) → 국기+코드 배지. 2자리 ISO 아니면 null → '—'.
function formatCountryBadge(country?: string | null): { flag: string; code: string; name: string } | null {
  const code = (country || '').toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return null
  return { flag: codeToFlag(code), code, name: COUNTRY_NAMES[code] || code }
}
// AI 기능별 사용 내역 툴팁 — 이번 달을 먼저 적고, 누적이 더 많으면 아래 줄에 덧붙인다.
// 원장(AiUsage)은 2026-08-11부터 쌓이므로 그 이전 호출은 여기에 없다.
function formatAiFeatureBreakdown(
  month?: Record<string, RnAiFeatureUse>,
  total?: Record<string, RnAiFeatureUse>,
): string {
  const line = (m?: Record<string, RnAiFeatureUse>) =>
    Object.entries(m ?? {})
      .sort((a, b) => b[1].credits - a[1].credits)
      .map(([k, v]) => `${RN_AI_FEATURE_LABELS[k] ?? k} ${v.calls}회 (${v.credits}크레딧)`)
      .join('\n')
  const m = line(month)
  const tAll = line(total)
  if (!tAll) return 'AI 사용 기록 없음 (원장 2026-08-11 시작)'
  return m
    ? `이번 달\n${m}${tAll !== m ? `\n\n누적\n${tAll}` : ''}`
    : `이번 달 사용 없음\n\n누적\n${tAll}`
}

type SortDir = 'asc' | 'desc'

// 컬럼 정의 (헤더 라벨 + 정렬키 + 정렬, 모바일 드롭다운 라벨). 순서 = 그리드 순서.
// 보이스카드 사용자 테이블과 동일: 가입/활동 날짜가 맨 앞 (2026-07-15 CEO)
const USER_COLUMNS: Array<{ key: UserSortKey; label: string; mobileLabel: string; align: 'left' | 'center' | 'right' }> = [
  { key: 'created', label: '가입',   mobileLabel: '가입일', align: 'center' },
  { key: 'active',  label: '활동',   mobileLabel: '활동일', align: 'center' },
  { key: 'name',    label: '닉네임', mobileLabel: '닉네임', align: 'left' },
  { key: 'email',   label: '이메일', mobileLabel: '이메일', align: 'left' },
  { key: 'country', label: '국가',   mobileLabel: '국가',   align: 'center' },
  { key: 'notes',    label: '노트',   mobileLabel: '노트',   align: 'center' },
  { key: 'problems', label: '문제',   mobileLabel: '문제',   align: 'center' },
  { key: 'sets',     label: '세트',   mobileLabel: '문제 세트', align: 'center' },
  { key: 'solves',   label: '풀이',   mobileLabel: '문제 풀이', align: 'center' },
  { key: 'balance', label: '잔액',   mobileLabel: '크레딧 잔액', align: 'center' },
  { key: 'spent',   label: '사용',   mobileLabel: '크레딧 사용', align: 'center' },
  { key: 'role',    label: '권한',   mobileLabel: '권한',   align: 'center' },
  { key: 'ai',      label: 'AI',     mobileLabel: 'AI 호출', align: 'center' },
  { key: 'storage', label: '용량',   mobileLabel: '용량',   align: 'center' },
]

// 텍스트 컬럼은 오름차순이 기본, 그 외(플랜·권한·용량·날짜)는 내림차순이 기본
const ASC_DEFAULT_KEYS = new Set<UserSortKey>(['name', 'email', 'country'])
const defaultSortDir = (key: UserSortKey): SortDir => (ASC_DEFAULT_KEYS.has(key) ? 'asc' : 'desc')

const USER_SORT_STORAGE_KEY = 'reviewnotes.userSort'
const USER_SORT_KEY_SET = new Set<UserSortKey>(USER_COLUMNS.map(o => o.key))

const USER_TABLE_COLS = '64px 64px minmax(72px,1fr) minmax(84px,1.1fr) 52px 40px 44px 40px 40px 52px 48px 48px 44px 58px'
// 컬럼 폭 합(768) + gap 6px×13(78) + 좌우 패딩(16). 이 아래로는 가로 스크롤이 걸린다.
const USER_TABLE_MIN_WIDTH = 862
const userHeadCell: React.CSSProperties = {
  fontSize: 'calc(9px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.subtle,
  letterSpacing: 0.3, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden',
}
const userTextCell: React.CSSProperties = {
  fontSize: 'calc(10px * var(--fz, 1))', color: t.neutrals.muted,
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
}
const userNumCell: React.CSSProperties = {
  fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.text,
  fontVariantNumeric: 'tabular-nums', textAlign: 'right', whiteSpace: 'nowrap',
}
const userDateCell: React.CSSProperties = {
  fontSize: 'calc(9.5px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted,
  fontVariantNumeric: 'tabular-nums', textAlign: 'right', whiteSpace: 'nowrap',
}

// 총값 + 오늘 변동 2줄 셀 — 보이스카드 NumDeltaCell과 동일 문법. delta 양수=초록(+), 0=미표시
function NumDeltaCell({ total, delta }: { total: number; delta: number }) {
  const d = Number(delta)
  return (
    <div style={{
      ...userNumCell, textAlign: 'center' as const,
      display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.15,
    }}>
      <span>{total.toLocaleString()}</span>
      {Number.isFinite(d) && d !== 0 && (
        <span style={{ fontSize: 'calc(8px * var(--fz, 1))', fontWeight: 600, color: d > 0 ? '#059669' : '#DC2626' }}>
          {d > 0 ? '+' : '−'}{Math.abs(d).toLocaleString()}
        </span>
      )}
    </div>
  )
}

// 전환율 계산 + 값 뒤 주황 보조라벨 (보이스카드 퍼널 문법) — 퍼널/운영지표 공용
const rate = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0)
const rateExtra = (label: string, pct: number) => (
  <span style={{
    fontSize: 'calc(9.5px * var(--fz, 1))', marginLeft: 5, fontWeight: 500,
    color: t.accent.warn, fontVariantNumeric: 'tabular-nums' as const,
  }}>
    {label} {pct}%
  </span>
)

// 일별 활동자 차트 — 보이스카드 DauTrendCard 리뷰노트판.
// 회원(기존 가입자)/신규(그날 가입)/비로그인 3계열 + 7일 이동평균.
// 비로그인은 세션 수라 로그인 활동자(유저 수)와 세는 단위가 다르다. 막대는 같이 쌓되
// 툴팁에서 구분해 적는다. 관리자·봇 제외는 RPC(rn_daily_active)에서 처리한다.
const RN_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
function rnWithWeekday(d: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d} (${RN_WEEKDAYS[new Date(d + 'T00:00:00Z').getUTCDay()]})` : d
}
function RnDauTrendCard({ daily, days = 42 }: {
  daily: Array<{ date: string; active: number; newUsers: number; member: number; anon: number }>
  days?: number
}) {
  const rows = (daily ?? []).slice(-days)
  const totalOf = (r: { active: number; anon: number }) => r.active + r.anon
  const max = rows.reduce((m, r) => Math.max(m, totalOf(r)), 0)
  const latest = rows.length ? rows[rows.length - 1] : null
  const MEMBER = '#3b82f6'
  const NEW = '#8b5cf6'
  const ANON = '#10b981'
  const MA_COLOR = '#f97316'
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const barPct = (v: number) => (max > 0 ? (v / max) * 100 : 0)
  const ma = rows.map((_, i) => {
    const win = rows.slice(Math.max(0, i - 6), i + 1)
    return win.reduce((sum, r) => sum + totalOf(r), 0) / win.length
  })
  return (
    <div style={{
      background: t.neutrals.inner, borderRadius: t.radius.sm, padding: '8px 10px',
      height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginBottom: 6 }}>
        <div style={{
          fontSize: 'calc(9.5px * var(--fz, 1))', fontFamily: t.font.mono, letterSpacing: 0.8,
          textTransform: 'uppercase' as const, color: t.neutrals.subtle, whiteSpace: 'nowrap' as const,
        }}>
          일별 활동자
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'calc(9px * var(--fz, 1))', fontFamily: t.font.mono, whiteSpace: 'nowrap' as const }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: t.neutrals.muted }}>
            <span style={{ width: 6, height: 6, borderRadius: 1, background: MEMBER }} />회원 {latest?.member ?? 0}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: t.neutrals.muted }}>
            <span style={{ width: 6, height: 6, borderRadius: 1, background: NEW }} />신규 {latest?.newUsers ?? 0}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: t.neutrals.muted }}>
            <span style={{ width: 6, height: 6, borderRadius: 1, background: ANON }} />비로그인 {latest?.anon ?? 0}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: t.neutrals.muted }}>
            <span style={{ width: 10, height: 2, borderRadius: 1, background: MA_COLOR }} />7일평균 {ma.length ? (Math.round(ma[ma.length - 1] * 10) / 10).toLocaleString() : 0}
          </span>
        </div>
      </div>
      {rows.length === 0 || max === 0 ? (
        <div style={{ flex: 1, minHeight: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'calc(10px * var(--fz, 1))', color: t.neutrals.subtle }}>
          데이터 없음
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 96, display: 'flex', alignItems: 'stretch', gap: 2, position: 'relative' }}>
          {rows.map((r, i) => {
            const anonH = barPct(r.anon)
            const newH = barPct(r.newUsers)
            const memberH = barPct(r.member)
            const dim = hoverIdx !== null && hoverIdx !== i
            return (
              <div key={r.date}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(prev => (prev === i ? null : prev))}
                style={{ flex: 1, minWidth: 2, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', cursor: 'default' }}>
                {anonH > 0 && <div style={{ height: `${anonH}%`, background: ANON, borderRadius: '1px 1px 0 0', opacity: dim ? 0.4 : 1, transition: 'opacity 120ms ease' }} />}
                {newH > 0 && <div style={{ height: `${newH}%`, background: NEW, borderRadius: anonH > 0 ? 0 : '1px 1px 0 0', opacity: dim ? 0.4 : 1, transition: 'opacity 120ms ease' }} />}
                {memberH > 0 && <div style={{ height: `${memberH}%`, background: MEMBER, borderRadius: (anonH > 0 || newH > 0) ? 0 : '1px 1px 0 0', opacity: dim ? 0.4 : 1, transition: 'opacity 120ms ease' }} />}
              </div>
            )
          })}
          {max > 0 && rows.length > 1 && (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
              <polyline
                points={ma.map((v, i) => `${(((i + 0.5) / rows.length) * 100).toFixed(2)},${(100 - (v / max) * 100).toFixed(2)}`).join(' ')}
                fill="none" stroke={MA_COLOR} strokeWidth={1.2} opacity={0.75}
                vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
          )}
          {hoverIdx !== null && rows[hoverIdx] && (() => {
            const r = rows[hoverIdx]
            const leftPct = Math.min(86, Math.max(14, ((hoverIdx + 0.5) / rows.length) * 100))
            return (
              <div style={{
                position: 'absolute', left: `${leftPct}%`, transform: 'translateX(-50%)',
                bottom: `calc(${barPct(totalOf(r)).toFixed(1)}% + 8px)`, pointerEvents: 'none', zIndex: 10,
                background: '#1E293B', color: '#F8FAFC',
                fontSize: 'calc(11px * var(--fz, 1))', fontFamily: t.font.sans, lineHeight: 1.4,
                borderRadius: 6, padding: '6px 10px', whiteSpace: 'nowrap',
              }}>
                <div style={{ opacity: 0.7, marginBottom: 3 }}>{rnWithWeekday(r.date)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 1, background: MEMBER }} />회원 {r.member}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 1, background: NEW }} />신규 {r.newUsers}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 1, background: ANON }} />비로그인 {r.anon}<span style={{ opacity: 0.6 }}> 세션</span>
                </div>
                <div style={{ opacity: 0.7, marginTop: 3 }}>로그인 {r.active}명 · 7일 평균 {Math.round(ma[hoverIdx] * 10) / 10}</div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReviewnotesBlock({
  loading, sales, userStats, trafficStats, contentStats,
  onRefresh, refreshing, error, cols,
}: ReviewnotesBlockProps) {
  const mobile = useIsMobile()
  const dashCols = cols
  const [userPage, setUserPage] = useState(1)
  const [userPerPage, setUserPerPage] = useState(10)
  const [userPerPageInput, setUserPerPageInput] = useState('10')
  const initialUserSort = (): { key: UserSortKey; dir: SortDir } => {
    if (typeof window === 'undefined') return { key: 'created', dir: 'desc' }
    const stored = window.localStorage.getItem(USER_SORT_STORAGE_KEY)
    if (!stored) return { key: 'created', dir: 'desc' }
    const [key, dir] = stored.split(':')
    if (!USER_SORT_KEY_SET.has(key as UserSortKey)) return { key: 'created', dir: 'desc' }
    const sortKey = key as UserSortKey
    return {
      key: sortKey,
      dir: dir === 'asc' ? 'asc' : dir === 'desc' ? 'desc' : defaultSortDir(sortKey),
    }
  }
  const [userSort, setUserSort] = useState<UserSortKey>(() => initialUserSort().key)
  const [userSortDir, setUserSortDir] = useState<SortDir>(() => initialUserSort().dir)

  const commitUserPerPage = () => {
    const n = Math.max(1, Math.min(100, Number(userPerPageInput) || 10))
    setUserPerPageInput(String(n))
    setUserPerPage(n)
    setUserPage(1)
  }

  const sortedUsers = useMemo(() => {
    if (!userStats) return []
    const arr = [...userStats.users]
    type U = typeof arr[number]
    const nameOf = (u: U) => (u.name || u.email || '').toLowerCase()
    // 컬럼별 1차 비교(항상 오름차순 기준). 방향은 dirMul로 적용.
    const primary = (a: U, b: U): number => {
      switch (userSort) {
        case 'name':    return nameOf(a).localeCompare(nameOf(b), 'ko')
        case 'email':   return a.email.localeCompare(b.email)
        // 국가 미상(null)은 최대 문자로 치환 → 오름차순에서 실제 국가 뒤로 밀림
        case 'country': return (a.country || '￿').localeCompare(b.country || '￿')
        case 'role':    return (a.role === 'ADMIN' ? 1 : 0) - (b.role === 'ADMIN' ? 1 : 0)
        case 'storage': return (a.storageUsed || 0) - (b.storageUsed || 0)
        case 'balance': return (a.creditBalance ?? 0) - (b.creditBalance ?? 0)
        case 'spent':   return (a.aiCreditsTotal ?? 0) - (b.aiCreditsTotal ?? 0)
        case 'ai':      return (a.aiCallsMonth ?? 0) - (b.aiCallsMonth ?? 0)
        case 'notes':    return (a.notes ?? 0) - (b.notes ?? 0)
        case 'problems': return (a.problems ?? 0) - (b.problems ?? 0)
        case 'sets':     return (a.problemSets ?? 0) - (b.problemSets ?? 0)
        case 'solves':   return (a.solves ?? 0) - (b.solves ?? 0)
        case 'created': return a.createdAt.localeCompare(b.createdAt)
        // 활동 기록 없는 유저(null)는 항상 뒤로
        case 'active':  return (a.lastActiveAt ?? '').localeCompare(b.lastActiveAt ?? '')
        default:        return 0
      }
    }
    const dirMul = userSortDir === 'asc' ? 1 : -1
    arr.sort((a, b) => {
      const p = primary(a, b)
      if (p !== 0) return p * dirMul
      return b.createdAt.localeCompare(a.createdAt) // 동점 보조정렬: 최신 가입 우선 (방향 무관)
    })
    return arr
  }, [userStats, userSort, userSortDir])

  const totalUsers = sortedUsers.length
  // 표에는 남기고 숫자에서만 빠지는 계정 수. 표의 30과 카드의 27이 왜 다른지 여기서 설명된다.
  const excludedCount = (userStats?.users ?? []).filter(isExcludedReviewNotesUser).length
  const totalUserPages = Math.max(1, Math.ceil(totalUsers / userPerPage))
  const safeUserPage = Math.min(userPage, totalUserPages)
  const paginatedUsers = sortedUsers.slice(
    (safeUserPage - 1) * userPerPage,
    safeUserPage * userPerPage
  )

  // 같은 컬럼 재클릭 시 방향 토글, 다른 컬럼 클릭 시 그 컬럼의 기본 방향. + localStorage 저장
  const handleSortChange = (key: UserSortKey) => {
    const nextDir: SortDir = key === userSort ? (userSortDir === 'asc' ? 'desc' : 'asc') : defaultSortDir(key)
    setUserSort(key)
    setUserSortDir(nextDir)
    setUserPage(1)
    window.localStorage.setItem(USER_SORT_STORAGE_KEY, `${key}:${nextDir}`)
  }

  // 그리드는 페이지가 갖는다. 여기서는 조각 두 개(퍼널열 · 사용자)만 내놓고, 페이지 그리드가
  // DOM 순서대로 두 열에 채운다. 보이스카드 블록과 같은 규칙이다.
  return (
    <>
    {/* 퍼널 · 운영 지표 — 두 섹션이 한 열로 붙어 다닌다 */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.blockGap, minWidth: 0 }}>
    {/* 카드1: 헤더 + 인사이트 */}
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 12 }}>
        <LSectionHead
          eyebrow="FUNNEL"
          title="방문 → 가입 → 활성화 → 결제"
          note={trafficStats?.daily[0]
            ? `${trafficStats.daily[0].date.slice(2).replace(/-/g, '.')} 집계 시작 · 누적 · 봇 제외`
            : undefined}
          action={
            <>
              <LHeadBtn icon="trending" title="LemonSqueezy" href="https://app.lemonsqueezy.com/products" />
              <LHeadBtn icon="refresh" title="데이터 새로고침" onClick={onRefresh} busy={refreshing} />
            </>
          }
        />

        {/* Error */}
        {error && (
          <div style={{
            padding: '8px 12px', borderRadius: t.radius.md,
            background: tonePalettes.neg.bg, color: tonePalettes.neg.fg,
            fontSize: 'calc(11px * var(--fz, 1))', marginBottom: 10,
          }}>
            {error}
          </div>
        )}

        {loading && (() => {
          const splitLayout = !mobile && dashCols === 1
          const pulse = { borderRadius: t.radius.sm, background: t.neutrals.inner, animation: 'pulse 1.5s ease-in-out infinite' } as const
          return (
            <div style={{ display: 'grid', gridTemplateColumns: splitLayout ? 'minmax(0,1fr) minmax(0,1fr)' : 'minmax(0,1fr)', gap: 8, alignItems: 'stretch' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                {/* 퍼널 6카드 */}
                <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 8 }}>
                  {[0, 1, 2, 3, 4, 5].map(i => <div key={i} style={{ ...pulse, height: 64 }} />)}
                </div>
                {/* 분포 파이 3 */}
                <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 8 }}>
                  {[0, 1, 2].map(i => <div key={i} style={{ ...pulse, height: 150 }} />)}
                </div>
              </div>
              {/* 일별 활동자(DAU) */}
              <div style={{ ...pulse, minWidth: 0, minHeight: splitLayout ? undefined : 190 }} />
            </div>
          )
        })()}

      {/* 인사이트 — 랜딩 트래픽 → 가입 → 로그인 → 활동 → 유료 퍼널.
          보이스카드와 동일하게 헤더 컨테이너 안에 배치 — 두 블록의 인사이트 시작 높이 정렬 (2026-07-15 CEO) */}
      {!loading && trafficStats && (
        <div>
          {/* 퍼널 KPI (집계 시작 2026-06-24 이후 전체 누적): 순 방문자 → 페이지뷰 → 가입 —
              활동/유료 사용자는 카드 대신 "사용자" 구성 파이(비가입/무료/유료)로 표현 (2026-07-15 CEO).
              보이스카드 인사이트처럼 각 카드 값 뒤에 전단계 대비 전환율 (2026-07-15 CEO).
              스파크라인도 누적 — 일별 값은 노이즈 스파이크라 누적 기울기로 추세를 읽고, 끝점 = 헤드라인. */}
          {(() => {
            const daily = trafficStats.daily
            const last = daily.length ? daily[daily.length - 1] : null
            const todayViews = last?.views ?? 0
            const todayVisitors = last?.visitors ?? 0
            const last7Views = daily.slice(-7).reduce((s, d) => s + d.views, 0)
            const last7Visitors = daily.slice(-7).reduce((s, d) => s + d.visitors, 0)
            let runViews = 0, runVisitors = 0
            const cumViews = daily.map(d => ({ date: d.date, value: (runViews += d.views) }))
            const cumVisitors = daily.map(d => ({ date: d.date, value: (runVisitors += d.visitors) }))

            // 가입/유료 — userStats 기반 (KST 날짜키). 시작일 = 트래픽 집계 시작(첫 PageView 날짜)
            // 통계는 관리자 제외 (2026-07-16 CEO) — 테이블에만 전체 표시
            const users = (userStats?.users ?? []).filter(u => !isExcludedReviewNotesUser(u))
            const trackStartKey = daily.length ? daily[0].date : ''
            const todayKey = daily.length ? daily[daily.length - 1].date : ''
            const sevenAgoKey = daily.length >= 7 ? daily[daily.length - 7].date : trackStartKey
            const kstKey = (iso: string) => kstDateKey(iso) // UTC naive → KST 날짜키 (Z 명시 파싱)
            const signupsSinceStart = users.filter(u => kstKey(u.createdAt) >= trackStartKey).length
            const signupsToday = users.filter(u => kstKey(u.createdAt) === todayKey).length
            const signups7 = users.filter(u => kstKey(u.createdAt) >= sevenAgoKey).length
            // 집계 시작 이후 누적 가입 스파크라인
            const signupByDay = new Map<string, number>()
            for (const u of users) {
              const k = kstKey(u.createdAt)
              if (k >= trackStartKey) signupByDay.set(k, (signupByDay.get(k) ?? 0) + 1)
            }
            let runSignups = 0
            const cumSignups = daily.map(d => ({ date: d.date, value: (runSignups += signupByDay.get(d.date) ?? 0) }))
            // 활성화 = 문제를 하나라도 등록한 유저 (rn_activation, 첫 등록 시각 기준).
            // 스파크라인은 집계 시작 이전 활성화분을 베이스라인으로 깔고 누적 — 끝점 = 총 활성 유저.
            const activation = trafficStats.activation ?? []
            const activatedTotal = activation.length
            const activatedToday = activation.filter(a => kstKey(a.firstProblemAt) === todayKey).length
            const activated7 = activation.filter(a => kstKey(a.firstProblemAt) >= sevenAgoKey).length
            const actByDay = new Map<string, number>()
            let actBaseline = 0
            for (const a of activation) {
              const k = kstKey(a.firstProblemAt)
              if (k < trackStartKey) actBaseline++
              else actByDay.set(k, (actByDay.get(k) ?? 0) + 1)
            }
            let runAct = actBaseline
            const cumActivated = daily.map(d => ({ date: d.date, value: (runAct += actByDay.get(d.date) ?? 0) }))
            // 구매자·매출 누적 — LemonSqueezy 주문 기준(첫 구매일에 한 번). 활성화와 같은 베이스라인 방식.
            const salesDaily = sales?.daily ?? []
            const buyersByDay = new Map<string, number>()
            const revenueByDay = new Map<string, number>()
            for (const d of salesDaily) {
              buyersByDay.set(d.date, (buyersByDay.get(d.date) ?? 0) + d.orders)
              revenueByDay.set(d.date, (revenueByDay.get(d.date) ?? 0) + d.revenueUsd)
            }
            let runBuyers = 0
            const cumBuyers = salesDaily.length
              ? daily.map(d => ({ date: d.date, value: (runBuyers += buyersByDay.get(d.date) ?? 0) }))
              : undefined
            let runRevenue = 0
            const revenueSpark = salesDaily.length
              ? daily.map(d => ({ date: d.date, value: Math.round((runRevenue += revenueByDay.get(d.date) ?? 0) / 100) }))
              : undefined

            const splitLayout = !mobile && dashCols === 1
            return (
          <div style={{ display: 'grid', gridTemplateColumns: splitLayout ? 'minmax(0,1fr) minmax(0,1fr)' : 'minmax(0,1fr)', gap: 8, alignItems: 'stretch' }}>
          {/* 좌: 퍼널 카드(3×2) + 파이 · 우: 일별 활동자 전체높이 (1열 모드 전용, 보이스카드와 동일) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 8 }}>
            <LStat
              label="순 방문자"
              title="랜딩 유니크 방문자 누적 (기기 기준, 집계 시작 이후)"
              value={trafficStats.totals.visitors.toLocaleString()}
              sub={`오늘 ${todayVisitors.toLocaleString()}명 · 7일 ${last7Visitors.toLocaleString()}명`}
              tone="info"
              sparkline={mobile ? undefined : cumVisitors}
            />
            <LStat
              label="페이지뷰"
              title="랜딩(/ko, /en) 페이지뷰 누적 — 세션당 1회, 봇 제외 (집계 시작 2026-06-24 이후). 배수 = 방문자당 조회."
              value={trafficStats.totals.views.toLocaleString()}
              valueExtra={trafficStats.totals.visitors > 0 ? (
                <span style={{
                  fontSize: 'calc(9.5px * var(--fz, 1))', marginLeft: 5, fontWeight: 500,
                  fontFamily: t.font.mono, color: t.neutrals.subtle, fontVariantNumeric: 'tabular-nums' as const,
                }}>
                  {(trafficStats.totals.views / trafficStats.totals.visitors).toFixed(1)}x
                </span>
              ) : undefined}
              sub={`오늘 ${todayViews.toLocaleString()}회 · 7일 ${last7Views.toLocaleString()}회`}
              sparkline={mobile ? undefined : cumViews}
            />
            <LStat
              label="가입"
              title="집계 시작(2026-06-24) 이후 가입자 누적. 전환율 = 가입 ÷ 순 방문자 — 랜딩을 안 거친 가입도 포함되므로 참고치."
              value={signupsSinceStart.toLocaleString()}
              valueExtra={rateExtra('전환', rate(signupsSinceStart, trafficStats.totals.visitors))}
              sub={`오늘 ${signupsToday.toLocaleString()}명 · 7일 ${signups7.toLocaleString()}명`}
              sparkline={mobile ? undefined : cumSignups}
            />
            <LStat
              label="활성화"
              title="문제를 하나라도 등록한 유저 (전 기간). 활성 = 활성화 ÷ 전체 가입자. 스파크라인은 집계 시작 이후 누적(이전 활성화분은 베이스라인)."
              value={activatedTotal.toLocaleString()}
              valueExtra={rateExtra('전환', rate(activatedTotal, users.length))}
              sub={`오늘 ${activatedToday.toLocaleString()}명 · 7일 ${activated7.toLocaleString()}명`}
              tone={users.length > 0 && activatedTotal / users.length >= 0.5 ? 'pos' : 'warn'}
              sparkline={mobile ? undefined : cumActivated}
            />
            {/* 구독을 접고 크레딧 팩으로 갔다(2026-08-24). 유료 사용자 = 플랜 보유자가 아니라
                실제로 팩을 산 사람이고, MRR이라는 숫자는 더 이상 존재하지 않는다. */}
            <LStat
              label="크레딧 구매자"
              title="'ReviewNotes Credits' 팩을 실제로 결제한 사람 (LemonSqueezy 주문, 이메일 기준). 전환 = 구매자 ÷ 활성화."
              value={sales ? sales.buyers.toLocaleString() : '—'}
              valueExtra={sales && sales.buyers > 0 ? rateExtra('전환', rate(sales.buyers, activatedTotal)) : undefined}
              sub={sales ? `구매 ${sales.paidOrders.toLocaleString()}건 · 이번 달 ${sales.monthOrders.toLocaleString()}건` : '결제 데이터 없음'}
              tone={sales && sales.buyers > 0 ? 'pos' : 'default'}
              sparkline={mobile ? undefined : cumBuyers}
            />
            <LStat
              label="결제"
              title="크레딧 팩 누적 매출(결제 완료분). 스토어는 Scripta와 공유하고 상품으로 가른다. 구독이 아니라 단건 결제라 MRR은 없다."
              value={sales ? formatCurrency(sales.revenueUsd) : '—'}
              valueExtra={sales && sales.paidOrders > 0 ? (
                <span style={{
                  fontSize: 'calc(9.5px * var(--fz, 1))', marginLeft: 5, fontWeight: 500,
                  fontFamily: t.font.mono, color: t.neutrals.subtle, fontVariantNumeric: 'tabular-nums' as const,
                }}>
                  {sales.paidOrders.toLocaleString()}건
                </span>
              ) : undefined}
              sub={sales ? `이번 달 ${formatCurrency(sales.monthRevenueUsd)}` : '누적 매출'}
              subExtra={sales && sales.refundedOrders > 0 ? (
                <span style={{ fontSize: 'calc(9.5px * var(--fz, 1))', color: t.neutrals.subtle, fontFamily: t.font.mono }}>
                  환불 {sales.refundedOrders.toLocaleString()}건
                </span>
              ) : undefined}
              tone="info"
              sparkline={mobile ? undefined : revenueSpark}
              sparkFormat={(v) => `$${v.toLocaleString()}`}
            />
          </div>
          {/* 유입 경로 / 국가 / 기기 — 보이스카드와 동일한 파이 + 탭 (2026-07-15 사용자 구성 파이는 제거).
              회원·유료 유입은 EventLog↔PageView 방문자 ID 조인의 first-touch 귀속이라 랜딩 미경유 유저는 빠짐. */}
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(3, minmax(0,1fr))', gap: 8 }}>
            {/* 회원/유료 귀속 탭은 데이터가 쌓이면 복원 — memberReferrers/paidReferrers가 RPC에 이미 있음.
                지금은 랜딩 경유 가입자가 1명뿐이라 전체(방문)만 의미 있음 (2026-07-15 CEO). */}
            <DistributionPie
              title="유입 경로"
              tabs={[
                { key: 'visit', label: '전체', data: trafficStats.topReferrers.map(r => ({ name: r.referrer === 'direct' ? '직접 유입' : r.referrer, value: r.count })) },
              ]}
              palette={['#6366f1', '#f97316', '#10b981', '#ec4899', '#8b5cf6', '#06b6d4', '#f59e0b', '#84cc16']}
              topN={4}
            />
            <DistributionPie
              title="국가"
              tabs={[
                { key: 'visit', label: '방문', data: trafficStats.topCountries.map(c => ({ name: formatCountryName(c.country), value: c.count })) },
                { key: 'member', label: '회원', data: trafficStats.memberCountries.map(c => ({ name: formatCountryName(c.country), value: c.count })) },
                { key: 'paid', label: '유료', data: trafficStats.paidCountries.map(c => ({ name: formatCountryName(c.country), value: c.count })) },
              ]}
              palette={['#6366f1', '#f97316', '#10b981', '#ec4899', '#8b5cf6', '#06b6d4', '#f59e0b', '#84cc16']}
              unit="명"
              topN={3}
            />
            {/* 기기 — 2026-07-15부터 수집. 그 전 방문(device null)은 제외하고 실측만 표시 —
                수집 전 데이터가 '미상 100%'로 파이를 무의미하게 만드는 것 방지. 새 방문부터 채워짐. */}
            <DistributionPie
              title="기기"
              tabs={[{
                key: 'all', label: '전체',
                data: trafficStats.devices
                  .filter(d => ['mobile', 'tablet', 'desktop'].includes(d.device))
                  .map(d => ({
                    name: d.device === 'mobile' ? '모바일' : d.device === 'tablet' ? '태블릿' : 'PC',
                    value: d.count,
                  })),
              }]}
              palette={['#3b82f6', '#8b5cf6', '#10b981']}
              unit="명"
            />
          </div>
          </div>
          {/* 일별 활동자 — 1열 모드는 우측 전체높이, 그 외(2열·모바일) 파이 아래 전체폭 (보이스카드와 동일 190) */}
          <div style={{ minWidth: 0, minHeight: splitLayout ? undefined : 190 }}>
            <RnDauTrendCard daily={trafficStats.dailyActive} />
          </div>
          </div>
            )
          })()}
        </div>
      )}
      </div>
    </LCard>

    {/* 카드2: 콘텐츠·학습 지표 */}
    <LCard pad={0}>
      {loading && (
        <div style={{ padding: `12px ${t.density.cardPad}px 12px` }}>
          <LSectionHead
            eyebrow="CONTENT"
            title="콘텐츠 사용량"
            mb={10}
            action={<LHeadBtn icon="refresh" title="데이터 새로고침" onClick={onRefresh} busy={refreshing} />}
          />
          <SkeletonRow count={mobile ? 2 : (dashCols === 2 ? 3 : 5)} />
        </div>
      )}
      {/* 콘텐츠·학습 카운트 — 결제 지표는 위 퍼널로 갔다 */}
      {!loading && userStats && (() => {
        // 오늘/7일 신규 — users[].createdAt(KST) 기준 파생. 통계는 관리자 제외 (2026-07-16 CEO)
        const realUsers = userStats.users.filter(u => !isExcludedReviewNotesUser(u))
        const toKst = (iso: string) => kstDateKey(iso) // UTC naive → KST 날짜키 (Z 명시 파싱)
        const todayKst = kstToday()
        const sevenAgoKst = kstDaysAgo(6) // 오늘 포함 7일
        const inToday = (u: typeof userStats.users[number]) => toKst(u.createdAt) === todayKst
        const in7 = (u: typeof userStats.users[number]) => toKst(u.createdAt) >= sevenAgoKst
        // 신규 가입자 업로드 용량
        const storageToday = realUsers.filter(inToday).reduce((s, u) => s + (u.storageUsed || 0), 0)
        const storage7 = realUsers.filter(in7).reduce((s, u) => s + (u.storageUsed || 0), 0)
        // 누적 스파크라인 — 트래픽 집계 시작(첫 PageView) 이후 윈도우, 이전분은 베이스라인 (인사이트와 동일 문법)
        const winDates = (trafficStats?.daily ?? []).map(d => d.date)
        const cumOf = (rows?: Array<{ date: string; n: number }>) => {
          if (!rows || winDates.length === 0) return undefined
          const byDay = new Map(rows.map(r => [r.date, r.n]))
          let run = rows.filter(r => r.date < winDates[0]).reduce((s, r) => s + r.n, 0)
          const spark = winDates.map(d => ({ date: d, value: (run += byDay.get(d) ?? 0) }))
          return spark.length > 1 ? spark : undefined
        }
        // 용량은 파일별 타임라인이 없어 가입일 기준 누적(그 시점까지 가입한 유저들의 현재 사용량 합) 프록시
        const storageCum = (() => {
          if (winDates.length === 0) return undefined
          const byDay = new Map<string, number>()
          let base = 0
          for (const u of realUsers) {
            const k = toKst(u.createdAt)
            const mb = (u.storageUsed || 0) / (1024 * 1024)
            if (k < winDates[0]) base += mb
            else byDay.set(k, (byDay.get(k) ?? 0) + mb)
          }
          let run = base
          const spark = winDates.map(d => ({ date: d, value: Math.round((run += byDay.get(d) ?? 0) * 10) / 10 }))
          return spark.length > 1 ? spark : undefined
        })()
        return (
          <div style={{ padding: `12px ${t.density.cardPad}px 12px` }}>
            <LSectionHead
              eyebrow="CONTENT"
              title="콘텐츠 사용량"
              mb={10}
              action={<LHeadBtn icon="refresh" title="데이터 새로고침" onClick={onRefresh} busy={refreshing} />}
            />
            {/* 콘텐츠·학습 카운트 (2026-07-16 CEO): 노트/문제/문제 세트/풀이/용량 5카드.
                와이드(1열) 모드 한 줄, 2열 모드 3+2, 모바일 2열. MRR·가입·유료는 인사이트 퍼널로 이동. */}
            <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : (dashCols === 2 ? 'repeat(3, 1fr)' : 'repeat(5, 1fr)'), gap: 8 }}>
              <LStat
                label="노트"
                value={(contentStats?.notes.total ?? 0).toLocaleString()}
                sub={contentStats ? `오늘 ${contentStats.notes.today}개 · 7일 ${contentStats.notes.d7}개` : undefined}
                sparkline={mobile ? undefined : cumOf(contentStats?.notes.daily)}
              />
              <LStat
                label="문제"
                value={(contentStats?.problems.total ?? 0).toLocaleString()}
                sub={contentStats ? `오늘 ${contentStats.problems.today}개 · 7일 ${contentStats.problems.d7}개` : undefined}
                sparkline={mobile ? undefined : cumOf(contentStats?.problems.daily)}
              />
              <LStat
                label="문제 세트"
                value={(contentStats?.problemSets.total ?? 0).toLocaleString()}
                sub={contentStats ? `오늘 ${contentStats.problemSets.today}개 · 7일 ${contentStats.problemSets.d7}개` : undefined}
                sparkline={mobile ? undefined : cumOf(contentStats?.problemSets.daily)}
              />
              <LStat
                label="문제 풀이"
                title="StudyResult 누적 — 문제를 실제로 풀어 제출한 횟수. 정답률 = 정답 ÷ 전체 풀이."
                value={(contentStats?.studyResults.total ?? 0).toLocaleString()}
                valueExtra={contentStats && contentStats.studyResults.total > 0 ? rateExtra('정답', rate(contentStats.studyResults.correct, contentStats.studyResults.total)) : undefined}
                sub={contentStats ? `오늘 ${contentStats.studyResults.today}회 · 7일 ${contentStats.studyResults.d7}회` : undefined}
                sparkline={mobile ? undefined : cumOf(contentStats?.studyResults.daily)}
              />
              {/* 학습 노트 카드는 제외 (2026-07-16 CEO) — 여섯 번째 자리는 비워둠, 데이터(studyNotes)는 RPC에 유지 */}
              <LStat
                label="용량"
                title="가입일 기준 누적 프록시 — 파일별 업로드 시점 데이터가 없어, 그 날짜까지 가입한 유저들의 현재 사용량 합으로 근사."
                value={`${(userStats.totalStorageUsed / (1024 * 1024)).toFixed(1)} MB`}
                sub={`오늘 ${formatBytes(storageToday)} · 7일 ${formatBytes(storage7)}`}
                sparkline={mobile ? undefined : storageCum}
                sparkFormat={(v) => `${v.toLocaleString()} MB`}
              />
            </div>
          </div>
        )
      })()}
    </LCard>
    </div>

    {/* 사용자 테이블 — 2열 모드에서 두 열을 모두 차지한다 (보이스카드 사용자 테이블과 동일).
        열이 많아 반 폭에서는 대부분이 가로 스크롤 뒤로 숨고, 옆에 짝지을 카드도 없다. */}
    <div style={{
      display: 'flex', flexDirection: 'column', gap: t.density.blockGap, minWidth: 0,
      ...(dashCols === 2 && !mobile ? { gridColumn: '1 / -1' } : null),
    }}>
    {/* 카드3: 사용자 테이블 */}
    <LCard pad={0}>
      {loading && (
        <div style={{ padding: `12px ${t.density.cardPad}px 12px` }}>
          <LSectionHead eyebrow="USERS" title="사용자" mb={8} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
              <div key={i} style={{ height: 40, borderRadius: t.radius.sm, background: t.neutrals.inner, animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))}
          </div>
        </div>
      )}
      {/* User list section */}
      {!loading && userStats && (
        <>
          {/* Recent users list */}
          <div style={{ padding: `12px ${t.density.cardPad}px 12px` }}>
            <LSectionHead
              eyebrow="USERS"
              title="사용자"
              meta={excludedCount > 0 ? `운영 계정 ${excludedCount}명은 통계에서 제외` : undefined}
              mb={8}
              tools={mobile ? (
                // 모바일은 헤더 클릭 정렬이 좁아서 안 되므로 드롭다운을 둔다.
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <select
                    value={userSort}
                    onChange={e => handleSortChange(e.target.value as UserSortKey)}
                    style={{
                      height: t.density.controlHSm, padding: '0 6px', borderRadius: t.radius.sm,
                      border: 'none', cursor: 'pointer',
                      fontSize: `calc(${t.type.control}px * var(--fz, 1))`, fontFamily: t.font.sans,
                      background: t.neutrals.inner, color: t.neutrals.text,
                    }}
                  >
                    {USER_COLUMNS.map(col => (
                      <option key={col.key} value={col.key}>{col.mobileLabel}</option>
                    ))}
                  </select>
                  <LHeadBtn
                    label={userSortDir === 'asc' ? '▲' : '▼'}
                    title="정렬 방향 전환"
                    onClick={() => handleSortChange(userSort)}
                  />
                </div>
              ) : undefined}
              action={<LHeadBtn icon="refresh" title="데이터 새로고침" onClick={onRefresh} busy={refreshing} />}
            />
            {/* PC/모바일 동일 테이블 — 모바일은 가로 스크롤 (보이스카드 사용자 테이블과 동일, 2026-07-15) */}
            <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: USER_TABLE_MIN_WIDTH, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* 테이블 헤더 — 클릭하여 정렬, 같은 컬럼 재클릭 시 방향 토글 */}
              <div style={{ display: 'grid', gridTemplateColumns: USER_TABLE_COLS, gap: 6, alignItems: 'center', padding: '0 8px 5px' }}>
                {USER_COLUMNS.map(col => {
                  const active = userSort === col.key
                  return (
                    <button
                      key={col.key}
                      onClick={() => handleSortChange(col.key)}
                      title={`${col.label} 기준 정렬`}
                      style={{
                        ...userHeadCell, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                        display: 'flex', alignItems: 'center', gap: 2, width: '100%',
                        justifyContent: col.align === 'right' ? 'flex-end' : col.align === 'center' ? 'center' : 'flex-start',
                        color: active ? t.neutrals.text : t.neutrals.subtle,
                      }}
                    >
                      {col.label}
                      <span style={{ fontSize: '0.85em', lineHeight: 1, opacity: active ? 1 : 0 }}>
                        {userSortDir === 'asc' ? '▲' : '▼'}
                      </span>
                    </button>
                  )
                })}
              </div>
              {paginatedUsers.map(user => {
                const isAdmin = user.role === 'ADMIN'
                const excluded = isExcludedReviewNotesUser(user)
                const balance = user.creditBalance ?? 0
                const spent = user.aiCreditsTotal ?? 0
                // 잔액이 20 아래로 떨어지면 주황 — 소진 임박(가입 지급 100의 20%)
                const lowCredits = balance > 0 && balance < 20
                const aiMonth = user.aiCallsMonth ?? 0
                const aiTotal = user.aiCallsTotal ?? 0
                const aiTitle = formatAiFeatureBreakdown(user.aiFeaturesMonth, user.aiFeaturesTotal)
                return (
                  <div key={user.id} style={{
                    display: 'grid', gridTemplateColumns: USER_TABLE_COLS, gap: 6, alignItems: 'center',
                    padding: '5px 8px', borderRadius: t.radius.sm, background: t.neutrals.inner,
                  }}>
                    {/* 가입 — 두 줄: 날짜 / (요일) 시각 (보이스카드와 동일) */}
                    <div style={{ ...userDateCell, display: 'flex', flexDirection: 'column', lineHeight: 1.2, textAlign: 'left' as const }}>
                      <span>{formatDateShort(user.createdAt)}</span>
                      <span style={{ fontSize: 'calc(8px * var(--fz, 1))', color: t.neutrals.subtle }}>({formatWeekdayShort(user.createdAt)}) {formatTimeShort(user.createdAt)}</span>
                    </div>
                    {/* 활동 — EventLog 마지막 활동 (트래킹 이전 활동은 — 표시) */}
                    <div style={{ ...userDateCell, display: 'flex', flexDirection: 'column', lineHeight: 1.2, textAlign: 'left' as const }}>
                      {user.lastActiveAt ? (
                        <>
                          <span>{formatDateShort(user.lastActiveAt)}</span>
                          <span style={{ fontSize: 'calc(8px * var(--fz, 1))', color: t.neutrals.subtle }}>({formatWeekdayShort(user.lastActiveAt)}) {formatTimeShort(user.lastActiveAt)}</span>
                        </>
                      ) : (
                        <span style={{ color: t.neutrals.subtle }}>—</span>
                      )}
                    </div>
                    {/* 닉네임 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: 22, flexShrink: 0,
                        background: t.brand[200], color: t.brand[800],
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 'calc(9px * var(--fz, 1))', fontWeight: 600, overflow: 'hidden',
                      }}>
                        {user.image
                          ? <img src={user.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : (user.name?.charAt(0) || user.email.charAt(0)).toUpperCase()
                        }
                      </div>
                      <span style={{
                        fontSize: 'calc(11px * var(--fz, 1))', fontWeight: 500,
                        color: user.name ? t.neutrals.text : t.neutrals.muted,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
                      }}>
                        {user.name || 'Unknown'}
                      </span>
                    </div>
                    {/* 이메일 */}
                    <div style={userTextCell} title={user.email}>{user.email}</div>
                    {/* 국가 — EventLog↔PageView first-touch IP 국가 (방문 이력 없으면 —) */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
                      {(() => {
                        const c = formatCountryBadge(user.country)
                        return c ? (
                          <span title={c.name} style={{
                            fontSize: 'calc(8.5px * var(--fz, 1))', fontFamily: t.font.mono, fontWeight: 600,
                            color: '#1E40AF', background: '#DBEAFE',
                            padding: '1px 4px', borderRadius: 3, lineHeight: 1.4, whiteSpace: 'nowrap',
                          }}>
                            {c.flag} {c.code}
                          </span>
                        ) : (
                          <span style={{ fontSize: 'calc(9.5px * var(--fz, 1))', color: t.neutrals.subtle, fontFamily: t.font.mono }}>—</span>
                        )
                      })()}
                    </div>
                    {/* 노트 / 문제 / 세트 / 풀이 — 누적 + 오늘 증가분 (보이스카드 문법) */}
                    <NumDeltaCell total={user.notes ?? 0} delta={user.notesToday ?? 0} />
                    <NumDeltaCell total={user.problems ?? 0} delta={user.problemsToday ?? 0} />
                    <NumDeltaCell total={user.problemSets ?? 0} delta={user.problemSetsToday ?? 0} />
                    <NumDeltaCell total={user.solves ?? 0} delta={user.solvesToday ?? 0} />
                    {/* 크레딧 잔액 — 가입 지급 100에서 쓴 만큼 줄고 팩을 사면 는다 */}
                    <div style={{ ...userNumCell, textAlign: 'center' as const, color: lowCredits ? t.accent.warn : t.neutrals.text }}>
                      {balance.toLocaleString()}
                    </div>
                    {/* 누적 사용 — AiUsage 원장 (2026-08-11 이전 호출은 없다) */}
                    <div style={{ ...userNumCell, textAlign: 'center' as const, color: spent > 0 ? t.neutrals.text : t.neutrals.subtle }}>
                      {spent.toLocaleString()}
                    </div>
                    {/* 권한 — 통계에서 빠지는 계정을 한눈에. PG Reviewer 는 role 이 USER 라
                        관리자 배지가 안 붙는데도 집계에서는 빠진다. 그 자리를 '제외'로 메운다. */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
                      {isAdmin || excluded ? (
                        <span
                          title={isAdmin ? '관리자 — 통계 제외' : '스토어 심사용 계정 — 통계 제외'}
                          style={{
                            fontSize: 'calc(8.5px * var(--fz, 1))', fontFamily: t.font.mono, fontWeight: 600,
                            padding: '1px 4px', borderRadius: 3, lineHeight: 1.4, textTransform: 'uppercase' as const,
                            background: tonePalettes.warn.bg, color: tonePalettes.warn.fg,
                          }}
                        >
                          {isAdmin ? 'Admin' : '제외'}
                        </span>
                      ) : (
                        <span style={{ fontSize: 'calc(9.5px * var(--fz, 1))', color: t.neutrals.subtle, fontFamily: t.font.mono }}>—</span>
                      )}
                    </div>
                    {/* AI — 이번 달 호출 수 / 누적, 툴팁에 기능별 내역 (AiUsage 원장) */}
                    <div
                      title={aiTitle}
                      style={{
                        ...userNumCell, textAlign: 'center' as const,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.15,
                      }}
                    >
                      <span style={{ color: aiMonth > 0 ? t.neutrals.text : t.neutrals.subtle }}>{aiMonth.toLocaleString()}</span>
                      {aiTotal > aiMonth && (
                        <span style={{ fontSize: 'calc(8px * var(--fz, 1))', color: t.neutrals.subtle }}>누적 {aiTotal.toLocaleString()}</span>
                      )}
                    </div>
                    {/* 용량 */}
                    <div style={{ ...userNumCell, textAlign: 'right' }}>{formatBytes(user.storageUsed || 0)}</div>
                  </div>
                )
              })}
            </div>
            </div>

            {/* 페이지네이션 (주식투자 페이지 섹션과 동일 스타일) */}
            {totalUsers > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 14px',
                borderTop: `1px solid ${t.neutrals.line}`,
              }}>
                {/* Page size input */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    value={userPerPageInput}
                    onChange={e => setUserPerPageInput(e.target.value.replace(/\D/g, ''))}
                    onBlur={commitUserPerPage}
                    onKeyDown={e => { if (e.key === 'Enter') commitUserPerPage() }}
                    style={{
                      width: 32, textAlign: 'center', border: 'none',
                      background: t.neutrals.inner, borderRadius: t.radius.sm,
                      fontSize: 'calc(11px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted,
                      padding: '2px 0', outline: 'none',
                    }}
                  />
                  <span style={{ fontSize: 'calc(10px * var(--fz, 1))', color: t.neutrals.subtle, fontFamily: t.font.sans }}>개씩</span>
                </div>

                {/* Page navigation */}
                {totalUserPages > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button disabled={safeUserPage === 1} onClick={() => setUserPage(p => Math.max(1, p - 1))}
                      style={{
                        background: 'transparent', border: 'none',
                        cursor: safeUserPage === 1 ? 'default' : 'pointer',
                        padding: 4, borderRadius: 4,
                        color: safeUserPage === 1 ? t.neutrals.line : t.neutrals.muted,
                        opacity: safeUserPage === 1 ? 0.4 : 1,
                      }}>
                      <LIcon name="chevronLeft" size={13} stroke={2} />
                    </button>
                    <span style={{
                      fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted,
                    }}>
                      {(safeUserPage - 1) * userPerPage + 1}-{Math.min(safeUserPage * userPerPage, totalUsers)} / {totalUsers}
                    </span>
                    <button disabled={safeUserPage >= totalUserPages} onClick={() => setUserPage(p => Math.min(totalUserPages, p + 1))}
                      style={{
                        background: 'transparent', border: 'none',
                        cursor: safeUserPage >= totalUserPages ? 'default' : 'pointer',
                        padding: 4, borderRadius: 4,
                        color: safeUserPage >= totalUserPages ? t.neutrals.line : t.neutrals.muted,
                        opacity: safeUserPage >= totalUserPages ? 0.4 : 1,
                      }}>
                      <LIcon name="chevronRight" size={13} stroke={2} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </LCard>
    </div>
    </>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// 가입자 카드 — 총원 + 오늘/7일 신규 + 플랜 분포 (LStat 스타일 매칭)


function SkeletonRow({ count }: { count: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${count}, 1fr)`, gap: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          height: t.density.statH, borderRadius: t.radius.sm, background: t.neutrals.inner,
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      ))}
    </div>
  )
}
