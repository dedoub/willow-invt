import { config } from 'dotenv'
config({ path: '.env.local' })

import fs from 'fs'
import path from 'path'
import { google, gmail_v1 } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { markdownToTelegramHtml, normalizeTelegramOutboundText, splitTelegramMessage } from './telegram-utils'

const LOG_PREFIX = '[gmail-summary-candidates]'
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_API = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : ''
const CONTEXTS = (process.env.GMAIL_SUMMARY_CONTEXTS || 'default,tensoftworks')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
const RANGE = process.env.GMAIL_SUMMARY_RANGE || '25h'
const MAX_PER_CONTEXT = Number(process.env.GMAIL_SUMMARY_MAX_PER_CONTEXT || 40)
const MAX_NOTIFY = Number(process.env.GMAIL_SUMMARY_MAX_NOTIFY || 8)
const STATE_PATH = path.join(process.cwd(), 'scripts/logs/gmail-summary-candidates.state.json')
const DRY_RUN = process.argv.includes('--dry-run')
const FORCE = process.argv.includes('--force')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

interface TokenData {
  access_token: string
  refresh_token: string
  token_expiry: string | null
  context: string
}

interface Candidate {
  id: string
  context: string
  dateMs: number
  from: string
  to: string
  subject: string
  snippet: string
  isSent: boolean
  attachmentNames: string[]
  reasons: string[]
  score: number
}

interface State {
  notifiedIds: string[]
  updatedAt?: string
}

function log(msg: string) {
  console.log(`${LOG_PREFIX} [${new Date().toISOString()}] ${msg}`)
}

function getOAuth2Client(context: string = 'default') {
  const creds = context === 'tensoftworks'
    ? { id: process.env.GOOGLE_CLIENT_ID_TENSW, secret: process.env.GOOGLE_CLIENT_SECRET_TENSW, label: 'TENSW' }
    : context === 'personal'
      ? { id: process.env.GOOGLE_CLIENT_ID_PERSONAL, secret: process.env.GOOGLE_CLIENT_SECRET_PERSONAL, label: 'PERSONAL' }
      : { id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET, label: 'DEFAULT' }

  if (!creds.id || !creds.secret) {
    throw new Error(`Missing Google OAuth credentials for Gmail context=${context} (${creds.label})`)
  }

  return new google.auth.OAuth2(creds.id, creds.secret, process.env.GOOGLE_REDIRECT_URI)
}

async function getGmailClient(context: string = 'default') {
  const { data, error } = await supabase
    .from('gmail_tokens')
    .select('*')
    .eq('context', context)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) {
    log(`${context} 토큰 없음: ${error?.message || 'not found'}`)
    return null
  }

  const token = data as TokenData
  const oauth2Client = getOAuth2Client(context)
  oauth2Client.setCredentials({
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expiry_date: token.token_expiry ? new Date(token.token_expiry).getTime() : undefined,
  })

  const expiryTime = token.token_expiry ? new Date(token.token_expiry).getTime() : 0
  if (expiryTime < Date.now() + 5 * 60 * 1000) {
    const { credentials } = await oauth2Client.refreshAccessToken()
    oauth2Client.setCredentials(credentials)

    await supabase
      .from('gmail_tokens')
      .update({
        access_token: credentials.access_token,
        refresh_token: credentials.refresh_token || token.refresh_token,
        token_expiry: credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', data.user_id)
      .eq('context', context)
  }

  return google.gmail({ version: 'v1', auth: oauth2Client })
}

function readState(): State {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) as State
  } catch {
    return { notifiedIds: [] }
  }
}

function writeState(state: State) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true })
  fs.writeFileSync(STATE_PATH, JSON.stringify({
    notifiedIds: [...new Set(state.notifiedIds)].slice(-300),
    updatedAt: new Date().toISOString(),
  }, null, 2))
}

function headerValue(headers: Array<{ name?: string | null; value?: string | null }> | undefined, name: string): string {
  return headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || ''
}

function collectAttachmentNames(part: gmail_v1.Schema$MessagePart | undefined): string[] {
  const names: string[] = []
  const visit = (node: gmail_v1.Schema$MessagePart | undefined) => {
    if (!node) return
    if (node.filename) names.push(String(node.filename))
    for (const child of node.parts || []) visit(child)
  }
  visit(part)
  return names
}

function cleanAddress(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function looksAutomated(from: string, subject: string): boolean {
  const text = `${from} ${subject}`.toLowerCase()
  return [
    'no-reply',
    'noreply',
    'notification',
    'newsletter',
    'google alerts',
    'calendar-notification',
    'github',
    'linkedin',
    'tensw todo',
    'vercel',
  ].some(token => text.includes(token))
}

function scoreCandidate(input: {
  from: string
  subject: string
  snippet: string
  labels: string[]
  attachmentNames: string[]
}): { score: number; reasons: string[] } {
  const reasons: string[] = []
  let score = 0
  const text = `${input.subject} ${input.snippet}`.toLowerCase()

  if (input.attachmentNames.length > 0) {
    score += 3
    reasons.push(`첨부 ${input.attachmentNames.length}개`)
  }

  if (input.attachmentNames.some(name => /\.(pdf|docx?|xlsx?|pptx?|csv)$/i.test(name))) {
    score += 2
    reasons.push('문서 첨부')
  }

  const keywordGroups: Array<[RegExp, string, number]> = [
    [/(proposal|pricing|fee|portfolio management|quote|estimate|견적|제안|수수료|보수)/i, '제안/비용 키워드', 4],
    [/(contract|agreement|msa|nda|계약|약정)/i, '계약 키워드', 4],
    [/(invoice|tax invoice|receipt|payment|세금계산서|청구|입금|영수증)/i, '청구/정산 키워드', 4],
    [/(questionnaire|request|action required|확인 요청|요청|질문지)/i, '요청/확인 키워드', 3],
    [/(timefolio|garrett|etc|akros|tensw|skku|타임폴리오|아크로스|텐소프트웍스|성균관)/i, '사업 관련 키워드', 2],
  ]

  for (const [pattern, reason, points] of keywordGroups) {
    if (pattern.test(text)) {
      score += points
      reasons.push(reason)
    }
  }

  if (input.labels.includes('IMPORTANT')) {
    score += 2
    reasons.push('중요 표시')
  }
  if (input.labels.includes('UNREAD')) {
    score += 1
    reasons.push('미읽음')
  }

  if (looksAutomated(input.from, input.subject)) {
    score -= 5
    reasons.push('자동메일 가능성')
  }

  return { score, reasons: [...new Set(reasons)] }
}

async function getCandidatesForContext(context: string): Promise<Candidate[]> {
  const gmail = await getGmailClient(context)
  if (!gmail) return []

  const res = await gmail.users.messages.list({
    userId: 'me',
    q: `newer_than:${RANGE} {in:inbox in:sent}`,
    maxResults: MAX_PER_CONTEXT,
  })

  const messages = res.data.messages || []
  const candidates: Candidate[] = []

  for (const msg of messages) {
    if (!msg.id) continue

    const detail = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id,
      format: 'full',
      metadataHeaders: ['From', 'To', 'Subject', 'Date'],
    })

    const headers = detail.data.payload?.headers || []
    const from = cleanAddress(headerValue(headers, 'From'))
    const to = cleanAddress(headerValue(headers, 'To'))
    const subject = headerValue(headers, 'Subject') || '(제목 없음)'
    const date = headerValue(headers, 'Date')
    const labelIds = detail.data.labelIds || []
    const attachmentNames = collectAttachmentNames(detail.data.payload)
    const { score, reasons } = scoreCandidate({
      from,
      subject,
      snippet: detail.data.snippet || '',
      labels: labelIds,
      attachmentNames,
    })

    if (score < 3) continue

    candidates.push({
      id: `${context}:${msg.id}`,
      context,
      dateMs: date ? new Date(date).getTime() : Number(detail.data.internalDate || Date.now()),
      from,
      to,
      subject,
      snippet: detail.data.snippet || '',
      isSent: labelIds.includes('SENT'),
      attachmentNames,
      reasons,
      score,
    })
  }

  return candidates
}

function contextLabel(context: string): string {
  if (context === 'tensoftworks') return 'TENSW'
  if (context === 'personal') return '개인'
  return 'Willow'
}

function formatKst(dateMs: number): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(dateMs))
}

function shortText(text: string, max = 90): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max - 1)}…`
}

function formatCandidateList(candidates: Candidate[]): string {
  const lines = candidates.map((candidate, idx) => {
    const direction = candidate.isSent ? '보낸메일' : '받은메일'
    const counterparty = candidate.isSent ? candidate.to : candidate.from
    const attachment = candidate.attachmentNames.length > 0
      ? `\n   첨부: ${shortText(candidate.attachmentNames.join(', '), 120)}`
      : ''
    return `${idx + 1}. [${contextLabel(candidate.context)} · ${direction}] ${shortText(candidate.subject, 80)}
   ${formatKst(candidate.dateMs)} · ${shortText(counterparty, 90)}
   이유: ${candidate.reasons.filter(r => r !== '자동메일 가능성').slice(0, 3).join(', ') || '정리 후보'}${attachment}`
  })

  return `📬 이메일 정리 후보 ${candidates.length}건

윌리가 최근 ${RANGE} 메일을 훑어서 정리할 만한 것만 추렸어요. 어느 걸 정리할까요? 번호나 제목으로 찍어주세요.

${lines.join('\n\n')}`
}

async function getCeoChatId(): Promise<number | null> {
  const { data } = await supabase
    .from('telegram_conversations')
    .select('chat_id')
    .eq('bot_type', 'ceo')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data?.chat_id ?? null
}

async function sendTelegramMessage(chatId: number, text: string) {
  if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is not set')

  const normalized = normalizeTelegramOutboundText(text)
  const chunks = splitTelegramMessage(normalized, 4000)

  for (const chunk of chunks) {
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: markdownToTelegramHtml(chunk), parse_mode: 'HTML' }),
    })

    if (!res.ok) {
      log(`Telegram HTML send failed: ${res.status}`)
      await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: chunk }),
      })
    }
  }
}

async function main() {
  log(`start contexts=${CONTEXTS.join(',')} range=${RANGE} dryRun=${DRY_RUN}`)

  const state = readState()
  const notified = new Set(state.notifiedIds)
  const allCandidates: Candidate[] = []

  for (const context of CONTEXTS) {
    const candidates = await getCandidatesForContext(context)
    log(`${context}: candidates=${candidates.length}`)
    allCandidates.push(...candidates)
  }

  const freshCandidates = allCandidates
    .filter(candidate => FORCE || !notified.has(candidate.id))
    .sort((a, b) => b.score - a.score || b.dateMs - a.dateMs)
    .slice(0, MAX_NOTIFY)

  if (freshCandidates.length === 0) {
    log('no fresh candidates')
    return
  }

  const message = formatCandidateList(freshCandidates)
  if (DRY_RUN) {
    console.log(message)
    return
  }

  const chatId = await getCeoChatId()
  if (!chatId) throw new Error('CEO chat_id not found')

  await sendTelegramMessage(chatId, message)
  writeState({ notifiedIds: [...state.notifiedIds, ...freshCandidates.map(candidate => candidate.id)] })
  log(`sent candidates=${freshCandidates.length}`)
}

main().catch(err => {
  console.error(`${LOG_PREFIX} failed`, err)
  process.exit(1)
})
