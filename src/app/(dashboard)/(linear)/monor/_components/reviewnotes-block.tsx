'use client'

import { useEffect, useMemo, useState } from 'react'
import { t, tonePalettes, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import type { ReviewNotesStats } from '@/lib/lemonsqueezy'
import type { ReviewNotesUserStats, ReviewNotesTrafficStats } from '@/lib/reviewnotes-supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReviewnotesBlockProps {
  loading: boolean
  stats: ReviewNotesStats | null
  userStats: ReviewNotesUserStats | null
  trafficStats: ReviewNotesTrafficStats | null
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
    year: 'numeric', month: 'short', day: 'numeric',
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

// 테이블 셀용 짧은 날짜 — 연월일 모두 표시 (YY.MM.DD)
function formatDateShort(dateString?: string | null): string {
  if (!dateString) return '—'
  const d = new Date(dateString)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${String(d.getFullYear()).slice(2)}.${p(d.getMonth() + 1)}.${p(d.getDate())}`
}

type UserSortKey = 'name' | 'email' | 'plan' | 'role' | 'storage' | 'created'
type SortDir = 'asc' | 'desc'

// 컬럼 정의 (헤더 라벨 + 정렬키 + 정렬, 모바일 드롭다운 라벨). 순서 = 그리드 순서.
const USER_COLUMNS: Array<{ key: UserSortKey; label: string; mobileLabel: string; align: 'left' | 'center' | 'right' }> = [
  { key: 'name',    label: '닉네임', mobileLabel: '닉네임', align: 'left' },
  { key: 'email',   label: '이메일', mobileLabel: '이메일', align: 'left' },
  { key: 'created', label: '가입',   mobileLabel: '가입일', align: 'center' },
  { key: 'plan',    label: '플랜',   mobileLabel: '플랜',   align: 'center' },
  { key: 'role',    label: '권한',   mobileLabel: '권한',   align: 'center' },
  { key: 'storage', label: '용량',   mobileLabel: '용량',   align: 'center' },
]

// 텍스트 컬럼은 오름차순이 기본, 그 외(플랜·권한·용량·날짜)는 내림차순이 기본
const ASC_DEFAULT_KEYS = new Set<UserSortKey>(['name', 'email'])
const defaultSortDir = (key: UserSortKey): SortDir => (ASC_DEFAULT_KEYS.has(key) ? 'asc' : 'desc')

const USER_SORT_STORAGE_KEY = 'reviewnotes.userSort'
const USER_SORT_KEY_SET = new Set<UserSortKey>(USER_COLUMNS.map(o => o.key))

const USER_TABLE_COLS = 'minmax(72px,1fr) minmax(84px,1.1fr) 52px 60px 48px 58px'
const USER_TABLE_MIN_WIDTH = 418 // 좁은 카드 폭에서 컬럼이 뭉개지지 않도록 가로 스크롤 허용
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

// ─── Component ────────────────────────────────────────────────────────────────

export function ReviewnotesBlock({
  loading, stats, userStats, trafficStats,
  onRefresh, refreshing, error,
}: ReviewnotesBlockProps) {
  const mobile = useIsMobile()
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
        case 'created': return a.createdAt.localeCompare(b.createdAt)
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

        {/* 인사이트 (매출 + 가입 통합, 4개 카드) */}
        {!loading && stats && userStats && (() => {
          // 오늘/7일 신규 — users[].createdAt(KST) 기준 파생
          const toKst = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
          const todayKst = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
          const sevenAgo = new Date(); sevenAgo.setDate(sevenAgo.getDate() - 6) // 오늘 포함 7일
          const sevenAgoKst = sevenAgo.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
          const inToday = (u: typeof userStats.users[number]) => toKst(u.createdAt) === todayKst
          const in7 = (u: typeof userStats.users[number]) => toKst(u.createdAt) >= sevenAgoKst
          // 신규 유료(non-FREE) 가입
          const paidToday = userStats.users.filter(u => inToday(u) && u.subscriptionPlan !== 'FREE').length
          const paid7 = userStats.users.filter(u => in7(u) && u.subscriptionPlan !== 'FREE').length
          // 신규 가입자 업로드 용량
          const storageToday = userStats.users.filter(inToday).reduce((s, u) => s + (u.storageUsed || 0), 0)
          const storage7 = userStats.users.filter(in7).reduce((s, u) => s + (u.storageUsed || 0), 0)
          return (
            <>
              <div style={{
                fontSize: 'calc(11px * var(--fz, 1))', fontWeight: 600, color: t.neutrals.subtle,
                fontFamily: t.font.mono, letterSpacing: 0.3,
                textTransform: 'uppercase' as const, marginBottom: 10,
              }}>
                인사이트
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 8 }}>
                <LStat
                  label="MRR"
                  value={formatCurrency(stats.mrr)}
                  sub="월간 반복 매출"
                  tone="info"
                />
                <LStat
                  label="활성 구독자"
                  value={String(stats.activeSubscriptions)}
                  sub={`오늘 ${paidToday}명 · 7일 ${paid7}명`}
                  tone="pos"
                />
                <SignupStat userStats={userStats} />
                <LStat
                  label="용량"
                  value={`${(userStats.totalStorageUsed / (1024 * 1024)).toFixed(1)} MB`}
                  sub={`오늘 ${formatBytes(storageToday)} · 7일 ${formatBytes(storage7)}`}
                />
              </div>
            </>
          )
        })()}
        {loading && <SkeletonRow count={4} />}
      </div>

      {/* 방문 통계 (랜딩페이지 트래픽) */}
      {!loading && trafficStats && (
        <div style={{ padding: `12px ${t.density.cardPad}px 12px` }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
          }}>
            <span style={{
              fontSize: 'calc(11px * var(--fz, 1))', fontWeight: 600, color: t.neutrals.subtle,
              fontFamily: t.font.mono, letterSpacing: 0.3, textTransform: 'uppercase' as const,
            }}>
              방문 통계
            </span>
            <span style={{
              fontSize: 'calc(9px * var(--fz, 1))', padding: '2px 6px', borderRadius: t.radius.sm,
              background: t.neutrals.inner, color: t.neutrals.muted, fontWeight: 500,
            }}>
              최근 {trafficStats.range}일 · 봇 제외
            </span>
          </div>

          {/* 방문 KPI + 일별 추이 스파크라인 */}
          {(() => {
            const daily = trafficStats.daily
            const last = daily.length ? daily[daily.length - 1] : null
            const todayViews = last?.views ?? 0
            const todayVisitors = last?.visitors ?? 0
            const last7Views = daily.slice(-7).reduce((s, d) => s + d.views, 0)
            const last7Visitors = daily.slice(-7).reduce((s, d) => s + d.visitors, 0)
            return (
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 8 }}>
            <LStat
              label="페이지뷰"
              value={trafficStats.totals.views.toLocaleString()}
              sub={`오늘 ${todayViews.toLocaleString()}회 · 7일 ${last7Views.toLocaleString()}회`}
              sparkline={trafficStats.daily.map(d => ({ date: d.date, value: d.views }))}
            />
            <LStat
              label="순 방문자"
              value={trafficStats.totals.visitors.toLocaleString()}
              sub={`오늘 ${todayVisitors.toLocaleString()}명 · 7일 ${last7Visitors.toLocaleString()}명`}
              tone="info"
              sparkline={trafficStats.daily.map(d => ({ date: d.date, value: d.visitors }))}
            />
            <BreakdownStat
              label="유입 경로"
              items={trafficStats.topReferrers.map(r => ({
                label: r.referrer === 'direct' ? '직접 유입' : r.referrer,
                count: r.count,
              }))}
            />
            <BreakdownStat
              label="국가"
              items={trafficStats.topCountries.map(c => ({
                label: c.country === 'Unknown' ? '알 수 없음' : c.country,
                count: c.count,
              }))}
            />
          </div>
            )
          })()}
        </div>
      )}

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
            {mobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {paginatedUsers.map(user => {
                const planTone = getTone(PLAN_TONES, user.subscriptionPlan)
                return (
                  <div key={user.id} style={{
                    padding: '6px 8px', borderRadius: t.radius.sm, background: t.neutrals.inner,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    {/* Avatar */}
                    <div style={{
                      width: 26, height: 26, borderRadius: 26, flexShrink: 0,
                      background: t.brand[200], color: t.brand[800],
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 'calc(10px * var(--fz, 1))', fontWeight: 600, overflow: 'hidden',
                    }}>
                      {user.image
                        ? <img src={user.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : (user.name?.charAt(0) || user.email.charAt(0)).toUpperCase()
                      }
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 'calc(11px * var(--fz, 1))', fontWeight: 500, color: t.neutrals.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {user.name || 'Unknown'}
                      </div>
                      <div style={{ fontSize: 'calc(9.5px * var(--fz, 1))', color: t.neutrals.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {user.email}
                      </div>
                    </div>

                    <span style={{
                      fontSize: 'calc(9.5px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted,
                      flexShrink: 0, fontVariantNumeric: 'tabular-nums',
                    }}>
                      {formatBytes(user.storageUsed || 0)}
                    </span>

                    <span style={{
                      fontSize: 'calc(9px * var(--fz, 1))', padding: '2px 6px', borderRadius: t.radius.sm,
                      background: planTone.bg, color: planTone.fg, fontWeight: 600, flexShrink: 0,
                    }}>
                      {user.subscriptionPlan}
                    </span>

                    {user.role === 'ADMIN' && (
                      <span style={{
                        fontSize: 'calc(9px * var(--fz, 1))', padding: '2px 6px', borderRadius: t.radius.sm,
                        background: tonePalettes.warn.bg, color: tonePalettes.warn.fg, fontWeight: 600, flexShrink: 0,
                      }}>
                        Admin
                      </span>
                    )}

                    <span style={{ fontSize: 'calc(9.5px * var(--fz, 1))', color: t.neutrals.muted, flexShrink: 0 }}>
                      {formatDate(user.createdAt)}
                    </span>
                  </div>
                )
              })}
            </div>
            ) : (
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
                    {/* 가입 */}
                    <div style={{ ...userDateCell, textAlign: 'center' }}>{formatDateShort(user.createdAt)}</div>
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
            )}

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
function SignupStat({ userStats }: { userStats: ReviewNotesUserStats }) {
  // 오늘/7일 신규 가입 — createdAt(KST 날짜) 기준
  const toKst = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
  const todayKst = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
  const sevenAgo = new Date(); sevenAgo.setDate(sevenAgo.getDate() - 6) // 오늘 포함 7일
  const sevenAgoKst = sevenAgo.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
  const todayCount = userStats.users.filter(u => toKst(u.createdAt) === todayKst).length
  const last7Count = userStats.users.filter(u => toKst(u.createdAt) >= sevenAgoKst).length
  return (
    <div style={{
      background: t.neutrals.inner, borderRadius: t.radius.sm, padding: '8px 10px', minWidth: 0,
    }}>
      <div style={{
        fontSize: 'calc(9.5px * var(--fz, 1))', fontFamily: t.font.mono, letterSpacing: 0.8,
        textTransform: 'uppercase' as const, color: t.neutrals.subtle, marginBottom: 2,
        whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
      }}>가입자</div>
      {/* 가입자 수 + 플랜 분포 배지 (바로 옆) */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 5 }}>
        <span style={{
          fontSize: 'calc(13px * var(--fz, 1))', fontWeight: 600, letterSpacing: -0.3,
          fontVariantNumeric: 'tabular-nums' as const, color: t.neutrals.text,
        }}>{userStats.totalUsers}</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {[
            { plan: 'FREE', count: userStats.freeUsers },
            { plan: 'BASIC', count: userStats.basicUsers },
            { plan: 'STANDARD', count: userStats.standardUsers },
            { plan: 'PRO', count: userStats.proUsers },
          ].filter(p => p.count > 0).map(p => {
            const tone = getTone(PLAN_TONES, p.plan)
            return (
              <span key={p.plan} style={{
                fontSize: 'calc(8.5px * var(--fz, 1))', fontFamily: t.font.mono, fontWeight: 600,
                padding: '1px 4px', borderRadius: 3, lineHeight: 1.4,
                background: tone.bg, color: tone.fg,
              }}>
                {p.plan} {p.count}
              </span>
            )
          })}
        </div>
      </div>
      <div style={{
        fontSize: 'calc(9.5px * var(--fz, 1))', color: t.neutrals.muted, marginTop: 4,
        whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
      }}>오늘 {todayCount}명 · 7일 {last7Count}명</div>
    </div>
  )
}

function BreakdownStat({ label, items }: { label: string; items: Array<{ label: string; count: number }> }) {
  return (
    <div style={{
      background: t.neutrals.inner, borderRadius: t.radius.sm, padding: '8px 10px',
      minWidth: 0,
    }}>
      <div style={{
        fontSize: 'calc(9.5px * var(--fz, 1))', fontFamily: t.font.mono, letterSpacing: 0.8,
        textTransform: 'uppercase' as const, color: t.neutrals.subtle, marginBottom: 4,
      }}>{label}</div>
      {items.length === 0 ? (
        <div style={{ fontSize: 'calc(10px * var(--fz, 1))', color: t.neutrals.muted }}>-</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {items.slice(0, 3).map(item => (
            <div key={item.label} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
            }}>
              <span style={{
                fontSize: 'calc(10px * var(--fz, 1))', color: t.neutrals.text,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{item.label}</span>
              <span style={{
                fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted,
                fontVariantNumeric: 'tabular-nums', flexShrink: 0,
              }}>{item.count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

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
