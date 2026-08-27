// 시크릿 키로 Portle(port-ledger) DB에 붙는 서버 전용 모듈. 클라이언트가 import 하면 빌드가 깨지도록 잠근다.
// 클라이언트가 쓰는 타입·상수는 portle-types.ts 로 갈라 뒀다 (reviewnotes와 같은 패턴).
//
// Portle은 원장 데이터가 기기/Drive에 있고 서버에는 AI 사용 로그·구독·공유코드만 쌓인다.
// 그래서 이 통계의 "사용자"는 AI를 한 번이라도 호출한 subject(google:/device:) 기준이다.
import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { kstDateKey, kstToday, kstDaysAgo } from '@/lib/kst'
import type {
  PortleStats, PortleDailyUsage, PortleKindStats, PortleUserRow, PortleEntitlement,
  PortleAppFunnel,
} from '@/lib/portle-types'

export * from '@/lib/portle-types'

const supabaseUrl = process.env.PORTLE_SUPABASE_URL
const supabaseKey = process.env.PORTLE_SUPABASE_SECRET_KEY

if (!supabaseUrl || !supabaseKey) {
  console.warn('Portle Supabase credentials not configured')
}

export const portleSupabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
  : null

interface AiUsageRow {
  created_at: string
  subject: string | null
  kind: string | null
  input_tokens: number | null
  output_tokens: number | null
  outcome: 'success' | 'empty' | 'failure' | null
}

// supabase-js는 기본 1000행 제한 — 전량을 페이지로 나눠 읽는다. 상한은 폭주 방지용.
const PAGE = 1000
const MAX_ROWS = 50_000

async function fetchAllAiUsage(): Promise<AiUsageRow[]> {
  if (!portleSupabase) return []
  const rows: AiUsageRow[] = []
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await portleSupabase
      .from('portle_ai_usage')
      .select('created_at, subject, kind, input_tokens, output_tokens, outcome')
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`portle_ai_usage 조회 실패: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return rows
}

// 앱 퍼널 이벤트 — 이벤트별 기기 첫 발생일(KST) 목록. 테이블이 비어 있으면 전부 빈 배열.
// 행 수가 커지면 RPC 집계로 옮긴다 (현재는 수집 시작 전이라 전량 페이지 조회로 충분).
const FUNNEL_EVENTS = ['app_opened', 'signin_completed', 'drive_linked', 'sheet_activated'] as const

async function fetchAppFunnel(): Promise<Omit<PortleAppFunnel, 'signins'> & { signins: string[] }> {
  const empty = { installs: [], signins: [], driveLinks: [], sheetActivations: [] }
  if (!portleSupabase) return empty
  // 이벤트별 (기기, 첫 발생) — 오름차순 스캔이라 처음 본 조합이 곧 첫 발생
  const firstAt = new Map<string, string>() // `${event}\n${device}` → date
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await portleSupabase
      .from('portle_app_events')
      .select('created_at, device_id, event, platform')
      .in('event', [...FUNNEL_EVENTS])
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) {
      console.warn('portle_app_events 조회 실패:', error.message)
      return empty
    }
    for (const row of data ?? []) {
      if (isInternalEvent(row.platform, row.created_at)) continue // 우리 손으로 만든 트래픽
      const key = `${row.event}\n${row.device_id}`
      if (!firstAt.has(key)) firstAt.set(key, kstDateKey(row.created_at))
    }
    if (!data || data.length < PAGE) break
  }
  const datesOf = (event: string) =>
    Array.from(firstAt.entries())
      .filter(([k]) => k.startsWith(`${event}\n`))
      .map(([, d]) => d)
      .sort()
  return {
    installs: datesOf('app_opened'),
    signins: datesOf('signin_completed'),
    driveLinks: datesOf('drive_linked'),
    sheetActivations: datesOf('sheet_activated'),
  }
}

function subjectType(subject: string): PortleUserRow['type'] {
  if (subject.startsWith('google:')) return 'google'
  if (subject.startsWith('device:')) return 'device'
  return 'other'
}

// ── 관리자·테스트 제외 (voicecards-server의 EXCLUDED_* 와 같은 역할) ──────────────
// 관리자(CEO) subject — AI 사용·구독·공유코드 전부 통계에서 뺀다.
// device:mt56... 는 CEO가 8/23 로컬에서 샘플 호출로 확인한 기기다.
const EXCLUDED_PORTLE_SUBJECTS = new Set([
  'google:100644446554227652222',
  'device:mt56m2l2wr2nezngiiq03sen',
])
// 스토어 출시(1.0.0) 전 데이터는 전부 로컬 테스트 트래픽:
// 8/20 device subject 41개(호출 1건씩), 8/21~8/22 02:18 KST 앱 이벤트 기기 340여 개 모두
// 시뮬레이터/자동화 테스트(밀리초 간격 버스트). 이 시각 이전은 통째로 제외한다.
// 출시 후 로컬 테스트는 관리자 계정으로 로그인해서 하거나 EXCLUDED_PORTLE_SUBJECTS 에 추가할 것.
const PORTLE_TEST_CUTOFF_MS = Date.parse('2026-08-22T03:00:00+09:00')

// iOS는 아직 App Store 심사 중이라 밖에서 설치할 경로가 없다 — 지금 들어오는 ios 앱 이벤트는
// 전부 우리 시뮬레이터다. 실제로 8/22 이후 ios 기기 279개 중 278개가 수명 10초 미만이었고
// (실행할 때마다 기기 id가 새로 생긴다), 같은 초에 signin_completed 가 10번씩 찍혔다.
// 심사가 끝나면 승인일을 여기에 적는다. 그때부터 ios 이벤트가 퍼널에 들어온다.
const PORTLE_IOS_RELEASE_MS: number | null = null

function isTestPeriod(createdAt: string): boolean {
  return new Date(createdAt).getTime() < PORTLE_TEST_CUTOFF_MS
}

/** 앱 이벤트가 우리(로컬 테스트·심사 전 iOS) 것인가 */
function isInternalEvent(platform: string | null, createdAt: string): boolean {
  if (isTestPeriod(createdAt)) return true
  if (platform === 'ios') {
    return PORTLE_IOS_RELEASE_MS === null || new Date(createdAt).getTime() < PORTLE_IOS_RELEASE_MS
  }
  return false
}

function isExcludedUsage(subject: string, createdAt: string): boolean {
  return EXCLUDED_PORTLE_SUBJECTS.has(subject) || isTestPeriod(createdAt)
}

export async function getPortleStats(): Promise<PortleStats> {
  if (!portleSupabase) throw new Error('Portle Supabase 미설정 (PORTLE_SUPABASE_URL / PORTLE_SUPABASE_SECRET_KEY)')

  const [usage, entitlementsRes, shortCodesRes, storeVisitsRes, appFunnel] = await Promise.all([
    fetchAllAiUsage(),
    portleSupabase.from('portle_entitlements').select('subject, store, product_id, expires_at, updated_at'),
    portleSupabase.from('portle_short_codes').select('owner_sub'),
    portleSupabase.from('portle_store_visits').select('date, visitors').order('date', { ascending: true }),
    fetchAppFunnel(),
  ])
  if (entitlementsRes.error) throw new Error(`portle_entitlements 조회 실패: ${entitlementsRes.error.message}`)
  if (shortCodesRes.error) throw new Error(`portle_short_codes 조회 실패: ${shortCodesRes.error.message}`)

  // 스토어 방문 — 일별 플랫폼 합산 (voicecards-server와 동일 문법)
  const svByDate = new Map<string, number>()
  for (const r of (storeVisitsRes.data ?? []) as Array<{ date: string; visitors: number }>) {
    svByDate.set(r.date, (svByDate.get(r.date) ?? 0) + (Number(r.visitors) || 0))
  }
  const storeVisits = Array.from(svByDate.entries()).map(([date, visitors]) => ({ date, visitors }))

  const now = Date.now()
  const entitlements = new Map<string, PortleEntitlement>()
  for (const e of entitlementsRes.data ?? []) {
    if (EXCLUDED_PORTLE_SUBJECTS.has(e.subject)) continue
    entitlements.set(e.subject, {
      subject: e.subject, store: e.store, productId: e.product_id,
      expiresAt: e.expires_at, updatedAt: e.updated_at,
      active: new Date(e.expires_at).getTime() > now,
    })
  }

  // owner_sub는 subject에서 접두사를 뗀 bare id — 제외 판정 시 google: 접두사를 붙여 비교한다.
  const sheetsByOwner = new Map<string, number>()
  let sharedSheetsCount = 0
  for (const s of shortCodesRes.data ?? []) {
    if (!s.owner_sub) continue
    if (EXCLUDED_PORTLE_SUBJECTS.has(s.owner_sub) || EXCLUDED_PORTLE_SUBJECTS.has(`google:${s.owner_sub}`)) continue
    sheetsByOwner.set(s.owner_sub, (sheetsByOwner.get(s.owner_sub) ?? 0) + 1)
    sharedSheetsCount++
  }

  const today = kstToday()
  const sevenAgo = kstDaysAgo(6) // 오늘 포함 7일

  // ── 일별 · kind별 · 사용자별 집계 (usage는 created_at 오름차순) ────────────────
  const daily = new Map<string, PortleDailyUsage & { subjectSet: Set<string> }>()
  const byKind = new Map<string, PortleKindStats & { subjectSet: Set<string> }>()
  const users = new Map<string, PortleUserRow & { daySet: Set<string> }>()

  let calls = 0, callsToday = 0, calls7d = 0
  let success = 0, success7d = 0, total7d = 0
  let inputTokens = 0, outputTokens = 0
  const subjectsTodaySet = new Set<string>()
  const subjects7dSet = new Set<string>()

  for (const row of usage) {
    const subject = row.subject || 'unknown'
    if (isExcludedUsage(subject, row.created_at)) continue
    const kind = row.kind || 'unknown'
    const outcome = row.outcome || 'failure'
    const day = kstDateKey(row.created_at)
    const inTok = row.input_tokens ?? 0
    const outTok = row.output_tokens ?? 0

    calls++
    inputTokens += inTok
    outputTokens += outTok
    if (outcome === 'success') success++
    if (day === today) { callsToday++; subjectsTodaySet.add(subject) }
    if (day >= sevenAgo) {
      calls7d++; total7d++; subjects7dSet.add(subject)
      if (outcome === 'success') success7d++
    }

    let d = daily.get(day)
    if (!d) { d = { date: day, success: 0, empty: 0, failure: 0, subjects: 0, subjectSet: new Set() }; daily.set(day, d) }
    d[outcome]++
    d.subjectSet.add(subject)

    let k = byKind.get(kind)
    if (!k) {
      k = {
        kind, calls: 0, success: 0, empty: 0, failure: 0, subjects: 0,
        inputTokens: 0, outputTokens: 0, callsToday: 0, calls7d: 0, lastAt: null,
        subjectSet: new Set(),
      }
      byKind.set(kind, k)
    }
    k.calls++
    k[outcome]++
    k.inputTokens += inTok
    k.outputTokens += outTok
    k.subjectSet.add(subject)
    k.lastAt = row.created_at // 오름차순이라 마지막 값이 최신
    if (day === today) k.callsToday++
    if (day >= sevenAgo) k.calls7d++

    let u = users.get(subject)
    if (!u) {
      u = {
        subject, type: subjectType(subject),
        firstAt: row.created_at, lastAt: row.created_at, activeDays: 0, repeatAt: null,
        calls: 0, success: 0, empty: 0, failure: 0, byKind: {},
        inputTokens: 0, outputTokens: 0,
        sharedSheets: sheetsByOwner.get(subject) ?? 0,
        entitlement: entitlements.get(subject) ?? null,
        daySet: new Set(),
      }
      users.set(subject, u)
    }
    u.lastAt = row.created_at
    u.calls++
    u[outcome]++
    u.byKind[kind] = (u.byKind[kind] ?? 0) + 1
    u.inputTokens += inTok
    u.outputTokens += outTok
    const prevDays = u.daySet.size
    u.daySet.add(day)
    // 두 번째 활동일 진입 시각 = 재사용 전환 시점 (오름차순 순회라 최초 기록이 잡힌다)
    if (prevDays === 1 && u.daySet.size === 2) u.repeatAt = row.created_at
  }

  // 빈 날짜 채우기 — 첫 기록일부터 오늘까지 연속 시계열 (차트가 실제 기간을 반영하도록)
  const dayKeys = Array.from(daily.keys()).sort()
  const dailyOut: PortleDailyUsage[] = []
  if (dayKeys.length > 0) {
    for (let d = new Date(`${dayKeys[0]}T00:00:00Z`); ; d.setUTCDate(d.getUTCDate() + 1)) {
      const key = d.toISOString().slice(0, 10)
      if (key > today) break
      const row = daily.get(key)
      dailyOut.push(row
        ? { date: key, success: row.success, empty: row.empty, failure: row.failure, subjects: row.subjectSet.size }
        : { date: key, success: 0, empty: 0, failure: 0, subjects: 0 })
    }
  }

  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0)

  // 로그인 폴백 — signin 이벤트 수집 전에는 AI 사용 로그에 잡힌 google: subject의 첫 사용일로 근사.
  // 이벤트가 쌓이기 시작하면 그쪽(기기 기준)이 정본이 된다.
  if (appFunnel.signins.length === 0) {
    appFunnel.signins = Array.from(users.values())
      .filter(u => u.type === 'google')
      .map(u => kstDateKey(u.firstAt))
      .sort()
  }

  return {
    storeVisits,
    funnel: appFunnel,
    totals: {
      subjects: users.size,
      subjectsToday: subjectsTodaySet.size,
      subjects7d: subjects7dSet.size,
      calls, callsToday, calls7d,
      successRate: pct(success, calls),
      successRate7d: pct(success7d, total7d),
      inputTokens, outputTokens,
      activeEntitlements: Array.from(entitlements.values()).filter(e => e.active).length,
      sharedSheets: sharedSheetsCount,
    },
    daily: dailyOut,
    byKind: Array.from(byKind.values())
      .map(({ subjectSet, ...k }) => ({ ...k, subjects: subjectSet.size }))
      .sort((a, b) => b.calls - a.calls),
    users: Array.from(users.values())
      .map(({ daySet, ...u }) => ({ ...u, activeDays: daySet.size }))
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt)),
    fetchedAt: new Date().toISOString(),
  }
}
