// VoiceCards 일일 유저 분석 → 텔레그램 발송
// 매일 09:30 KST 실행 (일요일 제외)
// Usage: npx tsx scripts/voicecards-user-analytics.ts

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

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
const TRACKED_USER_IDS = ['100157754402469375887']

type UserRow = {
  user_id: string
  nickname: string | null
  sheet_ids: string[] | null
  credits: number | null
  created_at: string
}

type AnalyticsRow = {
  user_id: string
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

async function sendTelegram(chatId: number, text: string) {
  const MAX_LEN = 4000
  const chunks: string[] = []
  let remaining = text
  while (remaining.length > 0) {
    if (remaining.length <= MAX_LEN) {
      chunks.push(remaining)
      break
    }
    let splitAt = remaining.lastIndexOf('\n', MAX_LEN)
    if (splitAt < 100) splitAt = MAX_LEN
    chunks.push(remaining.slice(0, splitAt))
    remaining = remaining.slice(splitAt).trimStart()
  }
  for (const chunk of chunks) {
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: 'Markdown' }),
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
      voicecards.from('user_analytics').select('user_id, cards_learned, total_attempts, last_updated').range(from, to),
    ),
  ])

  log(`Loaded ${users.length} users, ${analytics.length} analytics rows`)

  // Filter: 가족 + 운영자 제외
  const excludedIds = new Set(
    users.filter(u => u.nickname && EXCLUDED_NICKNAMES.has(u.nickname)).map(u => u.user_id),
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
  log(`Message length: ${message.length}`)

  const chatId = await getCeoChatId()
  if (!chatId) {
    log('No CEO chat_id found — skip telegram send')
    console.log('---PREVIEW---')
    console.log(message)
    return
  }

  await sendTelegram(chatId, message)
  log(`Sent to chat_id ${chatId}`)
}

main().catch(e => {
  console.error('[voicecards-analytics] FATAL:', e)
  process.exit(1)
})
