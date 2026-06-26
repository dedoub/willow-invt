// VoiceCards 일일 유저 분석 → 텔레그램 발송
// 매일 07:00 KST 실행 (일요일 제외)
// Usage: npx tsx scripts/voicecards-user-analytics.ts

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
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

const EXCLUDED_NICKNAMES = new Set(['류하아빠', '큐트도넛'])
// 봇/자동화 계정 이메일 도메인 (Firebase Test Lab 등) — 닉네임이 없어 도메인으로 식별
const EXCLUDED_EMAIL_DOMAINS = ['cloudtestlabaccounts.com']
const isExcludedEmail = (email: string | null) =>
  !!email && EXCLUDED_EMAIL_DOMAINS.some(d => email.toLowerCase().endsWith(`@${d}`))
const TRACKED_USER_IDS = ['100157754402469375887']

type UserRow = {
  user_id: string
  nickname: string | null
  email: string | null
  sheet_ids: string[] | null
  credits: number | null
  created_at: string
}

type AnalyticsRow = {
  user_id: string
  sheet_name: string | null
  cards_learned: number | null
  total_attempts: number | null
  last_updated: string | null
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

function daysAgoKST(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return kstDateStr(d)
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
  fn: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>,
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

function formatKST(iso: string): string {
  const d = new Date(iso)
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0')
  const day = String(kst.getUTCDate()).padStart(2, '0')
  const hh = String(kst.getUTCHours()).padStart(2, '0')
  const mm = String(kst.getUTCMinutes()).padStart(2, '0')
  return `${m}/${day} ${hh}:${mm}`
}

// 데이터 다이제스트를 claude -p(헤드리스 Claude CLI)에 먹여 CEO용 한국어 내러티브를 생성.
// 실패하면 null 반환 → 호출부가 기존 템플릿으로 폴백한다. (별도 API 키 불필요)
function generateNarrative(digest: string): string | null {
  const prompt = `당신은 VoiceCards(음성 플래시카드 앱)의 데이터 분석가입니다. 아래 데이터로 CEO에게 보낼 한국어 일일 리포트를 작성하세요.

작성 규칙:
- 핵심부터: 어제 누가 활동했고 **무엇을 공부했는지(주제=sheet_name)**, 얼마나(카드/시도) 했는지.
- 신규 유저의 활성화(첫 학습 전환)와 리텐션 신호를 짚는다. 추론과 사실을 구분한다.
- 마지막에 "오늘의 인사이트" 한 줄 — 가입 수보다 활성화·리텐션 관점에서.
- 제품 철학 반영: 정확도보다 연습 "볼륨"이 신호, 학습 모드(듣기/말하기)는 유저 자율(강요 금지).
- 길이는 텔레그램 1메시지(약 2500자 이내). 이모지 적당히, 과장·미사여구 금지.
- 마크다운 사용 가능(**굵게**, 목록, 표). 표는 짧게.

데이터:
${digest}`
  try {
    const out = execFileSync('claude', ['-p', '--model', 'claude-sonnet-4-6'], {
      input: prompt,
      encoding: 'utf8',
      timeout: 150000,
      maxBuffer: 10 * 1024 * 1024,
    })
    const text = (out || '').trim()
    return text.length > 0 ? text : null
  } catch (e) {
    log(`claude -p narrative failed: ${(e as Error).message}`)
    return null
  }
}

async function main() {
  if (isSundayKST()) {
    log('Sunday in KST → skip (sunday_no_message rule)')
    return
  }

  if (!voicecards) {
    log('VOICECARDS_SUPABASE_URL/KEY not set — skip')
    return
  }

  const today = kstDateStr()
  const yesterday = daysAgoKST(1)
  const weekAgo = daysAgoKST(7)

  log(`Running analytics for ${today} (yesterday=${yesterday}, weekAgo=${weekAgo})`)

  const [users, analytics] = await Promise.all([
    fetchAll<UserRow>((from, to) =>
      voicecards.from('users').select('*').order('created_at', { ascending: false }).range(from, to),
    ),
    fetchAll<AnalyticsRow>((from, to) =>
      voicecards.from('user_analytics').select('user_id, sheet_name, cards_learned, total_attempts, last_updated').range(from, to),
    ),
  ])

  log(`Loaded ${users.length} users, ${analytics.length} analytics rows`)

  // Filter: 가족 + 운영자 + 봇(테스트랩) 제외
  const excludedIds = new Set(
    users
      .filter(u => (u.nickname && EXCLUDED_NICKNAMES.has(u.nickname)) || isExcludedEmail(u.email))
      .map(u => u.user_id),
  )
  const externalUsers = users.filter(u => !excludedIds.has(u.user_id))
  const visibleIds = new Set(externalUsers.map(u => u.user_id))

  // 유저별 학습 데이터 집계
  const userCards = new Map<string, number>()
  const userAttempts = new Map<string, number>()
  const userLastActive = new Map<string, string>()

  for (const a of analytics) {
    if (!visibleIds.has(a.user_id)) continue
    userCards.set(a.user_id, (userCards.get(a.user_id) || 0) + (Number(a.cards_learned) || 0))
    userAttempts.set(a.user_id, (userAttempts.get(a.user_id) || 0) + (Number(a.total_attempts) || 0))
    if (a.last_updated) {
      const existing = userLastActive.get(a.user_id)
      if (!existing || a.last_updated > existing) userLastActive.set(a.user_id, a.last_updated)
    }
  }

  // 유저별 학습 주제(덱 이름) — 시도 많은 순 상위 3개
  const deckAgg = new Map<string, { name: string; att: number }[]>()
  for (const a of analytics) {
    if (!visibleIds.has(a.user_id) || !a.sheet_name) continue
    const arr = deckAgg.get(a.user_id) || []
    arr.push({ name: a.sheet_name, att: Number(a.total_attempts) || 0 })
    deckAgg.set(a.user_id, arr)
  }
  const deckNames = new Map<string, string[]>()
  for (const [uid, arr] of deckAgg) {
    deckNames.set(uid, arr.sort((x, y) => y.att - x.att).slice(0, 3).map(d => d.name))
  }

  // 활동 유저 리스트
  const activeUserList = externalUsers
    .map(u => ({
      user_id: u.user_id,
      nickname: shortNick(u),
      sheets: u.sheet_ids?.length || 0,
      cards: userCards.get(u.user_id) || 0,
      attempts: userAttempts.get(u.user_id) || 0,
      createdAt: u.created_at,
      lastActive: userLastActive.get(u.user_id) || null,
    }))
    .sort((a, b) => {
      if (a.cards !== b.cards) return b.cards - a.cards
      return (b.lastActive || '').localeCompare(a.lastActive || '')
    })

  const learners = activeUserList.filter(u => u.cards > 0)

  // 신규 가입자 (어제 KST 기준)
  const newSignups = externalUsers.filter(u => {
    const created = kstDateStr(new Date(u.created_at))
    return created === yesterday
  })

  // 어제 활동한 유저
  const activeYesterday = activeUserList.filter(u => {
    if (!u.lastActive) return false
    return kstDateStr(new Date(u.lastActive)) === yesterday
  })

  // 오늘 활동한 유저
  const activeToday = activeUserList.filter(u => {
    if (!u.lastActive) return false
    return kstDateStr(new Date(u.lastActive)) === today
  })

  // 트래킹 유저 (D1/D7 retention)
  const trackedReports: string[] = []
  for (const tid of TRACKED_USER_IDS) {
    const u = activeUserList.find(x => x.user_id === tid)
    if (!u) continue
    const createdDate = kstDateStr(new Date(u.createdAt))
    const daysSinceJoin = Math.floor(
      (Date.now() - new Date(u.createdAt).getTime()) / (24 * 60 * 60 * 1000),
    )
    const lastActiveDate = u.lastActive ? kstDateStr(new Date(u.lastActive)) : 'never'
    const cameBackToday = lastActiveDate === today
    const status = cameBackToday ? '✅ 오늘 복귀' : `⚠️ 마지막 ${u.lastActive ? formatKST(u.lastActive) : 'N/A'}`
    trackedReports.push(
      `\\- 가입 ${createdDate} (D+${daysSinceJoin}) | 카드 ${u.cards} | 시도 ${u.attempts} | ${status}`,
    )
  }

  // 메시지 작성
  const lines: string[] = []
  lines.push(`📊 *VoiceCards 유저 분석* (${today})`)
  lines.push('')
  lines.push(`외부 유저 ${externalUsers.length}명 | 학습 경험자 ${learners.length}명`)
  lines.push('')

  if (trackedReports.length > 0) {
    lines.push('🎯 *트래킹 유저 (첫 진성 유저)*')
    lines.push(...trackedReports)
    lines.push('')
  }

  lines.push(`📅 *어제(${yesterday}) 활동*`)
  lines.push(`\\- 신규 가입: ${newSignups.length}명`)
  lines.push(`\\- 학습 활동: ${activeYesterday.length}명`)
  if (activeYesterday.length > 0) {
    activeYesterday.slice(0, 5).forEach(u => {
      lines.push(`  • ${u.nickname} | 카드 ${u.cards} | 시도 ${u.attempts}`)
    })
  }
  lines.push('')

  lines.push(`☀️ *오늘(${today}) 현재 활동*`)
  lines.push(`\\- 활동 유저: ${activeToday.length}명`)
  if (activeToday.length > 0) {
    activeToday.slice(0, 5).forEach(u => {
      lines.push(`  • ${u.nickname} | 카드 ${u.cards} | 마지막 ${formatKST(u.lastActive!)}`)
    })
  }
  lines.push('')

  if (learners.length > 0) {
    lines.push('🏆 *전체 학습 경험자 TOP 5*')
    learners.slice(0, 5).forEach((u, i) => {
      const last = u.lastActive ? formatKST(u.lastActive) : '-'
      lines.push(`${i + 1}. ${u.nickname} | ${u.cards}카드/${u.attempts}시도 | ${last}`)
    })
    lines.push('')
  }

  // 함의/관찰
  const obs: string[] = []
  if (activeYesterday.length === 0 && activeToday.length === 0) {
    obs.push('⚠️ 최근 24h 외부 유저 활동 0건')
  } else if (activeYesterday.length >= 2) {
    obs.push(`✨ 어제 ${activeYesterday.length}명 동시 활동 — 의미있는 신호`)
  }
  if (newSignups.length > 0) {
    obs.push(`📈 신규 ${newSignups.length}명 가입 — D1 retention 내일 체크`)
  }
  if (obs.length > 0) {
    lines.push('💡 *관찰*')
    obs.forEach(o => lines.push(`\\- ${o}`))
  }

  const message = lines.join('\n')
  log(`Template message length: ${message.length}`)

  // 풍부한 내러티브: 데이터 다이제스트 → claude -p. 실패 시 위 템플릿으로 폴백.
  const isNewUser = (createdAt: string) => kstDateStr(new Date(createdAt)) === yesterday
  const fmtUser = (u: (typeof activeUserList)[number]) =>
    `- ${u.nickname} | ${isNewUser(u.createdAt) ? '신규' : '기존'} | 가입 ${kstDateStr(new Date(u.createdAt))} | 카드 ${u.cards}/시도 ${u.attempts} | 주제: ${(deckNames.get(u.user_id) || []).join(', ') || '-'} | 마지막 ${u.lastActive ? formatKST(u.lastActive) : '-'}`
  const digestLines: string[] = [
    `날짜: 오늘 ${today} / 어제 ${yesterday}`,
    `집계: 외부유저 ${externalUsers.length} · 학습경험자 ${learners.length} · 어제신규 ${newSignups.length} · 어제활동 ${activeYesterday.length} · 오늘활동(현재) ${activeToday.length}`,
    '',
    '[어제 활동 유저]',
    ...(activeYesterday.length ? activeYesterday.slice(0, 12).map(fmtUser) : ['- 없음']),
    '',
    '[오늘(현재까지) 활동 유저]',
    ...(activeToday.length ? activeToday.slice(0, 12).map(fmtUser) : ['- 없음']),
    '',
    '[전체 학습경험자 TOP8]',
    ...learners.slice(0, 8).map((u, i) =>
      `${i + 1}. ${u.nickname} | 카드 ${u.cards}/시도 ${u.attempts} | 주제: ${(deckNames.get(u.user_id) || []).join(', ') || '-'} | 마지막 ${u.lastActive ? formatKST(u.lastActive) : '-'}`,
    ),
  ]
  if (trackedReports.length > 0) {
    digestLines.push('', '[트래킹 유저 리텐션]', ...trackedReports.map(r => r.replace(/\\/g, '')))
  }
  const narrative = generateNarrative(digestLines.join('\n'))

  let outText = markdownToTelegramHtml(normalizeTelegramOutboundText(message))
  let parseMode = 'HTML'
  if (narrative) {
    outText = markdownToTelegramHtml(normalizeTelegramOutboundText(`📊 **VoiceCards 일일 분석** (${today})\n\n${narrative}`))
    parseMode = 'HTML'
    log(`Using claude narrative (len ${narrative.length})`)
  } else {
    log('Fallback to template message')
  }

  const chatId = await getCeoChatId()
  if (!chatId) {
    log('No CEO chat_id found — skip telegram send')
    console.log('---PREVIEW---')
    console.log(narrative || message)
    return
  }

  await sendTelegram(chatId, outText, parseMode)
  log(`Sent to chat_id ${chatId} (${parseMode})`)
}

main().catch(e => {
  console.error('[voicecards-analytics] FATAL:', e)
  process.exit(1)
})
