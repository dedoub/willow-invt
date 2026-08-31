'use client'

import { useState, useMemo, useEffect } from 'react'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead, LHeadBtn } from '@/app/(dashboard)/_components/linear-section-head'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { getStoredPageSize, savePageSize } from '@/app/(dashboard)/_components/linear-page-size'
import { DistributionPie } from '@/app/(dashboard)/_components/distribution-pie'
import { kstDateKey, kstToday, kstDaysAgo } from '@/lib/kst'
import { COUNTRY_NAMES, codeToFlag, formatCountryName } from '@/lib/country-format'
import { voicecardsDeviceDisplayName, voicecardsLearningActivationDate } from '@/lib/voicecards-device-journey'
import { LPageSize } from '@/app/(dashboard)/_components/linear-table'

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserStats {
  totalUsers: number
  // 기기 계정(로그인 없이 크레딧을 쓰는 사용자). 병합된 계정은 제외.
  deviceAccounts: number
  // 그중 실제로 덱을 만든 수 — 퍼널 '학습 활성화'에 구글 활성화와 합산된다.
  deviceAccountsActivated: number
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
    totalSheets: number
  }>
  users: Array<{
    id: string
    nickname: string | null
    email: string | null
    appVersion: string | null
    platform: string | null
    locale: string | null
    country: string | null
    hasPurchased: boolean
    credits: number
    purchasedCredits: number
    bonusCredits: number
    offerStage: string | null
    offerStageAt: string | null
    creditsUsed: number
    creditsSpent?: number
    hasFolder: boolean
    ownCards?: number
    sheetCount: number
    cards: number
    flips?: number
    attempts: number
    cardsToday: number
    attemptsToday: number
    listenToday: number
    flipsToday?: number
    spentToday?: number
    activeDays7d: number
    purchasedToday: number
    balanceDeltaToday: number
    sheetsDeltaToday: number
    intentPremiumVoice: boolean
    intentAi: boolean
    intentBanner: boolean
    intentGated: boolean
    hotLead: boolean
    purchaseScore: number
    lastIntentAt: string | null
    lastPurchaseAt: string | null // 마지막 구매 시각. 산 적 없으면 null
    // 백그라운드 재생 보장 만료 (users.unlimited_until) — 기간권. 산 적 없으면 null.
    unlimitedUntil: string | null
    unlimitedDaysLeft?: number // 남은 일수(서버 확정). 만료·미보유는 0
    createdAt: string
    activatedAt?: string | null
    lastActiveAt: string | null
    // 설치일 — 이 사용자의 기기 중 가장 이른 first_seen. 뷰 이전 가입자는 null.
    installedAt: string | null
  }>
}

interface CombinedStats {
  combined: {
    totalRevenue: number
    totalCreditsSold: number
    totalPaidUsers: number
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
    loggedDevices: number
    newLoggedDevices?: number
    memberLoggedDevices?: number
    anonDevices: number
    // 직전 30일(당일 포함) 활동 디바이스 distinct = 롤링 MAU.
    // active30 은 로그인 없이 쓰는 기기 계정까지 포함하고, memberActive30 은 로그인한
    // 디바이스만 센다(로그인율 분모). 보이스카드는 로그인 없이도 쓸 수 있고 그 사용자도
    // 크레딧을 사므로 1인당 지표의 분모는 active30 이 맞다 — 학습 활성화 카드가 구글
    // 경로와 기기 계정을 합산하는 것과 같은 이유다.
    active30?: number
    memberActive30?: number
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
  dailyFlips?: Array<{ date: string; flips: number }>
  dailyCreditSpend?: Array<{ date: string; tts: number; ai: number }>
  demoSheets: Array<{ sheetId: string; cards: number; devices: number }>
  platforms: Array<{ platform: string; devices: number; events: number }>
  locales: Array<{ locale: string; devices: number }>
  countries: Array<{ country: string; devices: number }>
  signinPlatforms: Array<{ platform: string; devices: number }>
  signinLocales: Array<{ locale: string; devices: number }>
  signinCountries: Array<{ country: string; devices: number }>
  payingPlatforms: Array<{ platform: string; devices: number }>
  payingLocales: Array<{ locale: string; devices: number }>
  payingCountries: Array<{ country: string; devices: number }>
  storeVisits?: Array<{ date: string; visitors: number }>
  // 앱버전 분포 — 최근 30일 활동 기기 기준 (업데이트 전파속도)
  versions?: Array<{ version: string; devices: number }>
  versionsIos?: Array<{ version: string; devices: number }>
  versionsAndroid?: Array<{ version: string; devices: number }>
  journeys?: {
    stages: Array<{ stage: string; devices: number }>
    recentAnon: Array<{
      deviceId: string
      stage: string
      platform: string | null
      appVersion: string | null
      country: string | null
      firstSeenAt: string | null
      lastSeenAt: string
      activeDays: number
      activeDays7d: number
      cardsViewed: number
      cardsLearned: number
      flips: number
      creditsSpent?: number
      addSheetOpens: number
      aiGenOpens: number
      signinClicks: number
    }>
  }
}

export interface VoicecardsBlockProps {
  usersLoading: boolean
  eventsLoading: boolean
  revenueLoading: boolean
  stats: CombinedStats | null
  userStats: UserStats | null
  anonymousStats: AnonymousEventStats | null
  chartData?: Array<{ date: string; ios: number; android: number; total: number; credits: number; paidUsers?: number }>
  onRefresh: () => void
  refreshing: boolean
  cols: 1 | 2 // 레이아웃 열 수 (1=wide: 인사이트 분할·KPI 6/row). 단일 앱 페이지는 1 고정.
}

// ─── Helpers ──────────────────────────────────────────────────────────────────


function formatNumber(value: number): string {
  return value.toLocaleString()
}

// 테이블 셀용 짧은 날짜 — 연월일 모두 표시 (YY.MM.DD), KST 기준
function formatDateShort(dateString?: string | null): string {
  if (!dateString) return '—'
  const key = new Date(dateString).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }) // YYYY-MM-DD
  return `${key.slice(2, 4)}.${key.slice(5, 7)}.${key.slice(8, 10)}`
}

// 요일 한 글자 (KST) — 예: "일"
function formatWeekdayShort(dateString?: string | null): string {
  if (!dateString) return ''
  return new Date(dateString).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', weekday: 'short' })
}

// 시간 HH:mm (KST)
function formatTimeShort(dateString?: string | null): string {
  if (!dateString) return ''
  return new Date(dateString).toLocaleTimeString('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })
}

// 데스크톱 사용자 테이블 — 컬럼 정렬(헤더/행 공유).
// 설치 | 로그인 | 활동 | 닉네임 | 플랫폼 | 앱버전 | 언어 | 국가 | 드라이브 | 활성화 | 덱 | 카드 | …
// 설치가 맨 앞인 이유: 로그인 없이 쓰는 기기 계정이 생기면서 로그인일이 더 이상
// 여정의 시작점이 아니다. 설치 → (구글 로그인) → (드라이브) 순으로 읽힌다.
const USER_TABLE_COLS = '64px 64px 64px minmax(120px,1fr) 44px 64px 44px 52px 56px 48px 36px 48px 48px 52px 44px 78px 60px 54px 64px 64px 48px 52px 44px 48px 44px'
// 좁은 카드 폭에서 컬럼이 뭉개지지 않도록 가로 스크롤 허용. 컬럼 정의에서 자동 산출 —
// 하드코딩하면 열 추가 때 래퍼 폭이 그리드보다 좁아져 마지막 열들이 회색 행 배경
// 밖으로 삐져나온다(2026-07-11 활성화 열 추가 때 실제 발생).
const USER_TABLE_MIN_WIDTH = (() => {
  const cols = USER_TABLE_COLS.split(' ')
  const px = cols.reduce((sum, c) => {
    const m = c.match(/minmax\((\d+)px/) || c.match(/^(\d+)px$/)
    return sum + (m ? Number(m[1]) : 0)
  }, 0)
  return px + (cols.length - 1) * 6 /* grid gap */ + 16 /* 행 좌우 padding */
})()
const userHeadCell: React.CSSProperties = {
  fontSize: 'calc(9px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.subtle,
  letterSpacing: 0.3, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden',
}
const userNumCell: React.CSSProperties = {
  fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.text,
  fontVariantNumeric: 'tabular-nums', textAlign: 'center', whiteSpace: 'nowrap',
}

// 총값 + 오늘 변동(전일대비) 2줄 셀. delta 양수=초록(+), 음수=빨강(−), 0=미표시
function NumDeltaCell({ total, delta, dim, note }: { total: number; delta: number; dim?: boolean; note?: string }) {
  const d = Number(delta)
  return (
    <div style={{ ...userNumCell, color: dim ? t.neutrals.muted : userNumCell.color, display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.15 }}>
      <span>{formatNumber(total)}</span>
      {note && (
        <span style={{ fontSize: 'calc(8px * var(--fz, 1))', fontWeight: 500, color: t.neutrals.subtle }}>{note}</span>
      )}
      {Number.isFinite(d) && d !== 0 && (
        <span style={{ fontSize: 'calc(8px * var(--fz, 1))', fontWeight: 600, color: d > 0 ? '#059669' : '#DC2626' }}>
          {d > 0 ? '+' : '−'}{formatNumber(Math.abs(d))}
        </span>
      )}
    </div>
  )
}
const userDateCell: React.CSSProperties = {
  fontSize: 'calc(9.5px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted,
  fontVariantNumeric: 'tabular-nums', textAlign: 'center', whiteSpace: 'nowrap',
}

// 정렬용 점수: 구매 가능성(purchaseScore) 최우선 — 헤비 TTS(듣기 볼륨)를 기저로 한
// 서버측 점수(결제자=몰입 듣기 유저 패턴). 동점 시 최근 의도 시각. 구매자/무신호는 0.
function intentScore(u: UserStats['users'][number]): number {
  const ts = u.lastIntentAt ? new Date(u.lastIntentAt).getTime() : 0
  return (u.purchaseScore ?? 0) * 1e13 + ts
}

// 오퍼 단계 정렬용 진행도 점수 (높을수록 퍼널 뒤쪽). 없음은 최하.
function offerStageScore(stage: string | null): number {
  switch (stage) {
    case 'redeemed': return 6
    case 'snoozed':  return 4
    case 'seen':     return 3
    case 'sent':     return 2
    case 'dismissed': return 1
    case 'expired':  return 0.5
    default:         return 0
  }
}

// 구매 신호 셀 (단순화) — 구매가능성 점수 + 🔥 핫리드(헤비 유저 & 업그레이드 클릭) +
// 💳 업그레이드 모달 클릭. 나머지 약한 신호(프리미엄보이스 미리듣기·AI·게이트)는 표에서 생략.
function IntentCell({ u }: { u: UserStats['users'][number] }) {
  // 점수는 숨기고 핫리드(🔥)·업그레이드 클릭(💳)만 노출. 정렬은 여전히 purchaseScore 기준.
  if (!u.hotLead && !u.intentBanner) {
    return <div style={{ textAlign: 'center', color: t.neutrals.subtle, fontSize: 'calc(11px * var(--fz, 1))' }}>—</div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, lineHeight: 1.1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, whiteSpace: 'nowrap' }}>
        {u.hotLead && (
          <span title="핫리드: 최근 7일 활성 미구매자 중 구매 가능성 상위 10%" style={{
            fontSize: 'calc(9px * var(--fz, 1))', background: '#FEE2E2', color: '#B91C1C',
            borderRadius: 3, padding: '0 3px', fontWeight: t.weight.medium,
          }}>🔥</span>
        )}
        {u.intentBanner && (
          <span title="업그레이드 모달/배너 클릭" style={{ fontSize: 'calc(11px * var(--fz, 1))' }}>💳</span>
        )}
      </div>
      {u.lastIntentAt && (
        <span style={{ fontSize: 'calc(8px * var(--fz, 1))', color: t.neutrals.subtle, fontFamily: t.font.mono }}>
          {formatDateShort(u.lastIntentAt)}
        </span>
      )}
    </div>
  )
}

// 타겟 오퍼 단계 셀. 퍼널: 발송 → 열람 → 스누즈 → 전환. 종료: 닫음/만료.
const OFFER_STAGE_STYLE: Record<string, { label: string; fg: string; bg: string; title: string }> = {
  sent:     { label: '발송',  fg: '#4B5563', bg: '#F3F4F6', title: '오퍼 발송됨 (아직 열람 전)' },
  seen:     { label: '열람',  fg: '#1E40AF', bg: '#DBEAFE', title: '오퍼 모달을 봄' },
  snoozed:  { label: '스누즈', fg: '#92400E', bg: '#FEF3C7', title: '“나중에” — 배너로 스누즈' },
  redeemed: { label: '전환',  fg: '#166534', bg: '#DCFCE7', title: '구매하여 보너스 지급됨 (전환)' },
  dismissed:{ label: '닫음',  fg: '#6B7280', bg: '#F3F4F6', title: '배너 X — 영구 닫음' },
  expired:  { label: '만료',  fg: '#9CA3AF', bg: '#F9FAFB', title: '만료됨 (미전환)' },
}
// 백그라운드 재생 보장(기간권) 셀. 남은 기간이 있는 사람과 지나간 사람은 읽는 방식이 다르다 —
// 살아 있으면 "언제까지"가, 끝났으면 "언제 끝났는지"가 다음 행동을 정한다.
function GuaranteeCell({ until, daysLeft = 0 }: { until?: string | null; daysLeft?: number }) {
  if (!until) {
    return <div style={{ ...userDateCell, textAlign: 'center' as const, color: t.neutrals.subtle }}>—</div>
  }
  // 남은 일수는 서버가 확정해 보낸다(렌더 중 Date.now() 금지 — react-hooks/purity).
  const active = daysLeft > 0
  return (
    <div
      title={active ? `기간권 ${daysLeft}일 남음 (${formatDateShort(until)} 만료)` : `기간권 만료 (${formatDateShort(until)})`}
      style={{ ...userDateCell, display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}
    >
      <span style={{ color: active ? '#166534' : t.neutrals.subtle, fontWeight: active ? 600 : 400 }}>
        {formatDateShort(until)}
      </span>
      <span style={{ fontSize: 'calc(8px * var(--fz, 1))', color: t.neutrals.subtle }}>
        {active ? `${daysLeft}일 남음` : '만료'}
      </span>
    </div>
  )
}

function OfferStageCell({ stage, at }: { stage: string | null; at: string | null }) {
  if (!stage || !OFFER_STAGE_STYLE[stage]) {
    return <div style={{ textAlign: 'center', color: t.neutrals.subtle, fontSize: 'calc(11px * var(--fz, 1))' }}>—</div>
  }
  const s = OFFER_STAGE_STYLE[stage]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, lineHeight: 1.1, minWidth: 0 }}>
      <span title={s.title} style={{
        fontSize: 'calc(8.5px * var(--fz, 1))', fontFamily: t.font.mono, fontWeight: 600,
        color: s.fg, background: s.bg, padding: '1px 5px', borderRadius: 3, lineHeight: 1.4, whiteSpace: 'nowrap',
      }}>
        {stage === 'redeemed' ? '💰' + s.label : s.label}
      </span>
      {at && (
        <span style={{ fontSize: 'calc(8px * var(--fz, 1))', color: t.neutrals.subtle, fontFamily: t.font.mono }}>
          {formatDateShort(at)}
        </span>
      )}
    </div>
  )
}

// 국가 한글명 (툴팁용). 국기는 코드에서 자동 생성하므로 여기 없어도 표시된다.
function regionOf(locale: string | null): string {
  if (!locale) return ''
  return (locale.split(/[-_]/)[1] || '').toUpperCase()
}
// 앱버전 파이 데이터: '최신 버전순' 상위 3개 + 나머지(구버전·미상)는 기타로 합침 — 업데이트 전파 파악용
function versionPieData(rows?: Array<{ version: string; devices: number }>): Array<{ name: string; value: number }> {
  const seg = (v: string) => v.split(/[^0-9]+/).filter(Boolean).map(Number)
  const newerFirst = (a: string, b: string) => {
    const x = seg(a), y = seg(b)
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const d = (y[i] ?? 0) - (x[i] ?? 0)
      if (d) return d
    }
    return 0
  }
  const named = (rows ?? []).filter(r => r.version !== 'unknown').sort((a, b) => newerFirst(a.version, b.version))
  const top = named.slice(0, 3).map(r => ({ name: `v${r.version}`, value: r.devices }))
  const rest = named.slice(3).reduce((sum, r) => sum + r.devices, 0)
    + (rows ?? []).filter(r => r.version === 'unknown').reduce((sum, r) => sum + r.devices, 0)
  return rest > 0 ? [...top, { name: '기타', value: rest }] : top
}

// 국가코드(백필된 anonymous_events.country) 우선, 없으면 로케일 지역 폴백.
function formatCountry(country: string | null, locale?: string | null): { flag: string; code: string; name: string } | null {
  const code = (country || regionOf(locale ?? null)).toUpperCase()
  if (!code || !/^[A-Z]{2}$/.test(code)) return null
  return { flag: codeToFlag(code), code, name: COUNTRY_NAMES[code] || code }
}

// ─── Component ────────────────────────────────────────────────────────────────

type UserSortKey =
  | 'name' | 'platform' | 'version' | 'language' | 'country' | 'status' | 'active'
  | 'sheets' | 'cards' | 'flips' | 'attempts' | 'listen' | 'intent' | 'offer' | 'credits' | 'purchased' | 'bonus' | 'spent' | 'paid' | 'lastPurchase' | 'guarantee'
  | 'installed' | 'created' | 'recent' | 'active7'
type SortDir = 'asc' | 'desc'

// 테이블 컬럼 정의 (헤더 라벨 + 정렬키 + 정렬, 모바일 드롭다운 라벨). 순서 = 그리드 순서.
const USER_COLUMNS: Array<{ key: UserSortKey; label: string; mobileLabel: string; align: 'left' | 'center' | 'right' }> = [
  { key: 'installed', label: '설치',  mobileLabel: '설치일',   align: 'center' },
  { key: 'created',  label: '로그인', mobileLabel: '로그인일', align: 'center' },
  { key: 'recent',   label: '활동',   mobileLabel: '활동일',   align: 'center' },
  { key: 'name',     label: '닉네임', mobileLabel: '닉네임',   align: 'left' },
  { key: 'platform', label: '플랫폼', mobileLabel: '플랫폼',   align: 'center' },
  { key: 'version',  label: '앱버전', mobileLabel: '앱버전',   align: 'center' },
  { key: 'language', label: '언어',   mobileLabel: '언어',     align: 'center' },
  { key: 'country',  label: '국가',   mobileLabel: '국가',     align: 'center' },
  { key: 'status',   label: '드라이브', mobileLabel: '드라이브', align: 'center' },
  { key: 'active',   label: '활성화', mobileLabel: '활성화',   align: 'center' },
  { key: 'sheets',   label: '덱',     mobileLabel: '덱',       align: 'center' },
  { key: 'cards',    label: '카드',   mobileLabel: '카드',     align: 'center' },
  { key: 'flips',    label: '뒤집기', mobileLabel: '뒤집기',   align: 'center' },
  { key: 'attempts', label: '말하기', mobileLabel: '말하기',   align: 'center' },
  { key: 'listen',   label: '듣기',   mobileLabel: '듣기',     align: 'center' },
  { key: 'intent',   label: '구매신호', mobileLabel: '구매신호', align: 'center' },
  { key: 'offer',    label: '오퍼',   mobileLabel: '오퍼단계', align: 'center' },
  { key: 'paid',     label: '유료',   mobileLabel: '유료결제', align: 'center' },
  { key: 'lastPurchase', label: '구매일', mobileLabel: '마지막 구매일', align: 'center' },
  { key: 'guarantee', label: '보장종료', mobileLabel: '백그라운드 재생 보장 종료', align: 'center' },
  { key: 'purchased', label: '구매', mobileLabel: '구매 크레딧', align: 'center' },
  { key: 'bonus',    label: '보너스', mobileLabel: '보너스 크레딧', align: 'center' },
  { key: 'spent',    label: '사용', mobileLabel: '사용 크레딧', align: 'center' },
  { key: 'credits',  label: '보유', mobileLabel: '보유 크레딧', align: 'center' },
  { key: 'active7',  label: '7일',    mobileLabel: '7일 활동일', align: 'center' },
]

// 텍스트/문자열 정렬 컬럼은 오름차순이 기본, 숫자·날짜는 내림차순이 기본
const ASC_DEFAULT_KEYS = new Set<UserSortKey>(['name', 'platform', 'language', 'country', 'status'])
const defaultSortDir = (key: UserSortKey): SortDir => (ASC_DEFAULT_KEYS.has(key) ? 'asc' : 'desc')
type SortCrit = { key: UserSortKey; dir: SortDir }

const USER_SORT_STORAGE_KEY = 'voicecards.userSort'
const USER_SORT_KEY_SET = new Set<UserSortKey>(USER_COLUMNS.map(o => o.key))


// 'YYYY-MM-DD (요일)' — 요일 효과 관찰용. 달력 날짜의 요일이라 타임존 무관(UTC 기준 계산).
const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토']
function withWeekday(d: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d} (${WEEKDAYS_KO[new Date(d + 'T00:00:00Z').getUTCDay()]})` : d
}

// ─── Skeletons ────────────────────────────────────────────────────────────────

function SkelBar({ width, height = 12, style }: { width: number | string; height?: number; style?: React.CSSProperties }) {
  return <div className="l-skeleton" style={{ width, height, maxWidth: '100%', ...style }} />
}

function SkelStat({ compact }: { compact: boolean }) {
  // LStat 2열 배치와 동일: 좌측 라벨/값/오늘·7일/보조라벨 4줄, 우측 스파크라인(≤50% 폭·80% 높이)
  return (
    <div style={{
      padding: '8px 10px', borderRadius: t.radius.sm, background: t.neutrals.inner,
      display: 'flex', alignItems: 'stretch', justifyContent: 'space-between', gap: 10, minHeight: 84,
      minWidth: 0, overflow: 'hidden',
    }}>
      <div style={{ minWidth: 0 }}>
        <SkelBar width={56} height={9} style={{ marginBottom: 6 }} />
        <SkelBar width={64} height={16} style={{ marginBottom: 5 }} />
        <SkelBar width={76} height={9} style={{ marginBottom: 4 }} />
        <SkelBar width={68} height={9} />
      </div>
      {!compact && (
        <div className="l-skeleton" style={{ flex: 1, minWidth: 20, maxWidth: '50%', height: '80%', alignSelf: 'center', borderRadius: 4 }} />
      )}
    </div>
  )
}

function SkelPie() {
  // DistributionPie 세로 스택과 동일: 제목+탭 → 도넛(72) 가운데 → 범례 행들
  return (
    <div style={{
      padding: '8px 10px', borderRadius: t.radius.sm, background: t.neutrals.inner,
      display: 'flex', flexDirection: 'column', gap: 6, minHeight: 150,
      minWidth: 0, overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
        <SkelBar width={40} height={10} />
        <SkelBar width={64} height={12} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, padding: '4px 0' }}>
        <div className="l-skeleton" style={{ width: 80, height: 80, borderRadius: '50%', flexShrink: 0, maxWidth: '100%' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
          <SkelBar width="85%" height={9} />
          <SkelBar width="70%" height={9} />
        </div>
      </div>
    </div>
  )
}

function SkelBars() {
  // SkelPie와 동일한 컨테이너 높이(minHeight 150)에 42일 바 차트 실물과 동일한 밀도로 채움.
  return (
    <div style={{
      padding: '8px 10px', borderRadius: t.radius.sm, background: t.neutrals.inner,
      display: 'flex', flexDirection: 'column', gap: 6, minHeight: 150, height: '100%', boxSizing: 'border-box',
      minWidth: 0, overflow: 'hidden',
    }}>
      <SkelBar width={70} height={10} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '6px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, width: '100%', height: '100%', minHeight: 96 }}>
          {Array.from({ length: 42 }).map((_, i) => (
            <div
              key={i}
              className="l-skeleton"
              style={{ flex: 1, minWidth: 2, height: `${28 + ((i * 37) % 56)}%`, borderRadius: 1 }}
            />
          ))}
        </div>
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
  onRefresh, refreshing, cols,
}: VoicecardsBlockProps) {
  const mobile = useIsMobile()
  const dashCols = cols
  // 매우 좁은 화면(모바일)에서만 sparkline 숨김. LStat이 sub를 자체 줄로 분리해서
  // 일반 PC 해상도에선 sparkline 들어갈 공간 있음.
  const compact = mobile
  // 인사이트 분할(좌 퍼널 / 우 대형 DAU)은 와이드(1열) 모드에서만 — 2열·모바일은 스택
  const splitLayout = !mobile && dashCols === 1
  // 다중 정렬: 우선순위 순서대로 [{key,dir}]. 헤더 클릭으로 컬럼을 체인에 추가/방향전환/해제.
  const [userSorts, setUserSorts] = useState<SortCrit[]>([{ key: 'created', dir: 'desc' }])
  const [userPage, setUserPage] = useState(1)
  const [userPerPage, setUserPerPage] = useState(() => getStoredPageSize('voicecards-users'))

  const applyUserPerPage = (n: number) => {
    setUserPerPage(n)
    setUserPage(1)
    savePageSize('voicecards-users', n)
  }

  // 마운트 시 localStorage에서 정렬 상태 복원 (SSR/CSR hydration 안전).
  // 신형: JSON [{key,dir}] (다중 정렬). 구형: "key:dir" 도 지원.
  useEffect(() => {
    const stored = window.localStorage.getItem(USER_SORT_STORAGE_KEY)
    if (!stored) return
    try {
      const parsed = JSON.parse(stored) as SortCrit[]
      if (Array.isArray(parsed) && parsed.length &&
          parsed.every(s => USER_SORT_KEY_SET.has(s.key) && (s.dir === 'asc' || s.dir === 'desc'))) {
        setUserSorts(parsed)
        return
      }
    } catch { /* 구형 포맷 폴백 */ }
    const [key, dir] = stored.split(':')
    if (USER_SORT_KEY_SET.has(key as UserSortKey)) {
      setUserSorts([{ key: key as UserSortKey, dir: dir === 'asc' ? 'asc' : dir === 'desc' ? 'desc' : defaultSortDir(key as UserSortKey) }])
    }
  }, [])

  // 비로그인 기기를 사용자 행 형태로 접는다. 별도 테이블이던 것을 한 표로 합친 이유:
  // 기기 계정이 생기면서 "로그인했는가"가 더 이상 사용자인지 아닌지를 가르지 않는다.
  // 로그인일(createdAt)이 빈 행 = 아직 구글 로그인을 안 한 기기.
  // 채워지지 않는 열(크레딧·오퍼·시트 등)은 이 기기에 대해 우리가 아는 게 없다는 뜻이고,
  // 0이 아니라 '—'로 보여야 하므로 값을 0으로 두되 렌더에서 kind로 구분한다.
  const deviceRows = useMemo(() => {
    const anon = anonymousStats?.journeys?.recentAnon
    if (!anon?.length) return []
    // 기기 계정(device:<uuid>)은 users 행으로 이미 위에 있는데, 구글 로그인을 한 적이
    // 없으므로 저니 뷰에서도 signed_in=false 로 잡힌다 → 같은 사람이 두 줄이 된다.
    // 기기 uuid는 곧 계정 id의 접미사라(설계상 보장) 그 키로 걸러낸다.
    // 오늘 실제 중복은 0건이다 — 현재 기기 계정 2개가 모두 구글 이력이 있는 기기라
    // signed_in=true 로 빠지기 때문. 구글을 한 번도 안 쓴 기기가 생기는 순간 발생한다.
    const deviceAccountIds = new Set(
      (userStats?.users ?? [])
        .filter(u => u.id.startsWith('device:'))
        .map(u => u.id.slice('device:'.length)),
    )
    return anon.filter(d => !deviceAccountIds.has(d.deviceId)).map(d => ({
      id: `dev:${d.deviceId}`,
      // 닉네임 자리에 기기번호를 넣는다. 병합 전 비로그인 표가 쓰던 관례 그대로
      // (uuid에서 하이픈을 뺀 앞 4자리에 #). id로 폴백을 돌리면 'dev:' 접두사 때문에
      // '#dev:'가 나오므로 여기서 명시적으로 만든다.
      nickname: voicecardsDeviceDisplayName(d.deviceId),
      email: null,
      appVersion: d.appVersion, platform: d.platform, locale: null, country: d.country,
      hasPurchased: false, credits: 0, purchasedCredits: 0, bonusCredits: 0,
      offerStage: null, offerStageAt: null,
      creditsUsed: 0, creditsSpent: d.creditsSpent ?? 0,
      hasFolder: false,
      // 비로그인 기기의 카드는 데모 카드다 — 소유 카드가 아니므로 ownCards는 0으로 둔다.
      ownCards: 0, sheetCount: 0, cards: d.cardsViewed, flips: d.flips, attempts: 0,
      cardsToday: 0, attemptsToday: 0, listenToday: 0, flipsToday: 0, spentToday: 0,
      activeDays7d: d.activeDays7d,
      purchasedToday: 0, balanceDeltaToday: 0, sheetsDeltaToday: 0,
      intentPremiumVoice: false, intentAi: d.aiGenOpens > 0, intentBanner: false,
      intentGated: d.addSheetOpens > 0, hotLead: false, purchaseScore: 0, lastIntentAt: null,
      // 구매·기간권은 계정에 붙는다 — 비로그인 기기에는 존재할 수 없다
      lastPurchaseAt: null,
      unlimitedUntil: null, unlimitedDaysLeft: 0,
      createdAt: '',                 // 로그인한 적 없음
      lastActiveAt: d.lastSeenAt,
      installedAt: d.firstSeenAt,
    }))
  }, [anonymousStats, userStats])

  const sortedUsers = useMemo(() => {
    if (!userStats) return []
    const arr = [...userStats.users, ...deviceRows]
    type U = typeof arr[number]
    // 동점 시 보조정렬(방향 무관): 최근 활동일 → 가입일 내림차순
    const recencyTiebreak = (a: U, b: U) => {
      const cmp = (b.lastActiveAt || '').localeCompare(a.lastActiveAt || '')
      return cmp !== 0 ? cmp : b.createdAt.localeCompare(a.createdAt)
    }
    const nameOf = (u: U) => (u.nickname || u.email || u.id || '').toLowerCase()

    // 컬럼별 1차 비교(항상 오름차순 기준). 방향은 아래에서 dir로 적용.
    const cmpByKey = (a: U, b: U, key: UserSortKey): number => {
      switch (key) {
        case 'name':     return nameOf(a).localeCompare(nameOf(b), 'ko')
        case 'platform': return (a.platform || '').localeCompare(b.platform || '')
        // 앱버전: 세그먼트 숫자 비교(1.1.9 < 1.1.10). 버전 없음은 가장 오래된 것으로 취급
        case 'version': {
          const seg = (v: string | null) => (v ? v.split(/[^0-9]+/).filter(Boolean).map(Number) : null)
          const va = seg(a.appVersion), vb = seg(b.appVersion)
          if (!va && !vb) return 0
          if (!va) return -1
          if (!vb) return 1
          for (let i = 0; i < Math.max(va.length, vb.length); i++) {
            const d = (va[i] ?? 0) - (vb[i] ?? 0)
            if (d) return d
          }
          return 0
        }
        case 'language': return (a.locale || '').localeCompare(b.locale || '')
        case 'country':  return (a.country || regionOf(a.locale)).localeCompare(b.country || regionOf(b.locale))
        case 'status':   return Number(a.hasFolder) - Number(b.hasFolder)
        case 'active':   return Number(a.sheetCount > 0 || (a.ownCards ?? a.cards) > 0 || (a.flips ?? 0) > 0) - Number(b.sheetCount > 0 || (b.ownCards ?? b.cards) > 0 || (b.flips ?? 0) > 0)
        case 'sheets':   return a.sheetCount - b.sheetCount
        case 'cards':    return a.cards - b.cards
        case 'flips':    return (a.flips ?? 0) - (b.flips ?? 0)
        case 'attempts': return a.attempts - b.attempts
        case 'listen':   return (a.creditsUsed ?? 0) - (b.creditsUsed ?? 0)
        // 구매신호: 핫리드 우선, 그 안에서 최근 의도 시각 순 (동점이면 다음 정렬로)
        case 'intent':   return intentScore(a) - intentScore(b)
        // 오퍼 단계: 퍼널 진행도 순 (전환 > 스누즈 > 열람 > 발송 > 닫음 > 만료 > 없음)
        case 'offer':    return offerStageScore(a.offerStage) - offerStageScore(b.offerStage)
        case 'credits':  return a.credits - b.credits
        case 'purchased': return (a.purchasedCredits ?? 0) - (b.purchasedCredits ?? 0)
        case 'bonus':    return (a.bonusCredits ?? 0) - (b.bonusCredits ?? 0)
        case 'spent':    return (a.creditsSpent ?? 0) - (b.creditsSpent ?? 0)
        case 'paid':     return Number(!!a.hasPurchased) - Number(!!b.hasPurchased)
        // 구매·기간권이 없는 사용자는 항상 뒤로 (빈 문자열이 어떤 ISO 시각보다 작다)
        case 'lastPurchase': return (a.lastPurchaseAt ?? '').localeCompare(b.lastPurchaseAt ?? '')
        case 'guarantee': return (a.unlimitedUntil ?? '').localeCompare(b.unlimitedUntil ?? '')
        // 날짜로 표시되는 컬럼은 날짜(YYYY-MM-DD) 단위로 비교 → 같은 날끼리는 동점이 되어
        // 다음 우선순위(예: 듣기 내림차순)가 그 안에서 적용됨.
        case 'recent':   return (a.lastActiveAt ? kstDateKey(a.lastActiveAt) : '').localeCompare(b.lastActiveAt ? kstDateKey(b.lastActiveAt) : '')
        case 'active7':  return (a.activeDays7d ?? 0) - (b.activeDays7d ?? 0)
        // 로그인 안 한 기기(createdAt '')는 항상 뒤로 — 설치일 정렬과 같은 규칙.
        case 'created':  return (a.createdAt ? kstDateKey(a.createdAt) : '￿')
          .localeCompare(b.createdAt ? kstDateKey(b.createdAt) : '￿')
        // 설치일 없는 계정(뷰 이전 가입)은 항상 뒤로 — 빈 문자열이 오름차순에서 맨 앞에
        // 몰리면 "가장 오래된 설치"처럼 보인다.
        case 'installed': return (a.installedAt ? kstDateKey(a.installedAt) : '￿')
          .localeCompare(b.installedAt ? kstDateKey(b.installedAt) : '￿')
        default:         return 0
      }
    }
    // 다중 정렬: 우선순위 순서대로 비교, 첫 번째로 동점이 아닌 컬럼이 결정.
    arr.sort((a, b) => {
      for (const s of userSorts) {
        const p = cmpByKey(a, b, s.key)
        if (p !== 0) return p * (s.dir === 'asc' ? 1 : -1)
      }
      return recencyTiebreak(a, b)
    })
    return arr
  }, [userStats, userSorts, deviceRows])

  const totalUserPages = Math.max(1, Math.ceil(sortedUsers.length / userPerPage))
  const safeUserPage = Math.min(userPage, totalUserPages)
  const paginatedUsers = sortedUsers.slice(
    (safeUserPage - 1) * userPerPage,
    safeUserPage * userPerPage
  )

  const persistSorts = (next: SortCrit[]) => {
    setUserSorts(next)
    setUserPage(1)
    window.localStorage.setItem(USER_SORT_STORAGE_KEY, JSON.stringify(next))
  }

  // 헤더 클릭(데스크톱): 다중 정렬 체인에 추가/방향전환/해제 3단계 순환.
  // 미포함 → 체인 끝에 추가(기본방향) → 재클릭 시 반대방향 → 재클릭 시 체인에서 제거.
  // 클릭한 컬럼이 항상 1순위가 되게 (기존 체인은 동점 처리용으로 뒤에 유지).
  // 1순위 재클릭: 방향전환 → 한 번 더 클릭하면 해제. (기존 '뒤에 추가' 방식은
  // 표가 그대로인 것처럼 보여 정렬이 안 되는 걸로 오인됨 — 2026-07-13 CEO 피드백)
  const handleHeaderSort = (key: UserSortKey) => {
    const idx = userSorts.findIndex(s => s.key === key)
    if (idx < 0) { persistSorts([{ key, dir: defaultSortDir(key) }, ...userSorts]); return }
    if (idx > 0) {
      // 체인에 있지만 1순위가 아님 → 1순위로 승격 (방향은 유지)
      persistSorts([userSorts[idx], ...userSorts.filter(s => s.key !== key)])
      return
    }
    const cur = userSorts[0]
    if (cur.dir === defaultSortDir(key)) {
      persistSorts([{ key, dir: cur.dir === 'asc' ? 'desc' : 'asc' }, ...userSorts.slice(1)])
    } else {
      persistSorts(userSorts.slice(1))
    }
  }


  // 그리드는 페이지가 갖는다. 여기서는 조각 세 개(퍼널열 · 사용자 · 비로그인)만 내놓고,
  // 페이지 그리드가 DOM 순서대로 두 열에 채운다. 스스로 그리드를 가지면 이 블록의 섹션들이
  // 검색·답변 섹션과 같은 줄에 설 수 없다.
  return (
    <>
    {/* 퍼널 · 가입 후 활동 — 두 섹션이 한 열로 붙어 다닌다 */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.blockGap, minWidth: 0 }}>
    {/* 카드1: 헤더 + 인사이트 */}
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 12 }}>
        <LSectionHead
          eyebrow="FUNNEL"
          title="스토어 → 설치 → 가입 → 결제"
          action={
            <LHeadBtn icon="refresh" title="데이터 새로고침" onClick={onRefresh} busy={refreshing} />
          }
        />

        {/* 인사이트 — 사용자/이벤트/매출 모두 필요 */}
        {(usersLoading || eventsLoading || revenueLoading) && !(userStats && anonymousStats?.summary) && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: splitLayout ? 'minmax(0,1fr) minmax(0,1fr)' : 'minmax(0,1fr)', gap: 8, alignItems: 'stretch' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(3, minmax(0,1fr))', gap: 8 }}>
                  {[0, 1, 2, 3, 4, 5].map(i => <SkelStat key={i} compact={!!mobile} />)}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(3, minmax(0,1fr))', gap: 8 }}>
                  <SkelPie />
                  <SkelPie />
                  <SkelPie />
                </div>
              </div>
              <div style={{ minWidth: 0, minHeight: splitLayout ? undefined : 190 }}>
                <SkelBars />
              </div>
            </div>
          </>
        )}
        {/* 로딩 끝났는데 데이터가 없으면(최초 로드 실패) 빈 화면 대신 재시도 UI */}
        {!(usersLoading || eventsLoading || revenueLoading) && !(userStats && anonymousStats?.summary) && (
          <div style={{
            padding: '18px 12px', borderRadius: t.radius.sm, background: t.neutrals.inner,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            color: t.neutrals.muted, fontSize: 'calc(11px * var(--fz, 1))',
          }}>
            <span>인사이트 데이터를 불러오지 못했어요</span>
            <button
              onClick={onRefresh}
              disabled={refreshing}
              style={{
                padding: '4px 12px', borderRadius: t.radius.sm, border: 'none',
                cursor: refreshing ? 'default' : 'pointer', opacity: refreshing ? 0.5 : 1,
                background: t.brand[500], color: '#fff',
                fontSize: 'calc(11px * var(--fz, 1))', fontWeight: 500, fontFamily: t.font.sans,
              }}
            >
              다시 시도
            </button>
          </div>
        )}
        {userStats && anonymousStats?.summary && (() => {
          const devices = anonymousStats.summary.totalDevices
          // 미활성: 로그인했지만 시트 0 & 자기 카드 0 & 뒤집기 0 — 아직 어떤 학습 활동도 안 한 단계.
          // 카드는 ownCards(데모 제외) 기준 — 데모 한 세션(total_cards 100)이 활성화로
          // 과대 분류되지 않게 한다. 데모만 체험한 유저는 미활성.
          // 뒤집기(flips, card_flipped_manual)만 한 사용자도 활동으로 간주해 활성화로 센다
          //   (2026-07-25 CEO — 말하기/듣기 없이 눈으로만 카드 넘긴 것도 학습 활동).
          // (구글연동(Drive)과는 별개 축: deferred-Drive라 연동을 마치고도 미활성일 수 있다.
          //  그 교집합 = "연동후대기" — AI draft만 두고 이탈한 코호트, 복귀 유도 타깃.)
          // 활성화 = 전체 − 미활성
          // ownCards가 없는 응답(배포 직후 ~60s unstable_cache의 옛 payload)은 cards로
          // 강등 — undefined 비교로 전원 활성화가 되는 착시를 막는다(2026-07-11 실제 발생).
          const isIdleUser = (u: { sheetCount: number; cards: number; ownCards?: number; flips?: number }) =>
            u.sheetCount === 0 && (u.ownCards ?? u.cards) === 0 && (u.flips ?? 0) === 0
          // 퍼널 3칸(구글 로그인 → 드라이브 연동 → 학습 활성화)은 모두 같은 모집단,
          // 즉 구글 로그인 사용자 위에서 세야 한다. userStats.users에는 표에 함께 보여주려고
          // 기기 계정도 들어 있는데(id가 'device:'), totalUsers는 그걸 빼고 세므로
          // 여기서 안 빼면 분자만 커져 활성화가 그만큼 깎인다(2026-08-10 실제로 2 깎였다).
          const googleUsers = (userStats?.users ?? []).filter(u => !u.id.startsWith('device:'))
          const incompleteSignups = googleUsers.filter(isIdleUser).length
          const linkedUsers = googleUsers.filter(u => u.hasFolder).length
          // 학습 활성화 = 구글 경로 활성화 + 기기 계정 활성화.
          // 기기 계정은 구글 로그인도 드라이브도 거치지 않고 바로 여기로 들어온다 —
          // 덱을 만든 사람을 빼지 않기 위해서다(2026-08-10 CEO). 그래서 이 칸만은
          // 앞 칸의 부분집합이 아니고, 전환율(연동 대비)도 구글 경로만으로 계산한다.
          const googleActivated = userStats.totalUsers - incompleteSignups
          const activatedUsers = (userStats?.users ?? []).filter(u => !!voicecardsLearningActivationDate(u))
          const deviceActivated = activatedUsers.filter(u => u.id.startsWith('device:')).length
          const signedUp = activatedUsers.length
          const paidUsers = stats?.combined.totalPaidUsers ?? 0

          // 활성화 전환율 = 구글연동 대비 (퍼널: 기기 → 연동 → 활성화).
          // 배지(activeRate)와 같은 구글 경로 기준 — signedUp 은 기기 계정을 포함해서
          // 분모(연동)에 없는 사람까지 세고 105% 로 부풀던 값을 톤 판정에 쓰고 있었다.
          // 결제율 = 유료 / 활성 사용자
          const payRate = signedUp > 0 ? Math.round((paidUsers / signedUp) * 100) : 0

          // 파이 카드 '활성' 탭: 활성화(!isIdleUser) 사용자의 플랫폼/국가 분포.
          // 기기/결제 탭은 이벤트 기기 기준이지만 활성화는 계정 속성(시트 보유)이라 users로 센다.
          const distOf = (label: (u: (typeof activatedUsers)[number]) => string) => {
            const m = new Map<string, number>()
            for (const u of activatedUsers) m.set(label(u), (m.get(label(u)) ?? 0) + 1)
            return Array.from(m, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
          }
          const activePlatforms = distOf(u => u.platform === 'ios' ? 'iOS' : u.platform === 'android' ? 'Android' : (u.platform || 'unknown'))
          const activeCountries = distOf(u => formatCountryName(u.country || 'unknown'))

          // 누적 trajectories
          const cumulative = anonymousStats.cumulativeDistinct ?? []
          const devicesData = cumulative.map(d => ({ date: d.date, value: d.devices }))

          const googleSignupDates = googleUsers
            .map(u => voicecardsLearningActivationDate(u))
            .filter((date): date is string => !!date)
            .map(kstDateKey)
            .sort()
          const signupDates = activatedUsers
            .map(u => voicecardsLearningActivationDate(u))
            .filter((date): date is string => !!date)
            .map(kstDateKey)
            .sort()
          const allDates = cumulative.map(d => d.date)
          const signupData = allDates.map(date => ({
            date,
            value: signupDates.filter(d => d <= date).length,
          }))
          const googleSignupData = allDates.map(date => ({
            date,
            value: googleSignupDates.filter(d => d <= date).length,
          }))
          // 구글연동(Drive 폴더 보유) 누적 추이 — 폴더 생성 시각은 따로 없어 가입일로
          // 근사(대부분 가입 직후 or 첫 저장 시 승인). 추세선 용도로 충분.
          // 카드 값(linkedUsers)이 googleUsers 위에서 세므로 추이도 같은 모집단으로 센다.
          // 기기 계정은 Drive를 안 거쳐 hasFolder가 늘 false지만, 정의를 맞춰 두면 나중에
          // 기기 계정에 폴더가 생겨도 카드와 추이가 갈리지 않는다.
          const linkedDates = googleUsers
            .filter(u => u.hasFolder)
            .map(u => kstDateKey(u.createdAt))
            .sort()
          const linkedData = allDates.map(date => ({
            date,
            value: linkedDates.filter(d => d <= date).length,
          }))
          // 로그인(=구글 계정) 누적 — 위계 항등식(로그인 = 연동 + 미연동, 활성화+미활성)이
          // 전부 계정 기준이므로 로그인 카드도 기기 이벤트가 아니라 users 테이블로 센다.
          // 카드의 헤드라인은 totalUsers(기기 계정 제외)라, 여기서도 googleUsers로 세야
          // 오늘/7일·스파크라인이 헤드라인과 같은 모집단이 된다. userStats.users를 그대로
          // 쓰면 로그인한 적 없는 기기 계정이 "구글 로그인 오늘 N명"에 섞인다
          // (2026-08-11: 실제 구글 1명인 날이 4명으로 표시됐다).
          const allUserDates = googleUsers.map(u => kstDateKey(u.createdAt)).sort()
          const allUsersData = allDates.map(date => ({
            date,
            value: allUserDates.filter(d => d <= date).length,
          }))
          // 비율 추이(%) — 각 카드의 점선 보조선(dualScale 우측 축).
          // 모든 비율은 직전 퍼널 단계 대비: 설치%=방문, 로그인%=설치기기, 연동%=로그인, 활성%=연동, 결제%=활성.
          const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0)
          const loginRateData = allDates.map((date, i) => ({ date, value: pct(allUsersData[i]?.value ?? 0, devicesData[i]?.value ?? 0) }))
          const linkedRateData = allDates.map((date, i) => ({ date, value: pct(linkedData[i]?.value ?? 0, allUsersData[i]?.value ?? 0) }))
          // 활성화율은 직전 단계(구글 연동) 대비 — 단계별 전환 효율 측정 (2026-07-12 CEO)
          const activeRateData = allDates.map((date, i) => ({ date, value: pct(googleSignupData[i]?.value ?? 0, linkedData[i]?.value ?? 0) }))
          const loginRate = Math.round(pct(userStats.totalUsers, devices))
          const linkedRate = Math.round(pct(linkedUsers, userStats.totalUsers))
          // 전환율은 구글 경로만으로 — 분모(드라이브 연동)에 기기 계정이 없으므로
          // 분자에도 넣으면 100%를 넘는 무의미한 수가 된다.
          const activeRate = Math.round(pct(googleActivated, linkedUsers))

          // 스토어 방문(퍼널 최상단) — store_visits 일별 합산. 누적 시리즈는 allDates 축으로 재샘플.
          const storeVisits = anonymousStats.storeVisits ?? []
          const svTotal = storeVisits.reduce((sum, r) => sum + r.visitors, 0)
          const svLast = storeVisits[storeVisits.length - 1]
          // 스토어 리포트는 ~1주 지연 → '7일'은 마지막 데이터일 기준 최근 7일
          const sv7From = svLast ? new Date(new Date(svLast.date + 'T00:00:00Z').getTime() - 6 * 86400000).toISOString().slice(0, 10) : ''
          const sv7 = storeVisits.filter(r => r.date >= sv7From).reduce((sum, r) => sum + r.visitors, 0)
          let svCum = 0, svIdx = 0
          const storeVisitsData = allDates.map(date => {
            while (svIdx < storeVisits.length && storeVisits[svIdx].date <= date) { svCum += storeVisits[svIdx].visitors; svIdx++ }
            return { date, value: svCum }
          })
          // 설치율은 방문 집계가 시작된 날 이후의 '신규 기기'만 분자로 — 그 전 기기까지 넣으면
          // 100%를 넘는 무의미한 값이 됨 (방문 데이터: 플레이 6/1~, iOS는 ASC 백필 대기).
          const svStartIdx = storeVisitsData.findIndex(d => d.value > 0)
          const devBaseline = svStartIdx > 0 ? (devicesData[svStartIdx - 1]?.value ?? 0) : 0
          const installRateData = allDates.map((date, i) => ({
            date,
            value: Math.min(100, pct(Math.max(0, (devicesData[i]?.value ?? 0) - devBaseline), storeVisitsData[i]?.value ?? 0)),
          }))
          const devicesSinceSv = Math.max(0, devices - devBaseline)
          const installRate = svTotal > 0 ? Math.min(100, Math.round(pct(devicesSinceSv, svTotal))) : 0

          // 크레딧 판매/유료전환 누적 (매출은 크레딧 볼륨으로 표시)
          const creditsByDate = new Map<string, number>()
          for (const row of (chartData ?? [])) {
            creditsByDate.set(row.date, (creditsByDate.get(row.date) ?? 0) + (row.credits ?? 0))
          }

          // 오늘 / 최근 7일 컷오프 (KST 기준)
          const revTodayKey = kstToday()
          const rev7AgoKey = kstDaysAgo(6)

          // 누적 매출을 크레딧 볼륨으로 표시 (k 단위 축약)
          const creditsSold = stats?.combined.totalCreditsSold ?? 0
          let runningCredits = 0
          const cumulativeCreditsByDate = new Map<string, number>()
          for (const d of Array.from(creditsByDate.keys()).sort()) {
            runningCredits += creditsByDate.get(d) ?? 0
            cumulativeCreditsByDate.set(d, runningCredits)
          }
          const creditsData = allDates.map(date => {
            let total = 0
            for (const [cDate, val] of cumulativeCreditsByDate) {
              if (cDate <= date) total = val
            }
            return { date, value: total }
          })
          // ARPMAU — 최근 30일 매출 ÷ MAU. 분자와 분모를 같은 30일 창에 맞춘다.
          // 누적 매출을 30일 활동자로 나누면 서로 다른 기간을 나눈 수가 되어 뜻이 없다.
          //
          // 점선(결제율)을 이 값으로 바꾸지 않은 이유: 이 행의 점선은 카드마다
          // "직전 퍼널 단계 대비 전환율"이라는 한 규칙을 쓴다(설치%→로그인%→연동%→
          // 활성%→결제%). 한 칸만 뜻을 바꾸면 행을 훑는 사람이 예외를 외워야 한다.
          // 대신 값 옆 배지가 결제%를 되풀이하고 있었으므로(점선과 같은 지표) 그 자리를 쓴다.
          const rev30AgoKey = kstDaysAgo(29)
          // MAU 는 서버 집계(vc_event_stats)의 롤링 30일 활동자(active30)를 쓴다 —
          // 로그인 없이 기기로만 쓰는 사용자를 포함한다.
          // users.lastActiveAt 로 세면 "마지막 활동"만 남아 과거 시점의 MAU 를 복원할 수
          // 없다 — 점선이 날짜별 CPMAU 를 그리려면 분모도 날짜별로 있어야 하고, 배지와
          // 점선이 서로 다른 분모를 쓰면 같은 이름의 두 값이 어긋난다.
          const mauByDate = new Map<string, number>()
          for (const r of (anonymousStats.daily ?? [])) {
            if (typeof r.active30 === 'number' && r.active30 > 0) mauByDate.set(r.date, r.active30)
          }
          const mauDates = [...mauByDate.keys()].sort()
          const mau = mauDates.length ? (mauByDate.get(mauDates[mauDates.length - 1]) ?? 0) : 0
          // 30일 평균 DAU — '일별 활동자' 바의 합(daily.devices)과 같은 값을 평균한 것이라
          // 옆 차트와 같은 모집단이다(봇·관리자 제외, 기기 계정 포함).
          // 오늘은 아직 안 끝난 하루라 뺀다 — 30분의 1이 반쪽이면 평균이 그만큼 낮게 나온다.
          const dauRows = (anonymousStats.daily ?? []).filter(r => r.date < revTodayKey).slice(-30)
          const avgDau30 = dauRows.length
            ? Math.round(dauRows.reduce((s, r) => s + (r.devices ?? 0), 0) / dauRows.length)
            : 0
          // CPMAU(credits per MAU) — 배지는 달러가 아니라 크레딧으로 낸다. 달러 매출은 product_id 를 정가표에
          // 대입한 추정치라(지역가·환불·스토어 수수료 미반영) 1인당으로 나누면 오차가
          // 그대로 실린다. 크레딧은 결제 이벤트의 delta(실제 지급량)로 세는 값이라
          // 환율·수수료를 타지 않고, 카드 머리값(판매 크레딧)과 단위도 같다.
          const credits30d = (chartData ?? [])
            .filter(r => r.date >= rev30AgoKey)
            .reduce((sum, r) => sum + (r.credits ?? 0), 0)
          const creditsPerMau = mau > 0 ? credits30d / mau : 0

          // CPMAU 추이(점선) — 날짜마다 "그날까지의 최근 30일 판매 ÷ 그날의 MAU".
          // 분자도 30일 창으로 굴린다. 누적 크레딧을 그날 MAU 로 나누면 시간이 갈수록
          // 기계적으로 올라가는 선이 되어 최근 판매가 붙었는지 알 수 없다.
          const rollingCredits30 = (endDate: string): number => {
            const start = new Date(`${endDate}T00:00:00+09:00`)
            start.setDate(start.getDate() - 29)
            const startKey = kstDateKey(start.toISOString())
            let sum = 0
            for (const [d, v] of creditsByDate) if (d >= startKey && d <= endDate) sum += v
            return sum
          }
          const cpmauData = allDates.map(date => {
            const m = mauByDate.get(date) ?? 0
            return { date, value: m > 0 ? rollingCredits30(date) / m : 0 }
          })
          const fmtPerMau = (v: number): string => (v >= 100 ? String(Math.round(v)) : v >= 10 ? v.toFixed(1) : v.toFixed(2))
          const fmtK = (v: number): string => {
            if (v >= 1000) {
              const k = v / 1000
              return `${k >= 100 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}k`
            }
            return String(Math.round(v))
          }
          // 누적 기기/데모 학습/가입 완료 — 오늘 / 최근 7일 신규 (모두 KST 기준, cumulativeDistinct 델타)
          const yesterdayKey = kstDaysAgo(1)
          const dayBefore7Key = kstDaysAgo(7)
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
          const signupToday = signupDates.filter(d => d === revTodayKey).length
          const signup7 = signupDates.filter(d => d >= rev7AgoKey).length
          const linkedToday = linkedDates.filter(d => d === revTodayKey).length
          const linked7 = linkedDates.filter(d => d >= rev7AgoKey).length
          const loginToday = allUserDates.filter(d => d === revTodayKey).length
          const login7 = allUserDates.filter(d => d >= rev7AgoKey).length

          return (
            <>

              {/* 좌: 퍼널 6카드(3×2) + 플랫폼/국가 파이 · 우: 일별 활동자 전체 높이 (와이드 모드 전용, CEO 레이아웃) */}
              <div style={{ display: 'grid', gridTemplateColumns: splitLayout ? 'minmax(0,1fr) minmax(0,1fr)' : 'minmax(0,1fr)', gap: 8, alignItems: 'stretch' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(3, minmax(0,1fr))', gap: 8 }}>
                <LStat
                  label="스토어 방문"
                  title="플레이·앱스토어 등록정보 방문자 누적(값 옆 = 마지막 집계일). 스토어 리포트 특성상 ~1주 지연. 퍼널: 방문→설치→구글 로그인→드라이브 연동→학습 활성화→결제."
                  value={svTotal > 0 ? svTotal.toLocaleString() : '—'}
                  valueExtra={svLast ? (
                    <span style={{
                      fontSize: 'calc(9.5px * var(--fz, 1))', marginLeft: 5, fontWeight: 500,
                      fontFamily: t.font.mono, color: t.neutrals.subtle, fontVariantNumeric: 'tabular-nums' as const,
                    }}>
                      {svLast.date.slice(5)} 기준
                    </span>
                  ) : undefined}
                  sub={svTotal > 0 ? `최근 ${(svLast?.visitors ?? 0).toLocaleString()}명 · 7일 ${sv7.toLocaleString()}명` : '수집 대기'}
                  tone="info"
                  sparkline={compact || svTotal === 0 ? undefined : storeVisitsData}
                />
                <LStat
                  label="설치 기기"
                  title="앱을 설치해 실행까지 온 고유 기기 누적. 설치율 = 방문 집계 시작 이후 신규 기기 / 스토어 방문 누적 (iOS 방문은 ASC 백필 대기 — 그 전까지 과대 표시를 100%로 클램프)."
                  value={devices.toLocaleString()}
                  valueExtra={svTotal > 0 ? (
                    <span style={{
                      fontSize: 'calc(9.5px * var(--fz, 1))', marginLeft: 5, fontWeight: 500,
                      color: t.accent.warn, fontVariantNumeric: 'tabular-nums' as const,
                    }}>
                      <span>전환 {installRate}%</span>
                    </span>
                  ) : undefined}
                  sub={`오늘 ${devToday.toLocaleString()}명 · 7일 ${dev7.toLocaleString()}명`}
                  tone="info"
                  sparkline={compact ? undefined : devicesData}
                  sparkline2={compact || svTotal === 0 ? undefined : installRateData}
                  sparkFormat2={(v) => `${v}%`}
                  spark2Domain={[0, 100]}
                  dualScale
                />
                <LStat
                  label="구글 로그인"
                  title="구글 계정으로 로그인한 사용자 누적. 점선 = 로그인율(설치 기기 대비). 기기 계정(로그인 없이 크레딧을 쓰는 사용자)은 여기 포함되지 않는다."
                  value={userStats.totalUsers.toLocaleString()}
                  valueExtra={(
                    <span style={{
                      fontSize: 'calc(9.5px * var(--fz, 1))', marginLeft: 5, fontWeight: 500,
                      color: t.accent.warn, fontVariantNumeric: 'tabular-nums' as const,
                    }}>
                      <span>전환 {loginRate}%</span>
                    </span>
                  )}
                  // 기기 계정은 여기 적지 않는다 — 이 카드는 순수하게 구글 로그인만 보는 자리다
                  // (2026-08-11 CEO). 기기 계정 수는 '학습 활성화' 카드에서 따로 읽는다.
                  sub={`오늘 ${loginToday.toLocaleString()}명 · 7일 ${login7.toLocaleString()}명`}
                  tone={devices > 0 && userStats.totalUsers / devices >= 0.2 ? 'pos' : 'warn'}
                  sparkline={compact ? undefined : allUsersData}
                  sparkline2={compact ? undefined : loginRateData}
                  sparkFormat2={(v) => `${v}%`}
                  spark2Domain={[0, 100]}
                  dualScale
                />
                <LStat
                  label="드라이브 연동"
                  title="Drive 폴더 연동까지 마친 사용자 누적. 점선 = 연동률(구글 로그인 대비)."
                  value={linkedUsers.toLocaleString()}
                  valueExtra={(
                    <span style={{
                      fontSize: 'calc(9.5px * var(--fz, 1))', marginLeft: 5, fontWeight: 500,
                      color: t.accent.warn, fontVariantNumeric: 'tabular-nums' as const,
                    }}>
                      <span>전환 {linkedRate}%</span>
                    </span>
                  )}
                  sub={`오늘 ${linkedToday.toLocaleString()}명 · 7일 ${linked7.toLocaleString()}명`}
                  tone={userStats.totalUsers > 0 && linkedUsers / userStats.totalUsers >= 0.5 ? 'pos' : 'warn'}
                  sparkline={compact ? undefined : linkedData}
                  sparkline2={compact ? undefined : linkedRateData}
                  sparkFormat2={(v) => `${v}%`}
                  spark2Domain={[0, 100]}
                  dualScale
                />
                <LStat
                  label="학습 활성화"
                  title={`첫 덱을 만든 사용자(데모 체험 제외). 구글 경로 ${googleActivated.toLocaleString()}명`
                    + (deviceActivated > 0 ? ` + 기기 계정 ${deviceActivated.toLocaleString()}명` : '')
                    + '. 기기 계정은 구글 로그인·드라이브를 거치지 않고 바로 여기로 들어오므로'
                    + ' 이 칸만은 앞 단계의 부분집합이 아니다.'
                    + ` 전환 ${activeRate}% = 구글 활성화 ${googleActivated.toLocaleString()} ÷ 드라이브 연동 ${linkedUsers.toLocaleString()}`
                    + ' — 기기 계정은 분모(연동)에 없으니 분자에서도 뺀다. 점선도 같은 구글 경로 비율.'}
                  value={signedUp.toLocaleString()}
                  // 이 칸만 배지가 둘이라 좁았다 — 전환율은 뺀다(2026-08-30 CEO). 점선이 같은 값을
                  // 그리고 툴팁에 나눗셈이 적혀 있다. 남기는 건 구성(구글 경로 몇 명)뿐 —
                  // 헤드라인에는 기기 계정이 섞여 있어서 이게 없으면 앞 칸과 어떻게 이어지는지 알 수 없다.
                  valueExtra={deviceActivated > 0 ? (
                    <span style={{
                      fontSize: 'calc(9.5px * var(--fz, 1))', marginLeft: 5, fontWeight: 500,
                      color: t.neutrals.muted, fontVariantNumeric: 'tabular-nums' as const,
                    }}>
                      구글 {googleActivated.toLocaleString()}
                    </span>
                  ) : undefined}
                  sub={`오늘 ${signupToday.toLocaleString()}명 · 7일 ${signup7.toLocaleString()}명`}
                  tone={linkedUsers > 0 && activeRate >= 50 ? 'pos' : 'warn'}
                  sparkline={compact ? undefined : signupData}
                  sparkline2={compact ? undefined : activeRateData}
                  sparkFormat2={(v) => `${v}%`}
                  spark2Domain={[0, 100]}
                  dualScale
                />
                <div style={{ display: 'grid' }}>
                {revenueLoading && !stats ? (
                  <SkelStat compact={!!mobile} />
                ) : (
                  <LStat
                    label="판매 크레딧"
                    title={`판매 크레딧 누적(실선). 점선 = CPMAU(크레딧/MAU) 추이 — 그날까지 최근 30일 판매 ÷ 그날의 MAU. 지금은 ${fmtK(credits30d)} ÷ ${mau}명 = ${fmtPerMau(creditsPerMau)}. MAU 는 직전 30일 활동자(기기 계정 포함, vc_event_stats). DAU 는 오늘을 뺀 최근 ${dauRows.length}일 활동 기기의 평균으로, 옆 '일별 활동자' 바와 같은 모집단이다. 결제율 ${payRate}% = 유료 ${paidUsers.toLocaleString()}명 ÷ 학습 활성화 ${signedUp.toLocaleString()}명. 달러 매출은 정가표 대입 추정이라(지역가·환불·스토어 수수료 미반영) 정산액이 아니어서 1인당 지표는 크레딧으로 낸다.`}
                    value={fmtK(creditsSold)}
                    valueExtra={(
                      <span style={{
                        fontSize: 'calc(9.5px * var(--fz, 1))', marginLeft: 5, fontWeight: 500,
                        color: t.brand[600], fontVariantNumeric: 'tabular-nums' as const,
                      }}>
                        CPMAU {fmtPerMau(creditsPerMau)}
                      </span>
                    )}
                    // 결제율은 툴팁으로 내렸다(CEO) — 이 자리에서는 DAU·MAU 가 붙어 있어야
                    // 둘의 비(끈적임)를 눈으로 바로 잡는다. 결제율은 퍼널 마지막 칸이 이미 센다.
                    sub={creditsSold > 0
                      ? `DAU ${avgDau30.toLocaleString()} · MAU ${mau.toLocaleString()}`
                      : '아직 없음'}
                    tone={creditsSold > 0 ? 'pos' : 'default'}
                    sparkline={compact ? undefined : creditsData}
                    sparkline2={compact ? undefined : cpmauData}
                    spark2Color={t.brand[600]}
                    sparkFormat={(v) => fmtK(v)}
                    sparkFormat2={(v) => fmtPerMau(v)}
                    // 점선은 배지와 같은 CPMAU 다 — 값과 그 값이 걸어온 길을 한 카드에서
                    // 같이 읽는다. 비율이 아니므로 [0,100] 고정 도메인을 쓰지 않고
                    // 우측 축에서 자기 범위로 그린다(좌표는 스파크라인 쪽에서 클램프).
                    dualScale
                  />
                )}
                </div>
              </div>

            {/* 플랫폼 / 국가 / 앱버전 */}
            <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(3, minmax(0,1fr))', gap: 8 }}>
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
                    key: 'active',
                    label: '활성',
                    data: activePlatforms,
                  },
                  {
                    key: 'paying',
                    label: '결제',
                    data: anonymousStats.payingPlatforms.map(p => ({
                      name: p.platform === 'ios' ? 'iOS' : p.platform === 'android' ? 'Android' : p.platform,
                      value: p.devices,
                    })),
                  },
                ]}
                palette={['#3b82f6', '#10b981', '#94a3b8']}
                unit="명"
              />
              <DistributionPie
                title="국가"
                tabs={[
                  {
                    key: 'devices',
                    label: '기기',
                    data: (anonymousStats.countries ?? []).map(c => ({ name: formatCountryName(c.country), value: c.devices })),
                  },
                  {
                    key: 'active',
                    label: '활성',
                    data: activeCountries,
                  },
                  {
                    key: 'paying',
                    label: '결제',
                    data: (anonymousStats.payingCountries ?? []).map(c => ({ name: formatCountryName(c.country), value: c.devices })),
                  },
                ]}
                palette={['#6366f1', '#f97316', '#10b981', '#ec4899', '#8b5cf6', '#06b6d4', '#f59e0b', '#84cc16']}
                unit="명"
                topN={3}
              />
              <DistributionPie
                title="앱버전"
                tabs={[
                  { key: 'all', label: '전체', data: versionPieData(anonymousStats.versions) },
                  { key: 'ios', label: 'iOS', data: versionPieData(anonymousStats.versionsIos) },
                  { key: 'and', label: 'AND', data: versionPieData(anonymousStats.versionsAndroid) },
                ]}
                palette={['#0ea5e9', '#8b5cf6', '#f59e0b', '#10b981', '#ec4899', '#6366f1', '#84cc16', '#06b6d4']}
                unit="대"
              />
            </div>
            </div>
            {/* 우측(와이드): 좌측 열 전체 높이로 stretch · 스택 모드: 아래 전폭 + 최소 높이 */}
            <div style={{ minWidth: 0, minHeight: splitLayout ? undefined : 190 }}>
              <DauTrendCard daily={anonymousStats.daily} />
            </div>
            </div>

            </>
          )
        })()}
      </div>
    </LCard>

    {/* 카드2: 가입 후 활동 · 매출 동인 */}
    <LCard pad={0}>
      {/* 가입 후 활동 · 매출 동인 — userStats 필요 (뒤집기/듣기 카드는 anonymousStats) */}
      {usersLoading && !userStats && (
        <div style={{ padding: `12px ${t.density.cardPad}px 12px` }}>
          <LSectionHead
            eyebrow="ENGAGEMENT"
            title="가입 후 활동 · 매출 동인"
            mb={10}
            action={<LHeadBtn icon="refresh" title="데이터 새로고침" onClick={onRefresh} busy={refreshing} />}
          />
          {/* 6카드: 와이드(1열) 모드 한 줄, 2열 모드 3+3 (인사이트 6카드와 동일 규칙), 모바일 2×3 */}
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : (dashCols === 2 ? 'repeat(3, 1fr)' : 'repeat(6, 1fr)'), gap: 8 }}>
            {[0, 1, 2, 3, 4, 5].map(i => <SkelStat key={i} compact={!!mobile} />)}
          </div>
        </div>
      )}
      {userStats && (
        <div style={{ padding: `12px ${t.density.cardPad}px 12px` }}>
          <LSectionHead
            eyebrow="ENGAGEMENT"
            title="가입 후 활동 · 매출 동인"
            mb={10}
            action={<LHeadBtn icon="refresh" title="데이터 새로고침" onClick={onRefresh} busy={refreshing} />}
          />

          {(() => {
            // 날짜 기준 — KST 기준 오늘 / 최근 7일 컷오프 계산
            const toKst = (d: Date | string): string => {
              const date = typeof d === 'string' ? new Date(d) : d
              return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
            }
            const sevenDaysAgo = new Date()
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6) // 오늘 포함 7일
            const sevenDaysAgoStr = toKst(sevenDaysAgo)

            // 보유 덱 추이: 일별 스냅샷(daily_inventory_snapshots.total_sheets)을 헤더 값에 맞춰 재척도.
            // 예전엔 '가입일에 그 사람의 현재 덱 수를 얹는' 코호트 누적이라, 어제 만든 덱도 작년 가입일에
            // 꽂혀서 선이 실제 증가 시점과 무관했다(끝점만 우연히 헤더와 같았다). 보유 카드와 같은 소스로.
            // 오늘 시트 증가분 = 사용자 테이블 per-user 델타(sheetsDeltaToday) 합 — 헤더 '오늘'과
            // 테이블 diff 열이 항상 일치하도록 같은 소스로 계산(신규유저 시트만 세던 옛 정의는 기존 유저의
            // 시트 추가를 놓쳐 테이블 합과 어긋났음, 2026-07-19).
            const todaySheets = userStats.users.reduce((sum, u) => sum + (u.sheetsDeltaToday || 0), 0)
            // 7일도 같은 뜻(증가분)으로 낸다. 예전엔 '최근 7일 가입자가 지금 들고 있는 덱 수'라
            // 오늘 옆에 서로 다른 뜻의 두 수가 붙어 있었다(2026-08-30 실측 오늘 11 vs 7일 92 —
            // 92는 증가분이 아니라 신규 가입자의 보유량이었다). 보유 카드와 같은 방식으로
            // live − 7일 전 스냅샷을 쓴다. 스냅샷 스케일 보정은 아래 invScale 과 같은 이유.
            const rawInv = userStats.dailyCardInventory ?? []
            const latestSnapSheets = rawInv.length ? rawInv[rawInv.length - 1].totalSheets : 0
            const sheetScale = latestSnapSheets > 0 ? userStats.totalSheets / latestSnapSheets : 1
            const sheetTrajectory = rawInv.map(d => ({ date: d.date, value: Math.round(d.totalSheets * sheetScale) }))
            const sheetsBeforeSeven = rawInv.filter(d => d.date <= sevenDaysAgoStr)
            const sevenAgoSheets = Math.round(
              ((sheetsBeforeSeven.length ? sheetsBeforeSeven[sheetsBeforeSeven.length - 1].totalSheets : rawInv[0]?.totalSheets) ?? latestSnapSheets) * sheetScale
            )
            const last7Sheets = latestSnapSheets > 0 ? userStats.totalSheets - sevenAgoSheets : 0

            // 말하기 학습: time_series_analytics 일별 → running sum.
            // 헤드라인은 user_analytics.total_attempts 합(=사용자 테이블 '말하기' 열 합)이고
            // 이 시리즈는 time_series_analytics 라 총량이 다르다(2026-08-30 실측 4,233 vs 4,088).
            // 차이는 일별 행이 안 남은 옛 시도·삭제된 시트의 시도라 시작 시점의 기준선으로 본다.
            // 그만큼을 시리즈 전체에 더해 실선이 헤드라인에서 끝나게 한다.
            const activity = userStats.dailyLearnActivity ?? []
            const attemptSeriesTotal = activity.reduce((s, d) => s + d.attempts, 0)
            const attemptBaseline = Math.max(0, userStats.totalAttempts - attemptSeriesTotal)
            let runningAttempts = attemptBaseline
            const attemptTrajectory = activity.map(d => {
              runningAttempts += d.attempts
              return { date: d.date, value: runningAttempts }
            })
            // 오늘 = 테이블 per-user 델타 합 (헤더·테이블 항상 일치, 2026-07-19 CEO). 7일은 대응열 없어 집계 유지.
            const todayAttempts = userStats.users.reduce((s, u) => s + (u.attemptsToday || 0), 0)
            const last7Attempts = activity.filter(d => d.date >= sevenDaysAgoStr).reduce((s, d) => s + d.attempts, 0)

            // 보유 카드: daily_inventory_snapshots 일별 스냅샷 → 일별 증감(diff)으로 추세 표시
            // 오늘 = live 합계 − 오늘 00:05 스냅샷 = 자정 이후 실제 증가분.
            // (스냅샷은 KST 자정에 찍혀서 '오늘 스냅샷 − 어제 스냅샷'은 전날 증가분을 오늘로 표기하던 문제.
            //  live와 오늘 스냅샷을 비교해야 '오늘 실제로 늘어난 카드'가 나온다. 오늘 스냅샷 없으면 0.)
            const liveCards = userStats.totalCards
            // 스냅샷 시리즈를 헤더의 live 값에 맞춰 재척도한다.
            // record_daily_inventory_snapshot()은 user_analytics 전체 합(삭제된 시트 포함)에 닉네임 2개만
            // 제외하는 반면, live 보유 카드는 현재 sheet_ids에 남은 시트만 세고 봇/내부 계정을 더 걸러내며
            // 기기 로컬 자산까지 더한다. 2026-08-30 실측 24,716 vs 18,094 — 스냅샷이 36% 부풀어 있어
            // 카드 스파크라인 끝점·7일 증감·배수 점선이 전부 헤더와 어긋났다(듣기 배지 3.1x, 점선 끝 2.3x).
            // 같은 날 두 정의를 재서 나온 비율로 과거를 맞추면 끝점이 항상 헤더와 일치한다.
            // (과거를 정확히 복원할 수는 없다 — 어느 시트가 언제 지워졌는지 기록이 없다. 시계열이 내부적으로
            //  일관되므로 읽는 쪽에서 맞춘다. DB 함수를 고치면 그날부터 정의가 섞이니 과거 행 재작성까지 같이 할 것.)
            const latestSnapCards = rawInv.length ? rawInv[rawInv.length - 1].totalCards : 0
            const invScale = latestSnapCards > 0 ? liveCards / latestSnapCards : 1
            const inventory = rawInv.map(d => ({ date: d.date, totalCards: Math.round(d.totalCards * invScale) }))
            const cardTrajectory = inventory.map(d => ({ date: d.date, value: d.totalCards }))
            // 오늘 카드 증가분 = 사용자 테이블 per-user 델타(cardsToday) 합 — 헤더 '오늘'과 테이블 diff 열이
            // 항상 일치. (live − 오늘 스냅샷 집계는 user_analytics orphan 행(users 테이블에 없는 계정)을
            // 포함해 매일 수십장 부풀던 문제, 2026-07-19.) 7일은 테이블 대응열이 없어 스냅샷 집계 유지.
            const todayCardsDelta = userStats.users.reduce((sum, u) => sum + (u.cardsToday || 0), 0)
            // 7일 = live − (7일전 이하 중 가장 최근 스냅샷). find는 오름차순에서 가장 오래된 걸 반환하던 버그라 filter 후 마지막 사용.
            const beforeSeven = inventory.filter(d => d.date <= sevenDaysAgoStr)
            const sevenAgoCards = (beforeSeven.length ? beforeSeven[beforeSeven.length - 1].totalCards : inventory[0]?.totalCards) ?? liveCards
            const last7CardsDelta = liveCards - sevenAgoCards

            // 일별 이벤트 시리즈를 사용자표 열 합계에 맞춘다 (2026-08-30 CEO: 사용자표 중심).
            // 카드 헤드라인은 사용자표의 열 합이고, 이벤트 시리즈에는 표에 없는 계정(봇으로 뺀 기기 등)이나
            // 표에서 빼는 데모 학습이 섞여 총량이 다르다 — 실측 뒤집기 13,238 vs 12,466(데모 772),
            // 듣기 57,065 vs 56,891, 크레딧 8,942(이벤트) vs 8,695(원장). 같은 날 두 총량의 비로
            // 시리즈를 맞추면 실선 끝점·7일·배수 점선이 전부 표 기준 위에 선다.
            // (일별 배분까지 바로잡으려면 이벤트 쪽 정의를 표와 같게 고쳐야 한다 — 데모 제외, 원장 기준.
            //  지금은 총량만 맞추고 하루하루의 모양은 이벤트 시리즈를 그대로 쓴다.)
            const alignToTable = (daily: Array<{ date: string; value: number }>, tableTotal: number) => {
              const seriesTotal = daily.reduce((sum, d) => sum + d.value, 0)
              const k = seriesTotal > 0 ? tableTotal / seriesTotal : 1
              let running = 0
              const cumulative = daily.map(d => {
                running += d.value * k
                return { date: d.date, value: Math.round(running) }
              })
              const last7 = Math.round(daily.filter(d => d.date >= sevenDaysAgoStr).reduce((sum, d) => sum + d.value, 0) * k)
              return { cumulative, last7, k }
            }

            // 학습량(뒤집기/말하기/듣기)이 보유 카드의 몇 배수인지 — 카드당 반복 학습 강도
            const cardRatioExtra = (n: number) => userStats.totalCards > 0 ? (
              <span style={{
                fontSize: 'calc(9.5px * var(--fz, 1))', marginLeft: 5, fontWeight: 500,
                fontFamily: t.font.mono, color: t.neutrals.subtle, fontVariantNumeric: 'tabular-nums' as const,
              }}>
                {(n / userStats.totalCards).toFixed(1)}x
              </span>
            ) : undefined

            // 배수(누적 학습량 ÷ 그 시점 보유 카드) 점선 시리즈 — 인사이트 카드의 비율 점선과 동일 문법.
            // 끝점 = valueExtra 배수 라벨과 일치. 카드 0인 초기 날은 0으로 둬 발산 방지.
            const invSorted = [...inventory].sort((a, b) => a.date.localeCompare(b.date))
            const cardsAt = (date: string): number => {
              let c = invSorted[0]?.totalCards ?? liveCards
              for (const inv of invSorted) { if (inv.date <= date) c = inv.totalCards; else break }
              return c
            }
            const ratioSpark = (cum: Array<{ date: string; value: number }>) =>
              cum.map(p => { const c = cardsAt(p.date); return { date: p.date, value: c > 0 ? p.value / c : 0 } })

            return (
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : (dashCols === 2 ? 'repeat(3, 1fr)' : 'repeat(6, 1fr)'), gap: 8 }}>
            <LStat
              label="보유 덱"
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
            {/* 카드 뒤집기 — 말하기/듣기 없이 눈으로만 넘기는 학습 볼륨 (card_flipped_manual) */}
            {eventsLoading && !anonymousStats ? (
              <SkelStat compact={!!mobile} />
            ) : (() => {
              // 헤드라인 = 사용자표 '뒤집기' 열 합. 이벤트 시리즈는 데모 덱 뒤집기를 포함하는데
              // 표의 열은 2026-08-10 결정대로 데모를 뺀다 — 그 차이(실측 772회)만큼 카드가 표보다 컸다.
              const totalFlips = userStats.users.reduce((s, u) => s + (u.flips || 0), 0)
              const flips = anonymousStats?.dailyFlips ?? []
              const todayFlips = userStats.users.reduce((s, u) => s + (u.flipsToday || 0), 0)
              const { cumulative: flipSpark, last7: last7Flips } = alignToTable(
                flips.map(d => ({ date: d.date, value: d.flips })), totalFlips
              )
              return (
                <LStat
                  label="카드 뒤집기"
                  title="카드를 수동으로 앞뒤 전환한 횟수(데모 덱 제외 — 사용자표 '뒤집기' 열과 같은 기준). 점선 = 보유 카드 대비 배수 (카드당 반복 강도)."
                  value={formatNumber(totalFlips)}
                  valueExtra={cardRatioExtra(totalFlips)}
                  sub={`오늘 ${formatNumber(todayFlips)}회 · 7일 ${formatNumber(last7Flips)}회`}
                  sparkline={compact ? undefined : (flipSpark.length > 1 ? flipSpark : undefined)}
                  sparkline2={compact ? undefined : (flipSpark.length > 1 ? ratioSpark(flipSpark) : undefined)}
                  sparkFormat2={(v) => `${v.toFixed(1)}x`}
                  spark2Color={t.neutrals.muted}
                  dualScale
                />
              )
            })()}
            <LStat
              label="말하기 학습"
              title="채점까지 성사된 말하기 시도 누적. 점선 = 보유 카드 대비 배수 (카드당 반복 강도)."
              value={formatNumber(userStats.totalAttempts)}
              valueExtra={cardRatioExtra(userStats.totalAttempts)}
              sub={`오늘 ${formatNumber(todayAttempts)}회 · 7일 ${formatNumber(last7Attempts)}회`}
              sparkline={compact ? undefined : (attemptTrajectory.length > 1 ? attemptTrajectory : undefined)}
              sparkline2={compact ? undefined : (attemptTrajectory.length > 1 ? ratioSpark(attemptTrajectory) : undefined)}
              sparkFormat2={(v) => `${v.toFixed(1)}x`}
              spark2Color={t.neutrals.muted}
              dualScale
            />
            {eventsLoading && !anonymousStats ? (
              <SkelStat compact={!!mobile} />
            ) : (() => {
              // 헤드라인 = 사용자표 '듣기' 열 합. 이벤트 시리즈에는 표에서 봇으로 뺀 기기의 재생이
              // 남아 있어 총량이 조금 크다(실측 57,065 vs 56,891).
              const totalUsed = userStats.users.reduce((s, u) => s + (u.creditsUsed || 0), 0)
              const usage = anonymousStats?.dailyCreditUsage ?? []
              // 오늘은 사용자표 per-user 델타 합. dailyCreditUsage 는 활동 있는 날만 행이 있어
              // 배열 마지막 원소가 '오늘'이 아닐 수 있으므로 7일도 날짜 매칭으로 낸다(slice(-7) 금지).
              const todayUsage = userStats.users.reduce((s, u) => s + (u.listenToday || 0), 0)
              const { cumulative: sparkData, last7: last7Sum } = alignToTable(
                usage.map(d => ({ date: d.date, value: d.credits })), totalUsed
              )
              return (
                <LStat
                  label="듣기 학습"
                  title="TTS·미리듣기·기기음성 재생 횟수 누적 (재생 엔진 무관, 사용자표 '듣기' 열과 같은 기준). 점선 = 보유 카드 대비 배수 (카드당 반복 강도)."
                  value={formatNumber(totalUsed)}
                  valueExtra={cardRatioExtra(totalUsed)}
                  sub={`오늘 ${formatNumber(todayUsage)}회 · 7일 ${formatNumber(last7Sum)}회`}
                  sparkline={compact ? undefined : (sparkData.length > 1 ? sparkData : undefined)}
                  sparkline2={compact ? undefined : (sparkData.length > 1 ? ratioSpark(sparkData) : undefined)}
                  sparkFormat2={(v) => `${v.toFixed(1)}x`}
                  spark2Color={t.neutrals.muted}
                  dualScale
                />
              )
            })()}
            {/* 실제 크레딧 소진 (TTS 차감 + AI 생성) */}
            {eventsLoading && !anonymousStats ? (
              <SkelStat compact={!!mobile} />
            ) : (() => {
              // 헤드라인 = 사용자표 '사용' 열 합 = credit_transactions 원장(환불 차감 후).
              // 이벤트 집계(credits_changed/tts_premium + ai_generation_success)는 환불을 되돌리지
              // 않고 표에 없는 계정도 섞여 조금 크다(실측 8,942 vs 8,695). 원장이 정본이다.
              const totalSpent = userStats.users.reduce((s, u) => s + (u.creditsSpent || 0), 0)
              const spend = anonymousStats?.dailyCreditSpend ?? []
              const dayTotal = (d: { tts: number; ai: number }) => (d.tts || 0) + (d.ai || 0)
              const todaySpend = userStats.users.reduce((s, u) => s + (u.spentToday || 0), 0)
              const { cumulative: spendSpark, last7: last7Spend, k: spendK } = alignToTable(
                spend.map(d => ({ date: d.date, value: dayTotal(d) })), totalSpent
              )
              // TTS/AI 내역도 같은 비율로 맞춰 둘의 합이 헤드라인과 같게 한다.
              const totalTts = Math.round(spend.reduce((sum, d) => sum + (d.tts || 0), 0) * spendK)
              const totalAi = totalSpent - totalTts
              return (
                <LStat
                  label="크레딧 사용"
                  title={`실제 소진된 크레딧 누적 — credit_transactions 원장 기준(환불 차감 후), 사용자표 '사용' 열과 같은 기준. 대략 TTS 차감 ${formatNumber(totalTts)} + AI 생성 ${formatNumber(totalAi)}. 유저의 크레딧 소진 속도 = 구매 압력. 점선 = 보유 카드 대비 배수 — 카드가 늘수록 소진도 빨라진다.`}
                  value={formatNumber(totalSpent)}
                  valueExtra={cardRatioExtra(totalSpent)}
                  sub={`오늘 ${formatNumber(todaySpend)} · 7일 ${formatNumber(last7Spend)}`}
                  sparkline={compact ? undefined : (spendSpark.length > 1 ? spendSpark : undefined)}
                  sparkline2={compact ? undefined : (spendSpark.length > 1 ? ratioSpark(spendSpark) : undefined)}
                  sparkFormat2={(v) => `${v.toFixed(1)}x`}
                  spark2Color={t.neutrals.muted}
                  dualScale
                />
              )
            })()}
          </div>
            )
          })()}
        </div>
      )}
    </LCard>
    </div>

    {/* 카드3: 사용자 테이블 — 2열 모드에서 두 열을 모두 차지한다.
        비로그인 표를 여기 합치면서 열이 23개가 됐고, 반 폭에서는 대부분이 가로 스크롤
        뒤로 숨는다. 옆에 짝지을 카드도 사라졌으므로 반 폭을 지킬 이유가 없다. */}
    <div style={{ minWidth: 0, ...(cols === 2 && !mobile ? { gridColumn: '1 / -1' } : null) }}>
    <LCard pad={0}>
      {/* 사용자 목록 (맨 아래) — userStats만 필요 */}
      {usersLoading && !userStats && (
        <div style={{ padding: `12px ${t.density.cardPad}px 12px` }}>
          <LSectionHead eyebrow="USERS" title="사용자" mb={8} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map(i => <SkelUserRow key={i} />)}
          </div>
        </div>
      )}
      {userStats && (
        <div style={{ padding: `12px ${t.density.cardPad}px 12px` }}>
          {(() => {
            // 이 표에는 모집단이 셋 섞여 있다: 구글 사용자 · 기기 계정 · 계정 없는 익명 기기.
            // 예전 헤더는 "미활성 N" 하나만 보여줬는데, 그 N이 userStats.users(구글+기기계정)
            // 기준이라 화면에 보이는 익명 기기 행은 세지 않으면서 퍼널의 미활성과도 값이
            // 달랐다(93 vs 91). 어느 쪽도 표의 행 수를 설명하지 못했다.
            // 이제 셋을 다 적고, 미활성은 퍼널과 같은 기준(구글 사용자)임을 명시한다.
            const googleRows = userStats.users.filter(u => !u.id.startsWith('device:'))
            const idleGoogle = googleRows.filter(u => u.sheetCount === 0 && (u.ownCards ?? u.cards) === 0 && (u.flips ?? 0) === 0).length
            const deviceRowCount = (userStats.users.length - googleRows.length) + deviceRows.length
            return (
              <LSectionHead
                eyebrow="USERS"
                title="사용자"
                meta={(
                  <span title={'구글 = 구글 로그인 사용자. 기기 = 로그인 없이 쓰는 행(기기 계정 + 계정 없는 익명 기기).\n'
                    + '미활성은 퍼널과 같은 기준으로 구글 사용자만 센다 — 기기 행은 로컬 덱이 서버에 남지 않아 '
                    + '구조적으로 항상 미활성이라, 섞으면 활성화율이 사용자 행동과 무관하게 떨어진다.'}>
                    구글 {googleRows.length} · 기기 {deviceRowCount} · 미활성 {idleGoogle}
                  </span>
                )}
                mb={8}
                action={<LHeadBtn icon="refresh" title="데이터 새로고침" onClick={onRefresh} busy={refreshing} />}
              />
            )
          })()}
          <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: USER_TABLE_MIN_WIDTH, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* 테이블 헤더 — 클릭하여 다중 정렬. 미포함→추가, 재클릭→방향전환, 또 클릭→해제.
                여러 컬럼이 활성이면 우선순위 번호 표시. */}
            <div style={{ display: 'grid', gridTemplateColumns: USER_TABLE_COLS, gap: 6, alignItems: 'center', padding: '0 8px 5px' }}>
              {USER_COLUMNS.map(col => {
                const sIdx = userSorts.findIndex(s => s.key === col.key)
                const active = sIdx >= 0
                const dir = active ? userSorts[sIdx].dir : null
                const multi = userSorts.length > 1
                return (
                  <button
                    key={col.key}
                    onClick={() => handleHeaderSort(col.key)}
                    title={active ? `${col.label}: ${dir === 'asc' ? '오름차순' : '내림차순'} (재클릭: 방향전환→해제)` : `${col.label} 기준 정렬 추가`}
                    style={{
                      ...userHeadCell, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                      display: 'flex', alignItems: 'center', gap: 2, width: '100%',
                      justifyContent: col.align === 'right' ? 'flex-end' : col.align === 'center' ? 'center' : 'flex-start',
                      color: active ? t.neutrals.text : t.neutrals.subtle,
                    }}
                  >
                    {col.label}
                    {active && (
                      <span style={{ fontSize: '0.85em', lineHeight: 1, display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                        {dir === 'asc' ? '▲' : '▼'}
                        {multi && <sup style={{ fontSize: '0.75em', color: t.neutrals.subtle }}>{sIdx + 1}</sup>}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            {paginatedUsers.map((user) => {
              const isDevice = user.id.startsWith('device:') || user.id.startsWith('dev:')
              const shortId = isDevice
                ? voicecardsDeviceDisplayName(user.id).slice(1)
                : (user.id || '').replace(/-/g, '').slice(0, 4)
              const fallbackName = user.email || (isDevice ? voicecardsDeviceDisplayName(user.id) : shortId ? `#${shortId}` : 'Unknown')
              // 기기 행의 닉네임은 '#4f4d' 꼴이라 첫 글자가 전부 '#'이 된다 — 원 안이
              // 전 행 동일해져 아무것도 구분해주지 못하므로 '#'은 건너뛴다(병합 전 표와 같은 글자).
              const initialSrc = (user.nickname?.replace(/^#/, '') || user.email || shortId)
              const initial = (initialSrc.charAt(0) || '?').toUpperCase()
              const titleParts = [user.appVersion ? `v${user.appVersion}` : null, user.locale].filter(Boolean).join(' · ')
              return (
                <div key={user.id} style={{
                  display: 'grid', gridTemplateColumns: USER_TABLE_COLS, gap: 6, alignItems: 'center',
                  padding: '5px 8px', borderRadius: t.radius.sm, background: t.neutrals.inner,
                }}>
                  {/* 설치 — 앱을 처음 연 날. 로그인보다 앞선다. 뷰 이전 가입자는 '—' */}
                  <div style={{ ...userDateCell, display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                    {user.installedAt ? (
                      <>
                        <span>{formatDateShort(user.installedAt)}</span>
                        <span style={{ fontSize: 'calc(8px * var(--fz, 1))', color: t.neutrals.subtle }}>({formatWeekdayShort(user.installedAt)}) {formatTimeShort(user.installedAt)}</span>
                      </>
                    ) : '—'}
                  </div>
                  {/* 로그인 — users 행이 생긴 날. 비어 있으면 아직 구글 로그인을 안 한 기기 */}
                  <div style={{ ...userDateCell, display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                    {user.createdAt ? (
                      <>
                        <span>{formatDateShort(user.createdAt)}</span>
                        <span style={{ fontSize: 'calc(8px * var(--fz, 1))', color: t.neutrals.subtle }}>({formatWeekdayShort(user.createdAt)}) {formatTimeShort(user.createdAt)}</span>
                      </>
                    ) : '—'}
                  </div>
                  <div style={{ ...userDateCell, display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                    {user.lastActiveAt ? (
                      <>
                        <span>{formatDateShort(user.lastActiveAt)}</span>
                        <span style={{ fontSize: 'calc(8px * var(--fz, 1))', color: t.neutrals.subtle }}>({formatWeekdayShort(user.lastActiveAt)}) {formatTimeShort(user.lastActiveAt)}</span>
                      </>
                    ) : '—'}
                  </div>
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
                  {/* 앱버전 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
                    {user.appVersion ? (
                      <span style={{
                        fontSize: 'calc(8.5px * var(--fz, 1))', fontFamily: t.font.mono, fontWeight: 600,
                        color: t.neutrals.muted, background: t.neutrals.card,
                        padding: '1px 4px', borderRadius: 3, lineHeight: 1.4,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
                      }}>
                        v{user.appVersion}
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
                  {/* 국가 (locale 지역) */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
                    {(() => {
                      const c = formatCountry(user.country, user.locale)
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
                  {/* 구글연동 = Drive 폴더 생성 완료(users.folder_id). deferred-Drive라
                      시트 0이어도 연동은 끝났을 수 있다(AI draft만 두고 이탈 등). */}
                  <div style={{
                    fontSize: 'calc(9.5px * var(--fz, 1))', fontFamily: t.font.sans, fontWeight: 500,
                    whiteSpace: 'nowrap', textAlign: 'center',
                    color: user.hasFolder ? t.neutrals.muted : '#B45309',
                  }}>
                    {user.hasFolder ? '완료' : '미완료'}
                  </div>
                  {/* 활성화 = 첫 시트 저장(또는 카드 보유). 미활성 && 구글연동 완료 = "연동후대기" —
                      draft만 두고 이탈한 복귀 유도 타깃이라 대기로 구분 표기. */}
                  <div style={{
                    fontSize: 'calc(9.5px * var(--fz, 1))', fontFamily: t.font.sans, fontWeight: 500,
                    whiteSpace: 'nowrap', textAlign: 'center',
                    color: (user.sheetCount > 0 || (user.ownCards ?? user.cards) > 0 || (user.flips ?? 0) > 0) ? t.neutrals.muted : '#B45309',
                  }}>
                    {(user.sheetCount > 0 || (user.ownCards ?? user.cards) > 0 || (user.flips ?? 0) > 0) ? '완료' : user.hasFolder ? '대기' : '미완료'}
                  </div>
                  <NumDeltaCell total={user.sheetCount} delta={user.sheetsDeltaToday} />
                  {/* 카드 합계는 데모 포함(대시보드 정의). 전부 데모면 흐리게 + '데모' 표기 —
                      시트 0인데 카드 100 같은 표가 저장 자산으로 오독되지 않게. */}
                  <NumDeltaCell total={user.cards} delta={user.cardsToday}
                    dim={(user.ownCards ?? user.cards) === 0 && user.cards > 0}
                    note={(user.ownCards ?? user.cards) === 0 && user.cards > 0 ? '데모' : undefined} />
                  <NumDeltaCell total={user.flips ?? 0} delta={user.flipsToday ?? 0} />
                  <NumDeltaCell total={user.attempts} delta={user.attemptsToday} />
                  <NumDeltaCell total={user.creditsUsed} delta={user.listenToday} />
                  <IntentCell u={user} />
                  <OfferStageCell stage={user.offerStage} at={user.offerStageAt} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
                    <span style={{
                      fontSize: 'calc(8.5px * var(--fz, 1))', fontFamily: t.font.mono, fontWeight: 600,
                      color: user.hasPurchased ? '#166534' : t.neutrals.muted,
                      background: user.hasPurchased ? '#DCFCE7' : t.neutrals.card,
                      padding: '1px 5px', borderRadius: 3, lineHeight: 1.4, whiteSpace: 'nowrap',
                    }}>
                      {user.hasPurchased ? '유료' : '무료'}
                    </span>
                  </div>
                  {/* 백그라운드 재생 보장 종료 — 기간권(users.unlimited_until). 크레딧 잔액과 별개로
                      이 날짜까지는 화면을 꺼도 듣기가 돈다. 자동 갱신이 없어 지나면 그냥 닫힌다.
                      살아 있으면 남은 일수를, 지났으면 흐리게 종료일을 적는다. */}
                  {/* 마지막 구매일 — 구매 이벤트 기준. 보장종료 바로 앞에 두어 "언제 사서 언제까지"가
                      한 줄에서 읽히게 한다. */}
                  <div style={{ ...userDateCell, display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                    {user.lastPurchaseAt ? (
                      <>
                        <span>{formatDateShort(user.lastPurchaseAt)}</span>
                        <span style={{ fontSize: 'calc(8px * var(--fz, 1))', color: t.neutrals.subtle }}>({formatWeekdayShort(user.lastPurchaseAt)}) {formatTimeShort(user.lastPurchaseAt)}</span>
                      </>
                    ) : (
                      <span style={{ color: t.neutrals.subtle, textAlign: 'center' as const }}>—</span>
                    )}
                  </div>
                  <GuaranteeCell until={user.unlimitedUntil} daysLeft={user.unlimitedDaysLeft} />
                  <NumDeltaCell total={user.purchasedCredits} delta={user.purchasedToday} />
                  <NumDeltaCell total={user.bonusCredits} delta={0} />
                  <NumDeltaCell total={user.creditsSpent ?? 0} delta={user.spentToday ?? 0} />
                  <NumDeltaCell total={user.credits} delta={user.balanceDeltaToday} dim />
                  <div style={userNumCell}>
                    {user.activeDays7d > 0
                      ? <span style={{ fontWeight: 600 }}>{user.activeDays7d}<span style={{ color: t.neutrals.subtle, fontWeight: 400 }}>/7</span></span>
                      : <span style={{ color: t.neutrals.subtle }}>—</span>}
                  </div>
                </div>
              )
            })}
          </div>
          </div>

          {/* 페이지네이션 (주식투자 페이지 섹션과 동일 스타일) */}
          {sortedUsers.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '6px 14px',
              borderTop: `1px solid ${t.neutrals.line}`,
            }}>
              {/* Page size input */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <LPageSize value={userPerPage} onChange={applyUserPerPage} />
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
    </div>

    {/* 카드4(비로그인 저니)는 2026-08-10 사용자 테이블에 병합됐다. 기기 계정이 생기면서
        "로그인 여부"가 사용자와 방문자를 가르는 선이 아니게 됐고, 두 표를 따로 두면 같은
        사람이 로그인 전후로 두 표에 나뉘어 보였다. 이제 로그인일이 빈 행이 그 자리를 대신한다. */}
    </>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────



// 일별 활동자 추이 — 하루 한 바를 4단 스택: 기존 로그인/신규 로그인/기존 기기/신규 기기.
// 아래에서 위로 기존 로그인 → 신규 로그인 → 기존 기기 → 신규 기기. 합 = daily.devices.
// 로그인(블루 계열)과 기기(그린 계열)를 색 계열로 묶어 두 경로가 한눈에 갈라지게 했다.
// 2026-08-10 3단→4단: 기기 계정 도입 후 "비로그인"이 한 덩어리가 아니게 됐다 — 로그인 없이
// 정착해 재방문하는 사용자와 오늘 처음 온 사람이 같은 칸에 섞여 있었다.
// 서버 집계(vc_event_stats)를 그대로 재사용해 대시보드 정의와 일치. 봇/관리자 제외 뷰 기준.
// 새 필드가 없는 옛 캐시 payload는 기기 신규=0, 기기 기존=비로그인 전체로 강등(기존 강등 규칙과 동형).
function DauTrendCard({ daily, days = 42 }: {
  daily: Array<{ date: string; devices: number; loggedDevices: number; anonDevices: number; newLoggedDevices?: number; memberLoggedDevices?: number; newDeviceDevices?: number; memberDeviceDevices?: number; memberActive30?: number }>
  days?: number
}) {
  const rows = (daily ?? []).slice(-days)
  const max = rows.reduce((m, r) => Math.max(m, r.devices), 0)
  const latest = rows.length ? rows[rows.length - 1] : null
  const newOf = (r: { loggedDevices: number; newLoggedDevices?: number }) => r.newLoggedDevices ?? 0
  const memberOf = (r: { loggedDevices: number; newLoggedDevices?: number; memberLoggedDevices?: number }) =>
    r.memberLoggedDevices ?? Math.max(0, r.loggedDevices - newOf(r))
  const devNewOf = (r: { newDeviceDevices?: number }) => r.newDeviceDevices ?? 0
  const devMemberOf = (r: { anonDevices: number; newDeviceDevices?: number; memberDeviceDevices?: number }) =>
    r.memberDeviceDevices ?? Math.max(0, r.anonDevices - devNewOf(r))
  // 로그인=블루 계열(기존 진함/신규 보라), 기기=그린 계열(기존 진함/신규 연함).
  // 같은 계열 안에서 신규가 밝은 쪽 — 위로 갈수록 '새 사람'이라 스택 방향과 읽는 방향이 맞는다.
  const MEMBER = '#3b82f6'
  const NEW = '#8b5cf6'
  const DEV_MEMBER = '#10b981'
  const DEV_NEW = '#6ee7b7'
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  // 바 높이는 컨테이너 대비 % — 카드가 커지면 차트도 같이 커짐 (좌측 퍼널 열 높이에 맞춰 stretch)
  const barPct = (v: number) => (max > 0 ? (v / max) * 100 : 0)
  // 7일 이동평균(총 활동 기기) — 바 위에 가볍게 얹는 추세선. 바 팔레트(블루/퍼플/그린)와 대비되는 주황
  const MA_COLOR = '#f97316'
  const ma = rows.map((_, i) => {
    const win = rows.slice(Math.max(0, i - 6), i + 1)
    return win.reduce((sum, r) => sum + r.devices, 0) / win.length
  })
  // 로그인율(%) — 회원 stickiness: 그날 회원 로그인 / 직전 30일 활동 회원(롤링 MAU).
  // 분모가 누적이 아니라 살아있는 회원 base라 선이 기계적으로 흘러내리지 않음. DAU/MAU와 같은 척도.
  // 자체 최대값에 맞춰 스케일링(로즈 점선).
  const LOGIN_RATE_COLOR = '#334155' // 짙은 회색(slate-700) — 차트 라이트 배경에서 선명. 툴팁(다크 bg) 스와치만 밝게 별도 처리.
  const LOGIN_RATE_SWATCH_ON_DARK = '#CBD5E1'
  const loginRate = rows.map(r => {
    const base = r.memberActive30 ?? 0
    return base > 0 ? (memberOf(r) / base) * 100 : 0
  })
  // 로그인율 라인은 당분간 숨김(복잡도 정리, CEO). 되살리려면 true. 데이터(memberActive30)·계산은 유지.
  const SHOW_LOGIN_RATE = false
  const hasLoginRate = SHOW_LOGIN_RATE && rows.some(r => (r.memberActive30 ?? 0) > 0) && loginRate.some(v => v > 0)
  // 원본 로그인율은 base가 작아 하루 1명에 크게 튐 → 7일 이동평균으로 추세만 남긴다(기기 7일평균 라인과 동일 방식).
  const loginRateMA = loginRate.map((_, i) => {
    const win = loginRate.slice(Math.max(0, i - 6), i + 1)
    return win.reduce((sum, v) => sum + v, 0) / win.length
  })
  const maxLoginRate = loginRateMA.reduce((m, v) => Math.max(m, v), 0)

  return (
    <div style={{
      background: t.neutrals.inner, borderRadius: t.radius.sm, padding: '8px 10px',
      height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 4, marginBottom: 6, flexWrap: 'wrap' as const, rowGap: 3,
      }}>
        <div style={{
          fontSize: 'calc(9.5px * var(--fz, 1))', fontFamily: t.font.mono, letterSpacing: 0.8,
          textTransform: 'uppercase' as const, color: t.neutrals.subtle, whiteSpace: 'nowrap' as const,
        }}>
          일별 활동자
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          // 칩 6개(4버킷 + 7일평균 + 로그인율) — 모바일 폭에서 한 줄에 안 들어간다.
          // 컨테이너 nowrap을 풀어 자연스럽게 접히게 하고, 줄바꿈은 칩 경계에서만
          // 일어나도록 nowrap을 칩 각각으로 내렸다. flex-end라 접혀도 우측 정렬 유지.
          flexWrap: 'wrap' as const, justifyContent: 'flex-end', rowGap: 3, minWidth: 0,
          fontSize: 'calc(9px * var(--fz, 1))', fontFamily: t.font.mono,
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: t.neutrals.muted, whiteSpace: 'nowrap' as const }}>
            <span style={{ width: 6, height: 6, borderRadius: 1, background: MEMBER }} />로그인·기존 {latest ? memberOf(latest) : 0}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: t.neutrals.muted, whiteSpace: 'nowrap' as const }}>
            <span style={{ width: 6, height: 6, borderRadius: 1, background: NEW }} />로그인·신규 {latest ? newOf(latest) : 0}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: t.neutrals.muted, whiteSpace: 'nowrap' as const }}>
            <span style={{ width: 6, height: 6, borderRadius: 1, background: DEV_MEMBER }} />기기·기존 {latest ? devMemberOf(latest) : 0}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: t.neutrals.muted, whiteSpace: 'nowrap' as const }}>
            <span style={{ width: 6, height: 6, borderRadius: 1, background: DEV_NEW }} />기기·신규 {latest ? devNewOf(latest) : 0}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: t.neutrals.muted, whiteSpace: 'nowrap' as const }}>
            <span style={{ width: 10, height: 2, borderRadius: 1, background: MA_COLOR }} />7일평균 {ma.length ? (Math.round(ma[ma.length - 1] * 10) / 10).toLocaleString() : 0}
          </span>
          {hasLoginRate && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: t.neutrals.muted, whiteSpace: 'nowrap' as const }} title="회원 stickiness 7일평균: 그날 회원 로그인 / 최근 30일 활동 회원(롤링)의 7일 이동평균. 회원 DAU/MAU와 같은 척도.">
              <span style={{ width: 10, height: 2, borderRadius: 1, background: LOGIN_RATE_COLOR, backgroundImage: `repeating-linear-gradient(90deg, ${LOGIN_RATE_COLOR} 0 3px, transparent 3px 5px)` }} />로그인율(7일) {loginRateMA.length ? `${Math.round(loginRateMA[loginRateMA.length - 1] * 10) / 10}%` : '0%'}
            </span>
          )}
        </div>
      </div>
      {rows.length === 0 || max === 0 ? (
        <div style={{
          flex: 1, minHeight: 80, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 'calc(10px * var(--fz, 1))', color: t.neutrals.subtle,
        }}>
          데이터 없음
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 96, display: 'flex', alignItems: 'stretch', gap: 2, position: 'relative' }}>
          {rows.map((r, i) => {
            const devNewH = barPct(devNewOf(r))
            const devMemberH = barPct(devMemberOf(r))
            const newH = barPct(newOf(r))
            const memberH = barPct(memberOf(r))
            const dim = hoverIdx !== null && hoverIdx !== i
            return (
              <div
                key={r.date}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(prev => (prev === i ? null : prev))}
                style={{ flex: 1, minWidth: 2, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', cursor: 'default' }}
              >
                {/* 바 위 총합 — 2열 모드에서도 표시(CEO). 바가 좁아지는 만큼 글자를 줄여 옆 바와 안 부딪히게 */}
                {r.devices > 0 && (
                  <span style={{
                    fontSize: 'calc(7.5px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.subtle,
                    fontVariantNumeric: 'tabular-nums' as const, lineHeight: 1, alignSelf: 'center', marginBottom: 2,
                    whiteSpace: 'nowrap' as const, opacity: dim ? 0.25 : 0.7, transition: 'opacity 120ms ease',
                  }}>{r.devices}</span>
                )}
                {devNewH > 0 && <div style={{ height: `${devNewH}%`, background: DEV_NEW, borderRadius: '1px 1px 0 0', opacity: dim ? 0.4 : 1, transition: 'opacity 120ms ease' }} />}
                {devMemberH > 0 && <div style={{ height: `${devMemberH}%`, background: DEV_MEMBER, borderRadius: devNewH > 0 ? 0 : '1px 1px 0 0', opacity: dim ? 0.4 : 1, transition: 'opacity 120ms ease' }} />}
                {newH > 0 && <div style={{ height: `${newH}%`, background: NEW, borderRadius: (devNewH > 0 || devMemberH > 0) ? 0 : '1px 1px 0 0', opacity: dim ? 0.4 : 1, transition: 'opacity 120ms ease' }} />}
                {memberH > 0 && <div style={{ height: `${memberH}%`, background: MEMBER, borderRadius: (devNewH > 0 || devMemberH > 0 || newH > 0) ? 0 : '1px 1px 0 0', opacity: dim ? 0.4 : 1, transition: 'opacity 120ms ease' }} />}
              </div>
            )
          })}
          {/* 7일 이동평균 라인 — 바 높이 좌표계(0~72px)와 동일 스케일 */}
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
              {/* 로그인율 7일평균(%) — 자체 최대값 스케일. 바/기기7일평균과 다른 우측 지표라 점선으로 구분. */}
              {hasLoginRate && maxLoginRate > 0 && (
                <polyline
                  points={loginRateMA.map((v, i) => `${(((i + 0.5) / rows.length) * 100).toFixed(2)},${(100 - (v / maxLoginRate) * 100).toFixed(2)}`).join(' ')}
                  fill="none" stroke={LOGIN_RATE_COLOR} strokeWidth={1.1} opacity={0.85}
                  strokeDasharray="3 2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round"
                />
              )}
            </svg>
          )}
          {hoverIdx !== null && rows[hoverIdx] && (() => {
            const r = rows[hoverIdx]
            const leftPct = Math.min(86, Math.max(14, ((hoverIdx + 0.5) / rows.length) * 100))
            return (
              <div style={{
                position: 'absolute', left: `${leftPct}%`, transform: 'translateX(-50%)',
                bottom: `calc(${barPct(r.devices).toFixed(1)}% + 8px)`, pointerEvents: 'none', zIndex: 10,
                background: '#1E293B', color: '#F8FAFC',
                fontSize: 'calc(11px * var(--fz, 1))', fontFamily: t.font.sans, lineHeight: 1.4,
                borderRadius: 6, padding: '6px 10px', whiteSpace: 'nowrap',
              }}>
                <div style={{ opacity: 0.7, marginBottom: 3 }}>{withWeekday(r.date)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 1, background: MEMBER }} />기존 로그인 {memberOf(r)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 1, background: NEW }} />신규 로그인 {newOf(r)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 1, background: DEV_MEMBER }} />기존 기기 {devMemberOf(r)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 1, background: DEV_NEW }} />신규 기기 {devNewOf(r)}
                </div>
                {hasLoginRate && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 7, height: 2, borderRadius: 1, background: LOGIN_RATE_SWATCH_ON_DARK }} />로그인율 7일평균 {Math.round(loginRateMA[hoverIdx] * 10) / 10}% <span style={{ opacity: 0.6 }}>(당일 {Math.round(loginRate[hoverIdx] * 10) / 10}% · 최근30일 회원 {r.memberActive30 ?? 0} 중 {memberOf(r)})</span>
                  </div>
                )}
                <div style={{ opacity: 0.7, marginTop: 3 }}>총 {r.devices} · 7일 평균 {Math.round(ma[hoverIdx] * 10) / 10}</div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
