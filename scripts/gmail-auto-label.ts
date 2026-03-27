import { config } from 'dotenv'
config({ path: '.env.local' })

import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { spawn } from 'child_process'
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
  const isTensw = context === 'tensoftworks'
  return new google.auth.OAuth2(
    isTensw ? process.env.GOOGLE_CLIENT_ID_TENSW : process.env.GOOGLE_CLIENT_ID,
    isTensw ? process.env.GOOGLE_CLIENT_SECRET_TENSW : process.env.GOOGLE_CLIENT_SECRET,
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
}

function askClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env }
    delete (env as Record<string, string | undefined>).CLAUDECODE
    delete (env as Record<string, string | undefined>).CLAUDE_CODE_SSE_PORT
    delete (env as Record<string, string | undefined>).CLAUDE_CODE_ENTRYPOINT
    delete (env as Record<string, string | undefined>).CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS

    // --verbose + json: result 필드 버그 우회 — assistant 메시지에서 텍스트 추출
    const args = ['-p', '--output-format', 'json', '--verbose', '--model', 'sonnet']

    const proc = spawn('claude', args, {
      cwd: os.tmpdir(),
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => { stdout += data.toString() })
    proc.stderr.on('data', (data) => { stderr += data.toString() })

    proc.on('close', (code) => {
      if (code === 0) {
        try {
          const parsed = JSON.parse(stdout)
          const events = Array.isArray(parsed) ? parsed : [parsed]
          // assistant 이벤트에서 텍스트 추출
          for (const event of events) {
            if (event.type === 'assistant' && event.message?.content) {
              const texts = event.message.content
                .filter((c: { type: string }) => c.type === 'text')
                .map((c: { text: string }) => c.text)
              if (texts.length > 0) {
                resolve(texts.join('\n').trim())
                return
              }
            }
          }
          // fallback: result 필드
          const resultEvent = events.find((e: { type: string }) => e.type === 'result')
          resolve(resultEvent?.result?.trim() || '')
        } catch {
          // JSON 파싱 실패 시 raw stdout 반환
          resolve(stdout.trim())
        }
      } else {
        log(`Claude CLI error: ${stderr}`)
        reject(new Error(`Claude exited with code ${code}: ${stderr}`))
      }
    })

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn claude: ${err.message}`))
    })

    // 5분 타임아웃
    const timeout = setTimeout(() => {
      proc.kill('SIGTERM')
      reject(new Error('Claude CLI timeout (5min)'))
    }, 5 * 60 * 1000)

    proc.on('close', () => clearTimeout(timeout))

    proc.stdin.write(prompt)
    proc.stdin.end()
  })
}

async function classifyEmails(emails: EmailSummary[], labels: LabelInfo[]): Promise<ClassificationResult[]> {
  if (emails.length === 0) return []

  const labelList = labels.map(l => l.name).join(', ')
  const emailList = emails.map((e, i) => {
    const direction = e.isSent ? '[보낸메일]' : '[받은메일]'
    const counterpart = e.isSent ? `to: ${e.to}` : `from: ${e.from}`
    return `[${i + 1}] ${direction} id: ${e.id}\n    ${counterpart}\n    subject: ${e.subject}\n    snippet: ${e.snippet}`
  }).join('\n\n')

  const prompt = `당신은 이메일 분류 전문가입니다. 아래 이메일들을 적절한 라벨로 분류해주세요.

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

## 이메일 목록
${emailList}

## 출력 형식
순수 JSON 배열만 출력하세요. 설명 텍스트 없이:
[
  {"email_id": "...", "label": "Akros/PR지원", "reason": "아크로스 PR 관련 이메일"},
  {"email_id": "...", "label": null, "reason": "일반 뉴스레터"}
]`

  try {
    const result = await askClaude(prompt)
    const jsonMatch = result.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      log('⚠️ 분류 결과에서 JSON을 찾을 수 없음')
      return []
    }
    return JSON.parse(jsonMatch[0]) as ClassificationResult[]
  } catch (err) {
    log(`⚠️ 이메일 분류 실패: ${err}`)
    return []
  }
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
async function sendTelegramNotification(results: ClassificationResult[], applied: number) {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
  if (!BOT_TOKEN) return

  const labeled = results.filter(r => r.label)
  if (labeled.length === 0) return // 분류된 것 없으면 알림 불필요

  const { data } = await supabase
    .from('telegram_conversations')
    .select('chat_id')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  if (!data?.chat_id) return

  const lines = labeled.map(r => `  🏷️ ${r.label}: ${r.reason}`).join('\n')
  const text = `📧 이메일 자동 분류 (${applied}건)\n\n${lines}`

  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: data.chat_id, text }),
  })
}

// ============================================================
// 컨텍스트별 라벨 분류 실행
// ============================================================
async function processContext(context: string, excludeLabels: string[]): Promise<{ applied: number; classifications: ClassificationResult[] }> {
  log(`\n📧 [${context}] 컨텍스트 처리 시작`)

  const gmail = await getGmailClientForScript(context)
  if (!gmail) {
    log(`  ⚠️ [${context}] Gmail 클라이언트 생성 실패 — 스킵`)
    return { applied: 0, classifications: [] }
  }

  // 1. 라벨 목록 조회
  const labels = await getUserLabels(gmail)
  log(`  📋 사용 가능한 라벨: ${labels.length}개`)

  // 2. 미분류 이메일 조회
  const excludeQuery = excludeLabels.map(l => `-label:${l}`).join(' ')
  const res = await gmail.users.messages.list({
    userId: 'me',
    q: `newer_than:${process.env.GMAIL_LABEL_RANGE || '25h'} {in:inbox in:sent} ${excludeQuery}`,
    maxResults: 50,
  })

  const messages = res.data.messages || []
  if (messages.length === 0) {
    log(`  ✅ 분류할 이메일 없음`)
    return { applied: 0, classifications: [] }
  }

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
    emails.push({ id: msg.id, from, to, subject, snippet: detail.data.snippet || '', labels: labelIds, isSent })
  }

  // 자동 발송 메일 제외 (분류 불필요)
  const skipSenders = ['TENSW Todo']
  const filtered = emails.filter(e => !skipSenders.some(s => e.from.includes(s)))
  if (filtered.length < emails.length) {
    log(`  🚫 자동 발송 메일 ${emails.length - filtered.length}건 제외 (${skipSenders.join(', ')})`)
  }
  const emailsToClassify = filtered

  log(`  📨 미분류 이메일: ${emailsToClassify.length}건`)

  // 3. Claude로 분류
  log(`  🤖 Claude로 이메일 분류 중...`)
  const classifications = await classifyEmails(emailsToClassify, labels)
  const toLabel = classifications.filter(c => c.label)
  log(`  📊 분류 결과: ${toLabel.length}/${emailsToClassify.length}건 라벨 할당`)

  if (toLabel.length === 0) {
    return { applied: 0, classifications }
  }

  // 4. 라벨 적용
  log(`  🏷️ 라벨 적용 중...`)
  const applied = await applyLabels(gmail, classifications, labels)
  log(`  ✅ ${applied}건 라벨 적용 완료`)

  return { applied, classifications }
}

// ============================================================
// Main
// ============================================================
async function main() {
  log('📧 Gmail 자동 라벨 분류 시작 (multi-context)')

  let totalApplied = 0
  let allClassifications: ClassificationResult[] = []

  // 1. default (willowinvt) 컨텍스트
  const defaultResult = await processContext('default', ['Akros', 'ETC', 'Willow'])
  totalApplied += defaultResult.applied
  allClassifications = allClassifications.concat(defaultResult.classifications)

  // 2. tensoftworks 컨텍스트
  const tenswResult = await processContext('tensoftworks', ['TENSW'])
  totalApplied += tenswResult.applied
  allClassifications = allClassifications.concat(tenswResult.classifications)

  log(`\n📊 전체 결과: ${totalApplied}건 라벨 적용`)

  // 텔레그램 알림
  if (totalApplied > 0) {
    await sendTelegramNotification(allClassifications, totalApplied)
  }
}

main().catch(err => {
  log(`❌ 치명적 오류: ${err}`)
  process.exit(1)
})
