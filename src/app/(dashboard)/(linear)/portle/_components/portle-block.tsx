'use client'

import { useEffect, useMemo, useState } from 'react'
import { t, tonePalettes, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import type { PortleStats, PortleUserRow } from '@/lib/portle-types'
import { PORTLE_KIND_LABELS } from '@/lib/portle-types'
import { kstDateKey, kstWeekday, kstTime } from '@/lib/kst'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PortleBlockProps {
  loading: boolean
  stats: PortleStats | null
  onRefresh: () => void
  refreshing: boolean
  error: string | null
  cols: 1 | 2 // 레이아웃 열 수 (1=wide)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toLocaleString()
}

// 테이블 셀용 짧은 날짜 — 연월일 모두 표시 (YY.MM.DD), KST 기준 (리뷰노트와 동일)
function formatDateShort(dateString?: string | null): string {
  if (!dateString) return '—'
  const key = kstDateKey(dateString)
  return `${key.slice(2, 4)}.${key.slice(5, 7)}.${key.slice(8, 10)}`
}

// 전환율 계산 + 값 뒤 주황 보조라벨 (보이스카드 퍼널 문법)
const rate = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0)
const rateExtra = (label: string, pct: number) => (
  <span style={{
    fontSize: 'calc(9.5px * var(--fz, 1))', marginLeft: 5, fontWeight: 500,
    color: t.accent.warn, fontVariantNumeric: 'tabular-nums' as const,
  }}>
    {label} {pct}%
  </span>
)

// 섹션 헤더 우측 새로고침 버튼 — 이 페이지의 섹션들이 쓰는 공통 모양.
function RefreshButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      title="데이터 새로고침"
      style={{
        width: 28, height: 28, borderRadius: t.radius.sm,
        background: t.neutrals.inner, border: 'none', cursor: busy ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: t.neutrals.muted, opacity: busy ? 0.5 : 1,
      }}
    >
      <LIcon name="refresh" size={13} stroke={1.8} />
    </button>
  )
}

// ─── 일별 AI 호출 차트 (리뷰노트 DauTrendCard 포틀판) ─────────────────────────────
// 성공/빈응답/실패 3계열 스택 + 7일 이동평균. Echo News 안정성 문제가 핵심 관찰 대상이라
// 결과(outcome)를 계열로 쓴다 — 실패가 붉게 쌓이면 바로 보인다.

const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토']
function withWeekday(d: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d} (${WEEKDAYS_KO[new Date(d + 'T00:00:00Z').getUTCDay()]})` : d
}

function PortleAiTrendCard({ daily, days = 42 }: {
  daily: Array<{ date: string; success: number; empty: number; failure: number; subjects: number }>
  days?: number
}) {
  const rows = (daily ?? []).slice(-days)
  const totalOf = (r: { success: number; empty: number; failure: number }) => r.success + r.empty + r.failure
  const max = rows.reduce((m, r) => Math.max(m, totalOf(r)), 0)
  const latest = rows.length ? rows[rows.length - 1] : null
  const OK = '#10b981'
  const EMPTY = '#f59e0b'
  const FAIL = '#ef4444'
  const MA_COLOR = '#6366f1'
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
          일별 AI 호출
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'calc(9px * var(--fz, 1))', fontFamily: t.font.mono, whiteSpace: 'nowrap' as const }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: t.neutrals.muted }}>
            <span style={{ width: 6, height: 6, borderRadius: 1, background: OK }} />성공 {latest?.success ?? 0}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: t.neutrals.muted }}>
            <span style={{ width: 6, height: 6, borderRadius: 1, background: EMPTY }} />빈응답 {latest?.empty ?? 0}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: t.neutrals.muted }}>
            <span style={{ width: 6, height: 6, borderRadius: 1, background: FAIL }} />실패 {latest?.failure ?? 0}
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
            const failH = barPct(r.failure)
            const emptyH = barPct(r.empty)
            const okH = barPct(r.success)
            const dim = hoverIdx !== null && hoverIdx !== i
            return (
              <div key={r.date}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(prev => (prev === i ? null : prev))}
                style={{ flex: 1, minWidth: 2, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', cursor: 'default' }}>
                {failH > 0 && <div style={{ height: `${failH}%`, background: FAIL, borderRadius: '1px 1px 0 0', opacity: dim ? 0.4 : 1, transition: 'opacity 120ms ease' }} />}
                {emptyH > 0 && <div style={{ height: `${emptyH}%`, background: EMPTY, borderRadius: failH > 0 ? 0 : '1px 1px 0 0', opacity: dim ? 0.4 : 1, transition: 'opacity 120ms ease' }} />}
                {okH > 0 && <div style={{ height: `${okH}%`, background: OK, borderRadius: (failH > 0 || emptyH > 0) ? 0 : '1px 1px 0 0', opacity: dim ? 0.4 : 1, transition: 'opacity 120ms ease' }} />}
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
                <div style={{ opacity: 0.7, marginBottom: 3 }}>{withWeekday(r.date)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 1, background: OK }} />성공 {r.success}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 1, background: EMPTY }} />빈응답 {r.empty}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 1, background: FAIL }} />실패 {r.failure}
                </div>
                <div style={{ opacity: 0.7, marginTop: 3 }}>사용자 {r.subjects}명 · 7일 평균 {Math.round(ma[hoverIdx] * 10) / 10}</div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

// ─── User table (보이스카드/리뷰노트 사용자 테이블과 동일 스타일) ───────────────────

type UserSortKey = 'first' | 'last' | 'subject' | 'calls' | 'success' | 'news' | 'ingest' | 'translate' | 'tokens' | 'days' | 'shared' | 'sub'
type SortDir = 'asc' | 'desc'

const USER_COLUMNS: Array<{ key: UserSortKey; label: string; mobileLabel: string; align: 'left' | 'center' | 'right' }> = [
  { key: 'first',     label: '첫 사용',   mobileLabel: '첫 사용',   align: 'center' },
  { key: 'last',      label: '마지막',    mobileLabel: '마지막 사용', align: 'center' },
  { key: 'subject',   label: '사용자',    mobileLabel: '사용자',    align: 'left' },
  { key: 'calls',     label: '호출',      mobileLabel: 'AI 호출',   align: 'center' },
  { key: 'success',   label: '성공률',    mobileLabel: '성공률',    align: 'center' },
  { key: 'news',      label: '뉴스',      mobileLabel: '에코 뉴스', align: 'center' },
  { key: 'ingest',    label: '거래',      mobileLabel: '거래 입력', align: 'center' },
  { key: 'translate', label: '번역',      mobileLabel: '규칙 번역', align: 'center' },
  { key: 'tokens',    label: '토큰',      mobileLabel: '토큰',      align: 'center' },
  { key: 'days',      label: '활동일',    mobileLabel: '활동일수',  align: 'center' },
  { key: 'shared',    label: '공유',      mobileLabel: '공유 시트', align: 'center' },
  { key: 'sub',       label: '구독',      mobileLabel: '구독',      align: 'center' },
]

const ASC_DEFAULT_KEYS = new Set<UserSortKey>(['subject'])
const defaultSortDir = (key: UserSortKey): SortDir => (ASC_DEFAULT_KEYS.has(key) ? 'asc' : 'desc')

const USER_SORT_STORAGE_KEY = 'portle.userSort'
const USER_SORT_KEY_SET = new Set<UserSortKey>(USER_COLUMNS.map(o => o.key))

const USER_TABLE_COLS = '64px 64px minmax(120px,1.4fr) 44px 52px 44px 44px 44px 52px 48px 40px 56px'
// 컬럼 폭 합(672) + gap 6px×11(66) + 좌우 패딩(16). 이 아래로는 가로 스크롤이 걸린다.
const USER_TABLE_MIN_WIDTH = 754
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
  fontVariantNumeric: 'tabular-nums', textAlign: 'center', whiteSpace: 'nowrap',
}
const userDateCell: React.CSSProperties = {
  fontSize: 'calc(9.5px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted,
  fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
}

// subject 표시: 유형 배지 + 접두사 뗀 축약 ID. device UUID는 앞 8자면 식별에 충분.
function subjectShort(u: PortleUserRow): string {
  const id = u.subject.replace(/^(google|device):/, '')
  return id.length > 14 ? `${id.slice(0, 12)}…` : id
}

const TYPE_TONES: Record<PortleUserRow['type'], { bg: string; fg: string; label: string }> = {
  google: { ...tonePalettes.info, label: '구글' },
  device: { bg: t.neutrals.inner, fg: t.neutrals.muted, label: '기기' },
  other:  { ...tonePalettes.neutral, label: '기타' },
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PortleBlock({ loading, stats, onRefresh, refreshing, error, cols }: PortleBlockProps) {
  const mobile = useIsMobile()
  const dashCols = cols
  const [userSort, setUserSort] = useState<UserSortKey>('last')
  const [userSortDir, setUserSortDir] = useState<SortDir>('desc')

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
    if (!stats) return []
    const arr = [...stats.users]
    type U = typeof arr[number]
    const primary = (a: U, b: U): number => {
      switch (userSort) {
        case 'first':     return a.firstAt.localeCompare(b.firstAt)
        case 'last':      return a.lastAt.localeCompare(b.lastAt)
        case 'subject':   return a.subject.localeCompare(b.subject)
        case 'calls':     return a.calls - b.calls
        case 'success':   return rate(a.success, a.calls) - rate(b.success, b.calls)
        case 'news':      return (a.byKind.echo_news ?? 0) - (b.byKind.echo_news ?? 0)
        case 'ingest':    return (a.byKind.ingest_transactions ?? 0) - (b.byKind.ingest_transactions ?? 0)
        case 'translate': return (a.byKind.translate_rule ?? 0) - (b.byKind.translate_rule ?? 0)
        case 'tokens':    return (a.inputTokens + a.outputTokens) - (b.inputTokens + b.outputTokens)
        case 'days':      return a.activeDays - b.activeDays
        case 'shared':    return a.sharedSheets - b.sharedSheets
        case 'sub':       return (a.entitlement?.active ? 1 : 0) - (b.entitlement?.active ? 1 : 0)
        default:          return 0
      }
    }
    const dirMul = userSortDir === 'asc' ? 1 : -1
    arr.sort((a, b) => {
      const p = primary(a, b)
      if (p !== 0) return p * dirMul
      return b.lastAt.localeCompare(a.lastAt) // 동점 보조정렬: 최근 활동 우선 (방향 무관)
    })
    return arr
  }, [stats, userSort, userSortDir])

  const handleSortChange = (key: UserSortKey) => {
    const nextDir: SortDir = key === userSort ? (userSortDir === 'asc' ? 'desc' : 'asc') : defaultSortDir(key)
    setUserSort(key)
    setUserSortDir(nextDir)
    window.localStorage.setItem(USER_SORT_STORAGE_KEY, `${key}:${nextDir}`)
  }

  const splitLayout = !mobile && dashCols === 1

  // 그리드는 페이지가 갖는다. 여기서는 조각 두 개(지표열 · 사용자)만 내놓고, 페이지 그리드가
  // DOM 순서대로 두 열에 채운다. 보이스카드/리뷰노트 블록과 같은 규칙이다.
  return (
    <>
    {/* AI 사용 · 기능별 — 두 섹션이 한 열로 붙어 다닌다 */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.blockGap, minWidth: 0 }}>
    {/* 카드1: AI 사용 · 안정성 */}
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 12 }}>
        <LSectionHead
          eyebrow="PORTLE"
          title="AI 사용 · 안정성"
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                fontSize: 'calc(9px * var(--fz, 1))', padding: '2px 6px', borderRadius: t.radius.sm,
                background: t.neutrals.inner, color: t.neutrals.muted, fontWeight: 500, whiteSpace: 'nowrap' as const,
              }}>
                서버 AI 로그 기준 · 원장은 기기/Drive
              </span>
              <RefreshButton onClick={onRefresh} busy={refreshing} />
            </div>
          }
        />

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
              <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 8 }}>
                {[0, 1, 2, 3, 4, 5].map(i => <div key={i} style={{ ...pulse, height: 64 }} />)}
              </div>
              <div style={{ ...pulse, minWidth: 0, minHeight: splitLayout ? undefined : 190 }} />
            </div>
          )
        })()}

        {!loading && stats && (() => {
          const totals = stats.totals
          // 일별 사용자 수 스파크라인 + 누적 호출 스파크라인
          const dailySubjects = stats.daily.map(d => ({ date: d.date, value: d.subjects }))
          let run = 0
          const cumCalls = stats.daily.map(d => ({ date: d.date, value: (run += d.success + d.empty + d.failure) }))
          const todayRow = stats.daily.length ? stats.daily[stats.daily.length - 1] : null
          const todayCalls = todayRow ? todayRow.success + todayRow.empty + todayRow.failure : 0
          const todayRate = todayCalls > 0 && todayRow ? rate(todayRow.success, todayCalls) : null
          return (
            <div style={{ display: 'grid', gridTemplateColumns: splitLayout ? 'minmax(0,1fr) minmax(0,1fr)' : 'minmax(0,1fr)', gap: 8, alignItems: 'stretch' }}>
            {/* 좌: 지표 카드(3×2) · 우: 일별 AI 호출 전체높이 (1열 모드 전용, 보이스카드와 동일) */}
            <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 8 }}>
              <LStat
                label="AI 사용자"
                title="AI를 한 번이라도 호출한 subject 누적 (google 로그인 + device 기기). 원장이 기기에 있어 서버에서 보이는 사용자는 이 축이 전부다."
                value={totals.subjects.toLocaleString()}
                sub={`오늘 ${totals.subjectsToday.toLocaleString()}명 · 7일 ${totals.subjects7d.toLocaleString()}명`}
                tone="info"
                sparkline={mobile ? undefined : dailySubjects}
              />
              <LStat
                label="AI 호출"
                title="portle_ai_usage 누적 호출 수 (에코 뉴스 · 거래 입력 · 규칙 번역). 스파크라인은 누적."
                value={totals.calls.toLocaleString()}
                sub={`오늘 ${totals.callsToday.toLocaleString()}회 · 7일 ${totals.calls7d.toLocaleString()}회`}
                sparkline={mobile ? undefined : cumCalls}
              />
              <LStat
                label="성공률"
                title="성공 ÷ 전체 호출 (전 기간). 429 레이트리밋·파싱 실패가 failure로 잡힌다 — Echo News 안정화가 현재 우선순위."
                value={`${totals.successRate}%`}
                valueExtra={rateExtra('7일', Math.round(totals.successRate7d))}
                sub={todayRate !== null ? `오늘 ${todayRate}% (${todayCalls}회)` : '오늘 호출 없음'}
                tone={totals.successRate7d >= 80 ? 'pos' : totals.successRate7d >= 50 ? 'warn' : 'neg'}
              />
              <LStat
                label="토큰"
                title="AI 호출 입력+출력 토큰 누적."
                value={formatTokens(totals.inputTokens + totals.outputTokens)}
                sub={`입력 ${formatTokens(totals.inputTokens)} · 출력 ${formatTokens(totals.outputTokens)}`}
              />
              <LStat
                label="활성 구독"
                title="portle_entitlements 중 만료 전 구독 (Apple/Google IAP)."
                value={totals.activeEntitlements.toLocaleString()}
                sub="스토어 IAP 기준"
                tone={totals.activeEntitlements > 0 ? 'pos' : 'default'}
              />
              <LStat
                label="공유 시트"
                title="단축코드로 공유된 원장 시트 수 (portle_short_codes)."
                value={totals.sharedSheets.toLocaleString()}
                sub="단축코드 발급 기준"
              />
            </div>
            {/* 일별 AI 호출 — 1열 모드는 우측 전체높이, 그 외(2열·모바일) 타일 아래 전체폭 */}
            <div style={{ minWidth: 0, minHeight: splitLayout ? undefined : 190 }}>
              <PortleAiTrendCard daily={stats.daily} />
            </div>
            </div>
          )
        })()}
      </div>
    </LCard>

    {/* 카드2: 기능별 AI 사용 */}
    <LCard pad={0}>
      <div style={{ padding: `12px ${t.density.cardPad}px 12px` }}>
        <LSectionHead eyebrow="FEATURES" title="기능별 AI 사용" mb={10} />
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ height: 36, borderRadius: t.radius.sm, background: t.neutrals.inner, animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))}
          </div>
        )}
        {!loading && stats && (
          <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 560, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(90px,1.2fr) 64px 110px minmax(80px,1fr) 52px 64px 64px', gap: 6, alignItems: 'center', padding: '0 8px 5px' }}>
              {['기능', '호출', '성공 · 빈 · 실패', '성공률', '사용자', '토큰', '마지막'].map((h, i) => (
                <div key={h} style={{ ...userHeadCell, textAlign: i === 0 ? 'left' : 'center' }}>{h}</div>
              ))}
            </div>
            {stats.byKind.map(k => {
              const okPct = rate(k.success, k.calls)
              return (
                <div key={k.kind} style={{
                  display: 'grid', gridTemplateColumns: 'minmax(90px,1.2fr) 64px 110px minmax(80px,1fr) 52px 64px 64px',
                  gap: 6, alignItems: 'center', padding: '6px 8px', borderRadius: t.radius.sm, background: t.neutrals.inner,
                }}>
                  <div style={{ ...userTextCell, color: t.neutrals.text, fontWeight: 500 }}>
                    {PORTLE_KIND_LABELS[k.kind] ?? k.kind}
                  </div>
                  <div style={{ ...userNumCell, display: 'flex', flexDirection: 'column', lineHeight: 1.15, alignItems: 'center' }}>
                    <span>{k.calls.toLocaleString()}</span>
                    {k.callsToday > 0 && (
                      <span style={{ fontSize: 'calc(8px * var(--fz, 1))', fontWeight: 600, color: '#059669' }}>
                        +{k.callsToday.toLocaleString()}
                      </span>
                    )}
                  </div>
                  <div style={{ ...userNumCell, color: t.neutrals.muted }}>
                    <span style={{ color: '#059669' }}>{k.success}</span>
                    {' · '}
                    <span style={{ color: '#D97706' }}>{k.empty}</span>
                    {' · '}
                    <span style={{ color: '#DC2626' }}>{k.failure}</span>
                  </div>
                  {/* 성공률 바 — 낮을수록 문제 기능이 한눈에 보이도록 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <div style={{ flex: 1, height: 4, borderRadius: 2, background: t.neutrals.line, overflow: 'hidden' }}>
                      <div style={{ width: `${okPct}%`, height: '100%', borderRadius: 2, background: okPct >= 80 ? '#10b981' : okPct >= 50 ? '#f59e0b' : '#ef4444' }} />
                    </div>
                    <span style={{ ...userNumCell, width: 34, textAlign: 'right' }}>{okPct}%</span>
                  </div>
                  <div style={userNumCell}>{k.subjects.toLocaleString()}</div>
                  <div style={userNumCell}>{formatTokens(k.inputTokens + k.outputTokens)}</div>
                  <div style={{ ...userDateCell, textAlign: 'center' }}>{formatDateShort(k.lastAt)}</div>
                </div>
              )
            })}
          </div>
          </div>
        )}
      </div>
    </LCard>
    </div>

    {/* 사용자 테이블 — 2열 모드에서 두 열을 모두 차지한다 (보이스카드/리뷰노트와 동일). */}
    <div style={{
      display: 'flex', flexDirection: 'column', gap: t.density.blockGap, minWidth: 0,
      ...(dashCols === 2 && !mobile ? { gridColumn: '1 / -1' } : null),
    }}>
    <LCard pad={0}>
      {loading && (
        <div style={{ padding: `12px ${t.density.cardPad}px 12px` }}>
          <LSectionHead eyebrow="USERS" title="사용자" mb={8} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div key={i} style={{ height: 40, borderRadius: t.radius.sm, background: t.neutrals.inner, animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))}
          </div>
        </div>
      )}
      {!loading && stats && (
        <div style={{ padding: `12px ${t.density.cardPad}px 12px` }}>
          <LSectionHead
            eyebrow="USERS"
            title="사용자"
            meta={`${sortedUsers.length}명 · AI 호출 기준`}
            mb={8}
            action={(
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {/* 모바일은 헤더 클릭 정렬이 좁아서 안 되므로 드롭다운을 함께 둔다 */}
                {mobile && (
                  <>
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
                  </>
                )}
                <RefreshButton onClick={onRefresh} busy={refreshing} />
              </div>
            )}
          />
          {/* PC/모바일 동일 테이블 — 모바일은 가로 스크롤 (보이스카드와 동일) */}
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
            {sortedUsers.map(user => {
              const typeTone = TYPE_TONES[user.type]
              const okPct = rate(user.success, user.calls)
              const ent = user.entitlement
              return (
                <div key={user.subject} style={{
                  display: 'grid', gridTemplateColumns: USER_TABLE_COLS, gap: 6, alignItems: 'center',
                  padding: '5px 8px', borderRadius: t.radius.sm, background: t.neutrals.inner,
                }}>
                  {/* 첫 사용 — 두 줄: 날짜 / (요일) 시각 (보이스카드와 동일) */}
                  <div style={{ ...userDateCell, display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                    <span>{formatDateShort(user.firstAt)}</span>
                    <span style={{ fontSize: 'calc(8px * var(--fz, 1))', color: t.neutrals.subtle }}>({kstWeekday(user.firstAt)}) {kstTime(user.firstAt)}</span>
                  </div>
                  <div style={{ ...userDateCell, display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                    <span>{formatDateShort(user.lastAt)}</span>
                    <span style={{ fontSize: 'calc(8px * var(--fz, 1))', color: t.neutrals.subtle }}>({kstWeekday(user.lastAt)}) {kstTime(user.lastAt)}</span>
                  </div>
                  {/* 사용자 — 유형 배지 + 축약 ID (전체 ID는 title로) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }} title={user.subject}>
                    <span style={{
                      fontSize: 'calc(8.5px * var(--fz, 1))', fontWeight: 600, padding: '1px 5px',
                      borderRadius: 999, background: typeTone.bg, color: typeTone.fg, whiteSpace: 'nowrap' as const,
                    }}>
                      {typeTone.label}
                    </span>
                    <span style={{ ...userTextCell, fontFamily: t.font.mono }}>{subjectShort(user)}</span>
                  </div>
                  <div style={userNumCell}>{user.calls.toLocaleString()}</div>
                  <div style={{ ...userNumCell, color: okPct >= 80 ? '#059669' : okPct >= 50 ? '#D97706' : '#DC2626' }}>{okPct}%</div>
                  <div style={userNumCell}>{(user.byKind.echo_news ?? 0) || '—'}</div>
                  <div style={userNumCell}>{(user.byKind.ingest_transactions ?? 0) || '—'}</div>
                  <div style={userNumCell}>{(user.byKind.translate_rule ?? 0) || '—'}</div>
                  <div style={userNumCell}>{formatTokens(user.inputTokens + user.outputTokens)}</div>
                  <div style={userNumCell}>{user.activeDays}</div>
                  <div style={userNumCell}>{user.sharedSheets || '—'}</div>
                  {/* 구독 — 활성이면 스토어 표시, 만료는 흐리게 */}
                  <div style={{ ...userNumCell, fontSize: 'calc(9px * var(--fz, 1))' }} title={ent ? `${ent.productId} · ${formatDateShort(ent.expiresAt)} 만료` : undefined}>
                    {ent ? (
                      <span style={{
                        padding: '1px 6px', borderRadius: 999, fontWeight: 600,
                        background: ent.active ? tonePalettes.pos.bg : t.neutrals.inner,
                        color: ent.active ? tonePalettes.pos.fg : t.neutrals.subtle,
                      }}>
                        {ent.store === 'apple' ? 'Apple' : 'Google'}
                      </span>
                    ) : '—'}
                  </div>
                </div>
              )
            })}
            {sortedUsers.length === 0 && (
              <div style={{ padding: '16px 8px', textAlign: 'center', fontSize: 'calc(10px * var(--fz, 1))', color: t.neutrals.subtle }}>
                아직 AI를 호출한 사용자가 없습니다
              </div>
            )}
          </div>
          </div>
        </div>
      )}
    </LCard>
    </div>
    </>
  )
}
