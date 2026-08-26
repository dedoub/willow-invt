'use client'

import { useMemo, useState } from 'react'
import { t, tonePalettes, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead, LHeadBtn } from '@/app/(dashboard)/_components/linear-section-head'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { DistributionPie } from '@/app/(dashboard)/_components/distribution-pie'
import { kstDateKey, kstToday, kstDaysAgo, kstWeekday, kstTime } from '@/lib/kst'
import {
  SC_LEVEL_LABELS, SC_CREDIT_REASON_LABELS, SC_LANGUAGE_LABELS, isExcludedScriptaUser,
} from '@/lib/scripta-types'
import type { ScriptaStats, ScriptaUser, ScMetric } from '@/lib/scripta-types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScriptaBlockProps {
  loading: boolean
  stats: ScriptaStats | null
  users: ScriptaUser[]
  onRefresh: () => void
  refreshing: boolean
  error: string | null
  cols: 1 | 2 // 레이아웃 열 수 (1=wide). 단일 앱 페이지는 1 고정.
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// 테이블 셀용 짧은 날짜 — 연월일 모두 표시 (YY.MM.DD), KST 기준
function formatDateShort(dateString?: string | null): string {
  if (!dateString) return '—'
  const key = kstDateKey(dateString) // YYYY-MM-DD
  return `${key.slice(2, 4)}.${key.slice(5, 7)}.${key.slice(8, 10)}`
}
function formatWeekdayShort(dateString?: string | null): string {
  return kstWeekday(dateString)
}
function formatTimeShort(dateString?: string | null): string {
  return kstTime(dateString)
}

// 전환율 계산 + 값 뒤 주황 보조라벨 (리뷰노트·보이스카드 퍼널 문법)
const rate = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0)
const rateExtra = (label: string, pct: number) => (
  <span style={{
    fontSize: 'calc(9.5px * var(--fz, 1))', marginLeft: 5, fontWeight: 500,
    color: t.accent.warn, fontVariantNumeric: 'tabular-nums' as const,
  }}>
    {label} {pct}%
  </span>
)

// 집계 윈도우 — 데이터가 처음 생긴 날부터 오늘까지 연속 KST 날짜. 스파크라인이 모두 같은 축을 쓴다.
function buildWindow(stats: ScriptaStats): string[] {
  const series: Array<Array<{ date: string }>> = [
    stats.users.daily, stats.attempts.daily, stats.aiGrades.daily, stats.credits.dailySpent,
    stats.content.cortices.daily, stats.content.texts.daily,
    stats.content.paragraphs.daily, stats.content.sentences.daily, stats.content.chunks.daily,
  ]
  const firsts = series.map(s => s[0]?.date).filter(Boolean) as string[]
  const today = kstToday()
  if (firsts.length === 0) return [today]
  const start = firsts.sort()[0]
  const out: string[] = []
  for (let d = new Date(`${start}T00:00:00+09:00`); ; d.setDate(d.getDate() + 1)) {
    const key = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
    out.push(key)
    if (key >= today) break
  }
  return out
}

// 일별 값 → 윈도우 위 누적 시리즈. 일별은 노이즈 스파이크라 누적 기울기로 추세를 읽는다(끝점 = 헤드라인).
function cumOf(rows: Array<{ date: string; n: number }> | undefined, win: string[]) {
  if (!rows || win.length === 0) return undefined
  const byDay = new Map(rows.map(r => [r.date, r.n]))
  let run = rows.filter(r => r.date < win[0]).reduce((s, r) => s + r.n, 0)
  const spark = win.map(d => ({ date: d, value: (run += byDay.get(d) ?? 0) }))
  return spark.length > 1 ? spark : undefined
}

// 시각 목록(활성화·연습 시작) → 일별 건수. 퍼널 카드의 오늘/7일·누적 스파크라인 공용.
function toDaily(items: Array<{ at: string }>): Array<{ date: string; n: number }> {
  const byDay = new Map<string, number>()
  for (const it of items) {
    const k = kstDateKey(it.at)
    byDay.set(k, (byDay.get(k) ?? 0) + 1)
  }
  return Array.from(byDay.entries()).map(([date, n]) => ({ date, n })).sort((a, b) => a.date.localeCompare(b.date))
}

function countOn(rows: Array<{ date: string; n: number }>, day: string): number {
  return rows.filter(r => r.date === day).reduce((s, r) => s + r.n, 0)
}
function countSince(rows: Array<{ date: string; n: number }>, day: string): number {
  return rows.filter(r => r.date >= day).reduce((s, r) => s + r.n, 0)
}

// ─── 일별 활동자 (리뷰노트 RnDauTrendCard의 Scripta판) ──────────────────────────
// 활동 = 글 등록·연습·크레딧 사용. Scripta는 비로그인 트래킹이 없어 회원/신규 2계열이다.
const SC_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
function scWithWeekday(d: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d} (${SC_WEEKDAYS[new Date(d + 'T00:00:00Z').getUTCDay()]})` : d
}
function ScDauTrendCard({ daily, days = 42 }: {
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
                <div style={{ opacity: 0.7, marginBottom: 3 }}>{scWithWeekday(r.date)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 1, background: MEMBER }} />회원 {r.member}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 1, background: NEW }} />신규 {r.newUsers}
                </div>
                <div style={{ opacity: 0.7, marginTop: 3 }}>활동 {r.active}명 · 7일 평균 {Math.round(ma[hoverIdx] * 10) / 10}</div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

// ─── User table (리뷰노트 사용자 테이블과 동일 스타일) ───────────────────────────

type UserSortKey = 'created' | 'active' | 'name' | 'email' | 'cortices' | 'texts' | 'sentences'
  | 'attempts' | 'score' | 'balance' | 'spent' | 'ai'

type SortDir = 'asc' | 'desc'

const USER_COLUMNS: Array<{ key: UserSortKey; label: string; mobileLabel: string; align: 'left' | 'center' | 'right' }> = [
  { key: 'created',   label: '가입',   mobileLabel: '가입일',   align: 'center' },
  { key: 'active',    label: '활동',   mobileLabel: '활동일',   align: 'center' },
  { key: 'name',      label: '닉네임', mobileLabel: '닉네임',   align: 'left' },
  { key: 'email',     label: '이메일', mobileLabel: '이메일',   align: 'left' },
  { key: 'cortices',  label: '코텍스', mobileLabel: '코텍스',   align: 'center' },
  { key: 'texts',     label: '글',     mobileLabel: '등록한 글', align: 'center' },
  { key: 'sentences', label: '문장',   mobileLabel: '문장',     align: 'center' },
  { key: 'attempts',  label: '연습',   mobileLabel: '연습 시도', align: 'center' },
  { key: 'score',     label: '평균',   mobileLabel: '평균 점수', align: 'center' },
  { key: 'balance',   label: '잔액',   mobileLabel: '크레딧 잔액', align: 'center' },
  { key: 'spent',     label: '사용',   mobileLabel: '크레딧 사용', align: 'center' },
  { key: 'ai',        label: 'AI',     mobileLabel: 'AI 채점',  align: 'center' },
]

// 텍스트 컬럼은 오름차순이 기본, 그 외(수치·날짜)는 내림차순이 기본
const ASC_DEFAULT_KEYS = new Set<UserSortKey>(['name', 'email'])
const defaultSortDir = (key: UserSortKey): SortDir => (ASC_DEFAULT_KEYS.has(key) ? 'asc' : 'desc')

const USER_SORT_STORAGE_KEY = 'scripta.userSort'
const USER_SORT_KEY_SET = new Set<UserSortKey>(USER_COLUMNS.map(o => o.key))

const USER_TABLE_COLS = '64px 64px minmax(72px,1fr) minmax(84px,1.1fr) 48px 44px 52px 48px 48px 56px 48px 40px'
// 컬럼 폭 합(668) + gap 6px×11(66) + 좌우 패딩(16). 이 아래로는 가로 스크롤이 걸린다.
const USER_TABLE_MIN_WIDTH = 750
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

// 총값 + 오늘 변동 2줄 셀 — 리뷰노트 NumDeltaCell과 동일 문법
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

const NumCell = ({ value, muted }: { value: number; muted?: boolean }) => (
  <div style={{ ...userNumCell, textAlign: 'center' as const, color: muted ? t.neutrals.subtle : t.neutrals.text }}>
    {value.toLocaleString()}
  </div>
)

// ─── Component ────────────────────────────────────────────────────────────────

export function ScriptaBlock({
  loading, stats, users, onRefresh, refreshing, error, cols,
}: ScriptaBlockProps) {
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
    const arr = [...users]
    type U = ScriptaUser
    const nameOf = (u: U) => (u.name || u.email || '').toLowerCase()
    // 컬럼별 1차 비교(항상 오름차순 기준). 방향은 dirMul로 적용.
    const primary = (a: U, b: U): number => {
      switch (userSort) {
        case 'name':      return nameOf(a).localeCompare(nameOf(b), 'ko')
        case 'email':     return a.email.localeCompare(b.email)
        case 'cortices':  return a.cortices - b.cortices
        case 'texts':     return a.texts - b.texts
        case 'sentences': return a.sentences - b.sentences
        case 'attempts':  return a.attempts - b.attempts
        case 'score':     return a.avgScore - b.avgScore
        case 'balance':   return a.balance - b.balance
        case 'spent':     return a.spent - b.spent
        case 'ai':        return a.aiCalls - b.aiCalls
        case 'created':   return a.createdAt.localeCompare(b.createdAt)
        // 활동 기록 없는 유저(null)는 항상 뒤로
        case 'active':    return (a.lastActivity ?? '').localeCompare(b.lastActivity ?? '')
        default:          return 0
      }
    }
    const dirMul = userSortDir === 'asc' ? 1 : -1
    arr.sort((a, b) => {
      const p = primary(a, b)
      if (p !== 0) return p * dirMul
      return b.createdAt.localeCompare(a.createdAt) // 동점 보조정렬: 최신 가입 우선 (방향 무관)
    })
    return arr
  }, [users, userSort, userSortDir])

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

  const splitLayout = !mobile && dashCols === 1

  // 그리드는 페이지가 갖는다. 여기서는 조각 두 개(퍼널열 · 사용자)만 내놓고, 페이지 그리드가
  // DOM 순서대로 두 열에 채운다. 리뷰노트 블록과 같은 규칙이다.
  return (
    <>
    {/* 퍼널 · 콘텐츠 — 두 섹션이 한 열로 붙어 다닌다 */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.blockGap, minWidth: 0 }}>
    {/* 카드1: 퍼널 + 인사이트 */}
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 12 }}>
        <LSectionHead
          eyebrow="FUNNEL"
          title="가입 → 글 등록 → 연습 → 결제"
          note={stats?.users.daily[0]
            ? `${stats.users.daily[0].date.slice(2).replace(/-/g, '.')} 집계 시작 · 누적`
            : undefined}
          action={
            <>
              <LHeadBtn icon="pencil" title="Scripta 앱" href="https://scripta.quest" />
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
              {/* 일별 활동자 */}
              <div style={{ ...pulse, minWidth: 0, minHeight: splitLayout ? undefined : 190 }} />
            </div>
          )
        })()}

      {/* 인사이트 — 가입 → 글 등록(활성화) → 연습 시작 → 연습 시도 → 크레딧 퍼널.
          Scripta는 랜딩 트래픽 수집이 없어 리뷰노트의 방문·페이지뷰 두 칸이 빠지고 가입에서 시작한다. */}
      {!loading && stats && (() => {
        const win = buildWindow(stats)
        const todayKey = kstToday()
        const sevenAgoKey = kstDaysAgo(6) // 오늘 포함 7일
        const real = users.filter(u => !isExcludedScriptaUser(u))

        const activationDaily = toDaily(stats.activation)
        const practiceDaily = toDaily(stats.practiceStart)
        const spent = stats.credits.dailySpent

        const attemptsTotal = stats.attempts.total
        const passRate = rate(stats.practice.passed, attemptsTotal)

        const subOf = (m: ScMetric, unit: string) => `오늘 ${m.today.toLocaleString()}${unit} · 7일 ${m.d7.toLocaleString()}${unit}`

        return (
          <div>
          <div style={{ display: 'grid', gridTemplateColumns: splitLayout ? 'minmax(0,1fr) minmax(0,1fr)' : 'minmax(0,1fr)', gap: 8, alignItems: 'stretch' }}>
          {/* 좌: 퍼널 카드(3×2) + 파이 · 우: 일별 활동자 전체높이 (1열 모드 전용, 리뷰노트와 동일) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 8 }}>
            <LStat
              label="가입"
              title="Scripta 계정 누적 (auth.users). 랜딩 트래픽 수집이 없어 방문 대비 전환은 아직 못 잰다."
              value={stats.users.total.toLocaleString()}
              sub={subOf(stats.users, '명')}
              tone="info"
              sparkline={mobile ? undefined : cumOf(stats.users.daily, win)}
            />
            <LStat
              label="활성화"
              title="글을 하나라도 등록한 유저 (Cortex 경유 귀속, 전 기간). 활성 = 활성화 ÷ 전체 가입자."
              value={stats.activation.length.toLocaleString()}
              valueExtra={rateExtra('전환', rate(stats.activation.length, real.length))}
              sub={`오늘 ${countOn(activationDaily, todayKey)}명 · 7일 ${countSince(activationDaily, sevenAgoKey)}명`}
              tone={real.length > 0 && stats.activation.length / real.length >= 0.5 ? 'pos' : 'warn'}
              sparkline={mobile ? undefined : cumOf(activationDaily, win)}
            />
            <LStat
              label="연습 시작"
              title="연습을 한 번이라도 제출한 유저. 전환 = 연습 시작 ÷ 활성화 — 글만 넣고 안 쓰는 구간을 본다."
              value={stats.practiceStart.length.toLocaleString()}
              valueExtra={rateExtra('전환', rate(stats.practiceStart.length, stats.activation.length))}
              sub={`오늘 ${countOn(practiceDaily, todayKey)}명 · 7일 ${countSince(practiceDaily, sevenAgoKey)}명`}
              sparkline={mobile ? undefined : cumOf(practiceDaily, win)}
            />
            <LStat
              label="연습 시도"
              title="문장·문단·전체 글 연습 제출 누적. 통과 = 통과 ÷ 전체 시도 (Cortex 통과 점수 기준)."
              value={attemptsTotal.toLocaleString()}
              valueExtra={attemptsTotal > 0 ? rateExtra('통과', passRate) : undefined}
              sub={subOf(stats.attempts, '회')}
              subExtra={attemptsTotal > 0 ? (
                <span style={{ fontSize: 'calc(9.5px * var(--fz, 1))', color: t.neutrals.subtle, fontFamily: t.font.mono }}>
                  평균 {stats.practice.avgScore}점
                </span>
              ) : undefined}
              sparkline={mobile ? undefined : cumOf(stats.attempts.daily, win)}
            />
            <LStat
              label="크레딧 소진"
              title="구조 생성·채점·필기 인식으로 차감된 크레딧 누적 (실패 환불 전 총 차감)."
              value={stats.credits.spent.toLocaleString()}
              valueExtra={stats.credits.refunded > 0 ? (
                <span style={{
                  fontSize: 'calc(9.5px * var(--fz, 1))', marginLeft: 5, fontWeight: 500,
                  fontFamily: t.font.mono, color: t.neutrals.subtle, fontVariantNumeric: 'tabular-nums' as const,
                }}>
                  환불 {stats.credits.refunded.toLocaleString()}
                </span>
              ) : undefined}
              sub={`오늘 ${countOn(spent, todayKey).toLocaleString()} · 7일 ${countSince(spent, sevenAgoKey).toLocaleString()}`}
              subExtra={
                <span style={{ fontSize: 'calc(9.5px * var(--fz, 1))', color: t.neutrals.subtle, fontFamily: t.font.mono }}>
                  잔액 {stats.credits.balance.toLocaleString()}
                </span>
              }
              sparkline={mobile ? undefined : cumOf(spent, win)}
            />
            <LStat
              label="크레딧 구매"
              title="결제로 유입된 크레딧. LemonSqueezy 웹훅(scripta_payment_events) 연동 전이라 지금은 0이다."
              value={stats.credits.purchased.toLocaleString()}
              sub={`결제 이벤트 ${stats.payments.events.toLocaleString()}건`}
              subExtra={
                <span style={{ fontSize: 'calc(9.5px * var(--fz, 1))', color: t.neutrals.subtle, fontFamily: t.font.mono }}>
                  관리자 지급 {stats.credits.granted.toLocaleString()}
                </span>
              }
              tone={stats.credits.purchased > 0 ? 'pos' : 'default'}
            />
          </div>
          {/* 연습 단위 / 크레딧 사용처 / 목표 언어 — 리뷰노트의 유입경로·국가·기기 자리 */}
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(3, minmax(0,1fr))', gap: 8 }}>
            <DistributionPie
              title="연습 단위"
              tabs={[
                { key: 'attempts', label: '시도', data: stats.byLevel.map(l => ({ name: SC_LEVEL_LABELS[l.level] ?? l.level, value: l.attempts })) },
                { key: 'passed', label: '통과', data: stats.byLevel.map(l => ({ name: SC_LEVEL_LABELS[l.level] ?? l.level, value: l.passed })) },
              ]}
              palette={['#6366f1', '#f97316', '#10b981', '#ec4899']}
              unit="회"
            />
            <DistributionPie
              title="크레딧 사용처"
              tabs={[
                { key: 'credits', label: '크레딧', data: stats.credits.byReason.map(r => ({ name: SC_CREDIT_REASON_LABELS[r.reason] ?? r.reason, value: r.credits })) },
                { key: 'calls', label: '호출', data: stats.credits.byReason.map(r => ({ name: SC_CREDIT_REASON_LABELS[r.reason] ?? r.reason, value: r.calls })) },
              ]}
              palette={['#8b5cf6', '#06b6d4', '#f59e0b', '#84cc16', '#ec4899']}
              topN={4}
            />
            <DistributionPie
              title="목표 언어"
              tabs={[{
                key: 'cortex', label: 'Cortex',
                data: stats.languages.map(l => ({ name: SC_LANGUAGE_LABELS[l.language] ?? l.language, value: l.n })),
              }]}
              palette={['#3b82f6', '#8b5cf6', '#10b981', '#f97316', '#ec4899']}
              unit="개"
              topN={4}
            />
          </div>
          </div>
          {/* 일별 활동자 — 1열 모드는 우측 전체높이, 그 외(2열·모바일) 파이 아래 전체폭 (리뷰노트와 동일 190) */}
          <div style={{ minWidth: 0, minHeight: splitLayout ? undefined : 190 }}>
            <ScDauTrendCard daily={stats.dailyActive} />
          </div>
          </div>
          </div>
        )
      })()}
      </div>
    </LCard>

    {/* 카드2: 콘텐츠 계층 (Cortex → 글 → 문단 → 문장 → 청크) */}
    <LCard pad={0}>
      {loading && (
        <div style={{ padding: `12px ${t.density.cardPad}px 12px` }}>
          <LSectionHead
            eyebrow="CONTENT"
            title="학습 구조"
            mb={10}
            action={<LHeadBtn icon="refresh" title="데이터 새로고침" onClick={onRefresh} busy={refreshing} />}
          />
          <SkeletonRow count={mobile ? 2 : (dashCols === 2 ? 3 : 5)} />
        </div>
      )}
      {!loading && stats && (() => {
        const win = buildWindow(stats)
        const c = stats.content
        const card = (label: string, m: ScMetric, unit: string, title?: string) => (
          <LStat
            label={label}
            title={title}
            value={m.total.toLocaleString()}
            sub={`오늘 ${m.today.toLocaleString()}${unit} · 7일 ${m.d7.toLocaleString()}${unit}`}
            sparkline={mobile ? undefined : cumOf(m.daily, win)}
          />
        )
        return (
          <div style={{ padding: `12px ${t.density.cardPad}px 12px` }}>
            <LSectionHead
              eyebrow="CONTENT"
              title="학습 구조"
              meta={`AI 채점 ${stats.aiGrades.total.toLocaleString()}회`}
              mb={10}
              action={<LHeadBtn icon="refresh" title="데이터 새로고침" onClick={onRefresh} busy={refreshing} />}
            />
            {/* Cortex → 글 → 문단 → 문장 → 청크. 와이드(1열) 한 줄, 2열 모드 3+2, 모바일 2열. */}
            <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : (dashCols === 2 ? 'repeat(3, 1fr)' : 'repeat(5, 1fr)'), gap: 8 }}>
              {card('Cortex', c.cortices, '개', '하나의 쓰기 목표와 채점 기준을 공유하는 학습 컨테이너.')}
              {card('글', c.texts, '개', '사용자가 등록한 목표 글(Text) 누적.')}
              {card('문단', c.paragraphs, '개')}
              {card('문장', c.sentences, '개', '반복 학습과 취약도 계산의 기본 단위.')}
              {card('청크', c.chunks, '개', '외국어 문장의 의미와 어순을 복원하는 보조 단위.')}
            </div>
          </div>
        )
      })()}
    </LCard>
    </div>

    {/* 사용자 테이블 — 2열 모드에서 두 열을 모두 차지한다 (리뷰노트 사용자 테이블과 동일).
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
      {!loading && !error && (
        <div style={{ padding: `12px ${t.density.cardPad}px 12px` }}>
          <LSectionHead
            eyebrow="USERS"
            title="사용자"
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
          {/* PC/모바일 동일 테이블 — 모바일은 가로 스크롤 (리뷰노트 사용자 테이블과 동일) */}
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
            {paginatedUsers.length === 0 && (
              <div style={{
                padding: '18px 8px', textAlign: 'center',
                fontSize: 'calc(11px * var(--fz, 1))', color: t.neutrals.subtle,
              }}>
                가입자 없음
              </div>
            )}
            {paginatedUsers.map(user => {
              // 잔액이 20 아래로 떨어지면 주황 — 소진 임박(문장 채점 1크레딧 기준 스무 번 남짓)
              const lowBalance = user.balance > 0 && user.balance < 20
              return (
                <div key={user.userId} style={{
                  display: 'grid', gridTemplateColumns: USER_TABLE_COLS, gap: 6, alignItems: 'center',
                  padding: '5px 8px', borderRadius: t.radius.sm, background: t.neutrals.inner,
                }}>
                  {/* 가입 — 두 줄: 날짜 / (요일) 시각 */}
                  <div style={{ ...userDateCell, display: 'flex', flexDirection: 'column', lineHeight: 1.2, textAlign: 'left' as const }}>
                    <span>{formatDateShort(user.createdAt)}</span>
                    <span style={{ fontSize: 'calc(8px * var(--fz, 1))', color: t.neutrals.subtle }}>({formatWeekdayShort(user.createdAt)}) {formatTimeShort(user.createdAt)}</span>
                  </div>
                  {/* 활동 — 로그인·글 등록·연습·크레딧 사용 중 가장 최근 */}
                  <div style={{ ...userDateCell, display: 'flex', flexDirection: 'column', lineHeight: 1.2, textAlign: 'left' as const }}>
                    {user.lastActivity ? (
                      <>
                        <span>{formatDateShort(user.lastActivity)}</span>
                        <span style={{ fontSize: 'calc(8px * var(--fz, 1))', color: t.neutrals.subtle }}>({formatWeekdayShort(user.lastActivity)}) {formatTimeShort(user.lastActivity)}</span>
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
                      {user.avatarUrl
                        ? <img src={user.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : (user.name?.charAt(0) || user.email.charAt(0) || '?').toUpperCase()
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
                  {/* 코텍스 / 글 / 문장 */}
                  <NumCell value={user.cortices} muted={user.cortices === 0} />
                  <NumCell value={user.texts} muted={user.texts === 0} />
                  <NumCell value={user.sentences} muted={user.sentences === 0} />
                  {/* 연습 — 누적 + 오늘 증가분 */}
                  <NumDeltaCell total={user.attempts} delta={user.attemptsToday} />
                  {/* 평균 점수 + 통과 건수 */}
                  <div
                    title={`통과 ${user.passed.toLocaleString()} / ${user.attempts.toLocaleString()}회`}
                    style={{
                      ...userNumCell, textAlign: 'center' as const,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.15,
                    }}
                  >
                    <span style={{ color: user.attempts > 0 ? t.neutrals.text : t.neutrals.subtle }}>
                      {user.attempts > 0 ? user.avgScore : '—'}
                    </span>
                    {user.attempts > 0 && (
                      <span style={{ fontSize: 'calc(8px * var(--fz, 1))', color: t.neutrals.subtle }}>
                        통과 {user.passed.toLocaleString()}
                      </span>
                    )}
                  </div>
                  {/* 크레딧 잔액 */}
                  <div style={{ ...userNumCell, textAlign: 'center' as const, color: lowBalance ? t.accent.warn : t.neutrals.text }}>
                    {user.balance.toLocaleString()}
                  </div>
                  {/* 누적 사용 */}
                  <NumCell value={user.spent} muted={user.spent === 0} />
                  {/* AI 채점 요청 */}
                  <NumCell value={user.aiCalls} muted={user.aiCalls === 0} />
                </div>
              )
            })}
          </div>
          </div>

          {/* 페이지네이션 (리뷰노트 사용자 테이블과 동일 스타일) */}
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
      )}
    </LCard>
    </div>
    </>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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
