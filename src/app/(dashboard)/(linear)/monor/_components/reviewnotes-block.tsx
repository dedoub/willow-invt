'use client'

import { useEffect, useMemo, useState } from 'react'
import { t, tonePalettes, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { useDashCols } from './cols-toggle'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { DistributionPie } from '@/app/(dashboard)/_components/distribution-pie'
import type { ReviewNotesStats } from '@/lib/lemonsqueezy'
import { isExcludedReviewNotesUser } from '@/lib/reviewnotes-supabase'
import type { ReviewNotesUserStats, ReviewNotesTrafficStats, ReviewNotesContentStats } from '@/lib/reviewnotes-supabase'
import { formatCountryName } from '@/lib/country-format'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReviewnotesBlockProps {
  loading: boolean
  stats: ReviewNotesStats | null
  userStats: ReviewNotesUserStats | null
  trafficStats: ReviewNotesTrafficStats | null
  contentStats: ReviewNotesContentStats | null
  onRefresh: () => void
  refreshing: boolean
  error: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(value / 100)
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: 'short', day: 'numeric',
  })
}

function formatPct(value: number): string {
  if (value === 0) return '±0%'
  return value > 0 ? `+${value}%` : `${value}%`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`
}

const PLAN_ORDER: Record<string, number> = {
  PRO: 4, STANDARD: 3, BASIC: 2, FREE: 1,
}

const PLAN_TONES: Record<string, { bg: string; fg: string }> = {
  FREE:     { bg: t.neutrals.inner, fg: t.neutrals.muted },
  BASIC:    tonePalettes.info,
  STANDARD: { bg: '#EDE9FE', fg: '#7C3AED' },
  PRO:      tonePalettes.pos,
}

function getTone(map: Record<string, { bg: string; fg: string }>, key: string) {
  return map[key] ?? tonePalettes.neutral
}

// ─── User table (VoiceCards 사용자 테이블과 동일 스타일) ─────────────────────────

// 테이블 셀용 짧은 날짜 — 연월일 모두 표시 (YY.MM.DD), KST 기준
function formatDateShort(dateString?: string | null): string {
  if (!dateString) return '—'
  const key = new Date(dateString).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }) // YYYY-MM-DD
  return `${key.slice(2, 4)}.${key.slice(5, 7)}.${key.slice(8, 10)}`
}

// 요일 (월)/(화)... + 시간 HH:mm — 보이스카드 사용자 테이블과 동일 (KST)
function formatWeekdayShort(dateString?: string | null): string {
  if (!dateString) return ''
  return new Date(dateString).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', weekday: 'short' })
}
function formatTimeShort(dateString?: string | null): string {
  if (!dateString) return ''
  return new Date(dateString).toLocaleTimeString('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })
}

type UserSortKey = 'created' | 'active' | 'name' | 'email' | 'notes' | 'problems' | 'sets' | 'solves' | 'plan' | 'role' | 'storage'
type SortDir = 'asc' | 'desc'

// 컬럼 정의 (헤더 라벨 + 정렬키 + 정렬, 모바일 드롭다운 라벨). 순서 = 그리드 순서.
// 보이스카드 사용자 테이블과 동일: 가입/활동 날짜가 맨 앞 (2026-07-15 CEO)
const USER_COLUMNS: Array<{ key: UserSortKey; label: string; mobileLabel: string; align: 'left' | 'center' | 'right' }> = [
  { key: 'created', label: '가입',   mobileLabel: '가입일', align: 'center' },
  { key: 'active',  label: '활동',   mobileLabel: '활동일', align: 'center' },
  { key: 'name',    label: '닉네임', mobileLabel: '닉네임', align: 'left' },
  { key: 'email',   label: '이메일', mobileLabel: '이메일', align: 'left' },
  { key: 'notes',    label: '노트',   mobileLabel: '노트',   align: 'center' },
  { key: 'problems', label: '문제',   mobileLabel: '문제',   align: 'center' },
  { key: 'sets',     label: '세트',   mobileLabel: '문제 세트', align: 'center' },
  { key: 'solves',   label: '풀이',   mobileLabel: '문제 풀이', align: 'center' },
  { key: 'plan',    label: '플랜',   mobileLabel: '플랜',   align: 'center' },
  { key: 'role',    label: '권한',   mobileLabel: '권한',   align: 'center' },
  { key: 'storage', label: '용량',   mobileLabel: '용량',   align: 'center' },
]

// 텍스트 컬럼은 오름차순이 기본, 그 외(플랜·권한·용량·날짜)는 내림차순이 기본
const ASC_DEFAULT_KEYS = new Set<UserSortKey>(['name', 'email'])
const defaultSortDir = (key: UserSortKey): SortDir => (ASC_DEFAULT_KEYS.has(key) ? 'asc' : 'desc')

const USER_SORT_STORAGE_KEY = 'reviewnotes.userSort'
const USER_SORT_KEY_SET = new Set<UserSortKey>(USER_COLUMNS.map(o => o.key))

const USER_TABLE_COLS = '64px 64px minmax(72px,1fr) minmax(84px,1.1fr) 40px 44px 40px 40px 60px 48px 58px'
const USER_TABLE_MIN_WIDTH = 690 // 좁은 카드 폭에서 컬럼이 뭉개지지 않도록 가로 스크롤 허용 (모바일 포함)
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

// 일별 활동자 차트 — 보이스카드 DauTrendCard 리뷰노트판. 회원(기존 가입자)/신규(그날 가입) 2계열 + 7일 이동평균.
// 리뷰노트는 로그인 후에만 활동이라 익명(비로그인) tier 없음. 관리자 제외는 RPC(rn_daily_active)에서.
const RN_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
function rnWithWeekday(d: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d} (${RN_WEEKDAYS[new Date(d + 'T00:00:00Z').getUTCDay()]})` : d
}
function RnDauTrendCard({ daily, days = 42 }: {
  daily: Array<{ date: string; active: number; newUsers: number; member: number }>
  days?: number
}) {
  const rows = (daily ?? []).slice(-days)
  const max = rows.reduce((m, r) => Math.max(m, r.active), 0)
  const latest = rows.length ? rows[rows.length - 1] : null
  const MEMBER = '#3b82f6'
  const NEW = '#8b5cf6'
  const MA_COLOR = '#f97316'
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const barPct = (v: number) => (max > 0 ? (v / max) * 100 : 0)
  const ma = rows.map((_, i) => {
    const win = rows.slice(Math.max(0, i - 6), i + 1)
    return win.reduce((sum, r) => sum + r.active, 0) / win.length
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
            const newH = barPct(r.newUsers)
            const memberH = barPct(r.member)
            const dim = hoverIdx !== null && hoverIdx !== i
            return (
              <div key={r.date}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(prev => (prev === i ? null : prev))}
                style={{ flex: 1, minWidth: 2, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', cursor: 'default' }}>
                {newH > 0 && <div style={{ height: `${newH}%`, background: NEW, borderRadius: '1px 1px 0 0', opacity: dim ? 0.4 : 1, transition: 'opacity 120ms ease' }} />}
                {memberH > 0 && <div style={{ height: `${memberH}%`, background: MEMBER, borderRadius: newH > 0 ? 0 : '1px 1px 0 0', opacity: dim ? 0.4 : 1, transition: 'opacity 120ms ease' }} />}
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
                bottom: `calc(${barPct(r.active).toFixed(1)}% + 8px)`, pointerEvents: 'none', zIndex: 10,
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
                <div style={{ opacity: 0.7, marginTop: 3 }}>총 {r.active} · 7일 평균 {Math.round(ma[hoverIdx] * 10) / 10}</div>
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
  loading, stats, userStats, trafficStats, contentStats,
  onRefresh, refreshing, error,
}: ReviewnotesBlockProps) {
  const mobile = useIsMobile()
  const dashCols = useDashCols()
  const [userPage, setUserPage] = useState(1)
  const [userPerPage, setUserPerPage] = useState(10)
  const [userPerPageInput, setUserPerPageInput] = useState('10')
  const [userSort, setUserSort] = useState<UserSortKey>('created')
  const [userSortDir, setUserSortDir] = useState<SortDir>('desc')

  const commitUserPerPage = () => {
    const n = Math.max(5, Math.min(100, Number(userPerPageInput) || 10))
    setUserPerPageInput(String(n))
    setUserPerPage(n)
    setUserPage(1)
  }

  // 마운트 시 localStorage에서 정렬 상태 복원. 형식: "key:dir"
  useEffect(() => {
    const stored = window.localStorage.getItem(USER_SORT_STORAGE_KEY)
    if (!stored) return
    const [key, dir] = stored.split(':')
    if (USER_SORT_KEY_SET.has(key as UserSortKey)) {
      setUserSort(key as UserSortKey)
      setUserSortDir(dir === 'asc' ? 'asc' : dir === 'desc' ? 'desc' : defaultSortDir(key as UserSortKey))
    }
  }, [])

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
        case 'plan':    return (PLAN_ORDER[a.subscriptionPlan] ?? 0) - (PLAN_ORDER[b.subscriptionPlan] ?? 0)
        case 'role':    return (a.role === 'ADMIN' ? 1 : 0) - (b.role === 'ADMIN' ? 1 : 0)
        case 'storage': return (a.storageUsed || 0) - (b.storageUsed || 0)
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

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 12 }}>
        <LSectionHead
          eyebrow="REVIEWNOTES"
          title="리뷰노트"
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <a
                href="https://app.lemonsqueezy.com/products"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  width: 28, height: 28, borderRadius: t.radius.sm,
                  background: t.neutrals.inner, border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: t.neutrals.muted, textDecoration: 'none',
                }}
              >
                <LIcon name="trending" size={13} stroke={1.8} />
              </a>
              <button
                onClick={onRefresh}
                disabled={refreshing}
                style={{
                  width: 28, height: 28, borderRadius: t.radius.sm,
                  background: t.neutrals.inner, border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: t.neutrals.muted, opacity: refreshing ? 0.5 : 1,
                }}
              >
                <LIcon name="refresh" size={13} stroke={1.8} />
              </button>
            </div>
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

        {loading && <SkeletonRow count={4} />}

      {/* 인사이트 — 랜딩 트래픽 → 가입 → 로그인 → 활동 → 유료 퍼널.
          보이스카드와 동일하게 헤더 컨테이너 안에 배치 — 두 블록의 인사이트 시작 높이 정렬 (2026-07-15 CEO) */}
      {!loading && trafficStats && (
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
          }}>
            <span style={{
              fontSize: 'calc(11px * var(--fz, 1))', fontWeight: 600, color: t.neutrals.subtle,
              fontFamily: t.font.mono, letterSpacing: 0.3, textTransform: 'uppercase' as const,
            }}>
              인사이트
            </span>
            <span style={{
              fontSize: 'calc(9px * var(--fz, 1))', padding: '2px 6px', borderRadius: t.radius.sm,
              background: t.neutrals.inner, color: t.neutrals.muted, fontWeight: 500,
            }}>
              {trafficStats.daily[0] ? `${trafficStats.daily[0].date.slice(2).replace(/-/g, '.')} 집계 시작 · 누적` : '누적'} · 봇 제외
            </span>
          </div>

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
            const kstKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
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
            // 유료 사용자 누적 — 전환 시점(구독 생성일, 수동 부여는 가입일 폴백) 기준, 활성화와 동일한 베이스라인 방식
            const paidTimeline = trafficStats.paidTimeline ?? []
            const paidByDay = new Map<string, number>()
            let paidBaseline = 0
            for (const p of paidTimeline) {
              const k = kstKey(p.paidAt)
              if (k < trackStartKey) paidBaseline++
              else paidByDay.set(k, (paidByDay.get(k) ?? 0) + 1)
            }
            let runPaid = paidBaseline
            const cumPaid = daily.map(d => ({ date: d.date, value: (runPaid += paidByDay.get(d.date) ?? 0) }))
            // MRR 스파크라인 — 일별 스냅샷(달러)을 윈도우 전체로 전개 (각 날짜 = 그날 이전 최신 스냅샷 값).
            // 스냅샷 이전 구간은 첫 스냅샷 값으로 채움 — 구독이 없던 기간이라 $0 채움은 실제와 일치.
            const mrrHist = trafficStats.mrrHistory ?? []
            const mrrSpark = mrrHist.length > 0
              ? daily.map(d => {
                  let v = mrrHist[0].mrr
                  for (const h of mrrHist) { if (h.date <= d.date) v = h.mrr; else break }
                  return { date: d.date, value: Math.round(v / 100) }
                })
              : []

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
            <LStat
              label="유료 사용자"
              title="현재 유료 플랜(BASIC/STANDARD/PRO) 사용자. 전환 = 유료 ÷ 활성화. 스파크라인은 전환 시점(구독 생성일, 수동 부여는 가입일) 누적."
              value={users.filter(u => u.subscriptionPlan !== 'FREE').length.toLocaleString()}
              valueExtra={rateExtra('전환', rate(users.filter(u => u.subscriptionPlan !== 'FREE').length, activatedTotal))}
              sub={userStats ? `B ${userStats.basicUsers} · S ${userStats.standardUsers} · P ${userStats.proUsers}` : undefined}
              tone={users.some(u => u.subscriptionPlan !== 'FREE') ? 'pos' : 'default'}
              sparkline={mobile ? undefined : cumPaid}
            />
            <LStat
              label="MRR"
              title="월간 반복 매출 (LemonSqueezy 활성 구독 기준). 스파크라인은 일별 MRR 스냅샷(2026-07-16부터 축적, 그 이전 무구독 구간은 $0)."
              value={stats ? formatCurrency(stats.mrr) : '—'}
              sub={stats ? `활성 구독 ${stats.activeSubscriptions}건` : '월간 반복 매출'}
              tone="info"
              sparkline={mobile ? undefined : (mrrSpark.length > 1 ? mrrSpark : undefined)}
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
          {/* 일별 활동자 — 1열 모드는 우측 전체높이, 그 외(2열·모바일) 파이 아래 전체폭 */}
          <div style={{ minWidth: 0, minHeight: splitLayout ? undefined : 150 }}>
            <RnDauTrendCard daily={trafficStats.dailyActive} />
          </div>
          </div>
            )
          })()}
        </div>
      )}
      </div>

      {/* 운영 지표 (임시 이름) — 매출 + 가입 통합 4카드, 옛 '인사이트' 섹션 (2026-07-15 아래로 이동) */}
      {!loading && stats && userStats && (() => {
        // 오늘/7일 신규 — users[].createdAt(KST) 기준 파생. 통계는 관리자 제외 (2026-07-16 CEO)
        const realUsers = userStats.users.filter(u => !isExcludedReviewNotesUser(u))
        const toKst = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
        const todayKst = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
        const sevenAgo = new Date(); sevenAgo.setDate(sevenAgo.getDate() - 6) // 오늘 포함 7일
        const sevenAgoKst = sevenAgo.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
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
            <div style={{
              fontSize: 'calc(11px * var(--fz, 1))', fontWeight: 600, color: t.neutrals.subtle,
              fontFamily: t.font.mono, letterSpacing: 0.3,
              textTransform: 'uppercase' as const, marginBottom: 10,
            }}>
              운영 지표
            </div>
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

      {/* User list section */}
      {!loading && userStats && (
        <>
          {/* Recent users list */}
          <div style={{ padding: `12px ${t.density.cardPad}px 12px` }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 6, marginBottom: 8, flexWrap: 'wrap',
            }}>
              <div style={{
                fontSize: 'calc(11px * var(--fz, 1))', fontWeight: 600, color: t.neutrals.subtle,
                fontFamily: t.font.mono, letterSpacing: 0.3,
                textTransform: 'uppercase' as const,
              }}>
                사용자
              </div>
              {/* 데스크톱은 테이블 헤더 클릭으로 정렬. 모바일은 헤더가 없어 드롭다운으로 정렬. */}
              {mobile && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <select
                    value={userSort}
                    onChange={e => handleSortChange(e.target.value as UserSortKey)}
                    style={{
                      padding: '3px 6px', borderRadius: t.radius.sm, border: 'none', cursor: 'pointer',
                      fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.sans,
                      background: t.neutrals.inner, color: t.neutrals.text,
                    }}
                  >
                    {USER_COLUMNS.map(col => (
                      <option key={col.key} value={col.key}>{col.mobileLabel}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleSortChange(userSort)}
                    title="정렬 방향 전환"
                    style={{
                      padding: '3px 7px', borderRadius: t.radius.sm, border: 'none', cursor: 'pointer',
                      fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono,
                      background: t.neutrals.inner, color: t.neutrals.muted,
                    }}
                  >
                    {userSortDir === 'asc' ? '▲' : '▼'}
                  </button>
                </div>
              )}
            </div>
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
                const planTone = getTone(PLAN_TONES, user.subscriptionPlan)
                const isAdmin = user.role === 'ADMIN'
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
                    {/* 노트 / 문제 / 세트 / 풀이 — 누적 + 오늘 증가분 (보이스카드 문법) */}
                    <NumDeltaCell total={user.notes ?? 0} delta={user.notesToday ?? 0} />
                    <NumDeltaCell total={user.problems ?? 0} delta={user.problemsToday ?? 0} />
                    <NumDeltaCell total={user.problemSets ?? 0} delta={user.problemSetsToday ?? 0} />
                    <NumDeltaCell total={user.solves ?? 0} delta={user.solvesToday ?? 0} />
                    {/* 플랜 */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
                      <span style={{
                        fontSize: 'calc(8.5px * var(--fz, 1))', fontFamily: t.font.mono, fontWeight: 600,
                        padding: '1px 4px', borderRadius: 3, lineHeight: 1.4,
                        background: planTone.bg, color: planTone.fg,
                      }}>
                        {user.subscriptionPlan}
                      </span>
                    </div>
                    {/* 권한 */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
                      {isAdmin ? (
                        <span style={{
                          fontSize: 'calc(8.5px * var(--fz, 1))', fontFamily: t.font.mono, fontWeight: 600,
                          padding: '1px 4px', borderRadius: 3, lineHeight: 1.4, textTransform: 'uppercase' as const,
                          background: tonePalettes.warn.bg, color: tonePalettes.warn.fg,
                        }}>
                          Admin
                        </span>
                      ) : (
                        <span style={{ fontSize: 'calc(9.5px * var(--fz, 1))', color: t.neutrals.subtle, fontFamily: t.font.mono }}>—</span>
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
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// 가입자 카드 — 총원 + 오늘/7일 신규 + 플랜 분포 (LStat 스타일 매칭)


function SkeletonRow({ count }: { count: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${count}, 1fr)`, gap: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          height: 52, borderRadius: t.radius.sm, background: t.neutrals.inner,
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      ))}
    </div>
  )
}
