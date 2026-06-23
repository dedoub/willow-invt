'use client'

import { useState, useMemo, useEffect } from 'react'
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
  dailyCardInventory: Array<{
    date: string
    totalCards: number
  }>
  users: Array<{
    id: string
    nickname: string | null
    email: string | null
    appVersion: string | null
    platform: string | null
    locale: string | null
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

// 매출은 앱 DB 결제 이벤트의 정가(USD, 그로스) 합계 — 달러로 표시.
function formatCurrency(value: number): string {
  // 누적 매출은 소수점 이하 반올림(정수 달러)으로 표시
  return `$${Math.round(value).toLocaleString()}`
}

function formatNumber(value: number): string {
  return value.toLocaleString()
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

// 테이블 셀용 짧은 날짜 — 연월일 모두 표시 (YY.MM.DD)
function formatDateShort(dateString?: string | null): string {
  if (!dateString) return '—'
  const d = new Date(dateString)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${String(d.getFullYear()).slice(2)}.${p(d.getMonth() + 1)}.${p(d.getDate())}`
}

// 데스크톱 사용자 테이블 — 컬럼 정렬(헤더/행 공유). 컬럼: 닉네임·플랫폼·언어·상태·시트·카드·말하기·듣기·크레딧·가입·활동
// 닉네임 | 플랫폼 | 언어 | 구글연동 | 시트 | 카드 | 말하기 | 듣기 | 크레딧 | 가입 | 활동
const USER_TABLE_COLS = 'minmax(64px,1fr) 44px 44px 56px 36px 48px 52px 44px 52px 60px 60px'
const USER_TABLE_MIN_WIDTH = 616 // 좁은 카드 폭에서 컬럼이 뭉개지지 않도록 가로 스크롤 허용
const userHeadCell: React.CSSProperties = {
  fontSize: 'calc(9px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.subtle,
  letterSpacing: 0.3, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden',
}
const userNumCell: React.CSSProperties = {
  fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.text,
  fontVariantNumeric: 'tabular-nums', textAlign: 'center', whiteSpace: 'nowrap',
}
const userDateCell: React.CSSProperties = {
  fontSize: 'calc(9.5px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted,
  fontVariantNumeric: 'tabular-nums', textAlign: 'center', whiteSpace: 'nowrap',
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

type UserSortKey =
  | 'name' | 'platform' | 'language' | 'status'
  | 'sheets' | 'cards' | 'attempts' | 'listen' | 'credits'
  | 'created' | 'recent'
type SortDir = 'asc' | 'desc'

// 테이블 컬럼 정의 (헤더 라벨 + 정렬키 + 정렬, 모바일 드롭다운 라벨). 순서 = 그리드 순서.
const USER_COLUMNS: Array<{ key: UserSortKey; label: string; mobileLabel: string; align: 'left' | 'center' | 'right' }> = [
  { key: 'name',     label: '닉네임', mobileLabel: '닉네임',   align: 'left' },
  { key: 'platform', label: '플랫폼', mobileLabel: '플랫폼',   align: 'center' },
  { key: 'language', label: '언어',   mobileLabel: '언어',     align: 'center' },
  { key: 'status',   label: '구글연동', mobileLabel: '구글연동', align: 'center' },
  { key: 'sheets',   label: '시트',   mobileLabel: '시트',     align: 'center' },
  { key: 'cards',    label: '카드',   mobileLabel: '카드',     align: 'center' },
  { key: 'attempts', label: '말하기', mobileLabel: '말하기',   align: 'center' },
  { key: 'listen',   label: '듣기',   mobileLabel: '듣기',     align: 'center' },
  { key: 'credits',  label: '크레딧', mobileLabel: '크레딧',   align: 'center' },
  { key: 'created',  label: '가입',   mobileLabel: '가입일',   align: 'center' },
  { key: 'recent',   label: '활동',   mobileLabel: '활동일',   align: 'center' },
]

// 텍스트/문자열 정렬 컬럼은 오름차순이 기본, 숫자·날짜는 내림차순이 기본
const ASC_DEFAULT_KEYS = new Set<UserSortKey>(['name', 'platform', 'language', 'status'])
const defaultSortDir = (key: UserSortKey): SortDir => (ASC_DEFAULT_KEYS.has(key) ? 'asc' : 'desc')

const USER_SORT_STORAGE_KEY = 'voicecards.userSort'
const USER_SORT_KEY_SET = new Set<UserSortKey>(USER_COLUMNS.map(o => o.key))

// ─── Skeletons ────────────────────────────────────────────────────────────────

function SkelBar({ width, height = 12, style }: { width: number | string; height?: number; style?: React.CSSProperties }) {
  return <div className="l-skeleton" style={{ width, height, maxWidth: '100%', ...style }} />
}

function SkelStat({ compact }: { compact: boolean }) {
  return (
    <div style={{
      padding: '8px 10px', borderRadius: t.radius.sm, background: t.neutrals.inner,
      display: 'flex', flexDirection: 'column', gap: 6, minHeight: 78,
      minWidth: 0, overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <SkelBar width={60} height={9} style={{ marginBottom: 6 }} />
          <SkelBar width={80} height={18} />
        </div>
        {!compact && <SkelBar width={56} height={20} style={{ flexShrink: 0 }} />}
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
      padding: '8px 10px', borderRadius: t.radius.sm, background: t.neutrals.inner,
      display: 'flex', flexDirection: 'column', gap: 6, minHeight: 96,
      minWidth: 0, overflow: 'hidden',
    }}>
      <SkelBar width={70} height={10} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '6px 0' }}>
        <div className="l-skeleton" style={{ width: 80, height: 80, borderRadius: '50%', flexShrink: 0, maxWidth: '100%' }} />
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
  const [userSortDir, setUserSortDir] = useState<SortDir>('desc')
  const [userPage, setUserPage] = useState(1)
  const [userPerPage, setUserPerPage] = useState(10)
  const [userPerPageInput, setUserPerPageInput] = useState('10')

  const commitUserPerPage = () => {
    const n = Math.max(5, Math.min(100, Number(userPerPageInput) || 10))
    setUserPerPageInput(String(n))
    setUserPerPage(n)
    setUserPage(1)
  }

  // 마운트 시 localStorage에서 정렬 상태 복원 (SSR/CSR hydration 안전). 형식: "key:dir"
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
    // 동점 시 보조정렬(방향 무관): 최근 활동일 → 가입일 내림차순
    const recencyTiebreak = (a: U, b: U) => {
      const cmp = (b.lastActiveAt || '').localeCompare(a.lastActiveAt || '')
      return cmp !== 0 ? cmp : b.createdAt.localeCompare(a.createdAt)
    }
    const nameOf = (u: U) => (u.nickname || u.email || u.id || '').toLowerCase()
    const isIncomplete = (u: U) => (u.sheetCount === 0 && u.cards === 0 ? 1 : 0)

    // 컬럼별 1차 비교(항상 오름차순 기준). 방향은 아래에서 dirMul로 적용.
    const primary = (a: U, b: U): number => {
      switch (userSort) {
        case 'name':     return nameOf(a).localeCompare(nameOf(b), 'ko')
        case 'platform': return (a.platform || '').localeCompare(b.platform || '')
        case 'language': return (a.locale || '').localeCompare(b.locale || '')
        case 'status':   return isIncomplete(a) - isIncomplete(b)
        case 'sheets':   return a.sheetCount - b.sheetCount
        case 'cards':    return a.cards - b.cards
        case 'attempts': return a.attempts - b.attempts
        case 'listen':   return (a.creditsUsed ?? 0) - (b.creditsUsed ?? 0)
        case 'credits':  return a.credits - b.credits
        case 'recent':   return (a.lastActiveAt || '').localeCompare(b.lastActiveAt || '')
        case 'created':  return a.createdAt.localeCompare(b.createdAt)
        default:         return 0
      }
    }
    const dirMul = userSortDir === 'asc' ? 1 : -1
    arr.sort((a, b) => {
      const p = primary(a, b)
      if (p !== 0) return p * dirMul
      return recencyTiebreak(a, b)
    })
    return arr
  }, [userStats, userSort, userSortDir])

  const totalUserPages = Math.max(1, Math.ceil(sortedUsers.length / userPerPage))
  const safeUserPage = Math.min(userPage, totalUserPages)
  const paginatedUsers = sortedUsers.slice(
    (safeUserPage - 1) * userPerPage,
    safeUserPage * userPerPage
  )

  // 정렬 변경 + 1페이지로 리셋 + localStorage 저장.
  // 같은 컬럼 재클릭 시 방향 토글, 다른 컬럼 클릭 시 그 컬럼의 기본 방향.
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
          // 가입 미완료: 로그인했지만 시트 0 & 카드 0 (드라이브 공유 거부 등). 완료 = 전체 − 미완료
          const incompleteSignups = (userStats?.users ?? []).filter(u => u.sheetCount === 0 && u.cards === 0).length
          const signedUp = userStats.totalUsers - incompleteSignups
          const revenue = stats?.combined.totalRevenue ?? 0

          const learnConv = devices > 0 ? (learned / devices) * 100 : 0
          const signupConv = learned > 0 ? (signedUp / learned) * 100 : 0

          // 누적 trajectories
          const cumulative = anonymousStats.cumulativeDistinct ?? []
          const devicesData = cumulative.map(d => ({ date: d.date, value: d.devices }))
          const learnedData = cumulative.map(d => ({ date: d.date, value: d.learned }))

          const signupDates = (userStats?.users ?? [])
            .filter(u => !(u.sheetCount === 0 && u.cards === 0))
            .map(u => u.createdAt.split('T')[0])
            .sort()
          const allDates = cumulative.map(d => d.date)
          const signupData = allDates.map(date => ({
            date,
            value: signupDates.filter(d => d <= date).length,
          }))
          // 가입 미완료(시트 0 & 카드 0) 누적 추이 — 가입완료 스파크라인의 보조선
          const incompleteDates = (userStats?.users ?? [])
            .filter(u => u.sheetCount === 0 && u.cards === 0)
            .map(u => u.createdAt.split('T')[0])
            .sort()
          const incompleteData = allDates.map(date => ({
            date,
            value: incompleteDates.filter(d => d <= date).length,
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

          // 누적 매출 보조지표 — 오늘 / 최근 7일 (chartData 날짜는 UTC 기준)
          const revTodayKey = new Date().toISOString().slice(0, 10)
          const rev7AgoKey = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() - 6); return d.toISOString().slice(0, 10) })()
          const revenueToday = revenueByDate.get(revTodayKey) ?? 0
          const revenue7d = Array.from(revenueByDate.entries())
            .filter(([date]) => date >= rev7AgoKey)
            .reduce((sum, [, v]) => sum + v, 0)
          const fmtRev = (v: number) => v <= 0 ? '$0' : `$${Math.round(v).toLocaleString()}`

          // 누적 기기/데모 학습/가입 완료 — 오늘 / 최근 7일 신규 (날짜 UTC 기준, cumulativeDistinct 델타)
          const yesterdayKey = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10) })()
          const dayBefore7Key = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() - 7); return d.toISOString().slice(0, 10) })()
          const lastCum = cumulative.length ? cumulative[cumulative.length - 1] : null
          const cumValBefore = (
            date: string,
            pick: (r: { date: string; devices: number; learned: number; signin: number }) => number,
          ) => {
            let v = 0
            for (const d of cumulative) { if (d.date <= date) v = pick(d); else break }
            return v
          }
          const devToday = (lastCum?.devices ?? 0) - cumValBefore(yesterdayKey, r => r.devices)
          const dev7 = (lastCum?.devices ?? 0) - cumValBefore(dayBefore7Key, r => r.devices)
          const learnToday = (lastCum?.learned ?? 0) - cumValBefore(yesterdayKey, r => r.learned)
          const learn7 = (lastCum?.learned ?? 0) - cumValBefore(dayBefore7Key, r => r.learned)
          const signupToday = signupDates.filter(d => d === revTodayKey).length
          const signup7 = signupDates.filter(d => d >= rev7AgoKey).length

          return (
            <>
              <div style={{
                fontSize: 'calc(11px * var(--fz, 1))', fontWeight: 600, color: t.neutrals.subtle,
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
                  sub={`오늘 ${devToday.toLocaleString()}명 · 7일 ${dev7.toLocaleString()}명`}
                  tone="info"
                  sparkline={compact ? undefined : devicesData}
                />
                <LStat
                  label="데모 학습"
                  value={learned.toLocaleString()}
                  sub={`오늘 ${learnToday.toLocaleString()}명 · 7일 ${learn7.toLocaleString()}명`}
                  tone={devices > 0 && learnConv >= 40 ? 'pos' : 'warn'}
                  sparkline={compact ? undefined : learnedData}
                />
                <LStat
                  label="가입 완료"
                  value={signedUp.toLocaleString()}
                  sub={`오늘 ${signupToday.toLocaleString()}명 · 7일 ${signup7.toLocaleString()}명`}
                  tone={learned > 0 && signupConv >= 10 ? 'pos' : 'warn'}
                  sparkline={compact ? undefined : signupData}
                  sparkline2={compact ? undefined : incompleteData}
                />
                {revenueLoading && !stats ? (
                  <SkelStat compact={!!mobile} />
                ) : (
                  <LStat
                    label="누적 매출"
                    value={formatCurrency(revenue)}
                    sub={revenue > 0 ? `오늘 ${fmtRev(revenueToday)} · 7일 ${fmtRev(revenue7d)}` : '아직 없음'}
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
            fontSize: 'calc(11px * var(--fz, 1))', fontWeight: 600, color: t.neutrals.subtle,
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

            // 말하기 학습: time_series_analytics 일별 → running sum
            const activity = userStats.dailyLearnActivity ?? []
            let runningAttempts = 0
            const attemptTrajectory = activity.map(d => {
              runningAttempts += d.attempts
              return { date: d.date, value: runningAttempts }
            })
            const todayAttempts = activity.find(d => d.date === todayStr)?.attempts ?? 0
            const last7Attempts = activity.filter(d => d.date >= sevenDaysAgoStr).reduce((s, d) => s + d.attempts, 0)

            // 보유 카드: daily_inventory_snapshots 일별 스냅샷 → 일별 증감(diff)으로 추세 표시
            const inventory = userStats.dailyCardInventory ?? []
            const cardTrajectory = inventory.map(d => ({ date: d.date, value: d.totalCards }))
            // 일별 증감 = 오늘 스냅샷 - 어제 스냅샷
            const dateToCards = new Map(inventory.map(d => [d.date, d.totalCards]))
            const yesterdayStr = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return toKst(d) })()
            const todayCardsDelta = (dateToCards.get(todayStr) ?? 0) - (dateToCards.get(yesterdayStr) ?? 0)
            const sevenAgoCards = inventory.find(d => d.date <= sevenDaysAgoStr)?.totalCards
              ?? (inventory.length > 0 ? inventory[0].totalCards : 0)
            const last7CardsDelta = (dateToCards.get(todayStr) ?? userStats.totalCards) - sevenAgoCards

            return (
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 8 }}>
            <LStat
              label="보유 시트"
              value={formatNumber(userStats.totalSheets)}
              sub={`오늘 ${formatNumber(todaySheets)}개 · 7일 ${formatNumber(last7Sheets)}개`}
              sparkline={compact ? undefined : (sheetTrajectory.length > 1 ? sheetTrajectory : undefined)}
            />
            <LStat
              label="보유 카드"
              value={formatNumber(userStats.totalCards)}
              sub={inventory.length > 0 ? `오늘 ${formatNumber(todayCardsDelta)}개 · 7일 ${formatNumber(last7CardsDelta)}개` : undefined}
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
                  label="듣기 학습"
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
              fontSize: 'calc(11px * var(--fz, 1))', fontWeight: 600, color: t.neutrals.subtle,
              fontFamily: t.font.mono, letterSpacing: 0.3,
              textTransform: 'uppercase' as const,
              whiteSpace: 'nowrap' as const,
            }}>
              사용자{(() => {
                const n = userStats.users.filter(u => u.sheetCount === 0 && u.cards === 0).length
                return n > 0 ? ` · 미완료 ${n}` : ''
              })()}
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
            {paginatedUsers.map((user) => {
              const shortId = (user.id || '').replace(/-/g, '').slice(0, 4)
              const fallbackName = user.email || (shortId ? `#${shortId}` : 'Unknown')
              const initial = (user.nickname?.charAt(0) || user.email?.charAt(0) || shortId.charAt(0) || '?').toUpperCase()
              return (
              <div key={user.id} style={{
                padding: '6px 8px', borderRadius: t.radius.sm, background: t.neutrals.inner,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 26, flexShrink: 0,
                  background: t.brand[200], color: t.brand[800],
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 'calc(10px * var(--fz, 1))', fontWeight: 600,
                }}>
                  {initial}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6, minWidth: 0,
                  }}>
                    <span style={{
                      fontSize: 'calc(11px * var(--fz, 1))', fontWeight: 500,
                      color: user.nickname ? t.neutrals.text : t.neutrals.muted,
                      fontFamily: user.nickname ? t.font.sans : t.font.mono,
                      whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
                      minWidth: 0,
                    }}>
                      {user.nickname || fallbackName}
                    </span>
                    {user.appVersion && (
                      <span style={{
                        fontSize: 'calc(9px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted,
                        background: t.neutrals.card, padding: '1px 4px', borderRadius: 3,
                        flexShrink: 0, lineHeight: 1.4,
                      }}>
                        v{user.appVersion}
                      </span>
                    )}
                    {user.platform && (
                      <span style={{
                        fontSize: 'calc(9px * var(--fz, 1))', fontFamily: t.font.mono, fontWeight: 600,
                        color: user.platform === 'ios' ? '#0369A1' : user.platform === 'android' ? '#15803D' : t.neutrals.muted,
                        background: user.platform === 'ios' ? '#E0F2FE' : user.platform === 'android' ? '#DCFCE7' : t.neutrals.card,
                        padding: '1px 5px', borderRadius: 3,
                        flexShrink: 0, lineHeight: 1.4, textTransform: 'uppercase' as const,
                      }}>
                        {user.platform === 'ios' ? 'iOS' : user.platform === 'android' ? 'AND' : user.platform}
                      </span>
                    )}
                    {user.locale && (
                      <span style={{
                        fontSize: 'calc(9px * var(--fz, 1))', fontFamily: t.font.mono, fontWeight: 600,
                        color: '#6B21A8', background: '#F3E8FF',
                        padding: '1px 5px', borderRadius: 3,
                        flexShrink: 0, lineHeight: 1.4, textTransform: 'uppercase' as const,
                      }}>
                        {user.locale}
                      </span>
                    )}
                    {user.sheetCount === 0 && user.cards === 0 && (
                      <span style={{
                        fontSize: 'calc(9px * var(--fz, 1))', fontFamily: t.font.mono, fontWeight: 600,
                        color: '#92400E', background: '#FEF3C7',
                        padding: '1px 5px', borderRadius: 3,
                        flexShrink: 0, lineHeight: 1.4, whiteSpace: 'nowrap' as const,
                      }}>
                        가입 미완료
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontSize: 'calc(9.5px * var(--fz, 1))', color: t.neutrals.muted,
                    whiteSpace: mobile ? ('normal' as const) : ('nowrap' as const),
                    overflow: mobile ? 'visible' : 'hidden',
                    textOverflow: mobile ? 'clip' : 'ellipsis',
                    wordBreak: mobile ? ('keep-all' as const) : ('normal' as const),
                    lineHeight: 1.4,
                  }}>
                    시트 {user.sheetCount}개 · 카드 {formatNumber(user.cards)}개 · 말하기 {formatNumber(user.attempts)}회 · 듣기 {formatNumber(user.creditsUsed)}회 · 마지막 활동일 {user.lastActiveAt ? formatDate(user.lastActiveAt) : '—'} · 가입일 {formatDate(user.createdAt)}
                  </div>
                </div>

                <span style={{
                  fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted, flexShrink: 0,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {formatNumber(user.credits)} cr
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
            {paginatedUsers.map((user) => {
              const shortId = (user.id || '').replace(/-/g, '').slice(0, 4)
              const fallbackName = user.email || (shortId ? `#${shortId}` : 'Unknown')
              const initial = (user.nickname?.charAt(0) || user.email?.charAt(0) || shortId.charAt(0) || '?').toUpperCase()
              const incomplete = user.sheetCount === 0 && user.cards === 0
              const titleParts = [user.appVersion ? `v${user.appVersion}` : null, user.locale].filter(Boolean).join(' · ')
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
                      fontSize: 'calc(9px * var(--fz, 1))', fontWeight: 600,
                    }}>
                      {initial}
                    </div>
                    <span title={titleParts || undefined} style={{
                      fontSize: 'calc(11px * var(--fz, 1))', fontWeight: 500,
                      color: user.nickname ? t.neutrals.text : t.neutrals.muted,
                      fontFamily: user.nickname ? t.font.sans : t.font.mono,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
                    }}>
                      {user.nickname || fallbackName}
                    </span>
                  </div>
                  {/* 플랫폼 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
                    {user.platform ? (
                      <span style={{
                        fontSize: 'calc(8.5px * var(--fz, 1))', fontFamily: t.font.mono, fontWeight: 600,
                        color: user.platform === 'ios' ? '#0369A1' : user.platform === 'android' ? '#15803D' : t.neutrals.muted,
                        background: user.platform === 'ios' ? '#E0F2FE' : user.platform === 'android' ? '#DCFCE7' : t.neutrals.card,
                        padding: '1px 4px', borderRadius: 3, lineHeight: 1.4, textTransform: 'uppercase' as const,
                      }}>
                        {user.platform === 'ios' ? 'iOS' : user.platform === 'android' ? 'AND' : user.platform}
                      </span>
                    ) : (
                      <span style={{ fontSize: 'calc(9.5px * var(--fz, 1))', color: t.neutrals.subtle, fontFamily: t.font.mono }}>—</span>
                    )}
                  </div>
                  {/* 언어 (locale) */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
                    {user.locale ? (
                      <span style={{
                        fontSize: 'calc(8.5px * var(--fz, 1))', fontFamily: t.font.mono, fontWeight: 600,
                        color: '#6B21A8', background: '#F3E8FF',
                        padding: '1px 4px', borderRadius: 3, lineHeight: 1.4, textTransform: 'uppercase' as const,
                      }}>
                        {user.locale}
                      </span>
                    ) : (
                      <span style={{ fontSize: 'calc(9.5px * var(--fz, 1))', color: t.neutrals.subtle, fontFamily: t.font.mono }}>—</span>
                    )}
                  </div>
                  {/* 구글연동 (가입 완료 여부) */}
                  <div style={{
                    fontSize: 'calc(9.5px * var(--fz, 1))', fontFamily: t.font.sans, fontWeight: 500,
                    whiteSpace: 'nowrap', textAlign: 'center',
                    color: incomplete ? '#B45309' : t.neutrals.muted,
                  }}>
                    {incomplete ? '미완료' : '완료'}
                  </div>
                  <div style={userNumCell}>{user.sheetCount}</div>
                  <div style={userNumCell}>{formatNumber(user.cards)}</div>
                  <div style={userNumCell}>{formatNumber(user.attempts)}</div>
                  <div style={userNumCell}>{formatNumber(user.creditsUsed)}</div>
                  <div style={{ ...userNumCell, color: t.neutrals.muted }}>{formatNumber(user.credits)}</div>
                  <div style={userDateCell}>{formatDateShort(user.createdAt)}</div>
                  <div style={userDateCell}>{formatDateShort(user.lastActiveAt)}</div>
                </div>
              )
            })}
          </div>
          </div>
          )}

          {/* 페이지네이션 (주식투자 페이지 섹션과 동일 스타일) */}
          {sortedUsers.length > 0 && (
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
                    {(safeUserPage - 1) * userPerPage + 1}-{Math.min(safeUserPage * userPerPage, sortedUsers.length)} / {sortedUsers.length}
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
  const mobile = useIsMobile()
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
          fontSize: 'calc(9.5px * var(--fz, 1))', fontFamily: t.font.mono, letterSpacing: 0.8,
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
                  fontSize: 'calc(9px * var(--fz, 1))', fontWeight: 500, fontFamily: t.font.sans,
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
          fontSize: 'calc(10px * var(--fz, 1))', color: t.neutrals.subtle,
        }}>
          데이터 없음
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!mobile && (
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
                    contentStyle={{ fontSize: 'calc(11px * var(--fz, 1))', background: '#1E293B', border: 'none', borderRadius: 6, padding: '6px 10px' }}
                    itemStyle={{ color: '#F8FAFC' }}
                    labelStyle={{ color: '#F8FAFC' }}
                    formatter={(value: any, name: any) => [`${value}${unit ?? ''}`, String(name)]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
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
                    fontSize: 'calc(10px * var(--fz, 1))', color: t.neutrals.text,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    flex: 1, minWidth: 0,
                  }}>
                    {d.name}
                  </span>
                  <span style={{
                    fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted,
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

