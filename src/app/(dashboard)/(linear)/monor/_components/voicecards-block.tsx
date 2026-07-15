'use client'

import { useState, useMemo, useEffect } from 'react'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { useDashCols } from './cols-toggle'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { kstDateKey, kstToday, kstDaysAgo } from '@/lib/kst'

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
    country: string | null
    hasPurchased: boolean
    credits: number
    purchasedCredits: number
    bonusCredits: number
    offerStage: string | null
    offerStageAt: string | null
    creditsUsed: number
    hasFolder: boolean
    ownCards?: number
    sheetCount: number
    cards: number
    flips?: number
    attempts: number
    cardsToday: number
    attemptsToday: number
    listenToday: number
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
    createdAt: string
    lastActiveAt: string | null
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
      lastSeenAt: string
      activeDays: number
      cardsViewed: number
      cardsLearned: number
      flips: number
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
  onOpenSettings: () => void
  onRefresh: () => void
  refreshing: boolean
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

// 데스크톱 사용자 테이블 — 컬럼 정렬(헤더/행 공유). 컬럼: 닉네임·플랫폼·앱버전·언어·상태·시트·카드·말하기·듣기·크레딧·유료·가입·활동
// 닉네임 | 플랫폼 | 앱버전 | 언어 | 구글연동 | 시트 | 카드 | 말하기 | 듣기 | 크레딧 | 유료 | 가입 | 활동
const USER_TABLE_COLS = '64px 64px minmax(120px,1fr) 44px 64px 44px 52px 56px 48px 36px 48px 48px 52px 44px 78px 60px 54px 48px 52px 48px 44px'
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
// 비로그인 저니 테이블 — 컬럼: 활동(날짜) | 기기 | 단계 | 플랫폼 | 앱버전 | 국가 | 카드 | 학습 | 시트 | AI | 클릭 | 일수
const JOURNEY_TABLE_COLS = '64px minmax(90px,1fr) 64px 44px 64px 48px 40px 40px 44px 40px 36px 40px 40px'
const JOURNEY_TABLE_MIN_WIDTH = (() => {
  const cols = JOURNEY_TABLE_COLS.split(' ')
  const px = cols.reduce((sum, c) => {
    const m = c.match(/minmax\((\d+)px/) || c.match(/^(\d+)px$/)
    return sum + (m ? Number(m[1]) : 0)
  }, 0)
  return px + (cols.length - 1) * 6 + 16
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
const COUNTRY_NAMES: Record<string, string> = {
  KR: '한국', US: '미국', JP: '일본', CN: '중국', TW: '대만', HK: '홍콩', GB: '영국', DE: '독일',
  FR: '프랑스', ES: '스페인', IT: '이탈리아', BR: '브라질', RU: '러시아', IN: '인도', ID: '인도네시아',
  VN: '베트남', TH: '태국', PH: '필리핀', TR: '터키', NL: '네덜란드', PL: '폴란드', CA: '캐나다',
  AU: '호주', MX: '멕시코', SG: '싱가포르', MY: '말레이시아', SA: '사우디', AE: 'UAE', CO: '콜롬비아',
  AT: '오스트리아', VE: '베네수엘라', UA: '우크라이나', PK: '파키스탄', AR: '아르헨티나', BO: '볼리비아',
  SV: '엘살바도르', CL: '칠레', CZ: '체코', EE: '에스토니아', EG: '이집트', IE: '아일랜드', MA: '모로코',
  MZ: '모잠비크', NP: '네팔', PT: '포르투갈', UZ: '우즈베키스탄', NG: '나이지리아', ZA: '남아공',
}
function regionOf(locale: string | null): string {
  if (!locale) return ''
  return (locale.split(/[-_]/)[1] || '').toUpperCase()
}
// ISO 3166-1 alpha-2 → 국기 이모지 (지역 표시 기호). 임의 2자리 코드 지원.
function codeToFlag(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return '🏳️'
  const cc = code.toUpperCase()
  return String.fromCodePoint(...[...cc].map(c => 0x1f1e6 + c.charCodeAt(0) - 65))
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
// 분포 차트 라벨용: "🇺🇸 미국" / 미상
function formatCountryName(code: string): string {
  if (!code || code === 'unknown') return '미상'
  const cc = code.toUpperCase()
  if (!/^[A-Z]{2}$/.test(cc)) return code
  return `${codeToFlag(cc)} ${COUNTRY_NAMES[cc] || cc}`
}

// ─── Component ────────────────────────────────────────────────────────────────

type UserSortKey =
  | 'name' | 'platform' | 'version' | 'language' | 'country' | 'status' | 'active'
  | 'sheets' | 'cards' | 'flips' | 'attempts' | 'listen' | 'intent' | 'offer' | 'credits' | 'purchased' | 'bonus' | 'paid'
  | 'created' | 'recent' | 'active7'
type SortDir = 'asc' | 'desc'

// 테이블 컬럼 정의 (헤더 라벨 + 정렬키 + 정렬, 모바일 드롭다운 라벨). 순서 = 그리드 순서.
const USER_COLUMNS: Array<{ key: UserSortKey; label: string; mobileLabel: string; align: 'left' | 'center' | 'right' }> = [
  { key: 'created',  label: '가입',   mobileLabel: '가입일',   align: 'center' },
  { key: 'recent',   label: '활동',   mobileLabel: '활동일',   align: 'center' },
  { key: 'name',     label: '닉네임', mobileLabel: '닉네임',   align: 'left' },
  { key: 'platform', label: '플랫폼', mobileLabel: '플랫폼',   align: 'center' },
  { key: 'version',  label: '앱버전', mobileLabel: '앱버전',   align: 'center' },
  { key: 'language', label: '언어',   mobileLabel: '언어',     align: 'center' },
  { key: 'country',  label: '국가',   mobileLabel: '국가',     align: 'center' },
  { key: 'status',   label: '구글연동', mobileLabel: '구글연동', align: 'center' },
  { key: 'active',   label: '활성화', mobileLabel: '활성화',   align: 'center' },
  { key: 'sheets',   label: '시트',   mobileLabel: '시트',     align: 'center' },
  { key: 'cards',    label: '카드',   mobileLabel: '카드',     align: 'center' },
  { key: 'flips',    label: '뒤집기', mobileLabel: '뒤집기',   align: 'center' },
  { key: 'attempts', label: '말하기', mobileLabel: '말하기',   align: 'center' },
  { key: 'listen',   label: '듣기',   mobileLabel: '듣기',     align: 'center' },
  { key: 'intent',   label: '구매신호', mobileLabel: '구매신호', align: 'center' },
  { key: 'offer',    label: '오퍼',   mobileLabel: '오퍼단계', align: 'center' },
  { key: 'paid',     label: '유료',   mobileLabel: '유료결제', align: 'center' },
  { key: 'purchased', label: '구매', mobileLabel: '구매 크레딧', align: 'center' },
  { key: 'bonus',    label: '보너스', mobileLabel: '보너스 크레딧', align: 'center' },
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

function SkelSectionHeader({ width = 100 }: { width?: number }) {
  return <SkelBar width={width} height={11} style={{ marginBottom: 10 }} />
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
  onOpenSettings, onRefresh, refreshing,
}: VoicecardsBlockProps) {
  const mobile = useIsMobile()
  const dashCols = useDashCols()
  // 매우 좁은 화면(모바일)에서만 sparkline 숨김. LStat이 sub를 자체 줄로 분리해서
  // 일반 PC 해상도에선 sparkline 들어갈 공간 있음.
  const compact = mobile
  // 인사이트 분할(좌 퍼널 / 우 대형 DAU)은 와이드(1열) 모드에서만 — 2열·모바일은 스택
  const splitLayout = !mobile && dashCols === 1
  // 다중 정렬: 우선순위 순서대로 [{key,dir}]. 헤더 클릭으로 컬럼을 체인에 추가/방향전환/해제.
  const [userSorts, setUserSorts] = useState<SortCrit[]>([{ key: 'created', dir: 'desc' }])
  const [userPage, setUserPage] = useState(1)
  const [userPerPage, setUserPerPage] = useState(10)
  const [userPerPageInput, setUserPerPageInput] = useState('10')

  const commitUserPerPage = () => {
    const n = Math.max(5, Math.min(100, Number(userPerPageInput) || 10))
    setUserPerPageInput(String(n))
    setUserPerPage(n)
    setUserPage(1)
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
        // 하이드레이션 안전을 위해 마운트 후 1회 복원(서버엔 localStorage 없음) — 의도된 동기 setState
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setUserSorts(parsed)
        return
      }
    } catch { /* 구형 포맷 폴백 */ }
    const [key, dir] = stored.split(':')
    if (USER_SORT_KEY_SET.has(key as UserSortKey)) {
      setUserSorts([{ key: key as UserSortKey, dir: dir === 'asc' ? 'asc' : dir === 'desc' ? 'desc' : defaultSortDir(key as UserSortKey) }])
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
        case 'active':   return Number(a.sheetCount > 0 || (a.ownCards ?? a.cards) > 0) - Number(b.sheetCount > 0 || (b.ownCards ?? b.cards) > 0)
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
        case 'paid':     return Number(!!a.hasPurchased) - Number(!!b.hasPurchased)
        // 날짜로 표시되는 컬럼은 날짜(YYYY-MM-DD) 단위로 비교 → 같은 날끼리는 동점이 되어
        // 다음 우선순위(예: 듣기 내림차순)가 그 안에서 적용됨.
        case 'recent':   return (a.lastActiveAt ? kstDateKey(a.lastActiveAt) : '').localeCompare(b.lastActiveAt ? kstDateKey(b.lastActiveAt) : '')
        case 'active7':  return (a.activeDays7d ?? 0) - (b.activeDays7d ?? 0)
        case 'created':  return kstDateKey(a.createdAt).localeCompare(kstDateKey(b.createdAt))
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
  }, [userStats, userSorts])

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
        {(usersLoading || eventsLoading || revenueLoading) && !(userStats && anonymousStats?.summary) && (
          <>
            <SkelSectionHeader width={80} />
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
          // 미활성: 로그인했지만 시트 0 & 자기 카드 0 — 아직 첫 시트를 저장하지 않은 단계.
          // 카드는 ownCards(데모 제외) 기준 — 데모 한 세션(total_cards 100)이 활성화로
          // 과대 분류되지 않게 한다. 데모만 체험한 유저는 미활성.
          // (구글연동(Drive)과는 별개 축: deferred-Drive라 연동을 마치고도 미활성일 수 있다.
          //  그 교집합 = "연동후대기" — AI draft만 두고 이탈한 코호트, 복귀 유도 타깃.)
          // 활성화 = 전체 − 미활성 (첫 시트 저장 완료)
          // ownCards가 없는 응답(배포 직후 ~60s unstable_cache의 옛 payload)은 cards로
          // 강등 — undefined 비교로 전원 활성화가 되는 착시를 막는다(2026-07-11 실제 발생).
          const isIdleUser = (u: { sheetCount: number; cards: number; ownCards?: number }) =>
            u.sheetCount === 0 && (u.ownCards ?? u.cards) === 0
          const incompleteSignups = (userStats?.users ?? []).filter(isIdleUser).length
          const linkedUsers = (userStats?.users ?? []).filter(u => u.hasFolder).length
          const signedUp = userStats.totalUsers - incompleteSignups
          const paidUsers = stats?.combined.totalPaidUsers ?? 0

          // 활성화 전환율 = 구글연동 대비 (퍼널: 기기 → 연동 → 활성화)
          const signupConv = linkedUsers > 0 ? (signedUp / linkedUsers) * 100 : 0
          // 결제율 = 유료 / 활성 사용자
          const payRate = signedUp > 0 ? Math.round((paidUsers / signedUp) * 100) : 0

          // 파이 카드 '활성' 탭: 활성화(!isIdleUser) 사용자의 플랫폼/국가 분포.
          // 기기/결제 탭은 이벤트 기기 기준이지만 활성화는 계정 속성(시트 보유)이라 users로 센다.
          const activatedUsers = (userStats?.users ?? []).filter(u => !isIdleUser(u))
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

          const signupDates = (userStats?.users ?? [])
            .filter(u => !isIdleUser(u))
            .map(u => kstDateKey(u.createdAt))
            .sort()
          const allDates = cumulative.map(d => d.date)
          const signupData = allDates.map(date => ({
            date,
            value: signupDates.filter(d => d <= date).length,
          }))
          // 구글연동(Drive 폴더 보유) 누적 추이 — 폴더 생성 시각은 따로 없어 가입일로
          // 근사(대부분 가입 직후 or 첫 저장 시 승인). 추세선 용도로 충분.
          const linkedDates = (userStats?.users ?? [])
            .filter(u => u.hasFolder)
            .map(u => kstDateKey(u.createdAt))
            .sort()
          const linkedData = allDates.map(date => ({
            date,
            value: linkedDates.filter(d => d <= date).length,
          }))
          // 로그인(=users 계정) 누적 — 위계 항등식(로그인 = 연동 + 미연동, 활성화+미활성)이
          // 전부 계정 기준이므로 로그인 카드도 기기 이벤트가 아니라 users 테이블로 센다.
          const allUserDates = (userStats?.users ?? []).map(u => kstDateKey(u.createdAt)).sort()
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
          const activeRateData = allDates.map((date, i) => ({ date, value: pct(signupData[i]?.value ?? 0, linkedData[i]?.value ?? 0) }))
          const loginRate = Math.round(pct(userStats.totalUsers, devices))
          const linkedRate = Math.round(pct(linkedUsers, userStats.totalUsers))
          const activeRate = Math.round(pct(signedUp, linkedUsers))

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
          const paidUsersByDate = new Map<string, number>()
          for (const row of (chartData ?? [])) {
            creditsByDate.set(row.date, (creditsByDate.get(row.date) ?? 0) + (row.credits ?? 0))
            if (typeof row.paidUsers === 'number') paidUsersByDate.set(row.date, row.paidUsers)
          }
          const paidUsersData = allDates.map(date => {
            let total = 0
            for (const [paidDate, val] of paidUsersByDate) {
              if (paidDate <= date) total = val
            }
            return { date, value: total }
          })
          // 결제율(%) 추이 = 유료 누적 / 활성화 누적 — 매출 카드 점선 (0~100% 고정 스케일)
          const payRateData = allDates.map((date, i) => ({ date, value: pct(paidUsersData[i]?.value ?? 0, signupData[i]?.value ?? 0) }))

          // 오늘 / 최근 7일 컷오프 (KST 기준)
          const revTodayKey = kstToday()
          const rev7AgoKey = kstDaysAgo(6)

          // 누적 매출을 크레딧 볼륨으로 표시 (k 단위 축약)
          const creditsSold = stats?.combined.totalCreditsSold ?? 0
          const creditsToday = creditsByDate.get(revTodayKey) ?? 0
          const credits7d = Array.from(creditsByDate.entries())
            .filter(([date]) => date >= rev7AgoKey)
            .reduce((sum, [, v]) => sum + v, 0)
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
          const fmtK = (v: number): string => {
            if (v >= 1000) {
              const k = v / 1000
              return `${k >= 100 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}k`
            }
            return String(Math.round(v))
          }
          const fmtCr = (v: number) => `${fmtK(v)} cr`

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
              <div style={{
                fontSize: 'calc(11px * var(--fz, 1))', fontWeight: 600, color: t.neutrals.subtle,
                fontFamily: t.font.mono, letterSpacing: 0.3,
                textTransform: 'uppercase' as const, marginBottom: 10,
                whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                인사이트
              </div>

              {/* 좌: 퍼널 6카드(3×2) + 플랫폼/국가 파이 · 우: 일별 활동자 전체 높이 (와이드 모드 전용, CEO 레이아웃) */}
              <div style={{ display: 'grid', gridTemplateColumns: splitLayout ? 'minmax(0,1fr) minmax(0,1fr)' : 'minmax(0,1fr)', gap: 8, alignItems: 'stretch' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(3, minmax(0,1fr))', gap: 8 }}>
                <LStat
                  label="스토어 방문"
                  title="플레이·앱스토어 등록정보 방문자 누적(값 옆 = 마지막 집계일). 스토어 리포트 특성상 ~1주 지연. 퍼널: 방문→설치→로그인→연동→활성화→결제."
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
                      <span>설치 {installRate}%</span>
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
                  label="신규 로그인"
                  title="구글 계정으로 가입한 사용자 누적. 점선 = 로그인율(설치 기기 대비)."
                  value={userStats.totalUsers.toLocaleString()}
                  valueExtra={(
                    <span style={{
                      fontSize: 'calc(9.5px * var(--fz, 1))', marginLeft: 5, fontWeight: 500,
                      color: t.accent.warn, fontVariantNumeric: 'tabular-nums' as const,
                    }}>
                      <span>로그인 {loginRate}%</span>
                    </span>
                  )}
                  sub={`오늘 ${loginToday.toLocaleString()}명 · 7일 ${login7.toLocaleString()}명`}
                  tone={devices > 0 && userStats.totalUsers / devices >= 0.2 ? 'pos' : 'warn'}
                  sparkline={compact ? undefined : allUsersData}
                  sparkline2={compact ? undefined : loginRateData}
                  sparkFormat2={(v) => `${v}%`}
                  spark2Domain={[0, 100]}
                  dualScale
                />
                <LStat
                  label="구글 연동"
                  title="Drive 폴더 연동까지 마친 사용자 누적. 점선 = 연동률(로그인 대비)."
                  value={linkedUsers.toLocaleString()}
                  valueExtra={(
                    <span style={{
                      fontSize: 'calc(9.5px * var(--fz, 1))', marginLeft: 5, fontWeight: 500,
                      color: t.accent.warn, fontVariantNumeric: 'tabular-nums' as const,
                    }}>
                      <span>연동 {linkedRate}%</span>
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
                  label="활성화"
                  title="첫 시트를 저장한 사용자(데모 체험 제외). 점선 = 활성화율(구글 연동 대비)."
                  value={signedUp.toLocaleString()}
                  valueExtra={(
                    <span style={{
                      fontSize: 'calc(9.5px * var(--fz, 1))', marginLeft: 5, fontWeight: 500,
                      color: t.accent.warn, fontVariantNumeric: 'tabular-nums' as const,
                    }}>
                      <span>활성 {activeRate}%</span>
                    </span>
                  )}
                  sub={`오늘 ${signupToday.toLocaleString()}명 · 7일 ${signup7.toLocaleString()}명`}
                  tone={linkedUsers > 0 && signupConv >= 50 ? 'pos' : 'warn'}
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
                    label="누적 매출"
                    title="판매 크레딧 누적(정가 그로스, 환불·수수료 미반영). 점선 = 결제율(활성 대비)."
                    value={fmtCr(creditsSold)}
                    valueExtra={(
                      <span style={{
                        fontSize: 'calc(9.5px * var(--fz, 1))', marginLeft: 5, fontWeight: 500,
                        color: t.brand[600], fontVariantNumeric: 'tabular-nums' as const,
                      }}>
                        결제 {payRate}%
                      </span>
                    )}
                    sub={creditsSold > 0 ? `오늘 ${fmtCr(creditsToday)} · 7일 ${fmtCr(credits7d)}` : '아직 없음'}
                    tone={creditsSold > 0 ? 'pos' : 'default'}
                    sparkline={compact ? undefined : creditsData}
                    sparkline2={compact ? undefined : payRateData}
                    spark2Color={t.brand[600]}
                    sparkFormat={fmtCr}
                    sparkFormat2={(v) => `${v}%`}
                    spark2Domain={[0, 100]}
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
              <DauTrendCard daily={anonymousStats.daily} showTotals={splitLayout} />
            </div>
            </div>

            </>
          )
        })()}
      </div>

      {/* 가입 후 활동 · 매출 동인 — userStats 필요 (뒤집기/듣기 카드는 anonymousStats) */}
      {usersLoading && !userStats && (
        <div style={{ padding: `12px ${t.density.cardPad}px 12px` }}>
          <SkelSectionHeader width={140} />
          {/* 5카드: 와이드(1열) 모드 한 줄, 2열 모드 3+2 (인사이트 6카드와 동일 규칙), 모바일 2+2+1 */}
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : (dashCols === 2 ? 'repeat(3, 1fr)' : 'repeat(5, 1fr)'), gap: 8 }}>
            {[0, 1, 2, 3, 4].map(i => <SkelStat key={i} compact={!!mobile} />)}
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
            // 오늘 = live 합계 − 오늘 00:05 스냅샷 = 자정 이후 실제 증가분.
            // (스냅샷은 KST 자정에 찍혀서 '오늘 스냅샷 − 어제 스냅샷'은 전날 증가분을 오늘로 표기하던 문제.
            //  live와 오늘 스냅샷을 비교해야 '오늘 실제로 늘어난 카드'가 나온다. 오늘 스냅샷 없으면 0.)
            const dateToCards = new Map(inventory.map(d => [d.date, d.totalCards]))
            const liveCards = userStats.totalCards
            const todayCardsDelta = liveCards - (dateToCards.get(todayStr) ?? liveCards)
            // 7일 = live − (7일전 이하 중 가장 최근 스냅샷). find는 오름차순에서 가장 오래된 걸 반환하던 버그라 filter 후 마지막 사용.
            const beforeSeven = inventory.filter(d => d.date <= sevenDaysAgoStr)
            const sevenAgoCards = (beforeSeven.length ? beforeSeven[beforeSeven.length - 1].totalCards : inventory[0]?.totalCards) ?? liveCards
            const last7CardsDelta = liveCards - sevenAgoCards

            return (
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : (dashCols === 2 ? 'repeat(3, 1fr)' : 'repeat(5, 1fr)'), gap: 8 }}>
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
            {/* 카드 뒤집기 — 말하기/듣기 없이 눈으로만 넘기는 학습 볼륨 (card_flipped_manual, 듣기와 동일한 이벤트 통계 소스) */}
            {eventsLoading && !anonymousStats ? (
              <SkelStat compact={!!mobile} />
            ) : (() => {
              const flips = anonymousStats?.dailyFlips ?? []
              const todayFlips = flips.find(d => d.date === todayStr)?.flips ?? 0
              const last7Flips = flips.filter(d => d.date >= sevenDaysAgoStr).reduce((sum, d) => sum + d.flips, 0)
              const totalFlips = flips.reduce((sum, d) => sum + d.flips, 0)
              let runningFlips = 0
              const flipSpark = flips.map(d => {
                runningFlips += d.flips
                return { date: d.date, value: runningFlips }
              })
              return (
                <LStat
                  label="카드 뒤집기"
                  value={formatNumber(totalFlips)}
                  sub={`오늘 ${formatNumber(todayFlips)}회 · 7일 ${formatNumber(last7Flips)}회`}
                  sparkline={compact ? undefined : (flipSpark.length > 1 ? flipSpark : undefined)}
                />
              )
            })()}
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
              // 오늘/7일은 날짜 매칭으로 계산 (말하기 학습과 동일). dailyCreditUsage는
              // 활동 있는 날만 행이 있어 배열 마지막 원소가 '오늘'이 아닐 수 있음(오늘 0건이면
              // 직전 활동일이 마지막). slice(-7)도 날짜 갭 시 7일 초과 집계됨.
              const todayUsage = usage.find(d => d.date === todayStr)?.credits ?? 0
              const last7Sum = usage.filter(d => d.date >= sevenDaysAgoStr).reduce((sum, d) => sum + d.credits, 0)
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
                const n = userStats.users.filter(u => u.sheetCount === 0 && (u.ownCards ?? u.cards) === 0).length
                return n > 0 ? ` · 미활성 ${n}` : ''
              })()}
            </div>
            {/* 데스크톱은 테이블 헤더 클릭으로 정렬. 모바일은 헤더가 없어 드롭다운으로 정렬. */}
          </div>
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
              const shortId = (user.id || '').replace(/-/g, '').slice(0, 4)
              const fallbackName = user.email || (shortId ? `#${shortId}` : 'Unknown')
              const initial = (user.nickname?.charAt(0) || user.email?.charAt(0) || shortId.charAt(0) || '?').toUpperCase()
              const titleParts = [user.appVersion ? `v${user.appVersion}` : null, user.locale].filter(Boolean).join(' · ')
              return (
                <div key={user.id} style={{
                  display: 'grid', gridTemplateColumns: USER_TABLE_COLS, gap: 6, alignItems: 'center',
                  padding: '5px 8px', borderRadius: t.radius.sm, background: t.neutrals.inner,
                }}>
                  <div style={{ ...userDateCell, display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                    <span>{formatDateShort(user.createdAt)}</span>
                    <span style={{ fontSize: 'calc(8px * var(--fz, 1))', color: t.neutrals.subtle }}>({formatWeekdayShort(user.createdAt)}) {formatTimeShort(user.createdAt)}</span>
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
                    color: (user.sheetCount > 0 || (user.ownCards ?? user.cards) > 0) ? t.neutrals.muted : '#B45309',
                  }}>
                    {(user.sheetCount > 0 || (user.ownCards ?? user.cards) > 0) ? '완료' : user.hasFolder ? '대기' : '미완료'}
                  </div>
                  <NumDeltaCell total={user.sheetCount} delta={user.sheetsDeltaToday} />
                  {/* 카드 합계는 데모 포함(대시보드 정의). 전부 데모면 흐리게 + '데모' 표기 —
                      시트 0인데 카드 100 같은 표가 저장 자산으로 오독되지 않게. */}
                  <NumDeltaCell total={user.cards} delta={user.cardsToday}
                    dim={(user.ownCards ?? user.cards) === 0 && user.cards > 0}
                    note={(user.ownCards ?? user.cards) === 0 && user.cards > 0 ? '데모' : undefined} />
                  <NumDeltaCell total={user.flips ?? 0} delta={0} />
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
                  <NumDeltaCell total={user.purchasedCredits} delta={user.purchasedToday} />
                  <NumDeltaCell total={user.bonusCredits} delta={0} />
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

      {/* 비로그인 저니 — 사용자 테이블 아래 */}
      {anonymousStats?.journeys && anonymousStats.journeys.recentAnon.length > 0 && (
        <div style={{ padding: `0 ${t.density.cardPad}px ${t.density.cardPad}px` }}>
          <JourneyTable journeys={anonymousStats.journeys} />
        </div>
      )}
    </LCard>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// 비로그인 저니 — vc_device_journeys 뷰. 최근 14일 미로그인 기기, 사용자 테이블과 동일 문법.
// 사용자 테이블 바로 아래 배치. 페이지네이션 상태는 이 컴포넌트 소유.
function JourneyTable({ journeys }: { journeys: NonNullable<AnonymousEventStats['journeys']> }) {
  const [journeyPage, setJourneyPage] = useState(1)
  const [journeyPerPage, setJourneyPerPage] = useState(10)
  const [journeyPerPageInput, setJourneyPerPageInput] = useState('10')
  const commitJourneyPerPage = () => {
    const n = Math.max(5, Math.min(100, Number(journeyPerPageInput) || 10))
    setJourneyPerPageInput(String(n))
    setJourneyPerPage(n)
    setJourneyPage(1)
  }
  const stageMeta: Record<string, { label: string; desc: string; color: string; bg: string }> = {
    opened: { label: '실행만', desc: '앱 실행 후 데모도 열지 않고 이탈한 기기', color: t.neutrals.muted, bg: t.neutrals.card },
    demo: { label: '데모', desc: '익명 상태로 데모 학습까지 한 기기', color: '#0369A1', bg: '#E0F2FE' },
    intent: { label: '생성의도', desc: '시트 추가 또는 AI 생성 화면까지 진입한 기기', color: '#B45309', bg: '#FEF3C7' },
    signin_attempted: { label: '로그인시도', desc: '로그인 버튼을 눌렀지만 완료하지 못한 기기 (전원 ≤1.1.77 구버전 유물, 신규 발생 시 요주의)', color: '#B91C1C', bg: '#FEE2E2' },
  }
  const stageOf = (key: string) => stageMeta[key] ?? { label: key, desc: '', color: t.neutrals.muted, bg: t.neutrals.card }
  const allRecent = journeys.recentAnon
  const totalJourneyPages = Math.max(1, Math.ceil(allRecent.length / journeyPerPage))
  const safeJourneyPage = Math.min(journeyPage, totalJourneyPages)
  const recent = allRecent.slice((safeJourneyPage - 1) * journeyPerPage, safeJourneyPage * journeyPerPage)
  const heads: Array<{ label: string; align?: 'center' }> = [
    { label: '활동' }, { label: '기기' }, { label: '단계', align: 'center' },
    { label: '플랫폼', align: 'center' }, { label: '앱버전', align: 'center' }, { label: '국가', align: 'center' },
    { label: '카드', align: 'center' }, { label: '학습', align: 'center' }, { label: '뒤집기', align: 'center' },
    { label: '시트', align: 'center' }, { label: 'AI', align: 'center' }, { label: '클릭', align: 'center' },
    { label: '일수', align: 'center' },
  ]
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{
        fontSize: 'calc(11px * var(--fz, 1))', fontWeight: 600, color: t.neutrals.subtle,
        fontFamily: t.font.mono, letterSpacing: 0.3,
        textTransform: 'uppercase' as const, marginBottom: 10,
      }}>
        비로그인 저니 <span style={{ fontWeight: 500, textTransform: 'none' }}>· 최근 14일 · {allRecent.length}기기</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: JOURNEY_TABLE_MIN_WIDTH, display: 'flex', flexDirection: 'column' as const, gap: 2 }}>
        <div style={{ display: 'grid', gridTemplateColumns: JOURNEY_TABLE_COLS, gap: 6, alignItems: 'center', padding: '0 8px 5px' }}>
          {heads.map(h => (
            <span key={h.label} style={{ ...userHeadCell, textAlign: h.align === 'center' ? 'center' as const : 'left' as const }}>{h.label}</span>
          ))}
        </div>
        {recent.map(d => {
          const sm = stageOf(d.stage)
          const shortId = (d.deviceId || '').replace(/-/g, '').slice(0, 4)
          return (
            <div key={d.deviceId} style={{
              display: 'grid', gridTemplateColumns: JOURNEY_TABLE_COLS, gap: 6, alignItems: 'center',
              padding: '5px 8px', borderRadius: t.radius.sm, background: t.neutrals.inner,
            }}>
              {/* 활동 (마지막 활동, 최신순 첫 컬럼) */}
              <div style={{ ...userDateCell, display: 'flex', flexDirection: 'column', lineHeight: 1.2, textAlign: 'left' as const }}>
                <span>{formatDateShort(d.lastSeenAt)}</span>
                <span style={{ fontSize: 'calc(8px * var(--fz, 1))', color: t.neutrals.subtle }}>({formatWeekdayShort(d.lastSeenAt)}) {formatTimeShort(d.lastSeenAt)}</span>
              </div>
              {/* 기기 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 22, flexShrink: 0,
                  background: sm.bg, color: sm.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 'calc(9px * var(--fz, 1))', fontWeight: 600,
                }}>
                  {(shortId.charAt(0) || '?').toUpperCase()}
                </div>
                <span style={{
                  fontSize: 'calc(11px * var(--fz, 1))', fontWeight: 500, color: t.neutrals.muted,
                  fontFamily: t.font.mono, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
                }}>
                  #{shortId || '????'}
                </span>
              </div>
              {/* 단계 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
                <span title={sm.desc} style={{
                  fontSize: 'calc(8.5px * var(--fz, 1))', fontFamily: t.font.mono, fontWeight: 600,
                  color: sm.color, background: sm.bg,
                  padding: '1px 4px', borderRadius: 3, lineHeight: 1.4, whiteSpace: 'nowrap' as const,
                }}>
                  {sm.label}
                </span>
              </div>
              {/* 플랫폼 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
                {d.platform ? (
                  <span style={{
                    fontSize: 'calc(8.5px * var(--fz, 1))', fontFamily: t.font.mono, fontWeight: 600,
                    color: d.platform === 'ios' ? '#0369A1' : d.platform === 'android' ? '#15803D' : t.neutrals.muted,
                    background: d.platform === 'ios' ? '#E0F2FE' : d.platform === 'android' ? '#DCFCE7' : t.neutrals.card,
                    padding: '1px 4px', borderRadius: 3, lineHeight: 1.4, textTransform: 'uppercase' as const,
                  }}>
                    {d.platform === 'ios' ? 'iOS' : d.platform === 'android' ? 'AND' : d.platform}
                  </span>
                ) : (
                  <span style={{ fontSize: 'calc(9.5px * var(--fz, 1))', color: t.neutrals.subtle, fontFamily: t.font.mono }}>—</span>
                )}
              </div>
              {/* 앱버전 (사용자 테이블과 동일 칩) */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
                {d.appVersion ? (
                  <span style={{
                    fontSize: 'calc(8.5px * var(--fz, 1))', fontFamily: t.font.mono, fontWeight: 600,
                    color: t.neutrals.muted, background: t.neutrals.card,
                    padding: '1px 4px', borderRadius: 3, lineHeight: 1.4,
                    whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
                  }}>
                    v{d.appVersion}
                  </span>
                ) : (
                  <span style={{ fontSize: 'calc(9.5px * var(--fz, 1))', color: t.neutrals.subtle, fontFamily: t.font.mono }}>—</span>
                )}
              </div>
              {/* 국가 (사용자 테이블과 동일 칩: 국기+코드) */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
                {(() => {
                  const c = formatCountry(d.country)
                  return c ? (
                    <span title={c.name} style={{
                      fontSize: 'calc(8.5px * var(--fz, 1))', fontFamily: t.font.mono, fontWeight: 600,
                      color: '#1E40AF', background: '#DBEAFE',
                      padding: '1px 4px', borderRadius: 3, lineHeight: 1.4, whiteSpace: 'nowrap' as const,
                    }}>
                      {c.flag} {c.code}
                    </span>
                  ) : (
                    <span style={{ fontSize: 'calc(9.5px * var(--fz, 1))', color: t.neutrals.subtle, fontFamily: t.font.mono }}>—</span>
                  )
                })()}
              </div>
              {/* 카드 / 학습 / 뒤집기 / 시트 / AI / 클릭 / 일수 */}
              <div style={userNumCell}>{d.cardsViewed > 0 ? formatNumber(d.cardsViewed) : '—'}</div>
              <div style={userNumCell}>{d.cardsLearned > 0 ? formatNumber(d.cardsLearned) : '—'}</div>
              <div style={userNumCell}>{d.flips > 0 ? formatNumber(d.flips) : '—'}</div>
              <div style={userNumCell}>{d.addSheetOpens > 0 ? formatNumber(d.addSheetOpens) : '—'}</div>
              <div style={userNumCell}>{d.aiGenOpens > 0 ? formatNumber(d.aiGenOpens) : '—'}</div>
              <div style={{ ...userNumCell, color: d.signinClicks > 0 ? t.accent.neg : userNumCell.color as string, fontWeight: d.signinClicks > 0 ? 600 : undefined }}>
                {d.signinClicks > 0 ? formatNumber(d.signinClicks) : '—'}
              </div>
              <div style={userNumCell}>{d.activeDays > 1 ? `${d.activeDays}일` : '—'}</div>
            </div>
          )
        })}
      </div>
      </div>
      {/* 페이지네이션 — 사용자 테이블과 동일 스타일 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 8px',
        borderTop: `1px solid ${t.neutrals.line}`, marginTop: 6,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            value={journeyPerPageInput}
            onChange={e => setJourneyPerPageInput(e.target.value.replace(/\D/g, ''))}
            onBlur={commitJourneyPerPage}
            onKeyDown={e => { if (e.key === 'Enter') commitJourneyPerPage() }}
            style={{
              width: 32, textAlign: 'center', border: 'none',
              background: t.neutrals.inner, borderRadius: t.radius.sm,
              fontSize: 'calc(11px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted,
              padding: '2px 0', outline: 'none',
            }}
          />
          <span style={{ fontSize: 'calc(10px * var(--fz, 1))', color: t.neutrals.subtle, fontFamily: t.font.sans }}>개씩</span>
        </div>
        {totalJourneyPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button disabled={safeJourneyPage === 1} onClick={() => setJourneyPage(p => Math.max(1, p - 1))}
              style={{
                background: 'transparent', border: 'none',
                cursor: safeJourneyPage === 1 ? 'default' : 'pointer',
                padding: 4, borderRadius: 4,
                color: safeJourneyPage === 1 ? t.neutrals.line : t.neutrals.muted,
                opacity: safeJourneyPage === 1 ? 0.4 : 1,
              }}>
              <LIcon name="chevronLeft" size={13} stroke={2} />
            </button>
            <span style={{
              fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted,
            }}>
              {(safeJourneyPage - 1) * journeyPerPage + 1}-{Math.min(safeJourneyPage * journeyPerPage, allRecent.length)} / {allRecent.length}
            </span>
            <button disabled={safeJourneyPage >= totalJourneyPages} onClick={() => setJourneyPage(p => Math.min(totalJourneyPages, p + 1))}
              style={{
                background: 'transparent', border: 'none',
                cursor: safeJourneyPage >= totalJourneyPages ? 'default' : 'pointer',
                padding: 4, borderRadius: 4,
                color: safeJourneyPage >= totalJourneyPages ? t.neutrals.line : t.neutrals.muted,
                opacity: safeJourneyPage >= totalJourneyPages ? 0.4 : 1,
              }}>
              <LIcon name="chevronRight" size={13} stroke={2} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}


// 일별 활동자 추이 — 하루 한 바를 회원 로그인/신규 로그인/비로그인 3단 스택.
// 회원(그 날 활동한 기존 가입자) 아래, 신규(그 날 가입) 가운데, 비로그인(익명) 위. 합 = daily.devices.
// 서버 집계(vc_event_stats)를 그대로 재사용해 대시보드 정의와 일치. 봇/관리자 제외 뷰 기준.
// newLoggedDevices가 없는 옛 캐시 payload는 회원=logged 전체로 강등.
function DauTrendCard({ daily, days = 42, showTotals }: {
  daily: Array<{ date: string; devices: number; loggedDevices: number; anonDevices: number; newLoggedDevices?: number; memberLoggedDevices?: number }>
  days?: number
  showTotals?: boolean // 바 위 희미한 총합 — 바 폭이 충분한 와이드(1열) 모드에서만
}) {
  const rows = (daily ?? []).slice(-days)
  const max = rows.reduce((m, r) => Math.max(m, r.devices), 0)
  const latest = rows.length ? rows[rows.length - 1] : null
  const newOf = (r: { loggedDevices: number; newLoggedDevices?: number }) => r.newLoggedDevices ?? 0
  const memberOf = (r: { loggedDevices: number; newLoggedDevices?: number; memberLoggedDevices?: number }) =>
    r.memberLoggedDevices ?? Math.max(0, r.loggedDevices - newOf(r))
  // 플랫폼 파이차트 팔레트와 구분: 회원=블루, 신규=퍼플, 비로그인=그린
  const MEMBER = '#3b82f6'
  const NEW = '#8b5cf6'
  const ANON = '#10b981'
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  // 바 높이는 컨테이너 대비 % — 카드가 커지면 차트도 같이 커짐 (좌측 퍼널 열 높이에 맞춰 stretch)
  const barPct = (v: number) => (max > 0 ? (v / max) * 100 : 0)
  // 7일 이동평균(총 활동 기기) — 바 위에 가볍게 얹는 추세선. 바 팔레트(블루/퍼플/그린)와 대비되는 주황
  const MA_COLOR = '#f97316'
  const ma = rows.map((_, i) => {
    const win = rows.slice(Math.max(0, i - 6), i + 1)
    return win.reduce((sum, r) => sum + r.devices, 0) / win.length
  })

  return (
    <div style={{
      background: t.neutrals.inner, borderRadius: t.radius.sm, padding: '8px 10px',
      height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 4, marginBottom: 6,
      }}>
        <div style={{
          fontSize: 'calc(9.5px * var(--fz, 1))', fontFamily: t.font.mono, letterSpacing: 0.8,
          textTransform: 'uppercase' as const, color: t.neutrals.subtle, whiteSpace: 'nowrap' as const,
        }}>
          일별 활동자
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 'calc(9px * var(--fz, 1))', fontFamily: t.font.mono, whiteSpace: 'nowrap' as const,
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: t.neutrals.muted }}>
            <span style={{ width: 6, height: 6, borderRadius: 1, background: MEMBER }} />회원 {latest ? memberOf(latest) : 0}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: t.neutrals.muted }}>
            <span style={{ width: 6, height: 6, borderRadius: 1, background: NEW }} />신규 {latest ? newOf(latest) : 0}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: t.neutrals.muted }}>
            <span style={{ width: 6, height: 6, borderRadius: 1, background: ANON }} />비로그인 {latest?.anonDevices ?? 0}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: t.neutrals.muted }}>
            <span style={{ width: 10, height: 2, borderRadius: 1, background: MA_COLOR }} />7일평균 {ma.length ? (Math.round(ma[ma.length - 1] * 10) / 10).toLocaleString() : 0}
          </span>
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
            const anonH = barPct(r.anonDevices)
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
                {showTotals && r.devices > 0 && (
                  <span style={{
                    fontSize: 'calc(7.5px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.subtle,
                    fontVariantNumeric: 'tabular-nums' as const, lineHeight: 1, alignSelf: 'center', marginBottom: 2,
                    whiteSpace: 'nowrap' as const, opacity: dim ? 0.25 : 0.7, transition: 'opacity 120ms ease',
                  }}>{r.devices}</span>
                )}
                {anonH > 0 && <div style={{ height: `${anonH}%`, background: ANON, borderRadius: '1px 1px 0 0', opacity: dim ? 0.4 : 1, transition: 'opacity 120ms ease' }} />}
                {newH > 0 && <div style={{ height: `${newH}%`, background: NEW, borderRadius: anonH > 0 ? 0 : '1px 1px 0 0', opacity: dim ? 0.4 : 1, transition: 'opacity 120ms ease' }} />}
                {memberH > 0 && <div style={{ height: `${memberH}%`, background: MEMBER, borderRadius: (anonH > 0 || newH > 0) ? 0 : '1px 1px 0 0', opacity: dim ? 0.4 : 1, transition: 'opacity 120ms ease' }} />}
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
                  <span style={{ width: 7, height: 7, borderRadius: 1, background: MEMBER }} />회원 로그인 {memberOf(r)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 1, background: NEW }} />신규 로그인 {newOf(r)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 1, background: ANON }} />비로그인 {r.anonDevices}
                </div>
                <div style={{ opacity: 0.7, marginTop: 3 }}>총 {r.devices} · 7일 평균 {Math.round(ma[hoverIdx] * 10) / 10}</div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

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
      padding: '8px 10px', height: '100%', boxSizing: 'border-box' as const,
      display: 'flex', flexDirection: 'column' as const,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap' as const, gap: 4, marginBottom: 6,
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
                  padding: '2px 6px', borderRadius: t.radius.sm, border: 'none', cursor: 'pointer',
                  whiteSpace: 'nowrap' as const,
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
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
                    formatter={(value, name) => [`${value}${unit ?? ''}`, String(name)]}
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
