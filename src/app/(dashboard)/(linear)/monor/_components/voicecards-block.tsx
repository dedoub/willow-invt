'use client'

import { useState, useMemo } from 'react'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserStats {
  totalUsers: number
  activeUsers: number
  totalSheets: number
  totalCards: number
  totalAttempts: number
  totalCredits: number
  dailyLearnActivity: Array<{
    date: string
    cardsLearned: number
    attempts: number
  }>
  users: Array<{
    id: string
    nickname: string | null
    appVersion: string | null
    credits: number
    creditsUsed: number
    sheetCount: number
    cards: number
    attempts: number
    createdAt: string
    lastActiveAt: string | null
  }>
}

interface CombinedStats {
  combined: {
    totalRevenue: number
    totalNewDownloads: number
  }
}

interface AnonymousEventStats {
  summary: {
    totalEvents: number
    totalDevices: number
    learnedDevices: number
    signinDevices: number
    learnConversionPct: number
    signinConversionPct: number
  }
  daily: Array<{
    date: string
    devices: number
    appOpened: number
    cardsLearned: number
    promptShown: number
    signinCompleted: number
  }>
  cumulativeDistinct: Array<{
    date: string
    devices: number
    learned: number
    signin: number
  }>
  dailyCreditUsage: Array<{
    date: string
    credits: number
  }>
  demoSheets: Array<{ sheetId: string; cards: number; devices: number }>
  platforms: Array<{ platform: string; devices: number; events: number }>
  locales: Array<{ locale: string; devices: number }>
  signinPlatforms: Array<{ platform: string; devices: number }>
  signinLocales: Array<{ locale: string; devices: number }>
}

export interface VoicecardsBlockProps {
  usersLoading: boolean
  eventsLoading: boolean
  revenueLoading: boolean
  stats: CombinedStats | null
  userStats: UserStats | null
  anonymousStats: AnonymousEventStats | null
  chartData?: Array<{ date: string; ios: number; android: number; total: number }>
  onOpenSettings: () => void
  onRefresh: () => void
  refreshing: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)}억원`
  if (value >= 10000) return `${(value / 10000).toFixed(0)}만원`
  return `${value.toLocaleString()}원`
}

function formatNumber(value: number): string {
  return value.toLocaleString()
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

const LOCALE_LABELS: Record<string, { flag: string; name: string }> = {
  ko: { flag: '🇰🇷', name: '한국어' },
  en: { flag: '🇺🇸', name: '영어' },
  zh: { flag: '🇨🇳', name: '중국어' },
  ja: { flag: '🇯🇵', name: '일본어' },
  de: { flag: '🇩🇪', name: '독일어' },
  es: { flag: '🇪🇸', name: '스페인어' },
  fr: { flag: '🇫🇷', name: '프랑스어' },
  it: { flag: '🇮🇹', name: '이탈리아어' },
  pt: { flag: '🇵🇹', name: '포르투갈어' },
  ru: { flag: '🇷🇺', name: '러시아어' },
  vi: { flag: '🇻🇳', name: '베트남어' },
  th: { flag: '🇹🇭', name: '태국어' },
  id: { flag: '🇮🇩', name: '인도네시아어' },
  hi: { flag: '🇮🇳', name: '힌디어' },
  ar: { flag: '🇸🇦', name: '아랍어' },
  tr: { flag: '🇹🇷', name: '터키어' },
  nl: { flag: '🇳🇱', name: '네덜란드어' },
  pl: { flag: '🇵🇱', name: '폴란드어' },
}

function formatLocale(locale: string): string {
  // 'en-US', 'zh-CN' 같은 BCP 47 코드도 지원
  const base = locale.split(/[-_]/)[0].toLowerCase()
  const entry = LOCALE_LABELS[base]
  return entry ? `${entry.flag} ${entry.name}` : locale
}

// ─── Component ────────────────────────────────────────────────────────────────

type UserSortKey = 'sheets' | 'cards' | 'attempts' | 'credits' | 'recent' | 'created'

const USER_SORT_OPTIONS: Array<{ key: UserSortKey; label: string }> = [
  { key: 'sheets',   label: '시트' },
  { key: 'cards',    label: '카드' },
  { key: 'attempts', label: '말하기' },
  { key: 'credits',  label: '프리미엄' },
  { key: 'recent',   label: '활동일' },
  { key: 'created',  label: '가입일' },
]

// ─── Skeletons ────────────────────────────────────────────────────────────────

function SkelBar({ width, height = 12, style }: { width: number | string; height?: number; style?: React.CSSProperties }) {
  return <div className="l-skeleton" style={{ width, height, ...style }} />
}

function SkelStat({ compact }: { compact: boolean }) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: t.radius.md, background: t.neutrals.inner,
      display: 'flex', flexDirection: 'column', gap: 6, minHeight: 78,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <SkelBar width={60} height={9} style={{ marginBottom: 6 }} />
          <SkelBar width={80} height={18} />
        </div>
        {!compact && <SkelBar width={56} height={20} />}
      </div>
      <SkelBar width="70%" height={9} />
    </div>
  )
}

function SkelSectionHeader({ width = 100 }: { width?: number }) {
  return <SkelBar width={width} height={11} style={{ marginBottom: 10 }} />
}

function SkelPie() {
  return (
    <div style={{
      padding: 12, borderRadius: t.radius.md, background: t.neutrals.inner,
      display: 'flex', flexDirection: 'column', gap: 10, minHeight: 160,
    }}>
      <SkelBar width={70} height={10} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
        <div className="l-skeleton" style={{ width: 90, height: 90, borderRadius: '50%' }} />
      </div>
    </div>
  )
}

function SkelUserRow() {
  return (
    <div style={{
      padding: '6px 8px', borderRadius: t.radius.sm, background: t.neutrals.inner,
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <div className="l-skeleton" style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <SkelBar width={120} height={10} style={{ marginBottom: 4 }} />
        <SkelBar width="80%" height={9} />
      </div>
      <SkelBar width={36} height={9} />
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function VoicecardsBlock({
  usersLoading, eventsLoading, revenueLoading,
  stats, userStats, anonymousStats, chartData,
  onOpenSettings, onRefresh, refreshing,
}: VoicecardsBlockProps) {
  const mobile = useIsMobile()
  // 매우 좁은 화면(모바일)에서만 sparkline 숨김. LStat이 sub를 자체 줄로 분리해서
  // 일반 PC 해상도에선 sparkline 들어갈 공간 있음.
  const compact = mobile
  const [userSort, setUserSort] = useState<UserSortKey>('created')
  const [userPage, setUserPage] = useState(1)
  const [userPerPage, setUserPerPage] = useState(10)

  const sortedUsers = useMemo(() => {
    if (!userStats) return []
    const arr = [...userStats.users]
    // 공통 tiebreaker: 최근 활동일 → 가입일
    const recencyTiebreak = (a: typeof arr[number], b: typeof arr[number]) => {
      const cmp = (b.lastActiveAt || '').localeCompare(a.lastActiveAt || '')
      return cmp !== 0 ? cmp : b.createdAt.localeCompare(a.createdAt)
    }
    // 크레딧 사용량 — 이벤트 기반 (추가 결제 영향 없음)
    const creditsUsed = (u: typeof arr[number]) => u.creditsUsed ?? 0

    switch (userSort) {
      case 'sheets':
        arr.sort((a, b) => (b.sheetCount - a.sheetCount) || recencyTiebreak(a, b))
        break
      case 'cards':
        arr.sort((a, b) => (b.cards - a.cards) || recencyTiebreak(a, b))
        break
      case 'attempts':
        arr.sort((a, b) => (b.attempts - a.attempts) || recencyTiebreak(a, b))
        break
      case 'credits':
        arr.sort((a, b) => (creditsUsed(b) - creditsUsed(a)) || recencyTiebreak(a, b))
        break
      case 'recent':
        arr.sort((a, b) => recencyTiebreak(a, b))
        break
      case 'created':
      default:
        arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    }
    return arr
  }, [userStats, userSort])

  const totalUserPages = Math.max(1, Math.ceil(sortedUsers.length / userPerPage))
  const safeUserPage = Math.min(userPage, totalUserPages)
  const paginatedUsers = sortedUsers.slice(
    (safeUserPage - 1) * userPerPage,
    safeUserPage * userPerPage
  )

  // 정렬 변경 시 1페이지로 리셋
  const handleSortChange = (key: UserSortKey) => {
    setUserSort(key)
    setUserPage(1)
  }

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 12 }}>
        <LSectionHead
          eyebrow="VOICECARDS"
          title="보이스카드"
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={onOpenSettings}
                style={{
                  width: 28, height: 28, borderRadius: t.radius.sm,
                  background: t.neutrals.inner, border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: t.neutrals.muted,
                }}
              >
                <LIcon name="settings" size={13} stroke={1.8} />
              </button>
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

        {/* 인사이트 — 사용자/이벤트/매출 모두 필요 */}
        {(usersLoading || eventsLoading || revenueLoading) && !(userStats && anonymousStats) && (
          <>
            <SkelSectionHeader width={80} />
            <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 8 }}>
              {[0, 1, 2, 3].map(i => <SkelStat key={i} compact={!!mobile} />)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
              <SkelPie />
              <SkelPie />
            </div>
          </>
        )}
        {userStats && anonymousStats && (() => {
          const devices = anonymousStats.summary.totalDevices
          const learned = anonymousStats.summary.learnedDevices
          const signedUp = userStats.totalUsers
          const revenue = stats?.combined.totalRevenue ?? 0

          const learnConv = devices > 0 ? (learned / devices) * 100 : 0
          const signupConv = learned > 0 ? (signedUp / learned) * 100 : 0
          const fmtPct = (v: number) => v >= 10 ? `${v.toFixed(0)}%` : `${v.toFixed(1)}%`

          // 누적 trajectories
          const cumulative = anonymousStats.cumulativeDistinct ?? []
          const devicesData = cumulative.map(d => ({ date: d.date, value: d.devices }))
          const learnedData = cumulative.map(d => ({ date: d.date, value: d.learned }))

          const signupDates = (userStats?.users ?? [])
            .map(u => u.createdAt.split('T')[0])
            .sort()
          const allDates = cumulative.map(d => d.date)
          const signupData = allDates.map(date => ({
            date,
            value: signupDates.filter(d => d <= date).length,
          }))

          // 매출 누적
          const revenueByDate = new Map<string, number>()
          for (const row of (chartData ?? [])) {
            revenueByDate.set(row.date, (revenueByDate.get(row.date) ?? 0) + row.total)
          }
          let runningRevenue = 0
          const cumulativeRevenueByDate = new Map<string, number>()
          for (const d of Array.from(revenueByDate.keys()).sort()) {
            runningRevenue += revenueByDate.get(d) ?? 0
            cumulativeRevenueByDate.set(d, runningRevenue)
          }
          const revenueData = allDates.map(date => {
            let total = 0
            for (const [revDate, val] of cumulativeRevenueByDate) {
              if (revDate <= date) total = val
            }
            return { date, value: total }
          })

          return (
            <>
              <div style={{
                fontSize: 11, fontWeight: 600, color: t.neutrals.subtle,
                fontFamily: t.font.mono, letterSpacing: 0.3,
                textTransform: 'uppercase' as const, marginBottom: 10,
                whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                인사이트
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 8 }}>
                <LStat
                  label="누적 기기"
                  value={devices.toLocaleString()}
                  sub="앱 오픈"
                  tone="info"
                  sparkline={compact ? undefined : devicesData}
                />
                <LStat
                  label="데모 학습"
                  value={learned.toLocaleString()}
                  sub={devices > 0 ? `${fmtPct(learnConv)} 전환 · 비로그인` : '비로그인'}
                  tone={devices > 0 && learnConv >= 40 ? 'pos' : 'warn'}
                  sparkline={compact ? undefined : learnedData}
                />
                <LStat
                  label="가입 완료"
                  value={signedUp.toLocaleString()}
                  sub={learned > 0 ? `${fmtPct(signupConv)} 전환 · 계정 생성` : '계정 생성'}
                  tone={learned > 0 && signupConv >= 10 ? 'pos' : 'warn'}
                  sparkline={compact ? undefined : signupData}
                />
                {revenueLoading && !stats ? (
                  <SkelStat compact={!!mobile} />
                ) : (
                  <LStat
                    label="누적 매출"
                    value={formatCurrency(revenue)}
                    sub={revenue > 0 ? '누적' : '아직 없음'}
                    tone={revenue > 0 ? 'pos' : 'default'}
                    sparkline={compact ? undefined : revenueData}
                    sparkFormat={formatCurrency}
                  />
                )}
              </div>

            {/* 플랫폼 / 언어 파이차트 (기기/가입 탭) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
              <DistributionPie
                title="플랫폼"
                tabs={[
                  {
                    key: 'devices',
                    label: '기기',
                    data: anonymousStats.platforms.map(p => ({
                      name: p.platform === 'ios' ? 'iOS' : p.platform === 'android' ? 'Android' : p.platform,
                      value: p.devices,
                    })),
                  },
                  {
                    key: 'signin',
                    label: '가입',
                    data: anonymousStats.signinPlatforms.map(p => ({
                      name: p.platform === 'ios' ? 'iOS' : p.platform === 'android' ? 'Android' : p.platform,
                      value: p.devices,
                    })),
                  },
                ]}
                palette={['#3b82f6', '#10b981', '#94a3b8']}
                unit="명"
              />
              <DistributionPie
                title="언어"
                tabs={[
                  {
                    key: 'devices',
                    label: '기기',
                    data: anonymousStats.locales.map(l => ({ name: formatLocale(l.locale), value: l.devices })),
                  },
                  {
                    key: 'signin',
                    label: '가입',
                    data: anonymousStats.signinLocales.map(l => ({ name: formatLocale(l.locale), value: l.devices })),
                  },
                ]}
                palette={['#6366f1', '#f97316', '#10b981', '#ec4899', '#8b5cf6', '#06b6d4', '#f59e0b', '#84cc16']}
                unit="명"
                topN={3}
              />
            </div>
            </>
          )
        })()}
      </div>

      {/* 가입 후 활동 · 매출 동인 — userStats 필요 (4번째 카드는 anonymousStats) */}
      {usersLoading && !userStats && (
        <div style={{ padding: `12px ${t.density.cardPad}px 12px` }}>
          <SkelSectionHeader width={140} />
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 8 }}>
            {[0, 1, 2, 3].map(i => <SkelStat key={i} compact={!!mobile} />)}
          </div>
        </div>
      )}
      {userStats && (
        <div style={{ padding: `12px ${t.density.cardPad}px 12px` }}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: t.neutrals.subtle,
            fontFamily: t.font.mono, letterSpacing: 0.3,
            textTransform: 'uppercase' as const, marginBottom: 10,
            whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            가입 후 활동 · 매출 동인
          </div>

          {(() => {
            // 날짜 기준 — KST 기준 오늘 / 최근 7일 컷오프 계산
            const toKst = (d: Date | string): string => {
              const date = typeof d === 'string' ? new Date(d) : d
              return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
            }
            const todayStr = toKst(new Date())
            const sevenDaysAgo = new Date()
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6) // 오늘 포함 7일
            const sevenDaysAgoStr = toKst(sevenDaysAgo)

            // 보유 시트: 사용자 createdAt 기준 sheetCount 누적 (createdAt → KST 날짜로 변환)
            const sortedUsersByDate = [...userStats.users].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
            let runningSheets = 0
            const sheetTrajectory = sortedUsersByDate.map(u => {
              runningSheets += u.sheetCount
              return { date: toKst(u.createdAt), value: runningSheets }
            })
            const todaySheets = sortedUsersByDate
              .filter(u => toKst(u.createdAt) === todayStr)
              .reduce((sum, u) => sum + u.sheetCount, 0)
            const last7Sheets = sortedUsersByDate
              .filter(u => toKst(u.createdAt) >= sevenDaysAgoStr)
              .reduce((sum, u) => sum + u.sheetCount, 0)

            // 학습 카드 / 학습 시도: time_series_analytics 일별 → running sum
            const activity = userStats.dailyLearnActivity ?? []
            let runningCards = 0
            const cardTrajectory = activity.map(d => {
              runningCards += d.cardsLearned
              return { date: d.date, value: runningCards }
            })
            let runningAttempts = 0
            const attemptTrajectory = activity.map(d => {
              runningAttempts += d.attempts
              return { date: d.date, value: runningAttempts }
            })
            const todayCards = activity.find(d => d.date === todayStr)?.cardsLearned ?? 0
            const last7Cards = activity.filter(d => d.date >= sevenDaysAgoStr).reduce((s, d) => s + d.cardsLearned, 0)
            const todayAttempts = activity.find(d => d.date === todayStr)?.attempts ?? 0
            const last7Attempts = activity.filter(d => d.date >= sevenDaysAgoStr).reduce((s, d) => s + d.attempts, 0)

            return (
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 8 }}>
            <LStat
              label="보유 시트"
              value={formatNumber(userStats.totalSheets)}
              sub={`오늘 ${formatNumber(todaySheets)}개 · 7일 ${formatNumber(last7Sheets)}개`}
              sparkline={compact ? undefined : (sheetTrajectory.length > 1 ? sheetTrajectory : undefined)}
            />
            <LStat
              label="학습 카드"
              value={formatNumber(userStats.totalCards)}
              sub={`오늘 ${formatNumber(todayCards)}개 · 7일 ${formatNumber(last7Cards)}개`}
              sparkline={compact ? undefined : (cardTrajectory.length > 1 ? cardTrajectory : undefined)}
            />
            <LStat
              label="말하기 학습"
              value={formatNumber(userStats.totalAttempts)}
              sub={`오늘 ${formatNumber(todayAttempts)}회 · 7일 ${formatNumber(last7Attempts)}회`}
              sparkline={compact ? undefined : (attemptTrajectory.length > 1 ? attemptTrajectory : undefined)}
            />
            {eventsLoading && !anonymousStats ? (
              <SkelStat compact={!!mobile} />
            ) : (() => {
              const usage = anonymousStats?.dailyCreditUsage ?? []
              const todayUsage = usage.length > 0 ? usage[usage.length - 1].credits : 0
              const last7Sum = usage.slice(-7).reduce((sum, d) => sum + d.credits, 0)
              const totalUsed = usage.reduce((sum, d) => sum + d.credits, 0)
              // 누적 sparkline
              let running = 0
              const sparkData = usage.map(d => {
                running += d.credits
                return { date: d.date, value: running }
              })
              return (
                <LStat
                  label="프리미엄 기능"
                  value={formatNumber(totalUsed)}
                  sub={`오늘 ${formatNumber(todayUsage)}회 · 7일 ${formatNumber(last7Sum)}회`}
                  sparkline={compact ? undefined : (sparkData.length > 1 ? sparkData : undefined)}
                />
              )
            })()}
          </div>
            )
          })()}
        </div>
      )}

      {/* 사용자 목록 (맨 아래) — userStats만 필요 */}
      {usersLoading && !userStats && (
        <div style={{ padding: `12px ${t.density.cardPad}px 12px` }}>
          <SkelSectionHeader width={50} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map(i => <SkelUserRow key={i} />)}
          </div>
        </div>
      )}
      {userStats && (
        <div style={{ padding: `12px ${t.density.cardPad}px 12px` }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 6, marginBottom: 8, flexWrap: 'wrap',
          }}>
            <div style={{
              fontSize: 11, fontWeight: 600, color: t.neutrals.subtle,
              fontFamily: t.font.mono, letterSpacing: 0.3,
              textTransform: 'uppercase' as const,
              whiteSpace: 'nowrap' as const,
            }}>
              사용자
            </div>
            <div style={{ display: 'flex', gap: 3 }}>
              {USER_SORT_OPTIONS.map(opt => {
                const active = userSort === opt.key
                return (
                  <button
                    key={opt.key}
                    onClick={() => handleSortChange(opt.key)}
                    style={{
                      padding: '3px 8px', borderRadius: t.radius.sm, border: 'none', cursor: 'pointer',
                      fontSize: 10, fontWeight: 500, fontFamily: t.font.sans,
                      background: active ? t.brand[500] : t.neutrals.inner,
                      color: active ? '#fff' : t.neutrals.muted,
                      transition: 'background 120ms ease, color 120ms ease',
                    }}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {paginatedUsers.map((user) => {
              const shortId = (user.id || '').replace(/-/g, '').slice(0, 4)
              const fallbackName = shortId ? `#${shortId}` : 'Unknown'
              const initial = (user.nickname?.charAt(0) || shortId.charAt(0) || '?').toUpperCase()
              return (
              <div key={user.id} style={{
                padding: '6px 8px', borderRadius: t.radius.sm, background: t.neutrals.inner,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 26, flexShrink: 0,
                  background: t.brand[200], color: t.brand[800],
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 600,
                }}>
                  {initial}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6, minWidth: 0,
                  }}>
                    <span style={{
                      fontSize: 11, fontWeight: 500,
                      color: user.nickname ? t.neutrals.text : t.neutrals.muted,
                      fontFamily: user.nickname ? t.font.sans : t.font.mono,
                      whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
                      minWidth: 0,
                    }}>
                      {user.nickname || fallbackName}
                    </span>
                    {user.appVersion && (
                      <span style={{
                        fontSize: 9, fontFamily: t.font.mono, color: t.neutrals.muted,
                        background: t.neutrals.card, padding: '1px 4px', borderRadius: 3,
                        flexShrink: 0, lineHeight: 1.4,
                      }}>
                        v{user.appVersion}
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontSize: 9.5, color: t.neutrals.muted,
                    whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    시트 {user.sheetCount}개 · 카드 {formatNumber(user.cards)}개 · 말하기 {formatNumber(user.attempts)}회 · 프리미엄 {formatNumber(user.creditsUsed)}회 · 마지막 활동일 {user.lastActiveAt ? formatDate(user.lastActiveAt) : '—'}
                  </div>
                </div>

                <span style={{
                  fontSize: 10, fontFamily: t.font.mono, color: t.neutrals.muted, flexShrink: 0,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {formatNumber(user.credits)} cr
                </span>
              </div>
              )
            })}
          </div>

          {/* 페이지네이션 */}
          {sortedUsers.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 6, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${t.neutrals.line}`,
              flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  fontSize: 10, color: t.neutrals.muted,
                  fontFamily: t.font.mono, fontVariantNumeric: 'tabular-nums',
                }}>
                  {sortedUsers.length}명 중 {(safeUserPage - 1) * userPerPage + 1}-{Math.min(safeUserPage * userPerPage, sortedUsers.length)}
                </span>
                <select
                  value={userPerPage}
                  onChange={(e) => {
                    setUserPerPage(Number(e.target.value))
                    setUserPage(1)
                  }}
                  style={{
                    fontSize: 10, fontFamily: t.font.sans,
                    background: t.neutrals.inner, color: t.neutrals.muted,
                    border: 'none', borderRadius: t.radius.sm,
                    padding: '3px 6px', cursor: 'pointer',
                  }}
                >
                  <option value={10}>10개</option>
                  <option value={25}>25개</option>
                  <option value={50}>50개</option>
                  <option value={100}>100개</option>
                </select>
              </div>
              {totalUserPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <PageNavButton onClick={() => setUserPage(Math.max(1, safeUserPage - 1))} disabled={safeUserPage === 1} icon="chevronLeft" />
                  <span style={{
                    fontSize: 10, fontFamily: t.font.mono, color: t.neutrals.text,
                    padding: '0 6px', fontVariantNumeric: 'tabular-nums',
                  }}>
                    {safeUserPage}/{totalUserPages}
                  </span>
                  <PageNavButton onClick={() => setUserPage(Math.min(totalUserPages, safeUserPage + 1))} disabled={safeUserPage === totalUserPages} icon="chevronRight" />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </LCard>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DistributionPie({
  title, tabs, palette, unit, topN,
}: {
  title: string
  tabs: Array<{ key: string; label: string; data: Array<{ name: string; value: number }> }>
  palette: string[]
  unit?: string
  topN?: number  // 상위 N개만 표시하고 나머지는 "기타"로 합침
}) {
  const [activeTab, setActiveTab] = useState(tabs[0].key)
  const current = tabs.find(t => t.key === activeTab) ?? tabs[0]
  const OTHER_LABEL = '기타'
  const OTHER_COLOR = '#94a3b8'

  // 상위 N개 + 나머지 "기타"로 집계
  const aggregateTopN = (rows: Array<{ name: string; value: number }>) => {
    if (!topN || rows.length <= topN) return rows
    const sorted = [...rows].sort((a, b) => b.value - a.value)
    const top = sorted.slice(0, topN)
    const rest = sorted.slice(topN)
    const otherValue = rest.reduce((sum, r) => sum + r.value, 0)
    return otherValue > 0 ? [...top, { name: OTHER_LABEL, value: otherValue }] : top
  }
  const data = aggregateTopN(current.data)
  const total = data.reduce((sum, d) => sum + d.value, 0)

  // Color mapping: 모든 탭의 상위 N개 카테고리에 일관된 색 할당, "기타"는 항상 회색
  const allTopNames = Array.from(new Set(
    tabs.flatMap(tb => aggregateTopN(tb.data).map(d => d.name)).filter(n => n !== OTHER_LABEL)
  ))
  const colorByName = new Map<string, string>(allTopNames.map((name, i) => [name, palette[i % palette.length]]))
  colorByName.set(OTHER_LABEL, OTHER_COLOR)

  return (
    <div style={{
      background: t.neutrals.inner, borderRadius: t.radius.sm,
      padding: '8px 10px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 4, marginBottom: 6,
      }}>
        <div style={{
          fontSize: 9.5, fontFamily: t.font.mono, letterSpacing: 0.8,
          textTransform: 'uppercase' as const, color: t.neutrals.subtle,
          whiteSpace: 'nowrap' as const,
        }}>
          {title}
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          {tabs.map(tb => {
            const active = activeTab === tb.key
            return (
              <button
                key={tb.key}
                onClick={() => setActiveTab(tb.key)}
                style={{
                  padding: '2px 7px', borderRadius: t.radius.sm, border: 'none', cursor: 'pointer',
                  fontSize: 9, fontWeight: 500, fontFamily: t.font.sans,
                  background: active ? t.brand[500] : 'transparent',
                  color: active ? '#fff' : t.neutrals.muted,
                  transition: 'background 120ms ease, color 120ms ease',
                }}
              >
                {tb.label}
              </button>
            )
          })}
        </div>
      </div>
      {data.length === 0 || total === 0 ? (
        <div style={{
          height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, color: t.neutrals.subtle,
        }}>
          데이터 없음
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 80, height: 80, flexShrink: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%" cy="50%"
                  innerRadius={20} outerRadius={36}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                >
                  {data.map((d, i) => (
                    <Cell key={i} fill={colorByName.get(d.name) ?? palette[i % palette.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ fontSize: 11, background: '#1E293B', border: 'none', borderRadius: 6, padding: '6px 10px' }}
                  itemStyle={{ color: '#F8FAFC' }}
                  labelStyle={{ color: '#F8FAFC' }}
                  formatter={(value: any, name: any) => [`${value}${unit ?? ''}`, String(name)]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
            {data.map(d => {
              const pct = total > 0 ? Math.round((d.value / total) * 100) : 0
              return (
                <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: 2,
                    background: colorByName.get(d.name) ?? t.neutrals.subtle, flexShrink: 0,
                  }} />
                  <span style={{
                    fontSize: 10, color: t.neutrals.text,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    flex: 1, minWidth: 0,
                  }}>
                    {d.name}
                  </span>
                  <span style={{
                    fontSize: 10, fontFamily: t.font.mono, color: t.neutrals.muted,
                    fontVariantNumeric: 'tabular-nums', flexShrink: 0,
                  }}>
                    {pct}%
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function PageNavButton({
  onClick, disabled, icon,
}: {
  onClick: () => void
  disabled: boolean
  icon: 'chevronLeft' | 'chevronRight'
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 22, height: 22, borderRadius: t.radius.sm, border: 'none',
        background: disabled ? 'transparent' : t.neutrals.inner,
        color: disabled ? t.neutrals.line : t.neutrals.muted,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 120ms ease',
      }}
    >
      <LIcon name={icon} size={12} stroke={2} />
    </button>
  )
}

