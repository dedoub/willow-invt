'use client'

import { useEffect, useMemo, useState } from 'react'
import { t, tonePalettes, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LCardFoot } from '@/app/(dashboard)/_components/linear-card-foot'
import { StatRows } from '@/app/(dashboard)/_components/linear-stat-rows'
import { LSectionHead, LHeadBtn } from '@/app/(dashboard)/_components/linear-section-head'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'
import type { PortleStats, PortleUserRow } from '@/lib/portle-types'
import type { PortleDailyActive } from '@/lib/portle-types'
import { kstDateKey, kstToday, kstWeekday, kstTime } from '@/lib/kst'
import { Bone } from '@/app/(dashboard)/_components/linear-skeleton'
import { LNotice } from '@/app/(dashboard)/_components/linear-notice'
import { LTableBadge, fzCols, fzTableMinWidth } from '@/app/(dashboard)/_components/linear-table'
import { DistributionPie } from '@/app/(dashboard)/_components/distribution-pie'
import { formatCountryName, countryName } from '@/lib/country-format'

// 분포 파이 공통 팔레트 — 보이스카드·리뷰노트와 같은 명도 사다리
const PIE_PALETTE = ['#0E415A', '#5B6B74', '#8D959D', '#B4BBC1', '#C7CCD3', '#D8DCE1', '#E4E7EB', '#EDEFF2']

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
    fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, marginLeft: t.density.gapSm, fontWeight: t.weight.medium,
    color: t.neutrals.muted, fontVariantNumeric: 'tabular-nums' as const,
  }}>
    {label} {pct}%
  </span>
)

const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토']
function withWeekday(d: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d} (${WEEKDAYS_KO[new Date(d + 'T00:00:00Z').getUTCDay()]})` : d
}

// 일별 활동자 — 보이스카드 DauTrendCard 의 포틀판. 하루 한 바를 4단 스택: 아래에서 위로
// 로그인·기존 → 로그인·신규 → 기기·기존 → 기기·신규. 합 = total. 활동 = 그날 앱 이벤트 또는
// AI 호출(서버 dailyActive, 관리자·테스트 제외). 명도 사다리도 보이스카드와 같다 — 같은 계열
// 안에서 신규가 밝은 쪽이라 위로 갈수록 '새 사람'이고, 스택 방향과 읽는 방향이 맞는다.
function PortleDauTrendCard({ daily, days = 42 }: { daily: PortleDailyActive[]; days?: number }) {
  const rows = (daily ?? []).slice(-days)
  const max = rows.reduce((m, r) => Math.max(m, r.total), 0)
  const latest = rows.length ? rows[rows.length - 1] : null
  const MEMBER = '#0E415A'
  const NEW = '#5B6B74'
  const DEV_MEMBER = '#A8B0B6'
  const DEV_NEW = '#D3D7DD'
  const MA_COLOR = '#17181C'
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const barPct = (v: number) => (max > 0 ? (v / max) * 100 : 0)
  // 7일 이동평균(총 활동자) — 바 위에 가볍게 얹는 추세선
  const ma = rows.map((_, i) => {
    const win = rows.slice(Math.max(0, i - 6), i + 1)
    return win.reduce((sum, r) => sum + r.total, 0) / win.length
  })
  const chip = (color: string, label: string, value: number | string, line = false) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: t.density.gapXs, color: t.neutrals.muted, whiteSpace: 'nowrap' as const }}>
      <span style={{ width: line ? 10 : 6, height: line ? 2 : 6, borderRadius: 1, background: color }} />{label} {value}
    </span>
  )
  const tipRow = (color: string, label: string, value: number) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm }}>
      <span style={{ width: 7, height: 7, borderRadius: 1, background: color }} />{label} {value}
    </div>
  )
  return (
    <div data-panel="" style={{
      background: t.neutrals.inner, borderRadius: t.radius.sm, padding: `${t.density.panelPadY}px ${t.density.panelPadX}px`,
      height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: t.density.gapXs, marginBottom: t.density.gapSm, flexWrap: 'wrap' as const, rowGap: t.density.gapXs,
      }}>
        <div data-panel-title="" style={{
          fontSize: `calc(${t.type.panelTitle}px * var(--fz, 1))`, fontFamily: t.font.mono, letterSpacing: 0.8,
          textTransform: 'uppercase' as const, color: t.neutrals.subtle, whiteSpace: 'nowrap' as const,
        }}>
          일별 활동자
        </div>
        {/* 칩 5개 — 모바일 폭에서 칩 경계로만 접히고, flex-end 라 접혀도 우측 정렬 유지 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: t.density.kpiGap,
          flexWrap: 'wrap' as const, justifyContent: 'flex-end', rowGap: t.density.gapXs, minWidth: 0,
          fontSize: `calc(${t.type.tableHead}px * var(--fz, 1))`, fontFamily: t.font.mono,
        }}>
          {chip(MEMBER, '로그인·기존', latest?.loggedMember ?? 0)}
          {chip(NEW, '로그인·신규', latest?.loggedNew ?? 0)}
          {chip(DEV_MEMBER, '기기·기존', latest?.deviceMember ?? 0)}
          {chip(DEV_NEW, '기기·신규', latest?.deviceNew ?? 0)}
          {chip(MA_COLOR, '7일평균', ma.length ? (Math.round(ma[ma.length - 1] * 10) / 10).toLocaleString() : 0, true)}
        </div>
      </div>
      {rows.length === 0 || max === 0 ? (
        <div style={{
          flex: 1, minHeight: 80, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, color: t.neutrals.subtle,
        }}>
          데이터 없음
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 96, display: 'flex', alignItems: 'stretch', gap: t.density.tableRowGap, position: 'relative' }}>
          {rows.map((r, i) => {
            const devNewH = barPct(r.deviceNew)
            const devMemberH = barPct(r.deviceMember)
            const newH = barPct(r.loggedNew)
            const memberH = barPct(r.loggedMember)
            const dim = hoverIdx !== null && hoverIdx !== i
            return (
              <div
                key={r.date}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(prev => (prev === i ? null : prev))}
                style={{ flex: 1, minWidth: 2, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', cursor: 'default' }}
              >
                {/* 바 위 총합 — 바가 좁아지는 만큼 글자를 줄여 옆 바와 안 부딪히게 */}
                {r.total > 0 && (
                  <span style={{
                    fontSize: `calc(${t.type.chartLabel}px * var(--fz, 1))`, fontFamily: t.font.mono, color: t.neutrals.subtle,
                    fontVariantNumeric: 'tabular-nums' as const, lineHeight: 1, alignSelf: 'center', marginBottom: t.density.tableRowGap,
                    whiteSpace: 'nowrap' as const, opacity: dim ? 0.25 : 0.7, transition: 'opacity 120ms ease',
                  }}>{r.total}</span>
                )}
                {devNewH > 0 && <div style={{ height: `${devNewH}%`, background: DEV_NEW, borderRadius: '1px 1px 0 0', opacity: dim ? 0.4 : 1, transition: 'opacity 120ms ease' }} />}
                {devMemberH > 0 && <div style={{ height: `${devMemberH}%`, background: DEV_MEMBER, borderRadius: devNewH > 0 ? 0 : '1px 1px 0 0', opacity: dim ? 0.4 : 1, transition: 'opacity 120ms ease' }} />}
                {newH > 0 && <div style={{ height: `${newH}%`, background: NEW, borderRadius: (devNewH > 0 || devMemberH > 0) ? 0 : '1px 1px 0 0', opacity: dim ? 0.4 : 1, transition: 'opacity 120ms ease' }} />}
                {memberH > 0 && <div style={{ height: `${memberH}%`, background: MEMBER, borderRadius: (devNewH > 0 || devMemberH > 0 || newH > 0) ? 0 : '1px 1px 0 0', opacity: dim ? 0.4 : 1, transition: 'opacity 120ms ease' }} />}
              </div>
            )
          })}
          {max > 0 && rows.length > 1 && (
            <svg
              viewBox="0 0 100 100" preserveAspectRatio="none"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}
            >
              <polyline
                points={ma.map((v, i) => `${(((i + 0.5) / rows.length) * 100).toFixed(2)},${(100 - (v / max) * 100).toFixed(2)}`).join(' ')}
                fill="none" stroke={MA_COLOR} strokeWidth={1.2} opacity={0.75}
                vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round"
              />
            </svg>
          )}
          {hoverIdx !== null && rows[hoverIdx] && (() => {
            const r = rows[hoverIdx]
            const leftPct = Math.min(86, Math.max(14, ((hoverIdx + 0.5) / rows.length) * 100))
            return (
              <div style={{
                position: 'absolute', left: `${leftPct}%`, transform: 'translateX(-50%)',
                bottom: `calc(${barPct(r.total).toFixed(1)}% + 8px)`, pointerEvents: 'none', zIndex: 10,
                background: '#1E293B', color: '#F8FAFC',
                fontSize: `calc(${t.type.control}px * var(--fz, 1))`, fontFamily: t.font.sans, lineHeight: 1.4,
                borderRadius: t.radius.md, padding: `${t.density.gapSm}px ${t.density.panelPadX}px`, whiteSpace: 'nowrap',
              }}>
                <div style={{ opacity: 0.7, marginBottom: t.density.gapXs }}>{withWeekday(r.date)}</div>
                {tipRow(MEMBER, '기존 로그인', r.loggedMember)}
                {tipRow(NEW, '신규 로그인', r.loggedNew)}
                {tipRow(DEV_MEMBER, '기존 기기', r.deviceMember)}
                {tipRow(DEV_NEW, '신규 기기', r.deviceNew)}
                <div style={{ opacity: 0.7, marginTop: t.density.gapXs }}>총 {r.total} · 7일 평균 {Math.round(ma[hoverIdx] * 10) / 10}</div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

// ─── User table (보이스카드/리뷰노트 사용자 테이블과 동일 스타일) ───────────────────

// 열 구성은 보이스카드 사용자 표를 바탕으로 한다 — 날짜 3종(설치·로그인·활동) · 사람 · 기기
// (플랫폼·앱버전·언어·국가) · 도달(드라이브·원장) · 결제 · 7일 활동. 보이스카드 고유인
// 덱·카드·뒤집기·말하기·듣기·구매신호·오퍼·보장종료와 크레딧 4열은 뺐다 — 포틀은 크레딧제가
// 아니라 구독제고 학습 지표가 없다. 그 자리에 포틀 고유인 첫 활동·AI 호출 5열·공유·구독 만료가 온다.
type UserSortKey =
  | 'first' | 'installed' | 'signin' | 'last' | 'subject'
  | 'platform' | 'version' | 'locale' | 'country' | 'drive' | 'ledger'
  | 'calls' | 'success' | 'news' | 'ingest' | 'translate' | 'tokens' | 'shared'
  | 'sub' | 'expires' | 'days' | 'active7'
type SortDir = 'asc' | 'desc'

const USER_COLUMNS: Array<{ key: UserSortKey; label: string; mobileLabel: string; align: 'left' | 'center' | 'right' }> = [
  // 첫 활동은 포틀 고유다 — 앱 이벤트 없이 AI 로그로만 잡힌 사람은 설치일을 모른다.
  { key: 'first',     label: '첫 활동',   mobileLabel: '첫 활동',   align: 'center' },
  { key: 'installed', label: '설치',      mobileLabel: '설치일',    align: 'center' },
  { key: 'signin',    label: '로그인',    mobileLabel: '로그인일',  align: 'center' },
  { key: 'last',      label: '활동',      mobileLabel: '마지막 활동', align: 'center' },
  { key: 'subject',   label: '사용자',    mobileLabel: '사용자',    align: 'left' },
  { key: 'platform',  label: '플랫폼',    mobileLabel: '플랫폼',    align: 'center' },
  { key: 'version',   label: '앱버전',    mobileLabel: '앱버전',    align: 'center' },
  { key: 'locale',    label: '언어',      mobileLabel: '언어',      align: 'center' },
  { key: 'country',   label: '국가',      mobileLabel: '국가',      align: 'center' },
  { key: 'drive',     label: '드라이브',  mobileLabel: '드라이브',  align: 'center' },
  { key: 'ledger',    label: '원장',      mobileLabel: '원장 활성화', align: 'center' },
  { key: 'calls',     label: '호출',      mobileLabel: 'AI 호출',   align: 'center' },
  { key: 'success',   label: '성공률',    mobileLabel: '성공률',    align: 'center' },
  { key: 'news',      label: '뉴스',      mobileLabel: '에코 뉴스', align: 'center' },
  { key: 'ingest',    label: '거래',      mobileLabel: '거래 입력', align: 'center' },
  { key: 'translate', label: '번역',      mobileLabel: '규칙 번역', align: 'center' },
  { key: 'tokens',    label: '토큰',      mobileLabel: '토큰',      align: 'center' },
  { key: 'shared',    label: '공유',      mobileLabel: '공유 시트', align: 'center' },
  { key: 'sub',       label: '구독',      mobileLabel: '구독',      align: 'center' },
  { key: 'expires',   label: '만료',      mobileLabel: '구독 만료일', align: 'center' },
  { key: 'days',      label: '활동일',    mobileLabel: '활동일수',  align: 'center' },
  { key: 'active7',   label: '7일',       mobileLabel: '7일 활동일', align: 'center' },
]

// 날짜 비교 — 둘 다 있을 때만 뜻이 있다. 없는 쪽 처리는 missingFor 가 정렬 바깥에서 한다.
const cmpDate = (a: string | null, b: string | null): number =>
  a && b ? a.localeCompare(b) : 0

// 이 열에서 이 사람의 값이 '없음'인가. 없는 값은 정렬 방향과 무관하게 표 아래로 간다.
const missingFor = (key: UserSortKey, u: PortleUserRow): boolean => {
  switch (key) {
    case 'installed': return !u.installedAt
    case 'signin':    return !u.signedInAt
    case 'drive':     return !u.driveLinkedAt
    case 'ledger':    return !u.ledgerActivatedAt
    case 'expires':   return !u.entitlement
    case 'platform':  return !u.platform
    case 'version':   return !u.appVersion
    case 'locale':    return !u.locale
    case 'country':   return !u.country
    default:          return false
  }
}

const ASC_DEFAULT_KEYS = new Set<UserSortKey>(['subject', 'platform', 'locale', 'country'])
const defaultSortDir = (key: UserSortKey): SortDir => (ASC_DEFAULT_KEYS.has(key) ? 'asc' : 'desc')

const USER_SORT_STORAGE_KEY = 'portle.userSort'
const USER_SORT_KEY_SET = new Set<UserSortKey>(USER_COLUMNS.map(o => o.key))

// 열 폭은 데스크톱에서 눈으로 맞춘 값이다. 실제 폭은 글자 배율(--fz)을 따라 함께 늘어난다 —
// 칸을 px 로 못박으면 모바일(1.3배)에서 글자만 커져 값이 옆 칸 위에 그려진다(fzCols 주석).
// 래퍼 최소 폭도 이 정의에서 뽑는다. 손으로 더하면 열을 추가할 때 어긋난다.
// 언어 열은 'ko-KR' 이 52px 를 넘겨(69px) 잘리고 있었다 — 72px 로 올린다.
const USER_TABLE_COL_SPEC = '72px 72px 72px 72px minmax(180px,1.6fr) 48px 56px 72px 56px 56px 52px 44px 52px 44px 44px 44px 52px 40px 56px 68px 48px 44px'
const USER_TABLE_COLS = fzCols(USER_TABLE_COL_SPEC)
const USER_TABLE_MIN_WIDTH = fzTableMinWidth(USER_TABLE_COL_SPEC, t.density.gapMd, t.density.panelPadY)
const userHeadCell: React.CSSProperties = {
  fontSize: `calc(${t.type.tableHead}px * var(--fz, 1))`, fontFamily: t.font.mono, color: t.neutrals.subtle,
  letterSpacing: 0.3, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden',
}
const userTextCell: React.CSSProperties = {
  fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, color: t.neutrals.muted,
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
}
const userNumCell: React.CSSProperties = {
  fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, fontFamily: t.font.mono, color: t.neutrals.text,
  fontVariantNumeric: 'tabular-nums', textAlign: 'center', whiteSpace: 'nowrap',
  // 칸보다 긴 값은 옆 칸을 덮는 대신 잘린다. nowrap 인 글자는 막아 두지 않으면 이웃 위에
  // 그대로 그려진다(LTableMono 와 같은 규칙). 잘린 것이 보이면 그 열 폭을 올리라는 신호다.
  minWidth: 0, overflow: 'hidden',
}
const emptyCell: React.CSSProperties = {
  fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, color: t.neutrals.subtle, fontFamily: t.font.mono,
}
const userDateCell: React.CSSProperties = {
  fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, fontFamily: t.font.mono, color: t.neutrals.muted,
  fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
  // 칸보다 긴 값은 옆 칸을 덮는 대신 잘린다. nowrap 인 글자는 막아 두지 않으면 이웃 위에
  // 그대로 그려진다(LTableMono 와 같은 규칙). 잘린 것이 보이면 그 열 폭을 올리라는 신호다.
  minWidth: 0, overflow: 'hidden',
}

// 사람 한 줄을 무엇으로 부를 것인가. 로그인한 사람은 계정으로, 아닌 사람은 기기로 부른다
// (보이스카드 사용자 표와 같은 규칙). 이메일이 있으면 이메일이 이름 자리에 온다.
// 이메일은 그 사람이 앱을 다시 열어 토큰 요청을 보내야 서버에 생기므로, 없는 동안은
// 계정 id 로 부른다. 이름(display name)은 포틀이 수집하지 않는다.
function identityOf(u: PortleUserRow): { label: string; full: string; account: boolean } {
  if (u.email) {
    return { label: u.email, full: `${u.email} (구글 계정 ${u.accountId ?? u.subject})`, account: true }
  }
  if (u.accountId) {
    return {
      label: u.accountId.length > 12 ? `${u.accountId.slice(0, 10)}…` : u.accountId,
      full: `구글 계정 ${u.accountId} (이메일 아직 없음)`,
      account: true,
    }
  }
  const deviceId = u.deviceIds[0] ?? u.subject.replace(/^device:/, '')
  return {
    label: `#${deviceId.replace(/-/g, '').slice(0, 4) || '????'}`,
    full: `기기 ${deviceId}`,
    account: false,
  }
}

const TYPE_TONES: Record<PortleUserRow['type'], { bg: string; fg: string; label: string }> = {
  google: { ...tonePalettes.info, label: '구글' },
  device: { bg: t.neutrals.inner, fg: t.neutrals.muted, label: '기기' },
  other:  { ...tonePalettes.neutral, label: '기타' },
}

// 날짜 셀 — 두 줄(날짜 / (요일) 시각). 값이 없으면 '—' 한 글자만.
function DateCell({ at }: { at: string | null }) {
  if (!at) return <div style={{ ...userDateCell, textAlign: 'center' }}><span style={emptyCell}>—</span></div>
  return (
    <div style={{ ...userDateCell, display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
      <span>{formatDateShort(at)}</span>
      <span style={{ fontSize: `calc(${t.type.chartLabel}px * var(--fz, 1))`, color: t.neutrals.subtle }}>({kstWeekday(at)}) {kstTime(at)}</span>
    </div>
  )
}

// 도달 여부 셀 — 보이스카드의 '드라이브 / 활성화' 열과 같은 문법(완료·미완료, 날짜는 툴팁).
function ReachedCell({ at, label }: { at: string | null; label: string }) {
  return (
    <div
      title={at ? `${label} ${formatDateShort(at)} ${kstTime(at)}` : `${label} 안 함`}
      style={{
        fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, fontFamily: t.font.sans, fontWeight: t.weight.medium,
        whiteSpace: 'nowrap', textAlign: 'center', color: at ? t.neutrals.text : t.neutrals.subtle,
      }}
    >
      {at ? '완료' : '미완료'}
    </div>
  )
}

// 앱버전 비교 — 1.0.9 < 1.0.10 이 되도록 세그먼트 숫자로 본다. 버전 없음은 가장 오래된 것.
function versionRank(v: string | null): number[] {
  return v ? v.split(/[^0-9]+/).filter(Boolean).map(Number) : [-1]
}
// 앱버전 파이 데이터: 최신 버전순 상위 3개 + 나머지(구버전·미상)는 기타 — 업데이트 전파 파악용
// (보이스카드 versionPieData 와 같은 규칙). 앱 이벤트가 없어 버전을 모르는 사람은 미상으로 기타에 든다.
function versionPieData(rows: PortleUserRow[]): Array<{ name: string; value: number }> {
  const byVersion = new Map<string, number>()
  let unknown = 0
  for (const u of rows) {
    if (u.appVersion) byVersion.set(u.appVersion, (byVersion.get(u.appVersion) ?? 0) + 1)
    else unknown++
  }
  const named = Array.from(byVersion.entries()).sort((a, b) => compareVersion(b[0], a[0]))
  const top = named.slice(0, 3).map(([version, value]) => ({ name: `v${version}`, value }))
  const rest = named.slice(3).reduce((sum, [, v]) => sum + v, 0) + unknown
  return rest > 0 ? [...top, { name: '기타', value: rest }] : top
}

function compareVersion(a: string | null, b: string | null): number {
  const va = versionRank(a), vb = versionRank(b)
  for (let i = 0; i < Math.max(va.length, vb.length); i++) {
    const d = (va[i] ?? 0) - (vb[i] ?? 0)
    if (d) return d
  }
  return 0
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
        // 없는 날짜는 언제나 맨 아래로 — 빈 칸이 '가장 오래된 것'처럼 줄 맨 위에 서면 안 된다
        case 'installed': return cmpDate(a.installedAt, b.installedAt)
        case 'signin':    return cmpDate(a.signedInAt, b.signedInAt)
        case 'last':      return a.lastAt.localeCompare(b.lastAt)
        case 'subject':   return identityOf(a).label.localeCompare(identityOf(b).label, 'ko')
        case 'platform':  return (a.platform ?? '').localeCompare(b.platform ?? '')
        case 'version':   return compareVersion(a.appVersion, b.appVersion)
        case 'locale':    return (a.locale ?? '').localeCompare(b.locale ?? '')
        case 'country':   return (a.country ?? '').localeCompare(b.country ?? '')
        case 'drive':     return cmpDate(a.driveLinkedAt, b.driveLinkedAt)
        case 'ledger':    return cmpDate(a.ledgerActivatedAt, b.ledgerActivatedAt)
        case 'expires':   return cmpDate(a.entitlement?.expiresAt ?? null, b.entitlement?.expiresAt ?? null)
        case 'active7':   return a.activeDays7d - b.activeDays7d
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
      // 값이 없는 쪽은 방향과 무관하게 아래로. dirMul 을 먹이면 오름차순에서 빈 칸이
      // 줄 맨 위를 차지해, 정작 보려던 사람들이 스크롤 아래로 밀려난다.
      const miss = missingFor(userSort, a) ? 1 : 0
      const missB = missingFor(userSort, b) ? 1 : 0
      if (miss !== missB) return miss - missB
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
    {/* 카드1: 활동 지표 — 호출량/성공률/토큰 + kind별 분해 */}
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: t.density.blockGap }}>
        <LSectionHead
          title="활동 지표"
          mb={10}
          action={<LHeadBtn icon="refresh" title="데이터 새로고침" onClick={onRefresh} busy={refreshing} />}
        />
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.gapXs }}>
            {[0, 1, 2].map(i => (
              <Bone key={i} h={36} />
            ))}
          </div>
        )}
        {!loading && stats && (() => {
          const totals = stats.totals
          let run = 0
          const cumCalls = stats.daily.map(d => ({ date: d.date, value: (run += d.success + d.empty + d.failure) }))
          const todayRow = stats.daily.length ? stats.daily[stats.daily.length - 1] : null
          const todayCalls = todayRow ? todayRow.success + todayRow.empty + todayRow.failure : 0
          const todayRate = todayCalls > 0 && todayRow ? rate(todayRow.success, todayCalls) : null
          return (
            <StatRows cols={mobile ? 'repeat(2, minmax(0,1fr))' : (dashCols === 2 ? 'repeat(3, minmax(0,1fr))' : 'repeat(5, minmax(0,1fr))')}>
              <LStat
                label="AI 사용자"
                title="AI를 한 번이라도 호출한 subject 누적 (google 로그인 + device 기기 — 기기 사용자도 정상 경로)."
                value={totals.subjects.toLocaleString()}
                sub={`오늘 ${totals.subjectsToday.toLocaleString()}명 · 7일 ${totals.subjects7d.toLocaleString()}명`}
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
                label="공유 시트"
                title="단축코드로 공유된 원장 시트 수 (portle_short_codes) — 사용자가 만든 유입 루프."
                value={totals.sharedSheets.toLocaleString()}
                sub="단축코드 발급 기준"
              />
            </StatRows>
          )
        })()}
      </div>
      {!loading && stats && (
        <LCardFoot
          left="서버 AI 로그 기준"
          right={`호출 ${stats.totals.calls.toLocaleString()}회`}
          style={{ marginTop: 0, padding: `${t.density.panelPadY}px ${t.density.cardPad}px` }}
        />
      )}
    </LCard>

    {/* 카드2: 결제 전환 퍼널 */}
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: t.density.blockGap }}>
        <LSectionHead
          title="결제 전환"
          mb={t.density.panelPadY + t.density.panelPadX}
          action={<LHeadBtn icon="refresh" title="데이터 새로고침" onClick={onRefresh} busy={refreshing} />}
        />

        {error && <LNotice tone="danger" text={error} />}

        {loading && (() => {
          return (
            <div style={{ display: 'grid', gridTemplateColumns: splitLayout ? 'minmax(0,1fr) minmax(0,1fr)' : 'minmax(0,1fr)', gap: t.density.kpiGap, alignItems: 'stretch' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.kpiGap, minWidth: 0 }}>
                <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: t.density.kpiGap }}>
                  {[0, 1, 2, 3, 4, 5].map(i => <Bone key={i} h={64} />)}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: t.density.kpiGap }}>
                  {[0, 1, 2].map(i => <Bone key={i} h={150} />)}
                </div>
              </div>
              <Bone h={splitLayout ? undefined : 190} style={{ minWidth: 0, height: splitLayout ? '100%' : 190 }} />
            </div>
          )
        })()}

        {!loading && stats && (() => {
          const totals = stats.totals
          // 퍼널: 스토어 방문 → 설치 기기 → 구글 로그인 → 드라이브 연동 → 원장 활성화 → 구독 가입.
          // 원장 활성화는 구글 시트(sheet_activated)와 기기 원장(local_ledger_activated)을 합친 것이다.
          // 기기 원장은 로그인·연동 없이도 열리므로 그 칸의 전환은 드라이브 연동이 아니라 설치 기기 대비다.
          // 보이스카드와 동일 단계. 스토어 방문은 portle_store_visits(스토어 리포트 수집 잡),
          // 설치/로그인/연동/활성화는 portle_app_events(앱 텔레메트리) — 수집 전 단계는 '수집 대기'.
          // 퍼널 축은 AI 사용일이 아니라 "이 퍼널에 무슨 일이든 있었던 기간"이어야 한다.
          // stats.daily(AI 호출)만 쓰면 AI를 아무도 안 쓴 날부터 축이 끊겨, 그 뒤에 들어온
          // 설치·로그인·활성화가 스파크라인에서 사라진다 — 카드 숫자는 57인데 선은 47에서
          // 나흘 전에 멈춰 있었다 (2026-08-27). 모든 계열의 날짜를 합쳐 오늘까지 채운다.
          const axis = (() => {
            const marks = [
              ...stats.daily.map(d => d.date),
              ...stats.storeVisits.map(v => v.date),
              ...stats.funnel.installs, ...stats.funnel.signins,
              ...stats.funnel.driveLinks, ...stats.funnel.ledgerActivations,
            ].filter(Boolean).sort()
            const todayKst = kstToday()
            if (marks.length === 0) return [todayKst]
            const out: string[] = []
            for (let d = new Date(`${marks[0]}T00:00:00+09:00`); ; d.setDate(d.getDate() + 1)) {
              const key = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
              out.push(key)
              if (key >= todayKst) break
            }
            return out
          })()
          const today = axis.length ? axis[axis.length - 1] : ''
          const sevenAgo = axis.length >= 7 ? axis[axis.length - 7] : (axis[0] ?? '')
          const cumOf = (dates: string[]) => {
            const sorted = [...dates].sort()
            return axis.map(date => ({ date, value: sorted.filter(d => d <= date).length }))
          }
          const countToday = (dates: string[]) => dates.filter(d => d === today).length
          const count7 = (dates: string[]) => dates.filter(d => d >= sevenAgo).length
          const todaySub = (dates: string[]) =>
            `오늘 ${countToday(dates).toLocaleString()}명 · 7일 ${count7(dates).toLocaleString()}명`

          // 스토어 방문 — 일별 합산을 축으로 재샘플해 누적 (보이스카드 storeVisitsData 문법)
          const sv = stats.storeVisits
          const svTotal = sv.reduce((sum, r) => sum + r.visitors, 0)
          const svLast = sv[sv.length - 1]
          // 스토어 리포트는 ~1주 지연 → '7일'은 마지막 데이터일 기준 최근 7일
          const sv7From = svLast ? new Date(new Date(svLast.date + 'T00:00:00Z').getTime() - 6 * 86400000).toISOString().slice(0, 10) : ''
          const sv7 = sv.filter(r => r.date >= sv7From).reduce((sum, r) => sum + r.visitors, 0)
          let svCum = 0, svIdx = 0
          const storeVisitsData = axis.map(date => {
            while (svIdx < sv.length && sv[svIdx].date <= date) { svCum += sv[svIdx].visitors; svIdx++ }
            return { date, value: svCum }
          })

          const { installs, signins, driveLinks, ledgerActivations, sheetActivations, localActivations } = stats.funnel
          const installsCum = cumOf(installs)
          const signinsCum = cumOf(signins)
          const driveCum = cumOf(driveLinks)
          const ledgerCum = cumOf(ledgerActivations)

          // 단계별 전환율 — 직전 단계 대비. 앞 단계가 수집 전(0)이면 전환을 적지 않는다.
          // 뒤 단계가 앞 단계보다 크면(=앞 단계 이벤트가 덜 걷힌 상태) 100%로 눌러 적지 않는다.
          // 한때 drive_linked 1건에 sheet_activated 57건이라, 그대로 두면 "전환 100%"라는
          // 거짓이 나왔다. 계측이 메워지기 전까지는 비워 두는 편이 정직하다.
          const conv = (n: number, d: number): number | null => (d > 0 && n <= d ? rate(n, d) : null)
          const installConv = conv(installs.length, svTotal)
          const loginConv = conv(signins.length, installs.length)
          const driveConv = conv(driveLinks.length, signins.length)
          const ledgerConv = conv(ledgerActivations.length, installs.length)
          const subConv = conv(totals.activeEntitlements, ledgerActivations.length)
          // 점선 = 전환율 추이 (dualScale 우측 축, 0~100 고정) — 분모 단계가 수집돼야 그린다
          const rateSeries = (num: Array<{ value: number }>, den: Array<{ value: number }>) =>
            axis.map((date, i) => ({ date, value: den[i].value > 0 ? Math.round((num[i].value / den[i].value) * 1000) / 10 : 0 }))
          // 전환율 숫자를 못 적는 단계(분모가 덜 걷혀 뒤 단계가 더 큰 경우)는 점선도 그리지 않는다.
          // 드라이브 연동 1건 대비 시트 활성화 57건이던 구간에서 5700% 점선이 카드 밖으로 튀었다.
          const loginRateData = loginConv !== null ? rateSeries(signinsCum, installsCum) : undefined
          const driveRateData = driveConv !== null ? rateSeries(driveCum, signinsCum) : undefined
          const ledgerRateData = ledgerConv !== null ? rateSeries(ledgerCum, installsCum) : undefined

          const PENDING_STORE = '수집 대기 (스토어 리포트)'
          const PENDING_APP = '수집 대기 (앱 이벤트)'

          // 분포 파이 3장 — 보이스카드와 같은 구성(플랫폼 · 국가 · 앱버전), 같은 탭(기기 · 활성 · 결제).
          // 기기 = 앱 이벤트가 있는 사람(설치 기기 카드와 같은 모집단). 활성 = 원장 활성화까지 간 사람.
          // 결제 = 만료 전 구독이 있는 사람. AI 로그만 있는 사람은 플랫폼·버전을 몰라 기기 탭에서 뺀다.
          const appUsers = stats.users.filter(u => u.deviceIds.length > 0)
          const activeUsers = appUsers.filter(u => u.stage === 'ledger')
          const payingUsers = stats.users.filter(u => u.entitlement?.active)
          const distOf = (rows: PortleUserRow[], label: (u: PortleUserRow) => string) => {
            const m = new Map<string, number>()
            for (const u of rows) m.set(label(u), (m.get(label(u)) ?? 0) + 1)
            return Array.from(m, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
          }
          const platformOf = (u: PortleUserRow) => u.platform === 'ios' ? 'iOS' : u.platform === 'android' ? 'Android' : '미상'
          const countryOf = (u: PortleUserRow) => formatCountryName(u.country ?? 'unknown')

          return (
            <div style={{ display: 'grid', gridTemplateColumns: splitLayout ? 'minmax(0,1fr) minmax(0,1fr)' : 'minmax(0,1fr)', gap: `${t.density.pagePadBottom}px ${t.density.pagePadX}px`, alignItems: 'stretch' }}>
            {/* 좌: 퍼널 6카드(3×2) + 플랫폼/국가/앱버전 파이 · 우: 일별 활동자 전체높이 (1열 모드 전용, 보이스카드와 동일) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.pagePadBottom, minWidth: 0 }}>
            <StatRows cols={mobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(3, minmax(0,1fr))'}>
              <LStat
                label="스토어 방문"
                title="플레이·앱스토어 등록정보 방문자 누적 (portle_store_visits). 스토어 리포트 특성상 ~1주 지연. 퍼널: 방문 → 설치 → 구글 로그인 → 드라이브 연동 → 원장 활성화 → 구독."
                value={svTotal > 0 ? svTotal.toLocaleString() : '—'}
                valueExtra={svLast ? (
                  <span style={{
                    fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, marginLeft: t.density.gapSm, fontWeight: t.weight.medium,
                    fontFamily: t.font.mono, color: t.neutrals.subtle, fontVariantNumeric: 'tabular-nums' as const,
                  }}>
                    {svLast.date.slice(5)} 기준
                  </span>
                ) : undefined}
                sub={svTotal > 0 ? `최근 ${(svLast?.visitors ?? 0).toLocaleString()}명 · 7일 ${sv7.toLocaleString()}명` : PENDING_STORE}
                sparkline={mobile || svTotal === 0 ? undefined : storeVisitsData}
              />
              <LStat
                label="설치 기기"
                title="앱을 설치해 실행까지 온 고유 기기 누적 (portle_app_events: app_opened). 전환 = 스토어 방문 대비."
                value={installs.length > 0 ? installs.length.toLocaleString() : '—'}
                valueExtra={installConv !== null ? rateExtra('전환', installConv) : undefined}
                sub={installs.length > 0 ? todaySub(installs) : PENDING_APP}
                sparkline={mobile || installs.length === 0 ? undefined : installsCum}
              />
              <LStat
                label="구글 로그인"
                title="구글 계정으로 로그인한 사용자 누적. 앱 이벤트(signin_completed) 수집 전에는 AI 사용 로그의 google 계정 첫 사용일로 근사. 전환 = 설치 기기 대비. 점선 = 로그인율 추이."
                value={signins.length.toLocaleString()}
                valueExtra={loginConv !== null ? rateExtra('전환', loginConv) : undefined}
                sub={todaySub(signins)}
                tone={signins.length > 0 ? 'pos' : 'default'}
                sparkline={mobile || signins.length === 0 ? undefined : signinsCum}
                sparkline2={mobile ? undefined : loginRateData}
                sparkColor={t.chart.mono}
                spark2Color={t.neutrals.subtle}
                sparkFormat2={(v) => `${v}%`}
                spark2Domain={[0, 100]}
                dualScale
              />
              <LStat
                label="드라이브 연동"
                title="Google Drive 연동(원장 저장소)까지 마친 기기 누적 (portle_app_events: drive_linked). 전환 = 구글 로그인 대비."
                value={driveLinks.length > 0 ? driveLinks.length.toLocaleString() : '—'}
                valueExtra={driveConv !== null ? rateExtra('전환', driveConv) : undefined}
                sub={driveLinks.length > 0 ? todaySub(driveLinks) : PENDING_APP}
                sparkline={mobile || driveLinks.length === 0 ? undefined : driveCum}
                sparkline2={mobile ? undefined : driveRateData}
                sparkColor={t.chart.mono}
                spark2Color={t.neutrals.subtle}
                sparkFormat2={(v) => `${v}%`}
                spark2Domain={[0, 100]}
                dualScale
              />
              <LStat
                label="원장 활성화"
                title="원장에 실제 기록을 시작한 기기 누적 — 구글 시트(sheet_activated)와 기기 원장(local_ledger_activated) 둘 다. 한 기기는 어느 쪽이든 처음 기록한 날 한 번만 센다. 전환 = 설치 기기 대비(기기 원장은 로그인·연동 없이도 열린다). 기기 원장 이벤트는 앱 1.0.3 부터 온다."
                value={ledgerActivations.length > 0 ? ledgerActivations.length.toLocaleString() : '—'}
                valueExtra={ledgerConv !== null ? rateExtra('전환', ledgerConv) : undefined}
                sub={ledgerActivations.length > 0
                  ? `시트 ${sheetActivations.length.toLocaleString()} · 기기 ${localActivations.length.toLocaleString()} · 오늘 ${countToday(ledgerActivations).toLocaleString()}명`
                  : PENDING_APP}
                sparkline={mobile || ledgerActivations.length === 0 ? undefined : ledgerCum}
                sparkline2={mobile ? undefined : ledgerRateData}
                sparkColor={t.chart.mono}
                spark2Color={t.neutrals.subtle}
                sparkFormat2={(v) => `${v}%`}
                spark2Domain={[0, 100]}
                dualScale
              />
              <LStat
                label="구독 가입"
                title="portle_entitlements 중 만료 전 구독 (Apple/Google IAP). 결제율 = 구독 ÷ 원장 활성화 (활성화 수집 전엔 미표시)."
                value={totals.activeEntitlements.toLocaleString()}
                valueExtra={subConv !== null ? rateExtra('결제', subConv) : undefined}
                sub="스토어 IAP 기준"
                tone={totals.activeEntitlements > 0 ? 'pos' : 'default'}
              />
            </StatRows>
            {/* 플랫폼 / 국가 / 앱버전 — 국가는 1.0.3·백엔드 갱신 뒤부터 채워진다(그 전 기기는 미상) */}
            <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(3, minmax(0,1fr))', gap: `${t.density.pagePadBottom}px ${t.density.pagePadX}px` }}>
              <DistributionPie
                title="플랫폼"
                tabs={[
                  { key: 'devices', label: '기기', data: distOf(appUsers, platformOf) },
                  { key: 'active', label: '활성', data: distOf(activeUsers, platformOf) },
                  { key: 'paying', label: '결제', data: distOf(payingUsers, platformOf) },
                ]}
                palette={PIE_PALETTE}
                unit="명"
              />
              <DistributionPie
                title="국가"
                tabs={[
                  { key: 'devices', label: '기기', data: distOf(appUsers, countryOf) },
                  { key: 'active', label: '활성', data: distOf(activeUsers, countryOf) },
                  { key: 'paying', label: '결제', data: distOf(payingUsers, countryOf) },
                ]}
                palette={PIE_PALETTE}
                unit="명"
                topN={3}
                monoFlags
              />
              <DistributionPie
                title="앱버전"
                tabs={[
                  { key: 'all', label: '전체', data: versionPieData(appUsers) },
                  { key: 'ios', label: 'iOS', data: versionPieData(appUsers.filter(u => u.platform === 'ios')) },
                  { key: 'and', label: 'AND', data: versionPieData(appUsers.filter(u => u.platform === 'android')) },
                ]}
                palette={PIE_PALETTE}
                unit="대"
              />
            </div>
            </div>
            {/* 일별 활동자 — 1열 모드는 우측 전체높이, 그 외(2열·모바일) 타일 아래 전체폭 (보이스카드와 동일) */}
            <div style={{ minWidth: 0, minHeight: splitLayout ? undefined : 190 }}>
              <PortleDauTrendCard daily={stats.dailyActive} />
            </div>
            </div>
          )
        })()}
      </div>
      <LCardFoot
        left="서버 AI 로그 기준"
        right="원장: 기기/Drive"
        style={{ marginTop: 0, padding: `${t.density.panelPadY}px ${t.density.cardPad}px` }}
      />
    </LCard>
    </div>

    {/* 사용자 테이블 — 2열 모드에서 두 열을 모두 차지한다 (보이스카드/리뷰노트와 동일). */}
    <div style={{
      display: 'flex', flexDirection: 'column', gap: t.density.blockGap, minWidth: 0,
      ...(dashCols === 2 && !mobile ? { gridColumn: '1 / -1' } : null),
    }}>
    <LCard pad={0}>
      {loading && (
        <div style={{ padding: t.density.cardPad, paddingBottom: t.density.blockGap }}>
          <LSectionHead
            title="사용자"
            mb={t.density.pagePadBottom}
            action={<LHeadBtn icon="refresh" title="데이터 새로고침" onClick={onRefresh} busy={refreshing} />}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.gapXs }}>
            {[0, 1, 2, 3, 4, 5].map(i => (
              <Bone key={i} h={40} />
            ))}
          </div>
        </div>
      )}
      {!loading && stats && (
        <div style={{ padding: t.density.cardPad, paddingBottom: t.density.blockGap }}>
          <LSectionHead
            title="사용자"
            mb={t.density.pagePadBottom}
            tools={mobile ? (
              // 모바일은 헤더 클릭 정렬이 좁아서 안 되므로 드롭다운을 둔다.
              <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapXs }}>
                <select
                  value={userSort}
                  onChange={e => handleSortChange(e.target.value as UserSortKey)}
                  style={{
                    height: t.density.controlHSm, padding: `0 ${t.density.gapSm}px`, borderRadius: t.radius.sm,
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
          {/* PC/모바일 동일 테이블 — 모바일은 가로 스크롤 (보이스카드와 동일) */}
          <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: USER_TABLE_MIN_WIDTH, display: 'flex', flexDirection: 'column', gap: t.density.tableRowGap }}>
            {/* 테이블 헤더 — 클릭하여 정렬, 같은 컬럼 재클릭 시 방향 토글 */}
            <div data-table-head="" style={{ display: 'grid', gridTemplateColumns: USER_TABLE_COLS, gap: t.density.gapMd, alignItems: 'center', padding: `0 ${t.density.panelPadY}px ${t.density.gapSm}px` }}>
              {USER_COLUMNS.map(col => {
                const active = userSort === col.key
                return (
                  <button
                    key={col.key}
                    onClick={() => handleSortChange(col.key)}
                    title={`${col.label} 기준 정렬`}
                    style={{
                      ...userHeadCell, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                      display: 'flex', alignItems: 'center', gap: t.density.tableRowGap, width: '100%',
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
              const ident = identityOf(user)
              const okPct = rate(user.success, user.calls)
              const ent = user.entitlement
              return (
                <div key={user.subject} data-table-row="" style={{
                  display: 'grid', gridTemplateColumns: USER_TABLE_COLS, gap: t.density.gapMd, alignItems: 'center',
                  padding: `${t.density.gapSm}px ${t.density.panelPadY}px`, borderRadius: t.radius.sm, background: t.neutrals.inner,
                }}>
                  {/* 첫 활동 — 설치·로그인·AI 호출 중 가장 이른 것. 두 줄: 날짜 / (요일) 시각 */}
                  <div style={{ ...userDateCell, display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                    <span>{formatDateShort(user.firstAt)}</span>
                    <span style={{ fontSize: `calc(${t.type.chartLabel}px * var(--fz, 1))`, color: t.neutrals.subtle }}>({kstWeekday(user.firstAt)}) {kstTime(user.firstAt)}</span>
                  </div>
                  {/* 설치 · 로그인 — 앱 이벤트가 없는 사람(AI 로그로만 잡힌 사람)은 모른다 */}
                  <DateCell at={user.installedAt} />
                  <DateCell at={user.signedInAt} />
                  {/* 활동 — 앱 이벤트와 AI 호출을 통틀어 가장 최근 */}
                  <div style={{ ...userDateCell, display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                    <span>{formatDateShort(user.lastAt)}</span>
                    <span style={{ fontSize: `calc(${t.type.chartLabel}px * var(--fz, 1))`, color: t.neutrals.subtle }}>({kstWeekday(user.lastAt)}) {kstTime(user.lastAt)}</span>
                  </div>
                  {/* 사용자 — 로그인한 사람은 계정으로, 아닌 사람은 기기로 부른다.
                      아바타 원은 구글 프로필 사진이 들어올 자리다(보이스카드와 같은 자리). */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm, minWidth: 0 }}
                       title={`${ident.full}${user.deviceIds.length > 1 ? ` · 기기 ${user.deviceIds.length}대` : ''}`}>
                    <div style={{
                      width: 22, height: 22, borderRadius: 22, flexShrink: 0,
                      background: ident.account ? typeTone.bg : '#E4E7EB',
                      color: ident.account ? typeTone.fg : '#3A3D42',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: `calc(${t.type.tableHead}px * var(--fz, 1))`, fontWeight: t.weight.semibold,
                    }}>
                      {(user.email ? user.email.charAt(0) : ident.account ? 'G' : ident.label.replace(/^#/, '').charAt(0)).toUpperCase() || '?'}
                    </div>
                    <LTableBadge tone={typeTone}>{typeTone.label}</LTableBadge>
                    <span style={{
                      ...userTextCell,
                      // 이메일은 읽는 글자라 sans, 계정 id·기기번호는 대조하는 글자라 mono.
                      fontFamily: user.email ? t.font.sans : t.font.mono,
                      color: user.email ? t.neutrals.text : t.neutrals.muted,
                    }}>{ident.label}</span>
                  </div>
                  {/* 플랫폼 · 앱버전 — 기기 이벤트에서 온다. 이벤트가 없는 사람은 '—' */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
                    {user.platform ? (
                      <LTableBadge tone={user.platform === 'ios' ? tonePalettes.neutral : user.platform === 'android' ? tonePalettes.pos : tonePalettes.neutral}>
                        {user.platform === 'ios' ? 'iOS' : user.platform === 'android' ? 'AND' : user.platform.toUpperCase()}
                      </LTableBadge>
                    ) : <span style={emptyCell}>—</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
                    {user.appVersion
                      ? <LTableBadge tone={tonePalettes.neutral}>v{user.appVersion}</LTableBadge>
                      : <span style={emptyCell}>—</span>}
                  </div>
                  {/* 언어 · 국가 — 앱이 1.0.3 부터 보낸다. 그 전 기기는 '—' */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
                    {user.locale
                      ? <LTableBadge tone={tonePalettes.neutral}>{user.locale.toUpperCase()}</LTableBadge>
                      : <span style={emptyCell}>—</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
                    {user.country ? (
                      <span title={countryName(user.country)} style={{ display: 'inline-flex', minWidth: 0 }}>
                        <LTableBadge tone={tonePalettes.neutral}>{user.country.toUpperCase()}</LTableBadge>
                      </span>
                    ) : <span style={emptyCell}>—</span>}
                  </div>
                  {/* 드라이브 · 원장 — 보이스카드의 '드라이브 / 활성화' 두 열과 같은 자리.
                      원장은 구글 시트든 기기 원장이든 처음 기록한 때다. */}
                  <ReachedCell at={user.driveLinkedAt} label="드라이브 연동" />
                  <ReachedCell at={user.ledgerActivatedAt} label="원장 활성화" />
                  <div style={userNumCell}>{user.calls || '—'}</div>
                  <div style={{ ...userNumCell, color: okPct >= 80 ? t.neutrals.text : t.neutrals.muted }}>{user.calls ? `${okPct}%` : '—'}</div>
                  <div style={userNumCell}>{(user.byKind.echo_news ?? 0) || '—'}</div>
                  <div style={userNumCell}>{(user.byKind.ingest_transactions ?? 0) || '—'}</div>
                  <div style={userNumCell}>{(user.byKind.translate_rule ?? 0) || '—'}</div>
                  <div style={userNumCell}>{formatTokens(user.inputTokens + user.outputTokens)}</div>
                  <div style={userNumCell}>{user.sharedSheets || '—'}</div>
                  {/* 구독 — 활성이면 스토어 표시, 만료는 흐리게 */}
                  <div style={{ ...userNumCell, fontSize: `calc(${t.type.tableHead}px * var(--fz, 1))` }} title={ent ? `${ent.productId} · ${formatDateShort(ent.expiresAt)} 만료` : undefined}>
                    {ent ? (
                      <LTableBadge tone={ent.active ? tonePalettes.pos : { bg: t.neutrals.inner, fg: t.neutrals.subtle }}>
                        {ent.store === 'apple' ? 'Apple' : 'Google'}
                      </LTableBadge>
                    ) : '—'}
                  </div>
                  {/* 만료 — 구독이 언제까지인가. 지난 날짜는 흐리게 */}
                  <div style={{ ...userDateCell, textAlign: 'center' }}>
                    {ent
                      ? <span style={{ color: ent.active ? t.neutrals.muted : t.neutrals.subtle }}>{formatDateShort(ent.expiresAt)}</span>
                      : <span style={emptyCell}>—</span>}
                  </div>
                  <div style={userNumCell}>{user.activeDays}</div>
                  {/* 7일 — 최근 7일 중 며칠 왔나. 지금 살아 있는 사람인지 보는 창(보이스카드와 동일) */}
                  <div style={userNumCell}>
                    {user.activeDays7d > 0
                      ? <span style={{ fontWeight: t.weight.semibold }}>{user.activeDays7d}<span style={{ color: t.neutrals.subtle, fontWeight: t.weight.regular }}>/7</span></span>
                      : <span style={emptyCell}>—</span>}
                  </div>
                </div>
              )
            })}
            {sortedUsers.length === 0 && (
              <div style={{ padding: `${t.density.cardPad}px ${t.density.panelPadY}px`, textAlign: 'center', fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, color: t.neutrals.subtle }}>
                아직 앱을 연 사람이 없습니다
              </div>
            )}
          </div>
          </div>
        </div>
      )}
      {!loading && stats && (
        <LCardFoot
          left={`AI 사용 ${stats.totals.subjects}명 · 설치만 ${stats.totals.deviceOnly}명${
            stats.totals.internalDevices > 0 ? ` · 내부 기기 ${stats.totals.internalDevices}대 제외` : ''
          }`}
          right={`${sortedUsers.length}명`}
          style={{ marginTop: 0, padding: `${t.density.panelPadY}px ${t.density.cardPad}px` }}
        />
      )}
    </LCard>
    </div>
    </>
  )
}
