/**
 * 세 앱의 요율을 <b>한 화면에서</b> 읽고 고치기 위한 서버 모듈.
 *
 * 각 앱에도 자기 요율 화면이 있다(리뷰노트·스크립타 `/admin/rates`). 여기는
 * 그것을 대신하는 곳이 아니라 <b>같이 놓고 보는</b> 곳이다 — 세 앱이 같은
 * 판매가($0.0099/크레딧)를 쓰므로, 한 앱만 보면 다른 앱이 띠 밖으로 나간 걸
 * 놓친다.
 *
 * 각 앱의 API 를 부르지 않고 DB 에 직접 붙는다. 앱 API 는 그 앱의 관리자
 * 세션을 요구하는데, 대시보드에는 그 세션이 없다. 서비스 키는 이미 문의함이
 * 같은 방식으로 쓰고 있다.
 *
 * <b>`server-only` 를 달지 않았다.</b> 주간 감사 스크립트(`credit-rate-audit.mjs`)가
 * 이 파일을 그대로 읽어야 하는데, 그 패키지는 Next 밖에서 import 되면 던진다.
 * 대신 아래 런타임 가드로 브라우저에서의 import 를 막는다 — 빌드 시점 검사보다
 * 늦게 잡히지만, 서비스 키가 번들에 섞이는 것은 똑같이 막는다.
 * 앱 코드는 `credit-rates.ts` 를 통해 쓴다(그쪽에 `server-only` 가 있다).
 */
if (typeof window !== 'undefined') {
  throw new Error('credit-rates-data 는 서버 전용이다 — 서비스 키가 들어 있다')
}
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  APPS, appOf, entryOf, verdictFor,
  type AppKey, type AppRates, type RateEntry, type Sample, type Verdict,
} from '@/lib/credit-rates-core'

export * from '@/lib/credit-rates-core'

const clientFor = (app: AppKey): SupabaseClient | null => {
  const prefix = app === 'voicecards' ? 'VOICECARDS' : app === 'reviewnotes' ? 'REVIEWNOTES' : 'SCRIPTA'
  const url = process.env[`${prefix}_SUPABASE_URL`]
  const key = process.env[`${prefix}_SUPABASE_SERVICE_KEY`]
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null
}

/** 앱마다 표 이름과 값 칸 이름이 다르다. 세 곳을 같은 모양으로 눕힌다. */
const STORE: Record<AppKey, { table: string; valueColumn: string }> = {
  voicecards:  { table: 'ai_rates',         valueColumn: 'value' },
  reviewnotes: { table: 'AiCreditRate',     valueColumn: 'credits' },
  scripta:     { table: 'scripta_ai_rates', valueColumn: 'value' },
}

export interface RateRow {
  key: string
  label: string
  unit: RateEntry['unit']
  hint: string
  /** 지금 도는 값 — DB 에 행이 있으면 그 값, 없으면 코드 기본값. */
  value: number
  fallback: number
  /** DB 에 행이 있는가. 없으면 코드 기본값으로 도는 중이다. */
  overridden: boolean
  verdict: Verdict
}

export interface AppRatesView {
  key: AppKey
  label: string
  table: string
  costSource: string | null
  rows: RateRow[]
  error: string | null
}

async function readOverrides(app: AppRates): Promise<Map<string, number>> {
  const client = clientFor(app.key)
  if (!client) throw new Error(`${app.label} DB 미설정 — 서비스 키 없음`)
  const { table, valueColumn } = STORE[app.key]
  // 칸 이름이 앱마다 달라 `select('*')` 로 받고 이름으로 꺼낸다. 문자열을
  // 조립해 넣으면 supabase-js 의 타입 파서가 칸 이름을 읽지 못한다.
  const { data, error } = await client.from(table).select('*')
  if (error) throw new Error(`${table} 조회 실패: ${error.message}`)
  const out = new Map<string, number>()
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const value = Number(row[valueColumn])
    if (Number.isFinite(value) && value > 0) out.set(String(row.key), value)
  }
  return out
}

/**
 * 리뷰노트의 실측. 건별 `EventLog` 를 기능별로 모은다.
 *
 * 크레딧은 <b>지금 요율로 다시 센다</b>. `meta.credits` 는 그때 받은 값이라
 * 요율을 바꾼 뒤에는 옛 행과 새 행이 다른 자를 쓰게 된다.
 */
async function reviewnotesSamples(rates: Map<string, number>): Promise<Map<string, Sample>> {
  const client = clientFor('reviewnotes')
  if (!client) throw new Error('리뷰노트 DB 미설정')
  const { data, error } = await client
    .from('EventLog')
    .select('meta')
    .eq('name', 'ai_tokens')
    .order('createdAt', { ascending: false })
    .limit(2000)
  if (error) throw new Error(`EventLog 조회 실패: ${error.message}`)

  const app = appOf('reviewnotes')!
  const rows = new Map<string, { cost: number; credits: number }[]>()
  for (const record of data ?? []) {
    const meta = (record as { meta: Record<string, unknown> | null }).meta ?? {}
    /**
     * 2026-08-27 이전 기록은 크롭·짝확인·문서추출이 전부 `documentExtraction`
     * 한 이름이었다. `mode` 가 그 셋을 가르므로 옛 행도 제 기능으로 돌려놓는다 —
     * 안 그러면 크롭 실측이 문서 추출 것으로 세어져 판단이 통째로 어긋난다.
     */
    const feature = meta.mode === 'regions' ? 'pageRegions'
      : meta.mode === 'pairCheck' || meta.mode === 'grouping' ? 'regionGrouping'
      : String(meta.feature ?? '')
    const entry = app.entries.find((e) => e.costFeature === feature)
    if (!entry?.creditsOf) continue
    const cost = Number(meta.costUsdMicros)
    if (!Number.isFinite(cost)) continue
    const value = rates.get(entry.key) ?? entry.fallback
    if (!rows.has(entry.key)) rows.set(entry.key, [])
    rows.get(entry.key)!.push({ cost, credits: Math.max(0, entry.creditsOf(meta, value)) })
  }

  const out = new Map<string, Sample>()
  for (const [key, list] of rows) {
    out.set(key, {
      n: list.length,
      totalCost: list.reduce((sum, r) => sum + r.cost, 0),
      totalCredits: list.reduce((sum, r) => sum + r.credits, 0),
      worstPerCredit: Math.max(0, ...list.map((r) => (r.credits > 0 ? r.cost / r.credits : 0))),
    })
  }
  return out
}

/**
 * 스크립타의 실측. 표를 직접 못 읽는다 — `scripta_attempts` 등은
 * `authenticated` 에게만 열려 있어 관리자 조회는 전부 `security definer`
 * 집계 함수를 거친다. 그래서 건별이 아니라 합계로 받는다.
 */
async function scriptaSamples(rates: Map<string, number>): Promise<Map<string, Sample>> {
  const client = clientFor('scripta')
  if (!client) throw new Error('스크립타 DB 미설정')
  const { data, error } = await client.rpc('sc_ai_cost_summary')
  if (error) throw new Error(`sc_ai_cost_summary 실패: ${error.message}`)

  const app = appOf('scripta')!
  const out = new Map<string, Sample>()
  for (const row of (data ?? []) as { feature: string; n: unknown; cost_micros: unknown; worst_micros: unknown }[]) {
    const entry = app.entries.find((e) => e.costFeature === row.feature)
    if (!entry) continue
    const n = Number(row.n) || 0
    if (n === 0) continue
    const value = rates.get(entry.key) ?? entry.fallback
    const perCall = entry.unit === 'milli' ? value / 1_000 : value
    out.set(entry.key, {
      n,
      totalCost: Number(row.cost_micros) || 0,
      totalCredits: perCall * n,
      // 합계만 받으므로 최악값은 한 건짜리로 환산해 넣는다.
      worstPerCredit: perCall > 0 ? (Number(row.worst_micros) || 0) / perCall : 0,
    })
  }
  return out
}

async function samplesFor(app: AppRates, rates: Map<string, number>): Promise<Map<string, Sample>> {
  if (app.key === 'reviewnotes') return reviewnotesSamples(rates)
  if (app.key === 'scripta') return scriptaSamples(rates)
  return new Map()   // 보이스카드는 원가 로그가 없다 — 정가로 판정한다.
}

async function viewFor(app: AppRates): Promise<AppRatesView> {
  const base = { key: app.key, label: app.label, table: app.table, costSource: app.costSource ?? null }
  try {
    const rates = await readOverrides(app)
    // 실측을 못 읽어도 값은 보여 준다. 판정만 빠진다.
    const samples = await samplesFor(app, rates).catch(() => new Map<string, Sample>())
    const rows: RateRow[] = app.entries.map((entry) => {
      const value = rates.get(entry.key) ?? entry.fallback
      return {
        key: entry.key,
        label: entry.label,
        unit: entry.unit,
        hint: entry.hint,
        value,
        fallback: entry.fallback,
        overridden: rates.has(entry.key),
        verdict: verdictFor(entry, value, samples.get(entry.key) ?? null),
      }
    })
    return { ...base, rows, error: null }
  } catch (error) {
    return { ...base, rows: [], error: error instanceof Error ? error.message : String(error) }
  }
}

/** 세 앱을 한꺼번에. 한 앱이 막혀도 나머지는 보인다. */
export async function getAllRates(): Promise<AppRatesView[]> {
  return Promise.all(APPS.map(viewFor))
}

/**
 * 값 하나를 바꾼다. `value` 가 null 이면 행을 지워 <b>코드 기본값으로</b>
 * 되돌린다 — 「기본값과 같은 수를 적는 것」과는 다르다. 그쪽은 코드가 바뀌어도
 * DB 값이 남아 옛 값에 앱을 묶어 둔다.
 */
export async function setRate(appKey: string, key: string, value: number | null, note?: string): Promise<void> {
  const app = appOf(appKey)
  if (!app) throw new Error(`모르는 앱: ${appKey}`)
  const entry = entryOf(app, key)
  if (!entry) throw new Error(`${app.label} 에 없는 요율: ${key}`)

  const client = clientFor(app.key)
  if (!client) throw new Error(`${app.label} DB 미설정`)
  const { table, valueColumn } = STORE[app.key]

  if (value === null) {
    const { error } = await client.from(table).delete().eq('key', key)
    if (error) throw new Error(`${table} 삭제 실패: ${error.message}`)
    return
  }
  // 0 이나 음수는 받지 않는다. `perCredit` 이 0 이면 나눗셈이 무한이 되고,
  // `credits` 가 0 이면 그 기능이 통째로 공짜가 된다.
  if (!Number.isInteger(value) || value <= 0) throw new Error('요율은 1 이상의 정수여야 한다')

  const row: Record<string, unknown> = { key, [valueColumn]: value, updated_at: new Date().toISOString() }
  if (note) row.note = note
  // 리뷰노트 표는 Prisma 가 만든 것이라 칸 이름이 카멜케이스다.
  if (app.key === 'reviewnotes') {
    delete row.updated_at
    row.updatedAt = new Date().toISOString()
  }
  const { error } = await client.from(table).upsert(row, { onConflict: 'key' })
  if (error) throw new Error(`${table} 저장 실패: ${error.message}`)
}
