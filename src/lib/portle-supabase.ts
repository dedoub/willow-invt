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
  PortleAppFunnel, PortleUserStage, PortleDailyActive,
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
// 원장 활성화는 두 이벤트다 — 시트에 기록(sheet_activated)이든 기기 원장에 기록
// (local_ledger_activated)이든 원장을 쓰기 시작한 것은 같다. 퍼널은 둘을 합쳐 한 칸으로 센다.
// session_started 는 퍼널 칸이 아니라 실행마다 오는 재방문 신호다 — 일별 활동자의 재료라 같이 읽는다.
const FUNNEL_EVENTS = [
  'app_opened', 'signin_completed', 'drive_linked', 'sheet_activated', 'local_ledger_activated',
] as const
const ACTIVITY_EVENTS = [...FUNNEL_EVENTS, 'session_started'] as const
const LEDGER_EVENTS = new Set<string>(['sheet_activated', 'local_ledger_activated'])

const STAGE_OF_EVENT: Record<string, PortleUserStage> = {
  app_opened: 'install',
  session_started: 'install',
  signin_completed: 'signin',
  drive_linked: 'drive',
  sheet_activated: 'ledger',
  local_ledger_activated: 'ledger',
}
const STAGE_RANK: Record<PortleUserStage, number> = { install: 0, signin: 1, drive: 2, ledger: 3 }

// 앱 이벤트로 본 기기 하나. 사용자 표는 이걸 사람(계정 또는 기기)에 귀속시킨다.
interface PortleDeviceRecord {
  deviceId: string
  platform: string | null
  appVersion: string | null
  // 기기 설정의 지역(country, 앱이 보낸다) 우선, 없으면 접속 IP 의 나라(ip_country, 백엔드가 적는다).
  // 둘 다 1.0.3/백엔드 갱신 뒤부터 오므로 그 전 기기는 null — 파이에서 '미상'.
  country: string | null
  // 이 기기에서 로그인한 구글 계정. 앱이 signin 이벤트에 subject 를 실어 보낸 경우에만 안다
  // (1.0.1 이전 버전은 안 보낸다). 없으면 로그인했어도 누구인지는 모른다 — stage 가 말해 준다.
  subject: string | null
  firstAt: string
  lastAt: string
  installedAt: string | null
  stage: PortleUserStage
  days: Set<string>
}

async function fetchAppEvents(): Promise<{
  funnel: PortleAppFunnel
  devices: PortleDeviceRecord[]
}> {
  const empty = {
    funnel: { installs: [], signins: [], driveLinks: [], ledgerActivations: [], sheetActivations: [], localActivations: [] },
    devices: [],
  }
  if (!portleSupabase) return empty
  const rows: Array<{
    created_at: string; device_id: string | null; subject: string | null
    event: string; platform: string | null; app_version: string | null
    country: string | null; ip_country: string | null
  }> = []
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await portleSupabase
      .from('portle_app_events')
      .select('created_at, device_id, subject, event, platform, app_version, country, ip_country')
      .in('event', [...ACTIVITY_EVENTS])
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) {
      console.warn('portle_app_events 조회 실패:', error.message)
      return empty
    }
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }

  // 기기 단위로 먼저 알아야 하는 것 두 가지. 행 하나만 봐서는 판정할 수 없다.
  //   deviceSubject: 그 기기가 어느 계정의 것인가 (로그인 이벤트 한 줄에만 실려 온다)
  //   그 계정이 관리자면 기기째로 뺀다 — 안 그러면 대표님 기기가 퍼널에 설치·로그인으로 잡힌다.
  const deviceSubject = new Map<string, string>()
  for (const row of rows) {
    if (row.device_id && row.subject && !deviceSubject.has(row.device_id)) {
      deviceSubject.set(row.device_id, row.subject)
    }
  }

  // 이벤트별 (기기, 첫 발생) — 오름차순 스캔이라 처음 본 조합이 곧 첫 발생
  const firstAt = new Map<string, string>() // `${event}\n${device}` → date
  const devices = new Map<string, PortleDeviceRecord>()
  for (const row of rows) {
    if (!row.device_id) continue
    const owner = deviceSubject.get(row.device_id) ?? null
    if (isInternalEvent(row.platform, row.created_at, owner)) continue // 우리 손으로 만든 트래픽
    const key = `${row.event}\n${row.device_id}`
    if (!firstAt.has(key)) firstAt.set(key, kstDateKey(row.created_at))
    // 원장 활성화는 두 이벤트를 한 키로 — 어느 쪽이든 처음 온 날이 그 기기의 활성화일
    if (LEDGER_EVENTS.has(row.event)) {
      const lkey = `ledger\n${row.device_id}`
      if (!firstAt.has(lkey)) firstAt.set(lkey, kstDateKey(row.created_at))
    }

    const stage = STAGE_OF_EVENT[row.event] ?? 'install'
    let d = devices.get(row.device_id)
    if (!d) {
      d = {
        deviceId: row.device_id, platform: row.platform, appVersion: row.app_version, country: null,
        subject: owner, firstAt: row.created_at, lastAt: row.created_at,
        installedAt: null, stage, days: new Set(),
      }
      devices.set(row.device_id, d)
    }
    d.lastAt = row.created_at                       // 오름차순이라 마지막 값이 최신
    if (row.app_version) d.appVersion = row.app_version
    if (row.platform) d.platform = row.platform
    if (row.country) d.country = row.country
    else if (row.ip_country && !d.country) d.country = row.ip_country
    if (row.event === 'app_opened' && !d.installedAt) d.installedAt = row.created_at
    if (STAGE_RANK[stage] > STAGE_RANK[d.stage]) d.stage = stage
    d.days.add(kstDateKey(row.created_at))
  }
  const datesOf = (event: string) =>
    Array.from(firstAt.entries())
      .filter(([k]) => k.startsWith(`${event}\n`))
      .map(([, d]) => d)
      .sort()
  return {
    funnel: {
      installs: datesOf('app_opened'),
      signins: datesOf('signin_completed'),
      driveLinks: datesOf('drive_linked'),
      ledgerActivations: datesOf('ledger'),
      sheetActivations: datesOf('sheet_activated'),
      localActivations: datesOf('local_ledger_activated'),
    },
    devices: Array.from(devices.values()),
  }
}

// 가입자 이메일 (portle_users). 서버가 검증된 구글 토큰에서 읽어 upsert 하므로 앱 버전과
// 무관하지만, 그 사람이 앱을 다시 열어 토큰 요청을 보내기 전까지는 행이 없다. 표가 아직
// 없거나 조회가 실패해도 대시보드는 계정 id 로 부르면 되므로 빈 맵으로 넘어간다.
async function fetchPortleEmails(): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!portleSupabase) return out
  const { data, error } = await portleSupabase.from('portle_users').select('subject, email')
  if (error) {
    console.warn('portle_users 조회 실패:', error.message)
    return out
  }
  for (const row of data ?? []) {
    if (row.subject && row.email) out.set(row.subject, row.email)
  }
  return out
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

// iOS 이벤트는 통째로 뺀다. 출시는 이미 됐다(1.0.1, 2026-09-10 07:01 KST) — 그런데도 빼는
// 이유는 포틀 Jest 스위트가 운영 /api/events 로 쏜 가짜 행 때문이다. jest 의 Platform.OS
// 기본값이 'ios' 라 전부 iOS 로 들어왔고, 스토리지 목이 파일마다 새 uuid 를 줘서 기기가
// 1,694대로 불어났다(2026-09-17 포틀 세션 진단, fetch 기록기로 입증).
//
// 확인한 수(8/22 컷오프 이후): ios 기기 1,400대 중 subject 를 한 번이라도 실은 기기는 4대뿐이고
// 그 4대가 실기기다(3대는 관리자, 1대는 9/1 사전 테스터). 나머지 1,396대 중 810대는 이벤트가
// 딱 1건이라 "앱 한 번 열고 만 실사용자"와 구분이 안 된다. 그래서 행 모양으로 가려내는 임시
// 규칙은 두지 않는다 — 진짜 해법은 가짜 행을 지우는 것이다.
//
// 이 상수를 푸는 순서: (1) 포틀이 테스트에서 목 없는 fetch 를 막은 변경을 머지, (2) 운영 DB 의
// Jest 행 삭제, (3) 여기에 출시 시각을 적는다. 순서를 건너뛰면 가짜 기기가 퍼널로 쏟아진다.
// 1.0.3 부터는 이벤트에 build·simulator 가 실려서 이 상수 자체가 필요 없어진다.
const PORTLE_IOS_RELEASE_MS: number | null = null

function isTestPeriod(createdAt: string): boolean {
  return new Date(createdAt).getTime() < PORTLE_TEST_CUTOFF_MS
}

/**
 * 앱 이벤트가 우리 것인가. 행 하나가 아니라 **기기 단위**로 판정한다 —
 * `owner` 는 그 기기가 로그인 이벤트에 실어 보낸 계정(없으면 null)이다.
 */
function isInternalEvent(platform: string | null, createdAt: string, owner: string | null): boolean {
  if (isTestPeriod(createdAt)) return true
  if (owner && EXCLUDED_PORTLE_SUBJECTS.has(owner)) return true   // 관리자 기기
  if (platform === 'ios') {
    // Jest 행을 지우기 전까지의 임시 기준(포틀 세션 제안, 2026-09-17): 계정을 한 번이라도
    // 실어 보낸 iOS 기기만 실기기로 본다. 가짜 기기 1,396대는 전부 계정이 없고, 로그인한
    // 실사용자는 drive_linked 에 계정이 실려 통과한다. 대신 **로그인 안 한 실제 iOS 사용자는
    // 여전히 안 보인다** — 이벤트 1건짜리 가짜 기기 810대와 생김새가 같아서 가를 수가 없다.
    // 지금도 iOS 를 통째로 빼고 있으니 이 규칙이 덜 가리는 쪽이고, 아래 출시 시각을 적는
    // 순간(=Jest 행 삭제 뒤) 규칙 자체가 사라진다.
    if (PORTLE_IOS_RELEASE_MS === null) return !owner
    return new Date(createdAt).getTime() < PORTLE_IOS_RELEASE_MS
  }
  return false
}

function isExcludedUsage(subject: string, createdAt: string): boolean {
  return EXCLUDED_PORTLE_SUBJECTS.has(subject) || isTestPeriod(createdAt)
}

export async function getPortleStats(): Promise<PortleStats> {
  if (!portleSupabase) throw new Error('Portle Supabase 미설정 (PORTLE_SUPABASE_URL / PORTLE_SUPABASE_SECRET_KEY)')

  const [usage, entitlementsRes, shortCodesRes, storeVisitsRes, appEvents, emails] = await Promise.all([
    fetchAllAiUsage(),
    portleSupabase.from('portle_entitlements').select('subject, store, product_id, expires_at, updated_at'),
    portleSupabase.from('portle_short_codes').select('owner_sub'),
    portleSupabase.from('portle_store_visits').select('date, visitors').order('date', { ascending: true }),
    fetchAppEvents(),
    fetchPortleEmails(),
  ])
  const appFunnel = appEvents.funnel
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
  // 장부에는 접두사 없는 id 가 들어 있고 사용자 행의 키는 'google:…' 이다. 양쪽으로 찾는다 —
  // 접두사 붙은 키로만 찾으면 공유 시트가 언제나 0으로 보인다.
  const sharedSheetsOf = (subject: string) =>
    sheetsByOwner.get(subject) ?? sheetsByOwner.get(subject.replace(/^(google|device):/, '')) ?? 0
  for (const s of shortCodesRes.data ?? []) {
    if (!s.owner_sub) continue
    if (EXCLUDED_PORTLE_SUBJECTS.has(s.owner_sub) || EXCLUDED_PORTLE_SUBJECTS.has(`google:${s.owner_sub}`)) continue
    sheetsByOwner.set(s.owner_sub, (sheetsByOwner.get(s.owner_sub) ?? 0) + 1)
    sharedSheetsCount++
  }

  // 기기 → 그 기기에서 로그인한 구글 계정. 로그인 전에 쓴 AI 호출(device: subject)을
  // 같은 사람의 계정 행으로 합치는 데 쓴다. 안 합치면 한 사람이 두 줄로 앉는다.
  const deviceOwner = new Map<string, string>()
  for (const d of appEvents.devices) {
    if (d.subject?.startsWith('google:')) deviceOwner.set(d.deviceId, d.subject)
  }
  const ownerOf = (subject: string): string => {
    if (!subject.startsWith('device:')) return subject
    return deviceOwner.get(subject.slice('device:'.length)) ?? subject
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
    const raw = row.subject || 'unknown'
    if (isExcludedUsage(raw, row.created_at)) continue
    const subject = ownerOf(raw)
    if (EXCLUDED_PORTLE_SUBJECTS.has(subject)) continue
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
        accountId: subject.startsWith('google:') ? subject.slice('google:'.length) : null,
        email: emails.get(subject) ?? null,
        deviceIds: [], platform: null, appVersion: null, country: null, stage: null, installedAt: null,
        firstAt: row.created_at, lastAt: row.created_at, activeDays: 0, repeatAt: null,
        calls: 0, success: 0, empty: 0, failure: 0, byKind: {},
        inputTokens: 0, outputTokens: 0,
        sharedSheets: sharedSheetsOf(subject),
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

  // ── 앱 이벤트의 기기를 사람에 붙인다 ──────────────────────────────────────────
  // 로그인한 기기는 그 계정 행에, 아직 로그인 안 한 기기는 그 자체로 한 사람이 된다.
  // 이 병합으로 사용자 표가 "AI 를 쓴 사람"이 아니라 "앱을 쓴 사람"을 보여주게 된다 —
  // 설치만 하고 AI 는 안 쓴 사람(지금 대부분이 그렇다)이 표에서 통째로 빠져 있었다.
  const aiSubjects = users.size
  for (const d of appEvents.devices) {
    const subject = d.subject ?? `device:${d.deviceId}`
    if (EXCLUDED_PORTLE_SUBJECTS.has(subject)) continue
    let u = users.get(subject)
    if (!u) {
      u = {
        subject, type: subjectType(subject),
        accountId: subject.startsWith('google:') ? subject.slice('google:'.length) : null,
        email: emails.get(subject) ?? null,
        deviceIds: [], platform: null, appVersion: null, country: null, stage: null, installedAt: null,
        firstAt: d.firstAt, lastAt: d.lastAt, activeDays: 0, repeatAt: null,
        calls: 0, success: 0, empty: 0, failure: 0, byKind: {},
        inputTokens: 0, outputTokens: 0,
        sharedSheets: sharedSheetsOf(subject),
        entitlement: entitlements.get(subject) ?? null,
        daySet: new Set(),
      }
      users.set(subject, u)
    }
    u.deviceIds.push(d.deviceId)
    if (d.platform) u.platform = d.platform === 'ios' || d.platform === 'android' ? d.platform : 'other'
    if (d.appVersion) u.appVersion = d.appVersion
    if (d.country && !u.country) u.country = d.country
    if (!u.stage || STAGE_RANK[d.stage] > STAGE_RANK[u.stage]) u.stage = d.stage
    if (d.installedAt && (!u.installedAt || d.installedAt < u.installedAt)) u.installedAt = d.installedAt
    if (d.firstAt < u.firstAt) u.firstAt = d.firstAt
    if (d.lastAt > u.lastAt) u.lastAt = d.lastAt
    for (const day of d.days) u.daySet.add(day)
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

  // ── 일별 활동자 — 보이스카드 '일별 활동자'와 같은 네 칸 ──────────────────────
  // 사람 단위는 위 users 와 같다(로그인 기기는 계정에 합쳐진 뒤). 활동 = 그날 앱 이벤트 또는
  // AI 호출. 로그인 = google 계정 사람, 기기 = 로그인 없는 기기. 신규 = 그 사람의 첫 활동일.
  // 축은 첫 활동일부터 오늘까지 빈 날도 채운다 — 차트가 실제 기간을 보여야 한다.
  const activeByDay = new Map<string, PortleDailyActive>()
  const activeRow = (date: string): PortleDailyActive => {
    let r = activeByDay.get(date)
    if (!r) { r = { date, total: 0, loggedMember: 0, loggedNew: 0, deviceMember: 0, deviceNew: 0 }; activeByDay.set(date, r) }
    return r
  }
  for (const u of users.values()) {
    if (u.daySet.size === 0) continue
    const firstDay = Array.from(u.daySet).sort()[0]
    const logged = u.type === 'google'
    for (const day of u.daySet) {
      const r = activeRow(day)
      r.total++
      if (logged) { if (day === firstDay) r.loggedNew++; else r.loggedMember++ }
      else { if (day === firstDay) r.deviceNew++; else r.deviceMember++ }
    }
  }
  const activeKeys = Array.from(activeByDay.keys()).sort()
  const dailyActive: PortleDailyActive[] = []
  if (activeKeys.length > 0) {
    for (let d = new Date(`${activeKeys[0]}T00:00:00Z`); ; d.setUTCDate(d.getUTCDate() + 1)) {
      const key = d.toISOString().slice(0, 10)
      if (key > today) break
      dailyActive.push(activeByDay.get(key) ?? { date: key, total: 0, loggedMember: 0, loggedNew: 0, deviceMember: 0, deviceNew: 0 })
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
      subjects: aiSubjects,
      deviceOnly: users.size - aiSubjects,
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
    dailyActive,
    byKind: Array.from(byKind.values())
      .map(({ subjectSet, ...k }) => ({ ...k, subjects: subjectSet.size }))
      .sort((a, b) => b.calls - a.calls),
    users: Array.from(users.values())
      .map(({ daySet, ...u }) => ({ ...u, activeDays: daySet.size }))
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt)),
    fetchedAt: new Date().toISOString(),
  }
}
