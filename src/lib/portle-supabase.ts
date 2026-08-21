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

function subjectType(subject: string): PortleUserRow['type'] {
  if (subject.startsWith('google:')) return 'google'
  if (subject.startsWith('device:')) return 'device'
  return 'other'
}

export async function getPortleStats(): Promise<PortleStats> {
  if (!portleSupabase) throw new Error('Portle Supabase 미설정 (PORTLE_SUPABASE_URL / PORTLE_SUPABASE_SECRET_KEY)')

  const [usage, entitlementsRes, shortCodesRes] = await Promise.all([
    fetchAllAiUsage(),
    portleSupabase.from('portle_entitlements').select('subject, store, product_id, expires_at, updated_at'),
    portleSupabase.from('portle_short_codes').select('owner_sub'),
  ])
  if (entitlementsRes.error) throw new Error(`portle_entitlements 조회 실패: ${entitlementsRes.error.message}`)
  if (shortCodesRes.error) throw new Error(`portle_short_codes 조회 실패: ${shortCodesRes.error.message}`)

  const now = Date.now()
  const entitlements = new Map<string, PortleEntitlement>()
  for (const e of entitlementsRes.data ?? []) {
    entitlements.set(e.subject, {
      subject: e.subject, store: e.store, productId: e.product_id,
      expiresAt: e.expires_at, updatedAt: e.updated_at,
      active: new Date(e.expires_at).getTime() > now,
    })
  }

  const sheetsByOwner = new Map<string, number>()
  for (const s of shortCodesRes.data ?? []) {
    if (!s.owner_sub) continue
    sheetsByOwner.set(s.owner_sub, (sheetsByOwner.get(s.owner_sub) ?? 0) + 1)
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
        firstAt: row.created_at, lastAt: row.created_at, activeDays: 0,
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
    u.daySet.add(day)
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

  return {
    totals: {
      subjects: users.size,
      subjectsToday: subjectsTodaySet.size,
      subjects7d: subjects7dSet.size,
      calls, callsToday, calls7d,
      successRate: pct(success, calls),
      successRate7d: pct(success7d, total7d),
      inputTokens, outputTokens,
      activeEntitlements: Array.from(entitlements.values()).filter(e => e.active).length,
      sharedSheets: (shortCodesRes.data ?? []).length,
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
