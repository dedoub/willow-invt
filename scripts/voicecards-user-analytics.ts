// VoiceCards 일일 유저 분석 → 텔레그램 발송
// 매일 07:00 KST 실행 (일요일 제외)
// Usage: npx tsx scripts/voicecards-user-analytics.ts

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { markdownToTelegramHtml, normalizeTelegramOutboundText, splitTelegramMessage } from './telegram-utils'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`

const willow = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
)

const vcUrl = process.env.VOICECARDS_SUPABASE_URL
const vcKey = process.env.VOICECARDS_SUPABASE_KEY
const voicecards = vcUrl && vcKey ? createClient(vcUrl, vcKey) : null
const voicecardsGcpProjectLabel = process.env.VOICECARDS_GCP_PROJECT_LABEL?.trim() || 'voice-cards'
const voicecardsGcpProjectId = process.env.VOICECARDS_GCP_PROJECT_ID?.trim() || 'consummate-tine-476004-u1'
const voicecardsGcpProjectShowId = process.env.VOICECARDS_GCP_PROJECT_SHOW_ID === '1'
const voicecardsAnalyticsForceRun = process.env.VOICECARDS_ANALYTICS_FORCE_RUN === '1'
const voicecardsAnalyticsPreview = process.env.VOICECARDS_ANALYTICS_PREVIEW === '1'
const voicecardsBillingTable = process.env.VOICECARDS_BILLING_BQ_TABLE?.trim() || ''
const voicecardsBillingDataset = process.env.VOICECARDS_BILLING_BQ_DATASET?.trim() || 'cloud_billing_export'
const voicecardsBillingQueryProjectId = process.env.VOICECARDS_BILLING_QUERY_PROJECT_ID?.trim() || ''
const googleServiceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()
const GCP_LOGIN_ALERT_STATE_FILE = join(process.cwd(), 'scripts', 'logs', 'voicecards-gcp-login-alert.json')
const GCP_LOGIN_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000

const EXCLUDED_NICKNAMES = new Set(['류하아빠', '큐트도넛'])
// 봇/자동화 계정 이메일 도메인 (Firebase Test Lab 등) — 닉네임이 없어 도메인으로 식별
const EXCLUDED_EMAIL_DOMAINS = ['cloudtestlabaccounts.com']
const isExcludedEmail = (email: string | null) =>
  !!email && EXCLUDED_EMAIL_DOMAINS.some(d => email.toLowerCase().endsWith(`@${d}`))

type UserRow = {
  user_id: string
  nickname: string | null
  email: string | null
  sheet_ids: string[] | null
  credits: number | null
  created_at: string
  has_purchased?: boolean | null
  onboarding_completed?: boolean | null
}

type AnalyticsRow = {
  user_id: string
  sheet_name: string | null
  cards_learned: number | null
  total_attempts: number | null
  last_updated: string | null
}

type EventRow = {
  user_id: string | null
  event_name: string
  created_at: string
  properties: Record<string, unknown> | null
  session_id: string | null
}

type UserSheetAggregate = {
  name: string
  learned: number
  attempts: number
}

type UserActivitySnapshot = {
  total: number
  sessionCount: number
  lastEventAt: string | null
  counts: Record<string, number>
}

type GcpCostSummary = {
  todayTotal: number
  monthTotal: number
  currency: string
  topServicesToday: { service: string; cost: number }[]
  targetDate: string
}

type GcpBillingInfo = {
  projectId: string
  billingEnabled: boolean
  billingAccountName: string | null
}

type ResolvedBillingTable = {
  qualifiedTableId: string
  queryProjectId: string
}

type GcpLoginAlertState = {
  lastAlertAt: string | null
  lastReason: string | null
}

function log(msg: string) {
  console.log(`[voicecards-analytics] [${new Date().toISOString()}] ${msg}`)
}

function isSundayKST(): boolean {
  const now = new Date()
  const kstTime = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return kstTime.getUTCDay() === 0
}

function kstDateStr(d: Date = new Date()): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().split('T')[0]
}

function firstDayOfMonth(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`
}

async function getCeoChatId(): Promise<number | null> {
  const { data } = await willow
    .from('telegram_conversations')
    .select('chat_id')
    .eq('bot_type', 'ceo')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.chat_id ?? null
}

async function sendTelegram(chatId: number, text: string, parseMode: string = 'HTML') {
  const chunks = splitTelegramMessage(text, 4000)
  for (const chunk of chunks) {
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: parseMode }),
    })
    if (!res.ok) {
      log(`Telegram send failed: ${res.status} ${await res.text()}`)
    }
    if (chunks.length > 1) await new Promise(r => setTimeout(r, 500))
  }
}

async function fetchAll<T>(
  fn: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  while (true) {
    const { data, error } = await fn(from, from + pageSize - 1)
    if (error || !data) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

function shortNick(u: UserRow): string {
  if (u.nickname) return u.nickname
  return `(${u.user_id.slice(0, 8)}…)`
}

function isValidBigQueryTableId(value: string): boolean {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_]+\.[A-Za-z0-9_*]+$/.test(value)
}

function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${value.toFixed(2)} ${currency}`
  }
}

function simplifyGcpCostError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error)
  if (/reauth|auth|login|invalid_grant|credential/i.test(msg)) return '인증 필요'
  if (/permission|access denied|forbidden|403/i.test(msg)) return '권한 부족'
  if (/not found|404/i.test(msg)) return '테이블 미발견'
  return '조회 실패'
}

function extractErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isGcpLoginRequiredError(error: unknown): boolean {
  const msg = extractErrorMessage(error)
  return /reauth|gcloud auth login|application-default login|invalid_grant|refreshing your current auth tokens|access token 발급 실패|authorized_user|oauth/i.test(msg)
}

function formatProjectDisplayName(projectId: string): string {
  return voicecardsGcpProjectShowId ? `${voicecardsGcpProjectLabel} (${projectId})` : voicecardsGcpProjectLabel
}

function kstNow(date: Date = new Date()): Date {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000)
}

function formatKstReportTimestamp(date: Date = new Date()): string {
  const kst = kstNow(date)
  const yyyy = String(kst.getUTCFullYear())
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(kst.getUTCDate()).padStart(2, '0')
  const hh = String(kst.getUTCHours()).padStart(2, '0')
  const min = String(kst.getUTCMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${min} KST`
}

function kstDayPart(date: Date = new Date()): string {
  const hour = kstNow(date).getUTCHours()
  if (hour < 5) return '심야'
  if (hour < 12) return '아침'
  if (hour < 18) return '오후'
  return '저녁'
}

function startOfKstDayIso(date: Date = new Date()): string {
  const kst = kstNow(date)
  const utcMs =
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), 0, 0, 0, 0) -
    9 * 60 * 60 * 1000
  return new Date(utcMs).toISOString()
}

function isSameOrAfterIso(iso: string, thresholdIso: string): boolean {
  return Date.parse(iso) >= Date.parse(thresholdIso)
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map(value => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean),
    ),
  )
}

function emailLocalPart(email: string | null): string | null {
  if (!email || !email.includes('@')) return email
  return email.split('@')[0] || email
}

function shortUserLabel(user: UserRow): string {
  return user.nickname || emailLocalPart(user.email) || shortNick(user)
}

function fullUserLabel(user: UserRow): string {
  return user.email || shortUserLabel(user)
}

function simplifySheetName(name: string | null): string {
  if (!name) return ''
  return name
    .replace(/^Demo:\s*/i, '')
    .replace(/^VoiceCards_/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function readStringProp(props: Record<string, unknown> | null | undefined, ...keys: string[]): string | null {
  if (!props) return null
  for (const key of keys) {
    const value = props[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function detectLanguages(sheetNames: string[]): string[] {
  const text = sheetNames.join(' | ').toLowerCase()
  const hits: string[] = []
  const defs: Array<[RegExp, string]> = [
    [/\bgerman\b|deutsch|немец|der n/, '독일어'],
    [/\bspanish\b|espa[ñn]ol/, '스페인어'],
    [/\brussian\b|русск/, '러시아어'],
    [/\bfrench\b/, '프랑스어'],
    [/\bchinese\b|mandarin|hsk/, '중국어'],
    [/\bjapanese\b|nihongo/, '일본어'],
    [/\bkorean\b|hangul/, '한국어'],
    [/\bvietnamese\b/, '베트남어'],
    [/\benglish\b|synonym|antonym/, '영어'],
  ]
  for (const [pattern, label] of defs) {
    if (pattern.test(text)) hits.push(label)
  }
  return uniqueNonEmpty(hits)
}

function inferStudyTheme(sheetNames: string[]): string {
  const cleaned = uniqueNonEmpty(sheetNames.map(simplifySheetName)).slice(0, 4)
  if (cleaned.length === 0) return '주제 미확인'

  const text = cleaned.join(' | ').toLowerCase()
  if (/jeppesen|reciprocating|turbine|aviation|engine/.test(text)) return '항공엔진(Jeppesen)'
  if (/cdl|interview|star/.test(text)) return 'CDL 면접 영어'
  if (/daily expressions/.test(text) && /english/.test(text) && /spanish|espa[ñn]ol/.test(text)) {
    return '영-스페인어 일상 표현'
  }

  const languages = detectLanguages(cleaned)
  const vocabLike = /der n|synonym|antonym|vocabulary|slova|слова|глагол|прилагатель/.test(text)
  if (languages.length >= 2) return `${languages.slice(0, 2).join('·')} 혼합 어학`
  if (languages.length === 1) return `${languages[0]} ${vocabLike ? '어휘' : '학습'}`
  return cleaned[0]
}

function buildTopSheetsByUser(analytics: AnalyticsRow[], visibleIds: Set<string>): Map<string, UserSheetAggregate[]> {
  const perUser = new Map<string, Map<string, UserSheetAggregate>>()
  for (const row of analytics) {
    if (!visibleIds.has(row.user_id) || !row.sheet_name) continue
    const userSheets = perUser.get(row.user_id) || new Map<string, UserSheetAggregate>()
    const key = simplifySheetName(row.sheet_name)
    const existing = userSheets.get(key) || { name: key, learned: 0, attempts: 0 }
    existing.learned += Number(row.cards_learned) || 0
    existing.attempts += Number(row.total_attempts) || 0
    userSheets.set(key, existing)
    perUser.set(row.user_id, userSheets)
  }

  const out = new Map<string, UserSheetAggregate[]>()
  for (const [userId, sheets] of perUser) {
    out.set(
      userId,
      Array.from(sheets.values()).sort((a, b) => {
        if (a.learned !== b.learned) return b.learned - a.learned
        return b.attempts - a.attempts
      }),
    )
  }
  return out
}

function buildActivityByUser(events: EventRow[]): Map<string, UserActivitySnapshot> {
  const out = new Map<string, UserActivitySnapshot>()
  const sessionSets = new Map<string, Set<string>>()

  for (const event of events) {
    if (!event.user_id) continue
    const snapshot =
      out.get(event.user_id) ||
      ({
        total: 0,
        sessionCount: 0,
        lastEventAt: null,
        counts: {},
      } satisfies UserActivitySnapshot)

    snapshot.total += 1
    snapshot.counts[event.event_name] = (snapshot.counts[event.event_name] || 0) + 1
    if (!snapshot.lastEventAt || event.created_at > snapshot.lastEventAt) snapshot.lastEventAt = event.created_at

    if (event.session_id) {
      const sessionSet = sessionSets.get(event.user_id) || new Set<string>()
      sessionSet.add(event.session_id)
      sessionSets.set(event.user_id, sessionSet)
      snapshot.sessionCount = sessionSet.size
    }

    out.set(event.user_id, snapshot)
  }

  return out
}

function isNewUserActivation(snapshot: UserActivitySnapshot | undefined): boolean {
  if (!snapshot) return false
  return [
    'learning_started',
    'listen_session_started',
    'card_viewed',
    'card_attempted',
    'tts_played',
    'stt_recording_started',
  ].some(eventName => (snapshot.counts[eventName] || 0) > 0)
}

function isPurchaseEvent(event: EventRow): boolean {
  const delta = Number(event.properties?.delta || 0)
  const reason = readStringProp(event.properties, 'reason')
  return event.event_name === 'credits_changed' && delta > 0 && reason === 'purchase'
}

function isErrorLikeEventName(eventName: string): boolean {
  return eventName === 'tts_synthesis_failed' || eventName === 'ai_grade_client_fail' || /(error|fail|timeout|missing)/i.test(eventName)
}

function formatUserList(labels: string[]): string {
  if (labels.length === 0) return '없음'
  return labels.join(', ')
}

function inferModeLabel(snapshot: UserActivitySnapshot): string {
  const listenSessions = snapshot.counts.listen_session_started || 0
  const ttsPlayed = snapshot.counts.tts_played || 0
  const attempts = snapshot.counts.card_attempted || 0
  const stt = snapshot.counts.stt_recording_started || 0

  if (listenSessions >= 3 && ttsPlayed >= Math.max(attempts * 2, 20) && stt <= 2) return '리슨 학습'
  if (listenSessions > 0 && stt >= 5) return '리슨+스픽 병행'
  if (listenSessions > 0 && attempts > 0) return '리슨+카드 복합'
  if (stt >= 3 && attempts > 0) return '스픽 중심'
  if (attempts > 0) return '카드 학습'
  return '활동'
}

function pickHeavyUsers(params: {
  ranked: Array<{ user: UserRow; snapshot: UserActivitySnapshot }>
  today: string
}): Array<{ user: UserRow; snapshot: UserActivitySnapshot }> {
  const { ranked, today } = params
  if (ranked.length <= 2) return ranked

  const picked: Array<{ user: UserRow; snapshot: UserActivitySnapshot }> = []
  const seen = new Set<string>()
  const pushIfNeeded = (candidate: { user: UserRow; snapshot: UserActivitySnapshot } | undefined) => {
    if (!candidate || seen.has(candidate.user.user_id)) return
    picked.push(candidate)
    seen.add(candidate.user.user_id)
  }

  pushIfNeeded(ranked.find(entry => entry.user.has_purchased))
  pushIfNeeded(ranked.find(entry => kstDateStr(new Date(entry.user.created_at)) === today))

  for (const candidate of ranked) {
    if (picked.length >= 2) break
    pushIfNeeded(candidate)
  }

  return picked.slice(0, 2)
}

function loadGcpLoginAlertState(): GcpLoginAlertState {
  try {
    const raw = readFileSync(GCP_LOGIN_ALERT_STATE_FILE, 'utf8')
    const parsed = JSON.parse(raw) as Partial<GcpLoginAlertState>
    return {
      lastAlertAt: parsed.lastAlertAt ?? null,
      lastReason: parsed.lastReason ?? null,
    }
  } catch {
    return {
      lastAlertAt: null,
      lastReason: null,
    }
  }
}

function saveGcpLoginAlertState(state: GcpLoginAlertState) {
  mkdirSync(join(process.cwd(), 'scripts', 'logs'), { recursive: true })
  writeFileSync(GCP_LOGIN_ALERT_STATE_FILE, JSON.stringify(state, null, 2))
}

function clearGcpLoginAlertState() {
  saveGcpLoginAlertState({
    lastAlertAt: null,
    lastReason: null,
  })
}

async function maybeSendGcpLoginRequiredAlert(chatId: number, reason: string) {
  const state = loadGcpLoginAlertState()
  const now = Date.now()
  const lastAlertAtMs = state.lastAlertAt ? new Date(state.lastAlertAt).getTime() : 0
  if (lastAlertAtMs && now - lastAlertAtMs < GCP_LOGIN_ALERT_COOLDOWN_MS) {
    log('Skip GCP login alert due to cooldown')
    return
  }

  const message = [
    '🔐 <b>VoiceCards GCP 재로그인 필요</b>',
    '',
    `프로젝트: ${formatProjectDisplayName(voicecardsGcpProjectId)}`,
    '비용 조회 중 Google Cloud 인증이 만료되었거나 재인증이 필요합니다.',
    '',
    '이 맥에서 다음 명령을 다시 실행해주세요.',
    '<code>gcloud auth login</code>',
    '',
    '다른 로컬 스크립트까지 함께 쓰면 이것도 권장합니다.',
    '<code>gcloud auth application-default login</code>',
    '',
    `최근 오류: <code>${reason.replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(0, 300)}</code>`,
  ].join('\n')

  await sendTelegram(chatId, message, 'HTML')
  saveGcpLoginAlertState({
    lastAlertAt: new Date(now).toISOString(),
    lastReason: reason,
  })
}

let googleAccessTokenPromise: Promise<string> | null = null

async function getGoogleAccessToken(): Promise<string> {
  if (!googleAccessTokenPromise) {
    googleAccessTokenPromise = (async () => {
      if (googleServiceAccountJson) {
        const auth = new google.auth.GoogleAuth({
          scopes: ['https://www.googleapis.com/auth/cloud-platform.read-only'],
          credentials: JSON.parse(googleServiceAccountJson),
        })
        const client = await auth.getClient()
        const tokenResult = await client.getAccessToken()
        const token = typeof tokenResult === 'string' ? tokenResult : tokenResult?.token
        if (token) return token
        throw new Error('서비스 계정 access token 발급 실패')
      }

      try {
        const token = execFileSync('gcloud', ['auth', 'print-access-token'], {
          encoding: 'utf8',
          timeout: 15000,
          maxBuffer: 1024 * 1024,
        }).trim()
        if (token) return token
      } catch (error) {
        log(`gcloud auth print-access-token failed: ${error instanceof Error ? error.message : String(error)}`)
      }

      const auth = new google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform.read-only'],
      })
      const client = await auth.getClient()
      const tokenResult = await client.getAccessToken()
      const token = typeof tokenResult === 'string' ? tokenResult : tokenResult?.token
      if (token) return token
      throw new Error('Google access token 발급 실패')
    })().catch(error => {
      googleAccessTokenPromise = null
      throw error
    })
  }

  return googleAccessTokenPromise
}

async function fetchGoogleApiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const token = await getGoogleAccessToken()
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(url, {
    ...init,
    headers,
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`${res.status} ${text || res.statusText}`)
  }
  return (text ? JSON.parse(text) : {}) as T
}

async function fetchVoicecardsBillingInfo(): Promise<GcpBillingInfo | null> {
  if (!voicecardsGcpProjectId) return null
  const data = await fetchGoogleApiJson<{
    projectId?: string
    billingEnabled?: boolean
    billingAccountName?: string
  }>(`https://cloudbilling.googleapis.com/v1/projects/${voicecardsGcpProjectId}/billingInfo`)

  return {
    projectId: data.projectId || voicecardsGcpProjectId,
    billingEnabled: !!data.billingEnabled,
    billingAccountName: data.billingAccountName || null,
  }
}

async function resolveVoicecardsBillingTable(): Promise<ResolvedBillingTable | null> {
  if (voicecardsBillingTable) {
    if (!isValidBigQueryTableId(voicecardsBillingTable)) {
      throw new Error('VOICECARDS_BILLING_BQ_TABLE 형식이 올바르지 않습니다. 예: billing-project.dataset.table')
    }
    const [tableProjectId] = voicecardsBillingTable.split('.')
    return {
      qualifiedTableId: voicecardsBillingTable,
      queryProjectId: voicecardsBillingQueryProjectId || tableProjectId,
    }
  }

  if (!voicecardsBillingDataset) return null

  const queryProjectId = voicecardsBillingQueryProjectId || voicecardsGcpProjectId
  const datasetProjectId = queryProjectId
  const data = await fetchGoogleApiJson<{
    tables?: Array<{ tableReference?: { tableId?: string } }>
  }>(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${datasetProjectId}/datasets/${voicecardsBillingDataset}/tables`,
  )

  const tableIds = (data.tables || [])
    .map(table => table.tableReference?.tableId || '')
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))

  const preferredTableId =
    tableIds.find(tableId => tableId.startsWith('gcp_billing_export_resource_v1_')) ||
    tableIds.find(tableId => tableId.startsWith('gcp_billing_export_v1_')) ||
    null

  if (!preferredTableId) return null

  return {
    qualifiedTableId: `${datasetProjectId}.${voicecardsBillingDataset}.${preferredTableId}`,
    queryProjectId,
  }
}

async function fetchVoicecardsGcpCostSummary(targetDate: string): Promise<GcpCostSummary | null> {
  const resolvedTable = await resolveVoicecardsBillingTable()
  if (!resolvedTable) return null

  const { qualifiedTableId, queryProjectId } = resolvedTable
  const monthStart = firstDayOfMonth(targetDate)
  const queryBase = `\`${qualifiedTableId}\``
  const totalExpr =
    'ROUND(SUM(cost) + SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)), 2)'
  const queryUrl = `https://bigquery.googleapis.com/bigquery/v2/projects/${queryProjectId}/queries`

  type BigQueryRow = { f?: Array<{ v?: string | number | null }> }
  type BigQueryQueryResponse = { rows?: BigQueryRow[] }
  const postBigQueryQuery = (query: string, queryParameters: Array<Record<string, unknown>>) =>
    fetchGoogleApiJson<BigQueryQueryResponse>(queryUrl, {
      method: 'POST',
      body: JSON.stringify({
        useLegacySql: false,
        parameterMode: 'NAMED',
        query,
        queryParameters,
      }),
    })

  const [todayResp, monthResp, topServiceResp] = await Promise.all([
    postBigQueryQuery(
      `
          SELECT
            ${totalExpr} AS total_cost,
            ANY_VALUE(currency) AS currency
          FROM ${queryBase}
          WHERE project.id = @projectId
            AND DATE(usage_start_time, "Asia/Seoul") = @targetDate
        `,
      [
        { name: 'projectId', parameterType: { type: 'STRING' }, parameterValue: { value: voicecardsGcpProjectId } },
        { name: 'targetDate', parameterType: { type: 'DATE' }, parameterValue: { value: targetDate } },
      ],
    ),
    postBigQueryQuery(
      `
          SELECT
            ${totalExpr} AS total_cost,
            ANY_VALUE(currency) AS currency
          FROM ${queryBase}
          WHERE project.id = @projectId
            AND DATE(usage_start_time, "Asia/Seoul") BETWEEN @monthStart AND @targetDate
        `,
      [
        { name: 'projectId', parameterType: { type: 'STRING' }, parameterValue: { value: voicecardsGcpProjectId } },
        { name: 'monthStart', parameterType: { type: 'DATE' }, parameterValue: { value: monthStart } },
        { name: 'targetDate', parameterType: { type: 'DATE' }, parameterValue: { value: targetDate } },
      ],
    ),
    postBigQueryQuery(
      `
          SELECT
            service.description AS service,
            ${totalExpr} AS total_cost
          FROM ${queryBase}
          WHERE project.id = @projectId
            AND DATE(usage_start_time, "Asia/Seoul") = @targetDate
          GROUP BY service
          HAVING total_cost IS NOT NULL
          ORDER BY total_cost DESC
          LIMIT 3
        `,
      [
        { name: 'projectId', parameterType: { type: 'STRING' }, parameterValue: { value: voicecardsGcpProjectId } },
        { name: 'targetDate', parameterType: { type: 'DATE' }, parameterValue: { value: targetDate } },
      ],
    ),
  ])

  const todayRow = todayResp.rows?.[0]?.f ?? []
  const monthRow = monthResp.rows?.[0]?.f ?? []
  const todayTotal = Number(todayRow[0]?.v || 0)
  const currency = String(todayRow[1]?.v || monthRow[1]?.v || 'USD')
  const monthTotal = Number(monthRow[0]?.v || 0)
  const topServicesToday = (topServiceResp.rows || [])
    .map(row => ({
      service: String(row.f?.[0]?.v || '').trim(),
      cost: Number(row.f?.[1]?.v || 0),
    }))
    .filter(row => row.service && Number.isFinite(row.cost))

  return {
    todayTotal,
    monthTotal,
    currency,
    topServicesToday,
    targetDate,
  }
}

async function main() {
  if (isSundayKST() && !voicecardsAnalyticsForceRun) {
    log('Sunday in KST → skip (sunday_no_message rule)')
    return
  }

  if (!voicecards) {
    log('VOICECARDS_SUPABASE_URL/KEY not set — skip')
    return
  }

  const now = new Date()
  const today = kstDateStr(now)
  const dayStartIso = startOfKstDayIso(now)
  const last24hStartIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const eventFetchStartIso = Date.parse(dayStartIso) < Date.parse(last24hStartIso) ? dayStartIso : last24hStartIso
  let gcpLoginRequiredReason: string | null = null
  const rememberGcpLoginRequired = (error: unknown) => {
    if (gcpLoginRequiredReason || !isGcpLoginRequiredError(error)) return
    gcpLoginRequiredReason = extractErrorMessage(error)
  }

  log(`Running analytics for ${today} (dayStart=${dayStartIso}, last24h=${last24hStartIso})`)

  const [users, analytics, recentEvents, gcpBillingInfo, gcpCostResult] = await Promise.all([
    fetchAll<UserRow>((from, to) =>
      voicecards.from('users').select('*').order('created_at', { ascending: false }).range(from, to),
    ),
    fetchAll<AnalyticsRow>((from, to) =>
      voicecards.from('user_analytics').select('user_id, sheet_name, cards_learned, total_attempts, last_updated').range(from, to),
    ),
    fetchAll<EventRow>((from, to) =>
      voicecards
        .from('anonymous_events_real_users')
        .select('user_id, event_name, created_at, properties, session_id')
        .gte('created_at', eventFetchStartIso)
        .order('created_at', { ascending: true })
        .range(from, to),
    ),
    fetchVoicecardsBillingInfo().catch(error => {
      rememberGcpLoginRequired(error)
      log(`GCP billing info lookup failed: ${extractErrorMessage(error)}`)
      return null
    }),
    fetchVoicecardsGcpCostSummary(today).catch(error => {
      rememberGcpLoginRequired(error)
      log(`GCP cost lookup failed: ${extractErrorMessage(error)}`)
      return { error: simplifyGcpCostError(error) }
    }),
  ])

  log(`Loaded ${users.length} users, ${analytics.length} analytics rows, ${recentEvents.length} recent events`)

  // Filter: 가족 + 운영자 + 봇(테스트랩) 제외
  const excludedIds = new Set(
    users
      .filter(u => (u.nickname && EXCLUDED_NICKNAMES.has(u.nickname)) || isExcludedEmail(u.email))
      .map(u => u.user_id),
  )
  const externalUsers = users.filter(u => !excludedIds.has(u.user_id))
  const visibleIds = new Set(externalUsers.map(u => u.user_id))
  const userById = new Map(externalUsers.map(user => [user.user_id, user]))
  const topSheetsByUser = buildTopSheetsByUser(analytics, visibleIds)
  const visibleEvents = recentEvents.filter(
    event => !!event.user_id && visibleIds.has(event.user_id),
  ) as EventRow[]
  const eventsToday = visibleEvents.filter(event => isSameOrAfterIso(event.created_at, dayStartIso))
  const events24h = visibleEvents.filter(event => isSameOrAfterIso(event.created_at, last24hStartIso))
  const activityTodayByUser = buildActivityByUser(eventsToday)
  const eventSheetHintsByUser = new Map<string, string[]>()
  for (const event of visibleEvents) {
    if (!event.user_id) continue
    const sheetName = simplifySheetName(
      readStringProp(event.properties, 'sheet_name', 'sheet_title', 'deck_name', 'deck_title'),
    )
    if (!sheetName) continue
    const current = eventSheetHintsByUser.get(event.user_id) || []
    if (!current.includes(sheetName)) current.push(sheetName)
    eventSheetHintsByUser.set(event.user_id, current)
  }

  const userSheetNames = (userId: string) =>
    uniqueNonEmpty([
      ...(topSheetsByUser.get(userId) || []).map(sheet => sheet.name),
      ...(eventSheetHintsByUser.get(userId) || []),
    ]).slice(0, 4)

  const newSignups = externalUsers.filter(user => kstDateStr(new Date(user.created_at)) === today)
  const activatedNewUsers = newSignups.filter(user => isNewUserActivation(activityTodayByUser.get(user.user_id)))
  const paidUsers = externalUsers.filter(user => !!user.has_purchased)

  const purchaseEvents24h = events24h.filter(isPurchaseEvent)
  const purchaseUserIds24h = uniqueNonEmpty(purchaseEvents24h.map(event => event.user_id))
  const purchaseUsers24h = purchaseUserIds24h
    .map(userId => userById.get(userId))
    .filter((user): user is UserRow => !!user)

  const creditBannerTapUserIds = uniqueNonEmpty(
    events24h.filter(event => event.event_name === 'credit_banner_tapped').map(event => event.user_id),
  )
  const zeroBalanceUserIds = uniqueNonEmpty(
    events24h
      .filter(
        event =>
          event.event_name === 'credits_changed' && Number(event.properties?.balance_after ?? Number.NaN) === 0,
      )
      .map(event => event.user_id),
  )

  const errorEvents24h = events24h.filter(event => isErrorLikeEventName(event.event_name))
  const ttsErrorCount = errorEvents24h.filter(event => event.event_name === 'tts_synthesis_failed').length
  const aiGradeErrorCount = errorEvents24h.filter(event => event.event_name === 'ai_grade_client_fail').length
  const otherErrorCount = errorEvents24h.filter(
    event => event.event_name !== 'tts_synthesis_failed' && event.event_name !== 'ai_grade_client_fail',
  ).length
  const errorUserLabels = uniqueNonEmpty(
    errorEvents24h.map(event => {
      const user = event.user_id ? userById.get(event.user_id) : null
      return user ? shortUserLabel(user) : null
    }),
  )

  const rankedHeavyUsers = externalUsers
    .map(user => ({ user, snapshot: activityTodayByUser.get(user.user_id) }))
    .filter(
      (
        entry,
      ): entry is {
        user: UserRow
        snapshot: UserActivitySnapshot
      } => !!entry.snapshot && entry.snapshot.total > 0,
    )
    .sort((a, b) => {
      if (a.snapshot.total !== b.snapshot.total) return b.snapshot.total - a.snapshot.total
      return (b.snapshot.lastEventAt || '').localeCompare(a.snapshot.lastEventAt || '')
    })

  const heavyUsers = pickHeavyUsers({ ranked: rankedHeavyUsers, today })
  const heavyNumbers = ['①', '②']

  const buildHeavyLine = (user: UserRow, snapshot: UserActivitySnapshot): string => {
    const theme = inferStudyTheme(userSheetNames(user.user_id))
    const mode = inferModeLabel(snapshot)
    const isNewToday = kstDateStr(new Date(user.created_at)) === today
    const ttsPlayed = snapshot.counts.tts_played || 0
    const listenSessions = snapshot.counts.listen_session_started || 0
    const cardAttempts = snapshot.counts.card_attempted || 0
    const stt = snapshot.counts.stt_recording_started || 0
    const metrics: string[] = []

    if (ttsPlayed > 0) metrics.push(`tts_played ${ttsPlayed}회`)
    if (listenSessions > 0) metrics.push(`listen_session ${listenSessions}회`)
    if (cardAttempts > 0 && metrics.length < 2) metrics.push(`card_attempted ${cardAttempts}회`)
    if (stt > 0 && metrics.length < 2) metrics.push(`stt ${stt}회`)

    let tail = '비유료 상태, 전환 관찰.'
    if (user.has_purchased) tail = '유료 고객, 일일 루틴 안정적.'
    else if (purchaseUserIds24h.includes(user.user_id)) tail = '오늘 결제 전환 발생.'
    else if (isNewToday && zeroBalanceUserIds.includes(user.user_id)) tail = '첫날 고강도 진입, 잔액 0 도달로 전환 관찰.'
    else if (isNewToday) tail = '첫날 고강도 진입, 미전환.'
    else if (zeroBalanceUserIds.includes(user.user_id)) tail = '잔액 0 도달, 전환 관찰 필요.'
    else if (creditBannerTapUserIds.includes(user.user_id)) tail = '배너 탭 발생, 전환 관찰 필요.'

    const name = `${shortUserLabel(user)}${isNewToday ? ' (오늘 신규)' : ''}`
    const metricText = metrics.length > 0 ? `${metrics.join(', ')}.` : ''
    return `${name} — ${theme} ${mode} ${snapshot.total} 이벤트. ${metricText} ${tail}`.replace(/\s+/g, ' ').trim()
  }

  const signupSummaryLine =
    newSignups.length > 0
      ? `신규 ${newSignups.length}명 (${newSignups.map(fullUserLabel).join(', ')}).`
      : '신규 가입 없음.'

  let activationLine = '즉시 활성화 유저 없음.'
  if (newSignups.length > 0) {
    if (activatedNewUsers.length === newSignups.length) {
      activationLine = `${activatedNewUsers.length}/${newSignups.length} 즉시 활성화 — 카드 학습 또는 리슨 세션 진입.`
    } else if (activatedNewUsers.length > 0) {
      activationLine = `${activatedNewUsers.length}/${newSignups.length} 활성화 — 일부는 아직 학습/리슨 진입 전.`
    } else {
      activationLine = `0/${newSignups.length} 활성화 — 아직 학습/리슨 진입 없음.`
    }
  }

  const cohortThemes = uniqueNonEmpty(newSignups.map(user => inferStudyTheme(userSheetNames(user.user_id))))
  const cohortThemeLine =
    newSignups.length > 0
      ? `${
          cohortThemes.every(theme => /어학|어휘|영어|독일어|스페인어|러시아어|중국어|일본어|프랑스어|한국어|베트남어/.test(theme))
            ? '주제: 어학 중심'
            : '주제: 혼합'
        } (${cohortThemes.slice(0, 3).join(', ')}).`
      : '주제: 해당 없음.'

  const paidUserLabels = paidUsers.map(user => emailLocalPart(user.email) || shortUserLabel(user)).slice(0, 6)
  const paymentLine =
    purchaseUsers24h.length > 0
      ? `지난 24h 결제 ${purchaseUsers24h.length}건 (${purchaseUsers24h.map(user => shortUserLabel(user)).join(', ')}). 누적 유료 고객 ${paidUsers.length}명 (${formatUserList(paidUserLabels)}).`
      : `지난 24h 결제 없음. 누적 유료 고객 ${paidUsers.length}명 (${formatUserList(paidUserLabels)}).`

  let conversionLine = '크레딧 배너 탭 / 잔액 0 도달 유저 없음 — 근전환 신호 없음.'
  if (creditBannerTapUserIds.length > 0 || zeroBalanceUserIds.length > 0) {
    const tappedLabels = creditBannerTapUserIds
      .map(userId => userById.get(userId))
      .filter((user): user is UserRow => !!user)
      .map(shortUserLabel)
    const zeroLabels = zeroBalanceUserIds
      .map(userId => userById.get(userId))
      .filter((user): user is UserRow => !!user)
      .map(shortUserLabel)
    conversionLine = `크레딧 배너 탭 ${creditBannerTapUserIds.length}명${
      tappedLabels.length ? ` (${tappedLabels.join(', ')})` : ''
    }, 잔액 0 도달 ${zeroBalanceUserIds.length}명${zeroLabels.length ? ` (${zeroLabels.join(', ')})` : ''} — 전환 신호 관찰 필요.`
  }

  const errorLines: string[] = []
  if (errorEvents24h.length === 0) {
    errorLines.push('특이사항 없음 — tts_synthesis_failed, ai_grade_client_fail, 에러 이벤트 모두 0건.')
  } else {
    errorLines.push(
      `tts_synthesis_failed ${ttsErrorCount}건, ai_grade_client_fail ${aiGradeErrorCount}건${
        otherErrorCount > 0 ? `, 기타 error성 이벤트 ${otherErrorCount}건` : ''
      }.`,
    )
    if (errorUserLabels.length > 0) {
      errorLines.push(`영향 사용자: ${errorUserLabels.slice(0, 4).join(', ')}.`)
    }
  }

  const costLines: string[] = []
  if (gcpCostResult && 'todayTotal' in gcpCostResult) {
    costLines.push(
      `프로젝트 ${formatProjectDisplayName(voicecardsGcpProjectId)}. 오늘 누적 ${formatMoney(gcpCostResult.todayTotal, gcpCostResult.currency)}, 이달 누적 ${formatMoney(gcpCostResult.monthTotal, gcpCostResult.currency)}.`,
    )
    if (gcpCostResult.topServicesToday.length > 0) {
      costLines.push(
        `주요 서비스: ${gcpCostResult.topServicesToday
          .map(item => `${item.service} ${formatMoney(item.cost, gcpCostResult.currency)}`)
          .join(', ')}.`,
      )
    }
  } else if (gcpBillingInfo) {
    costLines.push(
      `프로젝트 ${formatProjectDisplayName(gcpBillingInfo.projectId)}. 결제 연결은 ${gcpBillingInfo.billingEnabled ? '활성화' : '비활성화'} 상태이고, ${
        voicecardsBillingTable ? '비용 조회에 실패했어요.' : 'billing export 대기중이라 실제 일별 비용은 아직 미집계예요.'
      }`,
    )
  } else if (gcpCostResult && 'error' in gcpCostResult) {
    costLines.push(`프로젝트 ${formatProjectDisplayName(voicecardsGcpProjectId)}. 비용 조회 실패 (${gcpCostResult.error}).`)
  } else {
    costLines.push(`프로젝트 ${formatProjectDisplayName(voicecardsGcpProjectId)}. 비용 데이터 없음.`)
  }

  const insightLine = (() => {
    const topNewHeavy = rankedHeavyUsers.find(entry => kstDateStr(new Date(entry.user.created_at)) === today)
    if (newSignups.length > 0 && topNewHeavy) {
      const theme = inferStudyTheme(userSheetNames(topNewHeavy.user.user_id))
      return `신규 ${newSignups.length}명 중 ${activatedNewUsers.length}명이 즉시 활성화됐고, ${shortUserLabel(topNewHeavy.user)}이 ${theme} 주제로 첫날 ${topNewHeavy.snapshot.total} 이벤트를 쌓아 전환 관찰 가치가 높아요.`
    }
    if (purchaseUsers24h.length > 0) {
      return `결제 전환이 실제 사용으로 바로 이어지는지, 오늘 결제 유저의 잔존 활동량을 계속 추적하면 좋아요.`
    }
    if (heavyUsers.length > 0) {
      const top = heavyUsers[0]
      return `${shortUserLabel(top.user)}의 ${top.snapshot.total} 이벤트가 오늘 사용량을 주도했고, 현재는 리슨 중심 반복 사용이 핵심 패턴이에요.`
    }
    return '오늘은 강한 사용 패턴이 약해, 신규 유입과 첫 학습 진입 여부를 계속 보는 편이 좋아요.'
  })()

  const lines: string[] = [
    `📊 VoiceCards 리포트 — ${formatKstReportTimestamp(now)} (${kstDayPart(now)})`,
    '',
    '📈 신규가입·코호트',
    signupSummaryLine,
    activationLine,
    cohortThemeLine,
    '',
    '💳 결제·전환',
    paymentLine,
    conversionLine,
    '',
    '⚠️ 로그·에러',
    ...errorLines,
    '',
    '🔥 헤비유저 디프',
  ]

  if (heavyUsers.length > 0) {
    heavyUsers.forEach((entry, index) => {
      lines.push(`${heavyNumbers[index] || `${index + 1}.`} ${buildHeavyLine(entry.user, entry.snapshot)}`)
    })
  } else {
    lines.push('강활성 유저 없음.')
  }

  lines.push('', '☁️ API 비용 모니터링', ...costLines, '', `🧭 오늘의 한 줄: ${insightLine}`)

  const message = lines.join('\n')
  log(`Structured report length: ${message.length}`)
  const outText = markdownToTelegramHtml(normalizeTelegramOutboundText(message))
  const parseMode = 'HTML'

  const chatId = await getCeoChatId()
  if (!chatId) {
    log('No CEO chat_id found — skip telegram send')
    console.log('---PREVIEW---')
    console.log(message)
    return
  }

  if (gcpLoginRequiredReason) {
    await maybeSendGcpLoginRequiredAlert(chatId, gcpLoginRequiredReason)
  } else {
    clearGcpLoginAlertState()
  }

  if (voicecardsAnalyticsPreview) {
    log('VOICECARDS_ANALYTICS_PREVIEW=1 → skip telegram send')
    console.log('---PREVIEW---')
    console.log(message)
    return
  }

  await sendTelegram(chatId, outText, parseMode)
  log(`Sent to chat_id ${chatId} (${parseMode})`)
}

main().catch(e => {
  console.error('[voicecards-analytics] FATAL:', e)
  process.exit(1)
})
