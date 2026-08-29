import { config } from 'dotenv'
config({ path: '.env.local' })

import { google, type gmail_v1 } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { runAgent } from './lib/agent-cli'
import { markdownToTelegramHtml, normalizeTelegramOutboundText, splitTelegramMessage } from './telegram-utils'
import os from 'os'

// ============================================================
// Gmail Auto-Labeler — Claude가 이메일을 읽고 자동 라벨 분류
// ============================================================
// 매시간 실행
// 1. Gmail에서 최근 미분류 이메일 조회
// 2. Claude CLI로 이메일 분류
// 3. Gmail API로 라벨 적용
// ============================================================

const LOG_PREFIX = '[gmail-auto-label]'
// --dry-run: 분류까지만 하고 라벨을 붙이지도, 알림을 보내지도 않는다. 요약 문구를
// 실제 메일로 확인하려면 이게 없으면 CEO 텔레그램에 시험 발송이 그대로 간다.
const DRY_RUN = process.argv.includes('--dry-run')
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

function log(msg: string) {
  console.log(`${LOG_PREFIX} [${new Date().toISOString()}] ${msg}`)
}

// ============================================================
// Gmail 클라이언트 (스크립트용 — 쿠키 없이 DB에서 직접 토큰 조회)
// ============================================================
interface TokenData {
  access_token: string
  refresh_token: string
  token_expiry: string | null
  context: string
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

  return new google.auth.OAuth2(
    creds.id,
    creds.secret,
    process.env.GOOGLE_REDIRECT_URI
  )
}

async function getGmailClientForScript(context: string = 'default') {
  // DB에서 토큰 직접 조회 (가장 최근 토큰 사용)
  const { data, error } = await supabase
    .from('gmail_tokens')
    .select('*')
    .eq('context', context)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) {
    log(`❌ ${context} 컨텍스트 토큰 없음: ${error?.message}`)
    return null
  }

  const token = data as TokenData
  const oauth2Client = getOAuth2Client(context)
  oauth2Client.setCredentials({
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expiry_date: token.token_expiry ? new Date(token.token_expiry).getTime() : undefined,
  })

  // 토큰 만료 임박 시 갱신
  const expiryTime = token.token_expiry ? new Date(token.token_expiry).getTime() : 0
  if (expiryTime < Date.now() + 5 * 60 * 1000) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken()
      oauth2Client.setCredentials(credentials)

      // DB에 갱신된 토큰 저장
      await supabase
        .from('gmail_tokens')
        .update({
          access_token: credentials.access_token,
          refresh_token: credentials.refresh_token || token.refresh_token,
          token_expiry: credentials.expiry_date
            ? new Date(credentials.expiry_date).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', data.user_id)
        .eq('context', context)

      log(`🔄 ${context} 토큰 갱신 완료`)
    } catch (err) {
      log(`⚠️ ${context} 토큰 갱신 실패: ${err}`)
      return null
    }
  }

  return google.gmail({ version: 'v1', auth: oauth2Client })
}

// ============================================================
// Gmail 라벨 조회
// ============================================================
interface LabelInfo {
  id: string
  name: string
}

async function getUserLabels(gmail: ReturnType<typeof google.gmail>): Promise<LabelInfo[]> {
  const res = await gmail.users.labels.list({ userId: 'me' })
  const labels = res.data.labels || []
  return labels
    .filter(l => l.type === 'user' && l.id && l.name)
    .map(l => ({ id: l.id!, name: l.name! }))
}

// ============================================================
// 미분류 이메일 조회
// ============================================================
interface EmailSummary {
  id: string
  from: string
  to: string
  subject: string
  snippet: string
  labels: string[]
  body: string
  threadId: string
  internalDate: string
  isSent: boolean
}

async function getUnlabeledEmails(gmail: ReturnType<typeof google.gmail>, maxResults = 30): Promise<EmailSummary[]> {
  // 최근 2시간 이내 + 받은/보낸 이메일 중 미분류
  const res = await gmail.users.messages.list({
    userId: 'me',
    q: 'newer_than:25h {in:inbox in:sent} -label:Akros -label:ETC -label:Willow',
    maxResults,
  })

  const messages = res.data.messages || []
  if (messages.length === 0) return []

  const emails: EmailSummary[] = []
  for (const msg of messages) {
    if (!msg.id) continue

    const detail = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id,
      format: 'metadata',
      metadataHeaders: ['From', 'To', 'Subject'],
    })

    const headers = detail.data.payload?.headers || []
    const from = headers.find(h => h.name === 'From')?.value || ''
    const to = headers.find(h => h.name === 'To')?.value || ''
    const subject = headers.find(h => h.name === 'Subject')?.value || ''
    const labelIds = detail.data.labelIds || []
    const isSent = labelIds.includes('SENT')

    emails.push({
      id: msg.id,
      from,
      to,
      subject,
      snippet: detail.data.snippet || '',
      labels: labelIds,
      isSent,
    })
  }

  return emails
}

// ============================================================
// Claude CLI로 이메일 분류
// ============================================================
interface ClassificationResult {
  email_id: string
  label: string | null
  reason: string
  /** 메일이 무슨 말을 하는지 한 줄. CEO 봇 알림에 그대로 실린다. */
  summary?: string
  /** 상대가 답을 기다리는가. 미회신 팔로업이 이 값으로 스레드를 고른다. */
  requires_reply?: boolean
  /** High | Medium | Low — 팔로업 우선순위로 옮겨진다. */
  priority?: string
  /** 이 메일이 남기는 할 일. email_todos 로 쌓여 기한 팔로업이 된다. */
  action_items?: string[]
}

/** 본문 글자 수 상한. 프롬프트가 불어나면 분류까지 느려진다. */
const BODY_CHARS = 1200

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
}

/**
 * 메일 본문을 평문으로 뽑는다. text/plain 을 먼저 찾고 없으면 HTML 에서 태그를 벗긴다.
 *
 * 스니펫만으로는 "무슨 메일인지"까지밖에 안 된다 — 첫 200자는 대개 인사말이라
 * 요약이 제목을 되풀이하는 데서 끝난다. 본문을 봐야 요청·기한·금액이 잡힌다.
 */
function extractBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return ''

  const collect = (part: gmail_v1.Schema$MessagePart, mime: string): string[] => {
    const out: string[] = []
    if (part.mimeType === mime && part.body?.data) out.push(decodeBase64Url(part.body.data))
    for (const child of part.parts || []) out.push(...collect(child, mime))
    return out
  }

  const plain = collect(payload, 'text/plain').join('\n').trim()
  const raw = plain || collect(payload, 'text/html').join('\n')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')

  // 인용부(> ...)와 서명 아래는 요약에 도움이 안 되면서 자리만 차지한다.
  const trimmed = raw
    .split(/^-{2,}\s*$|^________+$/m)[0]
    .split('\n')
    .filter(line => !/^\s*>/.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()

  return trimmed.length > BODY_CHARS ? `${trimmed.slice(0, BODY_CHARS)}…` : trimmed
}

function askClaude(prompt: string): Promise<string> {
  return runAgent(prompt, {
    cwd: os.tmpdir(),
    // Codex로 옮기면서 model 옵션은 일단 wrapper 기본값에 위임 (codex config.toml에 정의됨)
    timeoutMs: 5 * 60 * 1000,
    backend: 'codex',
  })
}

async function classifyEmails(emails: EmailSummary[], labels: LabelInfo[]): Promise<ClassificationResult[]> {
  if (emails.length === 0) return []

  const labelList = labels.map(l => l.name).join(', ')
  const emailList = emails.map((e, i) => {
    const direction = e.isSent ? '[보낸메일]' : '[받은메일]'
    const counterpart = e.isSent ? `to: ${e.to}` : `from: ${e.from}`
    const body = e.body || e.snippet
    return `[${i + 1}] ${direction} id: ${e.id}\n    ${counterpart}\n    subject: ${e.subject}\n    body:\n${body.split('\n').map(l => `      ${l}`).join('\n')}`
  }).join('\n\n')

  const prompt = `당신은 이메일 분류 전문가입니다. 아래 이메일들을 적절한 라벨로 분류하고, 각 메일이 무슨 말을 하는지 한 줄로 정리해주세요.

## 사용 가능한 라벨
${labelList}

## 라벨 분류 기준
- **Akros**: 아크로스자산운용 관련 (ETF 운용, KRX, 한국거래소, AP/LP 업무)
  - Akros/PR지원: PR, 홍보, 언론 관련
  - Akros/미국ETF: 미국 ETF, US-listed ETF 관련
- **ETC**: 기타 금융사 업무
  - ETC/Fee: 수수료, 보수 관련
  - ETC/Kiwoom: 키움증권 관련
  - ETC/Hanwha: 한화자산운용 관련
  - ETC/Assetplus: 에셋플러스 관련
  - ETC/New Clients: 신규 고객사/파트너 제안
  - ETC/Core16: Core16 관련
  - KDEF, BOBP 관련 이메일(AUM 업데이트 등)은 ETC로 분류
- **Willow**: 윌로우인베스트먼트 내부 업무 (회사 운영, 경영, 인사)
- **ETC - Archive**: 종료된 프로젝트 (Fount ETFs, Toss, KPOP ETF 등)
  - ETC - Archive/Fount ETFs: Fount/파운트 관련
  - ETC - Archive/Toss: 토스 관련
  - ETC - Archive/Akros: 아크로스 아카이브
  - ETC - Archive/KPOP ETF: KPOP ETF 관련

## 분류 규칙
1. 가장 구체적인 하위 라벨을 우선 선택 (예: "Akros" 보다 "Akros/PR지원")
2. 어떤 라벨에도 해당하지 않는 일반 이메일(뉴스레터, 광고, 알림)은 null
3. 확신이 낮으면 null (잘못된 라벨보다 미분류가 나음)

## 함께 판단할 것
라벨과 별개로, 이 메일이 나중에 챙겨야 할 일을 남기는지 본다. CEO 봇이 이 값으로 미회신·기한 팔로업을 만든다.
- requires_reply: 상대가 내 답을 기다리면 true. 통지·뉴스레터·영수증처럼 답이 필요 없으면 false. 내가 보낸 메일(보낸메일)은 항상 false.
- priority: High(기한이 임박하거나 돈·계약이 걸림) / Medium(업무상 필요) / Low(참고).
- action_items: 이 메일 때문에 내가 해야 할 일. 한 건당 한 줄, 기한이 있으면 문장에 넣는다. 없으면 빈 배열.

## 요약(summary) 작성 기준
CEO가 아침에 이 줄만 읽고 무슨 일이 있었는지 알아야 한다. 제목을 다시 쓰지 말고 본문에서 실제로 무엇을 요구·통지하는지 적는다.
1. 한국어 평서문 한 줄, 80자 이내. 인사말·서명은 버린다.
2. 기한·금액·수량·일정처럼 행동을 정하는 숫자는 반드시 남긴다 (예: "9/5까지", "1,200만원").
3. 회신·서명·자료 제출처럼 CEO가 해야 할 일이 있으면 그것으로 끝맺는다.
4. 광고·뉴스레터는 한 줄로 무엇을 파는/알리는 메일인지만.

## 이메일 목록
${emailList}

## 출력 형식
순수 JSON 배열만 출력하세요. 설명 텍스트 없이:
[
  {"email_id": "...", "label": "Akros/PR지원", "reason": "아크로스 PR 관련 이메일", "summary": "9/5 상장 기념 보도자료 초안 검토를 요청, 회신 필요.", "requires_reply": true, "priority": "High", "action_items": ["9/5까지 보도자료 초안 검토 회신"]},
  {"email_id": "...", "label": null, "reason": "일반 뉴스레터", "summary": "주간 ETF 시장 동향 뉴스레터.", "requires_reply": false, "priority": "Low", "action_items": []}
]`

  try {
    const result = await askClaude(prompt)

    // JSON 배열 추출 — bracket 매칭으로 정확한 범위 추출
    let json: ClassificationResult[] | null = null
    const startIdx = result.indexOf('[')
    if (startIdx !== -1) {
      let depth = 0
      for (let i = startIdx; i < result.length; i++) {
        if (result[i] === '[') depth++
        else if (result[i] === ']') depth--
        if (depth === 0) {
          try {
            json = JSON.parse(result.slice(startIdx, i + 1))
          } catch {
            // bracket 매칭 실패 시 다음 시도
          }
          break
        }
      }
    }

    // fallback: 기존 regex (non-greedy)
    if (!json) {
      const jsonMatch = result.match(/\[[\s\S]*?\](?=\s*$|\s*[^,\s{])/)
      if (jsonMatch) {
        try {
          json = JSON.parse(jsonMatch[0])
        } catch { /* ignore */ }
      }
    }

    if (!json) {
      log('⚠️ 분류 결과에서 JSON을 찾을 수 없음')
      log(`  원본 (처음 500자): ${result.slice(0, 500)}`)
      return []
    }

    return json.filter(c => c.email_id)
  } catch (err) {
    log(`⚠️ 이메일 분류 실패: ${err}`)
    return []
  }
}

// ============================================================
// 분석 결과 적재 — 여기서 쌓인 것이 CEO 봇의 팔로업 재료가 된다
// ============================================================
// telegram-bot.ts 의 scanAutoFollowUps 가 30분마다 email_metadata·email_todos 를
// 읽어 미회신 스레드와 기한 지난 할 일을 agent_follow_ups 로 올린다. 그 엔진은
// 계속 돌고 있었는데 email_metadata 가 2026-04-26 이후로 비어 있었다 — 유일한
// 적재 경로가 브라우저 로그인이 필요한 /api/gmail/ingest 였고 아무도 부르지
// 않았다. 아침 분류가 이미 본문까지 읽으므로, 여기서 같이 남긴다.
const ANALYSIS_USER_ID = process.env.GMAIL_ANALYSIS_USER_ID || 'dw.kim@willowinvt.com'

function normalisePriority(value: string | undefined): string {
  const v = (value || '').toLowerCase()
  if (v.startsWith('h') || v === 'critical') return 'High'
  if (v.startsWith('l')) return 'Low'
  return 'Medium'
}

async function saveAnalysis(emails: EmailSummary[], classifications: ClassificationResult[]) {
  if (emails.length === 0) return { metadata: 0, todos: 0 }
  if (DRY_RUN) {
    const c = classifications.filter(x => x.action_items?.length)
    return { metadata: emails.length, todos: c.reduce((n, x) => n + (x.action_items?.length || 0), 0) }
  }
  const byId = new Map(classifications.map(c => [c.email_id, c]))

  // gmail_message_id 에 유니크 제약이 없다(현재 589개 중 중복 83). upsert 로 맡기면
  // 행이 늘기만 하므로, 이미 있는 건 건너뛰고 없는 것만 넣는다.
  const ids = emails.map(e => e.id)
  const { data: existing } = await supabase
    .from('email_metadata')
    .select('gmail_message_id')
    .in('gmail_message_id', ids)
  const known = new Set((existing || []).map(r => r.gmail_message_id))

  const now = new Date().toISOString()
  const rows = emails.filter(e => !known.has(e.id)).map(e => {
    const c = byId.get(e.id)
    // 보낸메일은 요약하지 않는다. 미회신 판정에 "내가 답했다"는 사실만 있으면 되고,
    // 그 한 줄을 위해 AI를 부르면 매일 값을 두 배로 치른다.
    return {
      user_id: ANALYSIS_USER_ID,
      gmail_message_id: e.id,
      gmail_thread_id: e.threadId,
      subject: e.subject || '(제목 없음)',
      from_email: e.from,
      from_name: cleanName(e.from),
      to_email: e.to,
      date: new Date(Number(e.internalDate) || Date.now()).toISOString(),
      direction: e.isSent ? 'outbound' : 'inbound',
      gmail_labels: e.labels,
      summary: e.isSent ? (e.subject || '') : (c?.summary || e.snippet || ''),
      requires_reply: e.isSent ? false : Boolean(c?.requires_reply),
      priority: normalisePriority(c?.priority),
      action_items: (c?.action_items || []).map(task => ({ task })),
      category: c?.label || null,
      is_analyzed: true,
      analyzed_at: now,
      trigger_source: 'auto-label',
    }
  })

  let metadata = 0
  if (rows.length > 0) {
    const { error } = await supabase.from('email_metadata').insert(rows)
    if (error) log(`  ⚠️ email_metadata 적재 실패: ${error.message}`)
    else metadata = rows.length
  }

  // 할 일은 따로 쌓는다 — 기한 팔로업이 email_todos 를 본다.
  const todoRows = emails.flatMap(e => {
    if (e.isSent || known.has(e.id)) return []
    const c = byId.get(e.id)
    return (c?.action_items || []).filter(t => t && t.trim()).map(task => ({
      user_id: ANALYSIS_USER_ID,
      label: c?.label || 'Uncategorized',
      category: c?.label || 'Uncategorized',
      task: task.trim().slice(0, 300),
      priority: normalisePriority(c?.priority).toLowerCase(),
      related_email_ids: [e.id],
      completed: false,
    }))
  })

  let todos = 0
  if (todoRows.length > 0) {
    const { error } = await supabase.from('email_todos').insert(todoRows)
    if (error) log(`  ⚠️ email_todos 적재 실패: ${error.message}`)
    else todos = todoRows.length
  }

  return { metadata, todos }
}

// ============================================================
// 라벨 적용
// ============================================================
async function applyLabels(
  gmail: ReturnType<typeof google.gmail>,
  classifications: ClassificationResult[],
  labels: LabelInfo[]
): Promise<number> {
  let applied = 0
  const labelMap = new Map(labels.map(l => [l.name, l.id]))

  for (const cls of classifications) {
    if (!cls.label || !cls.email_id) continue

    const labelId = labelMap.get(cls.label)
    if (!labelId) {
      log(`⚠️ 라벨 "${cls.label}" ID를 찾을 수 없음 — 스킵`)
      continue
    }

    try {
      await gmail.users.messages.modify({
        userId: 'me',
        id: cls.email_id,
        requestBody: {
          addLabelIds: [labelId],
        },
      })
      applied++
      log(`  ✅ ${cls.email_id} → ${cls.label} (${cls.reason})`)
    } catch (err) {
      log(`  ❌ ${cls.email_id} 라벨 적용 실패: ${err}`)
    }
  }

  return applied
}

// ============================================================
// 텔레그램 알림 (분류 결과 요약)
// ============================================================
/** "이름 <주소>" 에서 사람이 읽는 쪽만. 없으면 주소의 앞부분. */
function cleanName(address: string): string {
  const named = address.match(/^\s*"?([^"<]+?)"?\s*</)
  if (named) return named[1].trim()
  return address.replace(/[<>]/g, '').split('@')[0].trim() || address.trim()
}

async function sendTelegramNotification(
  results: ClassificationResult[],
  applied: number,
  emails: Map<string, EmailSummary>,
) {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
  if (!BOT_TOKEN && !DRY_RUN) return

  const labeled = results.filter(r => r.label)
  if (labeled.length === 0) return // 분류된 것 없으면 알림 불필요

  const { data } = await supabase
    .from('telegram_conversations')
    .select('chat_id')
    .eq('bot_type', 'ceo')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data?.chat_id && !DRY_RUN) return

  // 라벨별로 묶는다. 같은 건이 흩어져 있으면 아침에 훑기 어렵다.
  const byLabel = new Map<string, ClassificationResult[]>()
  for (const r of labeled) {
    const key = r.label!
    if (!byLabel.has(key)) byLabel.set(key, [])
    byLabel.get(key)!.push(r)
  }

  const sections = [...byLabel.entries()].map(([label, rows]) => {
    const items = rows.map(r => {
      const mail = emails.get(r.email_id)
      const who = mail ? (mail.isSent ? `→ ${cleanName(mail.to)}` : cleanName(mail.from)) : ''
      const subject = mail?.subject || '(제목 없음)'
      const head = who ? `· ${who} — ${subject}` : `· ${subject}`
      // 요약이 없으면(모델이 빠뜨렸거나 옛 형식) 분류 근거라도 보여 준다.
      const detail = (r.summary || r.reason || '').trim()
      return detail ? `${head}\n  ${detail}` : head
    }).join('\n')
    return `🏷️ ${label}\n${items}`
  }).join('\n\n')

  const text = normalizeTelegramOutboundText(`📧 아침 이메일 정리 (${applied}건)\n\n${sections}`)

  if (DRY_RUN) {
    log('🧪 dry-run — 아래 내용을 보내지 않았어요.\n')
    console.log(text)
    return
  }

  // 본문 요약이 붙으면 한 통에 안 들어가는 날이 있다.
  for (const chunk of splitTelegramMessage(text)) {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: data.chat_id, text: markdownToTelegramHtml(chunk), parse_mode: 'HTML' }),
    })
  }
}

// ============================================================
// 컨텍스트별 라벨 분류 실행
// ============================================================
async function processContext(context: string, excludeLabels: string[]): Promise<{ applied: number; classifications: ClassificationResult[]; emails: EmailSummary[] }> {
  log(`\n📧 [${context}] 컨텍스트 처리 시작`)

  const gmail = await getGmailClientForScript(context)
  if (!gmail) {
    log(`  ⚠️ [${context}] Gmail 클라이언트 생성 실패 — 스킵`)
    return { applied: 0, classifications: [], emails: [] }
  }

  // 1. 라벨 목록 조회
  const labels = await getUserLabels(gmail)
  log(`  📋 사용 가능한 라벨: ${labels.length}개`)

  // 2. 최근 메일 조회 — 라벨이 붙은 것까지 포함한다.
  //
  // 라벨 붙은 메일을 빼면 내가 보낸 답장이 기록에서 사라지고, 미회신 판정이
  // "아직 답 안 했다"로 잘못 남는다. 라벨을 붙일 대상은 아래에서 따로 가린다.
  const res = await gmail.users.messages.list({
    userId: 'me',
    q: `newer_than:${process.env.GMAIL_LABEL_RANGE || '25h'} {in:inbox in:sent}`,
    maxResults: 50,
  })

  const messages = res.data.messages || []
  if (messages.length === 0) {
    log(`  ✅ 분류할 이메일 없음`)
    return { applied: 0, classifications: [], emails: [] }
  }

  const emails: EmailSummary[] = []
  for (const msg of messages) {
    if (!msg.id) continue
    // format: 'full' — 요청 수는 metadata 때와 같고 본문만 더 받는다. 요약이 제목의
    // 되풀이가 되지 않으려면 본문이 있어야 한다.
    const detail = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id,
      format: 'full',
    })
    const headers = detail.data.payload?.headers || []
    const from = headers.find(h => h.name === 'From')?.value || ''
    const to = headers.find(h => h.name === 'To')?.value || ''
    const subject = headers.find(h => h.name === 'Subject')?.value || ''
    const labelIds = detail.data.labelIds || []
    const isSent = labelIds.includes('SENT')
    emails.push({
      id: msg.id, from, to, subject,
      snippet: detail.data.snippet || '',
      body: extractBody(detail.data.payload),
      labels: labelIds, isSent,
      threadId: detail.data.threadId || msg.id,
      internalDate: detail.data.internalDate || '',
    })
  }

  // 자동 발송 메일 제외 (분류 불필요)
  const skipSenders = ['TENSW Todo']
  const filtered = emails.filter(e => !skipSenders.some(s => e.from.includes(s)))
  if (filtered.length < emails.length) {
    log(`  🚫 자동 발송 메일 ${emails.length - filtered.length}건 제외 (${skipSenders.join(', ')})`)
  }
  const emailsToClassify = filtered

  // 이미 우리 라벨이 붙은 메일은 다시 붙일 게 없다. 다만 기록에는 남긴다.
  const labelNameById = new Map(labels.map(l => [l.id, l.name]))
  const alreadyLabeled = (e: EmailSummary) => e.labels.some(id => {
    const name = labelNameById.get(id)
    return !!name && excludeLabels.some(prefix => name === prefix || name.startsWith(`${prefix}/`))
  })

  // AI는 받은메일에만 쓴다. 보낸메일은 "내가 답했다"는 사실만 있으면 되고,
  // 그 한 줄에 값을 치를 이유가 없다.
  const toAnalyse = emailsToClassify.filter(e => !e.isSent)
  log(`  📨 최근 메일 ${emailsToClassify.length}건 (분석 대상 ${toAnalyse.length}건)`)

  // 3. 분류 + 내용 정리
  log(`  🤖 이메일 분류 중...`)
  const classifications = await classifyEmails(toAnalyse, labels)

  // 4. 분석 결과 적재 — 팔로업 엔진이 읽을 자리
  const saved = await saveAnalysis(emailsToClassify, classifications)
  log(`  🗂️ 기록: 메일 ${saved.metadata}건, 할 일 ${saved.todos}건`)

  // 라벨은 아직 안 붙은 것에만
  const needsLabel = new Set(emailsToClassify.filter(e => !alreadyLabeled(e)).map(e => e.id))
  const labelTargets = classifications.filter(c => c.label && needsLabel.has(c.email_id))
  const toLabel = labelTargets
  log(`  📊 분류 결과: ${toLabel.length}건 라벨 할당`)

  if (toLabel.length === 0) {
    return { applied: 0, classifications: labelTargets, emails: emailsToClassify }
  }

  // 4. 라벨 적용
  if (DRY_RUN) {
    log(`  🧪 dry-run — 라벨 ${toLabel.length}건을 붙이지 않았어요.`)
    return { applied: toLabel.length, classifications: labelTargets, emails: emailsToClassify }
  }
  log(`  🏷️ 라벨 적용 중...`)
  const applied = await applyLabels(gmail, labelTargets, labels)
  log(`  ✅ ${applied}건 라벨 적용 완료`)

  return { applied, classifications: labelTargets, emails: emailsToClassify }
}

// ============================================================
// Main
// ============================================================
async function main() {
  log('📧 Gmail 자동 라벨 분류 시작 (multi-context)')

  let totalApplied = 0
  let allClassifications: ClassificationResult[] = []
  // 알림에 제목·상대를 적으려면 분류 결과를 원래 메일과 다시 이어야 한다.
  const emailById = new Map<string, EmailSummary>()

  // 1. default (willowinvt) 컨텍스트
  const defaultResult = await processContext('default', ['Akros', 'ETC', 'Willow'])
  totalApplied += defaultResult.applied
  allClassifications = allClassifications.concat(defaultResult.classifications)
  for (const e of defaultResult.emails) emailById.set(e.id, e)

  // 2. tensoftworks 컨텍스트
  const tenswResult = await processContext('tensoftworks', ['TENSW'])
  totalApplied += tenswResult.applied
  allClassifications = allClassifications.concat(tenswResult.classifications)
  for (const e of tenswResult.emails) emailById.set(e.id, e)

  log(`\n📊 전체 결과: ${totalApplied}건 라벨 적용`)

  // 텔레그램 알림
  if (totalApplied > 0) {
    await sendTelegramNotification(allClassifications, totalApplied, emailById)
  }
}

main().catch(err => {
  log(`❌ 치명적 오류: ${err}`)
  process.exit(1)
})
