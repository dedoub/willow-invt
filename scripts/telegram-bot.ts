import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { spawn } from 'child_process'
import { existsSync, writeFileSync, readFileSync, unlinkSync } from 'fs'
import { join } from 'path'

// ============================================================
// Config
// ============================================================
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

const MAX_HISTORY = 20 // 대화 기록 최대 보관 수
const POLL_INTERVAL = 1500 // ms
const PROACTIVE_CHECK_INTERVAL = 30 * 60 * 1000 // 30분마다 자율 점검
const LOCK_FILE = join(__dirname, 'logs', 'telegram-bot.lock')
const OFFSET_FILE = join(__dirname, 'logs', 'telegram-bot.offset')

// CEO chat_id 저장 (첫 메시지 수신 시 등록)
let ceoChatId: number | null = null

// ============================================================
// Process lock — 중복 실행 방지
// ============================================================
function acquireLock(): boolean {
  try {
    if (existsSync(LOCK_FILE)) {
      const lockPid = parseInt(readFileSync(LOCK_FILE, 'utf-8').trim(), 10)
      // PID가 아직 살아있는지 확인
      try {
        process.kill(lockPid, 0) // signal 0 = 존재 확인만
        console.error(`❌ 봇이 이미 실행 중입니다 (PID: ${lockPid}). 중복 실행 차단.`)
        return false
      } catch {
        // 프로세스 없음 — stale lock 제거
        console.log(`⚠️ 이전 lock 파일 정리 (PID ${lockPid} 없음)`)
      }
    }
    writeFileSync(LOCK_FILE, String(process.pid))
    return true
  } catch (err) {
    console.error('Lock acquire error:', err)
    return false
  }
}

function releaseLock() {
  try {
    if (existsSync(LOCK_FILE)) {
      const lockPid = parseInt(readFileSync(LOCK_FILE, 'utf-8').trim(), 10)
      if (lockPid === process.pid) {
        unlinkSync(LOCK_FILE)
      }
    }
  } catch { /* ignore */ }
}

// ============================================================
// Persistent offset — 재시작 시 메시지 재처리 방지
// ============================================================
function loadOffset(): number {
  try {
    if (existsSync(OFFSET_FILE)) {
      return parseInt(readFileSync(OFFSET_FILE, 'utf-8').trim(), 10) || 0
    }
  } catch { /* ignore */ }
  return 0
}

function saveOffset(offset: number) {
  try {
    writeFileSync(OFFSET_FILE, String(offset))
  } catch { /* ignore */ }
}

// 처리 중인 메시지 추적 (동일 update 중복 처리 방지)
const processingMessages = new Set<number>()

// ============================================================
// Telegram API helpers
// ============================================================
async function tg(method: string, body: Record<string, unknown>) {
  const res = await fetch(`${TELEGRAM_API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

async function sendMessage(chatId: number, text: string) {
  // Telegram 메시지 길이 제한: 4096자
  const chunks = splitMessage(text, 4000)
  for (const chunk of chunks) {
    await tg('sendMessage', {
      chat_id: chatId,
      text: chunk,
      parse_mode: 'Markdown',
    }).catch(async () => {
      // Markdown 파싱 실패 시 plain text로 재시도
      await tg('sendMessage', { chat_id: chatId, text: chunk })
    })
  }
}

function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text]
  const chunks: string[] = []
  let remaining = text
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining)
      break
    }
    // 줄바꿈 기준으로 자르기
    let splitIdx = remaining.lastIndexOf('\n', maxLen)
    if (splitIdx === -1 || splitIdx < maxLen / 2) splitIdx = maxLen
    chunks.push(remaining.slice(0, splitIdx))
    remaining = remaining.slice(splitIdx).trimStart()
  }
  return chunks
}

async function sendTyping(chatId: number) {
  await tg('sendChatAction', { chat_id: chatId, action: 'typing' })
}

// ============================================================
// Dashboard data fetching
// ============================================================
function formatDate(d: Date) {
  return d.toISOString().split('T')[0]
}

async function fetchKnowledgeContext(): Promise<string> {
  // First get counts to decide loading strategy
  const [
    { count: entityCount },
    { count: relationCount },
    { count: insightCount },
  ] = await Promise.all([
    supabase.from('knowledge_entities').select('*', { count: 'exact', head: true }),
    supabase.from('knowledge_relations').select('*', { count: 'exact', head: true }),
    supabase.from('knowledge_insights').select('*', { count: 'exact', head: true }).eq('status', 'active'),
  ])

  const total = (entityCount || 0) + (relationCount || 0) + (insightCount || 0)
  const isCompact = total > 80 // 80개 초과 시 요약 모드

  const entityLimit = isCompact ? 15 : 50
  const relationLimit = isCompact ? 20 : 100
  const insightLimit = isCompact ? 8 : 20

  const [
    { data: entities },
    { data: relations },
    { data: recentInsights },
  ] = await Promise.all([
    supabase.from('knowledge_entities').select('name, entity_type, description').order('updated_at', { ascending: false }).limit(entityLimit),
    supabase.from('knowledge_relations').select('subject:knowledge_entities!subject_id(name), predicate, object:knowledge_entities!object_id(name)').limit(relationLimit),
    supabase.from('knowledge_insights').select('content, insight_type, created_at').eq('status', 'active').order('created_at', { ascending: false }).limit(insightLimit),
  ])

  const parts: string[] = []

  // 요약 모드일 때 통계 먼저
  if (isCompact) {
    parts.push(`[요약 모드] 엔티티 ${entityCount}개, 관계 ${relationCount}개, 인사이트 ${insightCount}개 — 아래는 최근 항목. DB에서 직접 쿼리 가능 (knowledge_entities, knowledge_relations, knowledge_insights 테이블)`)
  }

  if (entities?.length) {
    parts.push('엔티티:')
    const byType: Record<string, string[]> = {}
    for (const e of entities) {
      if (!byType[e.entity_type]) byType[e.entity_type] = []
      byType[e.entity_type].push(`${e.name}${e.description ? ` (${e.description.slice(0, 80)})` : ''}`)
    }
    for (const [type, items] of Object.entries(byType)) {
      parts.push(`  [${type}] ${items.join(' | ')}`)
    }
  }

  if (relations?.length) {
    parts.push('\n관계 그래프:')
    for (const r of relations) {
      const s = (r as any).subject?.name || '?'
      const o = (r as any).object?.name || '?'
      parts.push(`  ${s} —[${r.predicate}]→ ${o}`)
    }
  }

  if (recentInsights?.length) {
    parts.push('\n최근 인사이트:')
    for (const i of recentInsights) {
      parts.push(`  [${i.insight_type}] ${i.content.slice(0, 120)}`)
    }
  }

  return parts.length ? parts.join('\n') : ''
}

async function fetchWikiContext(): Promise<string> {
  const { data: wikiNotes } = await supabase
    .from('work_wiki')
    .select('id, title, content, category, section, created_at')
    .order('created_at', { ascending: false })
    .limit(30)

  if (!wikiNotes?.length) return ''

  const sections: string[] = ['\n## 업무위키 노트']

  // 섹션별 그룹핑
  const bySection: Record<string, typeof wikiNotes> = {}
  for (const note of wikiNotes) {
    const sec = note.section || 'etc'
    if (!bySection[sec]) bySection[sec] = []
    bySection[sec].push(note)
  }

  for (const [section, notes] of Object.entries(bySection)) {
    sections.push(`\n### [${section}]`)
    for (const n of notes) {
      // HTML 태그 제거해서 plain text로
      const plainContent = n.content
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim()
      const preview = plainContent.length > 500 ? plainContent.slice(0, 500) + '...' : plainContent
      sections.push(`- **${n.title}**${n.category ? ` [${n.category}]` : ''} (${n.created_at?.split('T')[0]})\n  ${preview}`)
    }
  }

  return sections.join('\n')
}

async function fetchDashboardContext(): Promise<string> {
  const today = new Date()
  const weekLater = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
  const todayStr = formatDate(today)
  const weekLaterStr = formatDate(weekLater)

  const [
    { data: projects },
    { data: clients },
    { data: milestones },
    { data: schedules },
    { data: tasks },
    { data: invoices },
  ] = await Promise.all([
    supabase.from('willow_mgmt_projects').select('*, client:willow_mgmt_clients(name)').order('created_at', { ascending: false }),
    supabase.from('willow_mgmt_clients').select('id, name').order('name'),
    supabase.from('willow_mgmt_milestones').select('*, project:willow_mgmt_projects(name, client:willow_mgmt_clients(name))').gte('target_date', formatDate(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000))).order('target_date'),
    supabase.from('willow_mgmt_schedules').select('*, client:willow_mgmt_clients(name), tasks:willow_mgmt_tasks(*)').gte('schedule_date', todayStr).lte('schedule_date', weekLaterStr).order('schedule_date'),
    supabase.from('willow_mgmt_tasks').select('*, schedule:willow_mgmt_schedules(title)').eq('is_completed', false).order('deadline'),
    supabase.from('willow_mgmt_invoices').select('*').order('created_at', { ascending: false }).limit(20),
  ])

  const sections: string[] = []

  // 오늘 날짜
  sections.push(`## 오늘: ${todayStr} (${['일','월','화','수','목','금','토'][today.getDay()]}요일)`)

  // 클라이언트
  if (clients?.length) {
    sections.push(`\n## 클라이언트 (${clients.length}개)\n${clients.map((c: any) => `- ${c.name}`).join('\n')}`)
  }

  // 프로젝트
  if (projects?.length) {
    sections.push(`\n## 프로젝트 (${projects.length}개)`)
    for (const p of projects) {
      sections.push(`- [${p.status}] ${(p as any).client?.name || '?'} > ${p.name}${p.description ? ` — ${p.description}` : ''}`)
    }
  }

  // 마일스톤 (마감 임박 / 지연)
  if (milestones?.length) {
    const overdue = milestones.filter((m: any) => m.target_date < todayStr && m.status !== 'completed')
    const upcoming = milestones.filter((m: any) => m.target_date >= todayStr && m.target_date <= weekLaterStr && m.status !== 'completed')
    const later = milestones.filter((m: any) => m.target_date > weekLaterStr && m.status !== 'completed')

    if (overdue.length) {
      sections.push(`\n## 🔴 지연된 마일스톤 (${overdue.length}개)`)
      for (const m of overdue) {
        const proj = (m as any).project
        sections.push(`- [D+${Math.floor((today.getTime() - new Date(m.target_date).getTime()) / 86400000)}] ${proj?.client?.name || '?'} > ${proj?.name || '?'} > ${m.name} (마감: ${m.target_date})`)
      }
    }
    if (upcoming.length) {
      sections.push(`\n## 🟡 이번 주 마일스톤 (${upcoming.length}개)`)
      for (const m of upcoming) {
        const proj = (m as any).project
        const daysLeft = Math.ceil((new Date(m.target_date).getTime() - today.getTime()) / 86400000)
        sections.push(`- [D-${daysLeft}] ${proj?.client?.name || '?'} > ${proj?.name || '?'} > ${m.name} (마감: ${m.target_date})`)
      }
    }
    if (later.length) {
      sections.push(`\n## 향후 마일스톤 (${later.length}개)`)
      for (const m of later.slice(0, 10)) {
        const proj = (m as any).project
        sections.push(`- ${proj?.client?.name || '?'} > ${proj?.name || '?'} > ${m.name} (마감: ${m.target_date})`)
      }
    }
  }

  // 이번 주 일정
  if (schedules?.length) {
    sections.push(`\n## 이번 주 일정 (${schedules.length}개)`)
    for (const s of schedules) {
      const time = s.start_time ? ` ${s.start_time.slice(0, 5)}` : ''
      const status = s.is_completed ? '✅' : '⬜'
      const taskCount = (s as any).tasks?.length || 0
      sections.push(`- ${status} ${s.schedule_date}${time} | ${(s as any).client?.name || ''} | ${s.title}${taskCount ? ` (태스크 ${taskCount}개)` : ''}`)
    }
  }

  // 미완료 태스크
  if (tasks?.length) {
    sections.push(`\n## 미완료 태스크 (${tasks.length}개)`)
    for (const t of tasks.slice(0, 15)) {
      const deadline = t.deadline ? ` (마감: ${t.deadline})` : ''
      sections.push(`- ${(t as any).schedule?.title || '?'} > ${t.content}${deadline}`)
    }
  }

  // 최근 인보이스 요약
  if (invoices?.length) {
    const revenue = invoices.filter((i: any) => i.type === 'revenue')
    const expense = invoices.filter((i: any) => i.type === 'expense')
    const totalRevenue = revenue.reduce((sum: number, i: any) => sum + (i.amount || 0), 0)
    const totalExpense = expense.reduce((sum: number, i: any) => sum + (i.amount || 0), 0)
    const unpaid = invoices.filter((i: any) => i.status === 'issued')

    sections.push(`\n## 재무 요약 (최근 인보이스 ${invoices.length}건)`)
    sections.push(`- 수입: ₩${totalRevenue.toLocaleString()} (${revenue.length}건)`)
    sections.push(`- 지출: ₩${totalExpense.toLocaleString()} (${expense.length}건)`)
    if (unpaid.length) {
      sections.push(`- 미수금: ${unpaid.length}건 (₩${unpaid.reduce((s: number, i: any) => s + (i.amount || 0), 0).toLocaleString()})`)
    }
  }

  return sections.join('\n')
}

// ============================================================
// Tensw Todo data fetching (via Claude CLI + MCP)
// ============================================================
let tenswDataCache: string = ''
let tenswCacheTime = 0
const TENSW_CACHE_TTL = 10 * 60 * 1000 // 10분 캐시

async function fetchTenswContext(): Promise<string> {
  // 캐시가 유효하면 반환
  if (tenswDataCache && Date.now() - tenswCacheTime < TENSW_CACHE_TTL) {
    return tenswDataCache
  }

  try {
    console.log('🔄 텐소프트웍스 데이터 로딩 중...')
    const result = await askClaude(
      `텐소프트웍스 CEO 대시보드를 조회해서 아래 형식으로 정리해줘. MCP 도구(get_ceo_dashboard)를 사용해.

형식:
## 텐소프트웍스 현황
- 전체 프로젝트: N개 (활성 N개)
- 태스크 진행률: N%
- 미완료 CEO 할일: (목록)
- 프로젝트별 진행률: (목록)
- 최신 주간보고서: (목록)

데이터만 정리하고 부가 설명은 하지 마.`,
      { allowedTools: [TENSW_MCP_TOOLS] }
    )

    tenswDataCache = result
    tenswCacheTime = Date.now()
    console.log('✅ 텐소프트웍스 데이터 로딩 완료')
    return result
  } catch (err) {
    console.error('Tensw data fetch error:', err)
    return tenswDataCache || '(텐소프트웍스 데이터 로딩 실패)'
  }
}

// ============================================================
// Conversation memory (Supabase)
// ============================================================
interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

async function getConversation(chatId: number): Promise<Message[]> {
  const { data } = await supabase
    .from('telegram_conversations')
    .select('messages')
    .eq('chat_id', chatId)
    .single()
  return (data?.messages as Message[]) || []
}

async function saveConversation(chatId: number, messages: Message[]) {
  // 최근 N개만 유지
  const trimmed = messages.slice(-MAX_HISTORY)
  await supabase
    .from('telegram_conversations')
    .upsert({
      chat_id: chatId,
      messages: trimmed,
      updated_at: new Date().toISOString(),
    })
}

// ============================================================
// Proactive monitoring state
// ============================================================
interface ProactiveState {
  lastCheckAt: string
  lastSnapshotHash: string       // 데이터 변화 감지용
  lastReportedIssues: string[]   // 중복 알림 방지
  morningBriefSent: string | null // 오늘 아침 브리핑 보냈는지 (날짜)
}

let proactiveState: ProactiveState = {
  lastCheckAt: '',
  lastSnapshotHash: '',
  lastReportedIssues: [],
  morningBriefSent: null,
}

// 간단한 해시 함수 (데이터 변화 감지)
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return hash.toString(36)
}

async function loadCeoChatId() {
  // DB에서 저장된 chat_id 로드
  const { data } = await supabase
    .from('telegram_conversations')
    .select('chat_id')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()
  if (data?.chat_id) {
    ceoChatId = data.chat_id
    console.log(`📌 CEO chat_id 로드: ${ceoChatId}`)
  }
}

// ============================================================
// Proactive check - Claude가 자율 판단
// ============================================================
const PROACTIVE_PROMPT = `당신은 윌로우 에이전트입니다.
아래 사업 데이터를 검토하고, CEO에게 **지금 즉시 알려야 할 사항**이 있는지 판단하세요.

## 알림 기준 (하나라도 해당하면 알림)
- 마일스톤이 오늘 마감이거나 이미 지연됨
- 오늘 예정된 일정이 있는데 아직 미완료 (오후 2시 이후)
- 미수금이 30일 이상 경과
- 긴급하거나 위험한 상황 감지

## 알림 제외
- 이미 보고한 사항 (아래 목록 참조)
- 단순 정보 (변화 없는 데이터)
- 일상적이고 정상적인 상태

## 이미 보고한 사항
{reported_issues}

## 응답 형식
알릴 사항이 있으면 CEO에게 보낼 메시지를 작성하세요. 텔레그램용으로 간결하게.
알릴 사항이 없으면 정확히 "SKIP" 한 단어만 출력하세요.`

const MORNING_BRIEF_PROMPT = `당신은 윌로우 에이전트입니다.
아침 브리핑을 작성하세요.

## 브리핑 포함 사항
1. 오늘의 핵심 일정 (시간순)
2. 지연/임박 마일스톤 경고
3. 미완료 태스크 중 긴급한 것
4. 재무 현황 요약 (미수금 중심)
5. 오늘 주의할 점

## 스타일
- "좋은 아침입니다" 로 시작
- 텔레그램용, 간결하게
- 이모지 적절히
- 위험 사항은 🔴, 주의 사항은 🟡, 정상은 🟢`

async function proactiveCheck() {
  if (!ceoChatId) return

  const now = new Date()
  const todayStr = formatDate(now)
  const hour = now.getHours()

  try {
    const dashboardContext = await fetchDashboardContext()
    const currentHash = simpleHash(dashboardContext)

    // 1) 아침 브리핑 (08:00~09:00, 하루 1회)
    if (hour >= 8 && hour < 9 && proactiveState.morningBriefSent !== todayStr) {
      console.log('🌅 아침 브리핑 생성 중...')
      await sendTyping(ceoChatId)

      const prompt = `${MORNING_BRIEF_PROMPT}\n\n# 현재 사업 데이터\n${dashboardContext}`
      const typingInterval = setInterval(() => sendTyping(ceoChatId!), 4000)
      const response = await askClaude(prompt)
      clearInterval(typingInterval)

      await sendMessage(ceoChatId, response)
      proactiveState.morningBriefSent = todayStr

      // 대화 기록에도 저장
      const history = await getConversation(ceoChatId)
      history.push({ role: 'assistant', content: `[아침 브리핑]\n${response}`, timestamp: now.toISOString() })
      await saveConversation(ceoChatId, history)

      console.log('✅ 아침 브리핑 전송 완료')
      return
    }

    // 2) 자율 점검 (데이터가 바뀌었거나, 업무 시간대일 때)
    const isWorkHours = hour >= 9 && hour <= 21
    const dataChanged = currentHash !== proactiveState.lastSnapshotHash

    if (!isWorkHours) return
    if (!dataChanged && proactiveState.lastCheckAt === todayStr) return // 오늘 이미 체크했고 데이터 변화 없으면 스킵

    console.log(`🔍 자율 점검 중... (데이터 변화: ${dataChanged})`)

    const reportedList = proactiveState.lastReportedIssues.length
      ? proactiveState.lastReportedIssues.map(i => `- ${i}`).join('\n')
      : '(없음)'

    const prompt = PROACTIVE_PROMPT.replace('{reported_issues}', reportedList)
      + `\n\n# 현재 사업 데이터\n${dashboardContext}\n\n# 현재 시각: ${now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`

    const response = await askClaude(prompt)

    proactiveState.lastSnapshotHash = currentHash
    proactiveState.lastCheckAt = todayStr

    if (response.trim() === 'SKIP') {
      console.log('  → 알릴 사항 없음')
      return
    }

    // 알림 전송
    console.log('📢 자율 알림 전송:', response.slice(0, 80))
    await sendTyping(ceoChatId)
    await sendMessage(ceoChatId, response)

    // 보고 사항 기록 (중복 방지)
    proactiveState.lastReportedIssues.push(response.slice(0, 100))
    // 최대 20개만 유지
    if (proactiveState.lastReportedIssues.length > 20) {
      proactiveState.lastReportedIssues = proactiveState.lastReportedIssues.slice(-20)
    }

    // 대화 기록 저장
    const history = await getConversation(ceoChatId)
    history.push({ role: 'assistant', content: `[자율 알림]\n${response}`, timestamp: now.toISOString() })
    await saveConversation(ceoChatId, history)

  } catch (err) {
    console.error('Proactive check error:', err)
  }

  // 뉴스 다이제스트도 체크
  try {
    await newsDigestCheck()
  } catch (err) {
    console.error('News digest error:', err)
  }
}

// ============================================================
// News & YouTube search
// ============================================================
interface WatchTopic {
  id: string
  topic: string
  keywords: string[]
  category: string
  is_active: boolean
  last_searched_at: string | null
}

async function getWatchTopics(): Promise<WatchTopic[]> {
  const { data } = await supabase
    .from('telegram_watch_topics')
    .select('*')
    .eq('is_active', true)
    .order('created_at')
  return (data as WatchTopic[]) || []
}

interface NewsItem {
  title: string
  link: string
  source: string
  pubDate: string
}

async function searchGoogleNews(query: string, limit = 5): Promise<NewsItem[]> {
  try {
    const encoded = encodeURIComponent(query)
    const res = await fetch(
      `https://news.google.com/rss/search?q=${encoded}&hl=ko&gl=KR&ceid=KR:ko`,
      { signal: AbortSignal.timeout(10000) }
    )
    const xml = await res.text()

    const items: NewsItem[] = []
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    let match
    while ((match = itemRegex.exec(xml)) !== null && items.length < limit) {
      const itemXml = match[1]
      const title = itemXml.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1') || ''
      const link = itemXml.match(/<link>([\s\S]*?)<\/link>/)?.[1] || ''
      const source = itemXml.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1') || ''
      const pubDate = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || ''
      items.push({ title, link, source, pubDate })
    }
    return items
  } catch (err) {
    console.error(`News search error for "${query}":`, err)
    return []
  }
}

interface YouTubeItem {
  title: string
  videoId: string
  channelName: string
  publishedAt: string
}

async function searchYouTube(query: string, limit = 5): Promise<YouTubeItem[]> {
  try {
    // YouTube RSS search via Invidious (free, no API key)
    const encoded = encodeURIComponent(query)
    const instances = [
      'https://vid.puffyan.us',
      'https://invidious.fdn.fr',
      'https://y.com.sb',
    ]

    for (const instance of instances) {
      try {
        const res = await fetch(
          `${instance}/api/v1/search?q=${encoded}&sort_by=upload_date&type=video&region=KR`,
          { signal: AbortSignal.timeout(8000) }
        )
        if (!res.ok) continue
        const data = await res.json() as any[]
        return data.slice(0, limit).map((v: any) => ({
          title: v.title || '',
          videoId: v.videoId || '',
          channelName: v.author || '',
          publishedAt: v.publishedText || '',
        }))
      } catch {
        continue
      }
    }
    return []
  } catch (err) {
    console.error(`YouTube search error for "${query}":`, err)
    return []
  }
}

async function buildNewsDigest(): Promise<string | null> {
  const topics = await getWatchTopics()
  if (!topics.length) return null

  const sections: string[] = []
  let hasContent = false

  for (const topic of topics) {
    const searchQuery = topic.keywords.length ? topic.keywords.join(' OR ') : topic.topic
    const [news, videos] = await Promise.all([
      searchGoogleNews(searchQuery, 3),
      searchYouTube(searchQuery, 2),
    ])

    if (!news.length && !videos.length) continue
    hasContent = true

    sections.push(`\n📌 *${topic.topic}*`)

    if (news.length) {
      sections.push('뉴스:')
      for (const n of news) {
        const date = n.pubDate ? new Date(n.pubDate).toLocaleDateString('ko-KR') : ''
        sections.push(`• ${n.title}${n.source ? ` (${n.source})` : ''} ${date}`)
      }
    }

    if (videos.length) {
      sections.push('유튜브:')
      for (const v of videos) {
        sections.push(`• ${v.title} — ${v.channelName} (${v.publishedAt})`)
        sections.push(`  https://youtu.be/${v.videoId}`)
      }
    }

    // 검색 시간 업데이트
    await supabase
      .from('telegram_watch_topics')
      .update({ last_searched_at: new Date().toISOString() })
      .eq('id', topic.id)
  }

  if (!hasContent) return null
  return sections.join('\n')
}

const NEWS_DIGEST_INTERVAL = 4 * 60 * 60 * 1000 // 4시간마다
let lastNewsDigestAt = 0

async function newsDigestCheck() {
  if (!ceoChatId) return
  const now = Date.now()
  if (now - lastNewsDigestAt < NEWS_DIGEST_INTERVAL) return

  const hour = new Date().getHours()
  // 뉴스 다이제스트: 09시, 13시, 18시 전후에 전송
  if (![9, 13, 18].includes(hour)) return

  console.log('📰 뉴스 다이제스트 생성 중...')
  const digest = await buildNewsDigest()
  if (!digest) {
    console.log('  → 뉴스 없음')
    return
  }

  // Claude에게 요약 요청
  const prompt = `당신은 윌로우 에이전트입니다. 아래 뉴스/유튜브 검색 결과를 CEO에게 간결하게 브리핑하세요.

## 브리핑 규칙
- 사업과 관련된 핵심 뉴스만 선별
- 각 뉴스의 사업적 의미/영향을 한 줄로 코멘트
- 중요도 순으로 정렬
- "📰 뉴스 다이제스트"로 시작
- 텔레그램용, 간결하게

## 검색 결과
${digest}`

  await sendTyping(ceoChatId)
  const typingInterval = setInterval(() => sendTyping(ceoChatId!), 4000)
  const response = await askClaude(prompt)
  clearInterval(typingInterval)

  await sendMessage(ceoChatId, response)
  lastNewsDigestAt = now

  // 대화 기록 저장
  const history = await getConversation(ceoChatId)
  history.push({ role: 'assistant', content: `[뉴스 다이제스트]\n${response}`, timestamp: new Date().toISOString() })
  await saveConversation(ceoChatId, history)

  console.log('✅ 뉴스 다이제스트 전송 완료')
}

// ============================================================
// Claude CLI integration
// ============================================================
const SYSTEM_PROMPT = `당신은 "윌로우 에이전트"입니다. 윌로우인베스트먼트의 COO 역할을 수행하며, CEO(김동욱)에게 사업 현황을 보고하고 전략을 논의하며 지시를 수행합니다. 자신을 지칭할 때는 "윌로우 에이전트"라고 하세요.

## 역할
1. **사업 현황 보고**: 일정, 프로젝트, 재무 현황을 파악하고 간결하게 보고
2. **위험 관리**: 위험 요소나 주의 사항을 선제적으로 알림
3. **전략 조언**: 업무위키의 사업전략 문서를 숙지하고, 건설적이고 비판적 관점에서 전략적 조언 제공
4. **실행 지원**: CEO 지시에 따라 일정 등록, 위키 작성 등 실행
5. **텐소프트웍스 관리**: 텐소프트웍스 프로젝트/태스크 현황 파악 및 관리 (MCP 도구 사용 가능)
6. **코딩 & 시스템 관리**: 코드 수정, 파일 관리, git 작업, DB 마이그레이션 등 개발 작업 수행 가능 (풀 세션 모드)

## 윌로우인베스트먼트 구조
- ETF 사업: 아크로스(인덱스 사업자), ETC(ETF 플랫폼/운용사)
- AI 사업: 텐소프트웍스 (50% 지분, 온톨로지+MCP 기반 AI 서비스)
- CEO 역할: CFO로서 자금 관리, 기술 동향 전파, MVP 방향 제시

## 전략 조언 스타일
- 데이터와 위키 문서에 기반한 조언
- 장밋빛 전망보다 현실적 리스크 지적
- "악마의 대변인" 관점도 필요할 때 제시
- 대안이나 보완책을 함께 제안
- CEO의 아이디어를 존중하되, 빈틈이 보이면 솔직하게 지적

## 액션 수행
CEO가 일정 등록, 위키 작성 등을 요청하면, 응답에 아래 JSON 블록을 포함하세요.
일반 대화에는 액션 블록을 포함하지 마세요.

### 일정 등록
\`\`\`action
{"type":"create_schedule","title":"일정제목","schedule_date":"2026-03-10","start_time":"14:00","end_time":"15:00","client_name":"클라이언트명","memo":"메모"}
\`\`\`

### 위키 노트 작성
\`\`\`action
{"type":"create_wiki","title":"노트 제목","content":"노트 내용 (마크다운 가능)","section":"willow-mgmt","category":"전략"}
\`\`\`

### 태스크 추가 (일정에 하위 태스크)
\`\`\`action
{"type":"create_task","schedule_title":"소속 일정 제목","content":"태스크 내용","deadline":"2026-03-15"}
\`\`\`

### 뉴스 추적 주제 등록
\`\`\`action
{"type":"watch_topic","topic":"주제 이름","keywords":["키워드1","키워드2"],"category":"etf"}
\`\`\`

### 뉴스 추적 주제 해제
\`\`\`action
{"type":"unwatch_topic","topic":"주제 이름"}
\`\`\`

### 텐소프트웍스 태스크 생성
\`\`\`action
{"type":"tensw_create_task","project_slug":"프로젝트slug","title":"태스크 제목","description":"설명","priority":"high","due_date":"2026-03-15"}
\`\`\`

### 텐소프트웍스 태스크 상태 변경
\`\`\`action
{"type":"tensw_change_status","task_id":"태스크ID","status":"in_progress"}
\`\`\`

### 텐소프트웍스 일정 생성
\`\`\`action
{"type":"tensw_create_schedule","project_slug":"프로젝트slug","title":"일정 제목","start_date":"2026-03-15","end_date":"2026-03-20","milestone_type":"milestone"}
\`\`\`

### 온톨로지: 엔티티 생성/업데이트
\`\`\`action
{"type":"knowledge_entity","name":"엔티티명","entity_type":"concept","description":"설명","tags":["태그1","태그2"],"properties":{"key":"value"}}
\`\`\`

### 온톨로지: 관계 생성
\`\`\`action
{"type":"knowledge_relation","subject":"엔티티명(주어)","predicate":"관계유형","object":"엔티티명(목적어)","properties":{"note":"맥락"}}
\`\`\`

### 온톨로지: 인사이트 기록
\`\`\`action
{"type":"knowledge_insight","content":"인사이트 내용","insight_type":"decision","entity_names":["관련엔티티1","관련엔티티2"],"context":"대화 맥락"}
\`\`\`

참고: 뉴스/검색 관련 질문 시 시스템이 자동으로 Google News와 YouTube를 검색해서 "실시간 검색 결과" 섹션으로 제공합니다. 이 결과를 바탕으로 요약/분석하세요. 직접 웹 검색을 시도하지 마세요.

참고: 텐소프트웍스 데이터는 "텐소프트웍스 현황" 섹션에 포함되어 있습니다. 텐소프트웍스 관련 질문에 이 데이터를 활용하세요.

중요: 모든 대화에서 사업적 가치가 있는 지식은 반드시 온톨로지 액션으로 기록하세요. 일상 대화라도 CEO의 생각, 방향성, 우려 사항이 담겨 있으면 insight로 기록합니다.

* start_time, end_time, client_name, memo, category는 선택
* section: "willow-mgmt" | "tensw-mgmt" | "akros" | "etf-etc"
* 액션 블록 앞뒤에 설명 텍스트를 자유롭게 추가하세요

## 풀 세션 모드 (코딩/개발 작업)
코딩이나 시스템 작업이 필요한 경우 풀 세션 모드가 활성화됩니다. 이 모드에서는:
- 파일 읽기/쓰기/편집 가능
- Bash 명령 실행 가능
- git 작업 가능 (단, push는 명시적 요청 시에만)
- DB 마이그레이션, API 수정 등 가능
- 작업 후 결과를 간결하게 보고 (변경 파일, 주요 수정 내용)
- 작업 디렉토리: /Volumes/PRO-G40/app-dev/willow-invt (Next.js 프로젝트)
- 중요: 파괴적 작업 전 반드시 확인 메시지 포함

## 온톨로지 기반 지식 축적 (매우 중요)
모든 대화에서 자동으로 지식을 추출하고 온톨로지를 진화시키세요.

### 지식 추출 규칙
1. **새로운 개념/엔티티** 발견 시 → knowledge_entity 액션
2. **관계** 발견 시 → knowledge_relation 액션
3. **인사이트/결정** 발견 시 → knowledge_insight 액션
4. 기존 엔티티 업데이트가 필요하면 → knowledge_update 액션
5. 사소한 대화라도 사업적 맥락이 있으면 기록

### 엔티티 타입
person, company, project, strategy, decision, insight, concept, technology, market, risk, opportunity, product, client, regulation

### 관계 타입 (predicate)
owns, manages, leads, part_of, depends_on, competes_with, supports, contradicts, blocks, leads_to, evolves_from, uses_technology, employs_strategy, serves_market, targets, collaborates_with, invested_in

### 온톨로지 원칙
- 밀도: 엔티티 간 최대한 많은 관계를 연결
- 진화: 새 정보가 기존 지식과 충돌하면 업데이트 (supersede)
- 계층: 상위 개념 → 하위 개념 구조 유지
- 맥락: 왜 이 지식이 중요한지 context 필드에 기록

## 커뮤니케이션 스타일
- 한국어로 대화
- 사람처럼 자연스럽게. 매번 길게 답할 필요 없음
- 짧은 질문엔 짧게, 깊은 논의엔 깊게
- 숫자와 날짜는 구체적으로
- 위험/지연 사항은 먼저 언급
- 이모지 적절히 활용`

// tensw-todo MCP 도구 패턴
const TENSW_MCP_TOOLS = 'mcp__claude_ai_tensw-todo__*'

function askClaude(prompt: string, opts?: { allowedTools?: string[]; fullSession?: boolean }): Promise<string> {
  return new Promise((resolve, reject) => {
    // CLAUDECODE 환경변수를 제거해야 중첩 세션 에러 방지
    const env = { ...process.env }
    delete env.CLAUDECODE

    const args = ['-p', '--output-format', 'text']
    // 풀 세션: 파일 편집, Bash, git 등 모든 도구 사용 가능
    if (opts?.fullSession) {
      args.push('--dangerously-skip-permissions')
    }
    if (opts?.allowedTools?.length) {
      args.push('--allowedTools', opts.allowedTools.join(','))
    }

    const proc = spawn('claude', args, {
      cwd: process.cwd(),
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => { stdout += data.toString() })
    proc.stderr.on('data', (data) => { stderr += data.toString() })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim())
      } else {
        console.error('Claude CLI error:', stderr)
        reject(new Error(`Claude exited with code ${code}: ${stderr}`))
      }
    })

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn claude: ${err.message}`))
    })

    proc.stdin.write(prompt)
    proc.stdin.end()
  })
}

// ============================================================
// Action parser & executor
// ============================================================
interface ActionBlock {
  type: string
  [key: string]: unknown
}

function extractActions(text: string): { cleanText: string; actions: ActionBlock[] } {
  const actions: ActionBlock[] = []
  const cleanText = text.replace(/```action\n([\s\S]*?)```/g, (_match, json) => {
    try {
      const action = JSON.parse(json.trim())
      if (action.type) actions.push(action)
    } catch (e) {
      console.error('Action parse error:', e)
    }
    return '' // 액션 블록은 사용자에게 보여주지 않음
  }).replace(/\n{3,}/g, '\n\n').trim()

  return { cleanText, actions }
}

async function executeAction(action: ActionBlock): Promise<string> {
  try {
    switch (action.type) {
      case 'create_schedule': {
        // client_name으로 client_id 조회
        let clientId: string | null = null
        if (action.client_name) {
          const { data: client } = await supabase
            .from('willow_mgmt_clients')
            .select('id')
            .ilike('name', `%${action.client_name}%`)
            .limit(1)
            .single()
          clientId = client?.id || null
        }

        const { data, error } = await supabase
          .from('willow_mgmt_schedules')
          .insert({
            title: action.title,
            schedule_date: action.schedule_date,
            start_time: action.start_time || null,
            end_time: action.end_time || null,
            client_id: clientId,
            description: action.memo || action.description || null,
            is_completed: false,
          })
          .select()
          .single()

        if (error) throw error
        return `✅ 일정 등록: "${action.title}" (${action.schedule_date})`
      }

      case 'create_wiki': {
        const { error } = await supabase
          .from('work_wiki')
          .insert({
            title: action.title,
            content: action.content,
            section: action.section || 'willow-mgmt',
            category: action.category || null,
          })

        if (error) throw error
        return `✅ 위키 작성: "${action.title}"`
      }

      case 'create_task': {
        // schedule_title로 schedule_id 조회
        let scheduleId: string | null = null
        if (action.schedule_title) {
          const { data: schedule } = await supabase
            .from('willow_mgmt_schedules')
            .select('id')
            .ilike('title', `%${action.schedule_title}%`)
            .order('schedule_date', { ascending: false })
            .limit(1)
            .single()
          scheduleId = schedule?.id || null
        }

        if (!scheduleId) return `⚠️ 태스크 추가 실패: 일정 "${action.schedule_title}"을 찾을 수 없습니다`

        const { error } = await supabase
          .from('willow_mgmt_tasks')
          .insert({
            schedule_id: scheduleId,
            content: action.content,
            deadline: action.deadline || null,
            is_completed: false,
          })

        if (error) throw error
        return `✅ 태스크 추가: "${action.content}"`
      }

      case 'watch_topic': {
        const keywords = (action.keywords as string[]) || [action.topic as string]
        const { error } = await supabase
          .from('telegram_watch_topics')
          .insert({
            topic: action.topic,
            keywords,
            category: action.category || 'general',
            is_active: true,
          })

        if (error) throw error
        return `✅ 뉴스 추적 등록: "${action.topic}" (키워드: ${keywords.join(', ')})`
      }

      case 'unwatch_topic': {
        const { error } = await supabase
          .from('telegram_watch_topics')
          .update({ is_active: false })
          .ilike('topic', `%${action.topic}%`)

        if (error) throw error
        return `✅ 뉴스 추적 해제: "${action.topic}"`
      }

      case 'search_news': {
        const query = action.query as string
        const includeYt = action.include_youtube !== false

        const results: string[] = [`🔍 "${query}" 검색 결과:`]

        const news = await searchGoogleNews(query, 5)
        if (news.length) {
          results.push('\n📰 뉴스:')
          for (const n of news) {
            results.push(`• ${n.title}${n.source ? ` (${n.source})` : ''}`)
          }
        }

        if (includeYt) {
          const videos = await searchYouTube(query, 3)
          if (videos.length) {
            results.push('\n🎬 유튜브:')
            for (const v of videos) {
              results.push(`• ${v.title} — ${v.channelName}`)
              results.push(`  https://youtu.be/${v.videoId}`)
            }
          }
        }

        return results.length > 1 ? results.join('\n') : `검색 결과가 없습니다: "${query}"`
      }

      // ─── 온톨로지 액션 ───
      case 'knowledge_entity': {
        // 기존 엔티티 확인 (이름으로)
        const { data: existing } = await supabase
          .from('knowledge_entities')
          .select('id')
          .eq('name', action.name)
          .limit(1)
          .single()

        if (existing) {
          // 업데이트
          const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
          if (action.description) updates.description = action.description
          if (action.properties) updates.properties = action.properties
          if (action.tags) updates.tags = action.tags
          await supabase.from('knowledge_entities').update(updates).eq('id', existing.id)
          return `🧠 엔티티 업데이트: "${action.name}"`
        } else {
          // 생성
          await supabase.from('knowledge_entities').insert({
            name: action.name,
            entity_type: action.entity_type || 'concept',
            description: action.description || '',
            properties: action.properties || {},
            tags: action.tags || [],
            source: 'conversation',
          })
          return `🧠 엔티티 생성: "${action.name}" (${action.entity_type})`
        }
      }

      case 'knowledge_relation': {
        // subject와 object 엔티티 ID 조회
        const [{ data: subj }, { data: obj }] = await Promise.all([
          supabase.from('knowledge_entities').select('id').eq('name', action.subject).limit(1).single(),
          supabase.from('knowledge_entities').select('id').eq('name', action.object).limit(1).single(),
        ])

        if (!subj || !obj) {
          // 엔티티가 없으면 자동 생성
          const missing = []
          let subjId = subj?.id
          let objId = obj?.id

          if (!subjId) {
            const { data: created } = await supabase.from('knowledge_entities')
              .insert({ name: action.subject as string, entity_type: 'concept', source: 'auto' })
              .select('id').single()
            subjId = created?.id
            missing.push(action.subject)
          }
          if (!objId) {
            const { data: created } = await supabase.from('knowledge_entities')
              .insert({ name: action.object as string, entity_type: 'concept', source: 'auto' })
              .select('id').single()
            objId = created?.id
            missing.push(action.object)
          }

          if (subjId && objId) {
            await supabase.from('knowledge_relations').insert({
              subject_id: subjId,
              predicate: action.predicate,
              object_id: objId,
              properties: action.properties || {},
              source: 'conversation',
            })
          }
          return `🔗 관계: "${action.subject}" —[${action.predicate}]→ "${action.object}" (자동 생성: ${missing.join(', ') || 'none'})`
        }

        await supabase.from('knowledge_relations').insert({
          subject_id: subj.id,
          predicate: action.predicate,
          object_id: obj.id,
          properties: action.properties || {},
          source: 'conversation',
        })
        return `🔗 관계: "${action.subject}" —[${action.predicate}]→ "${action.object}"`
      }

      case 'knowledge_insight': {
        // 관련 엔티티 ID 조회
        const entityNames = (action.entity_names as string[]) || []
        const entityIds: string[] = []
        for (const name of entityNames) {
          const { data } = await supabase.from('knowledge_entities').select('id').eq('name', name).limit(1).single()
          if (data) entityIds.push(data.id)
        }

        await supabase.from('knowledge_insights').insert({
          content: action.content,
          insight_type: action.insight_type || 'observation',
          entity_ids: entityIds,
          context: action.context || '',
        })
        return `💡 인사이트: "${(action.content as string).slice(0, 60)}..."`
      }

      // ─── Tensw-todo MCP 액션 ───
      case 'tensw_create_task': {
        const result = await askClaude(
          `텐소프트웍스 프로젝트 "${action.project_slug}"에 새 태스크를 생성해줘.
제목: ${action.title}
${action.description ? `설명: ${action.description}` : ''}
${action.priority ? `우선순위: ${action.priority}` : ''}
${action.due_date ? `마감일: ${action.due_date}` : ''}
생성 결과만 간단히 알려줘.`,
          { allowedTools: [TENSW_MCP_TOOLS] }
        )
        tenswDataCache = '' // 캐시 무효화
        return `✅ 텐소프트웍스 태스크: ${result.slice(0, 200)}`
      }

      case 'tensw_change_status': {
        const result = await askClaude(
          `텐소프트웍스 태스크 ID "${action.task_id}"의 상태를 "${action.status}"로 변경해줘. 결과만 간단히 알려줘.`,
          { allowedTools: [TENSW_MCP_TOOLS] }
        )
        tenswDataCache = '' // 캐시 무효화
        return `✅ 텐소프트웍스 상태변경: ${result.slice(0, 200)}`
      }

      case 'tensw_create_schedule': {
        const result = await askClaude(
          `텐소프트웍스 프로젝트 "${action.project_slug}"에 새 일정을 생성해줘.
제목: ${action.title}
시작일: ${action.start_date}
${action.end_date ? `종료일: ${action.end_date}` : ''}
${action.milestone_type ? `유형: ${action.milestone_type}` : ''}
생성 결과만 간단히 알려줘.`,
          { allowedTools: [TENSW_MCP_TOOLS] }
        )
        tenswDataCache = '' // 캐시 무효화
        return `✅ 텐소프트웍스 일정: ${result.slice(0, 200)}`
      }

      default:
        return `⚠️ 알 수 없는 액션: ${action.type}`
    }
  } catch (err: any) {
    console.error('Action execution error:', err)
    return `⚠️ 액션 실행 실패 (${action.type}): ${err.message}`
  }
}

// ============================================================
// Message handler
// ============================================================
async function handleMessage(chatId: number, text: string) {
  console.log(`[${chatId}] User: ${text}`)

  try {
    // 대시보드 + 위키 + 추적주제 + 텐소프트웍스 + 온톨로지 데이터 수집
    const [dashboardContext, wikiContext, watchTopics, tenswContext, knowledgeContext] = await Promise.all([
      fetchDashboardContext(),
      fetchWikiContext(),
      getWatchTopics(),
      fetchTenswContext(),
      fetchKnowledgeContext(),
    ])

    // 대화 기록 조회
    const history = await getConversation(chatId)

    // 추적 주제 컨텍스트
    const topicsText = watchTopics.length
      ? '\n## 뉴스 추적 주제\n' + watchTopics.map(t =>
          `- ${t.topic} [${t.category}] (키워드: ${t.keywords.join(', ')})`
        ).join('\n')
      : ''

    // 뉴스/검색 관련 메시지면 미리 검색해서 결과를 제공
    const newsKeywords = ['뉴스', '기사', '소식', '검색', '찾아', '알려줘', 'news', '최근', '요즘', '동향', '시장']
    const isNewsRelated = newsKeywords.some(k => text.includes(k))
    let prefetchedNews = ''

    if (isNewsRelated) {
      console.log('📰 뉴스 사전검색 중...')
      // 메시지에서 관련 주제/키워드 추출해서 검색
      const searchQueries: string[] = []

      // 등록된 주제 중 메시지와 관련된 것
      for (const t of watchTopics) {
        const topicWords = [t.topic, ...t.keywords]
        if (topicWords.some(w => text.includes(w) || text.includes(t.topic.split(' ')[0]))) {
          searchQueries.push(t.keywords.join(' OR '))
        }
      }

      // 메시지 자체도 검색어로 사용 (너무 길지 않으면)
      if (searchQueries.length === 0 && text.length < 50) {
        searchQueries.push(text.replace(/[?？뭐있어알려줘찾아봐]/g, '').trim())
      }

      if (searchQueries.length > 0) {
        const newsResults = await Promise.all(
          searchQueries.map(async q => {
            const [news, videos] = await Promise.all([
              searchGoogleNews(q, 5),
              searchYouTube(q, 3),
            ])
            return { query: q, news, videos }
          })
        )

        const parts: string[] = []
        for (const r of newsResults) {
          if (r.news.length) {
            parts.push(`\n### 뉴스 검색 "${r.query}":`)
            for (const n of r.news) {
              const date = n.pubDate ? new Date(n.pubDate).toLocaleDateString('ko-KR') : ''
              parts.push(`- ${n.title} (${n.source}) ${date}`)
            }
          }
          if (r.videos.length) {
            parts.push(`\n### 유튜브 "${r.query}":`)
            for (const v of r.videos) {
              parts.push(`- ${v.title} — ${v.channelName} (${v.publishedAt}) https://youtu.be/${v.videoId}`)
            }
          }
        }
        if (parts.length) {
          prefetchedNews = '\n\n# 실시간 검색 결과 (방금 검색)\n' + parts.join('\n')
        }
      }
    }

    // 프롬프트 빌드
    const historyText = history.length
      ? '\n## 이전 대화\n' + history.map(m =>
          m.role === 'user' ? `사용자: ${m.content}` : `윌로우 에이전트: ${m.content}`
        ).join('\n')
      : ''

    const fullPrompt = `${SYSTEM_PROMPT}

# 현재 사업 데이터 (윌로우인베스트먼트)
${dashboardContext}

# 텐소프트웍스 현황
${tenswContext}

# 온톨로지 (지식 그래프)
${knowledgeContext}

# 업무위키
${wikiContext}
${topicsText}
${prefetchedNews}
${historyText}

# CEO 메시지
${text}

위 데이터를 참고하여 CEO의 메시지에 답하세요. 텔레그램 메시지이므로 간결하게. 검색 결과가 포함되어 있으면 핵심만 요약하고 사업적 의미를 코멘트하세요.`

    // 타이핑 유지 (Claude 처리 중)
    const typingInterval = setInterval(() => sendTyping(chatId), 4000)

    // 항상 풀 세션: Claude Code + 모든 도구 + MCP
    const response = await askClaude(fullPrompt, {
      fullSession: true,
      allowedTools: [TENSW_MCP_TOOLS],
    })

    clearInterval(typingInterval)

    // 액션 추출 및 실행
    const { cleanText, actions } = extractActions(response)

    // 액션 실행 결과 수집
    const actionResults: string[] = []
    for (const action of actions) {
      console.log(`⚡ 액션 실행: ${action.type}`)
      const result = await executeAction(action)
      actionResults.push(result)
      console.log(`  → ${result}`)
    }

    // 사용자에게 보낼 최종 메시지 (액션 결과 포함)
    const finalMessage = actionResults.length
      ? `${cleanText}\n\n---\n${actionResults.join('\n')}`
      : cleanText

    // 대화 기록 저장
    const now = new Date().toISOString()
    history.push({ role: 'user', content: text, timestamp: now })
    history.push({ role: 'assistant', content: finalMessage, timestamp: now })
    await saveConversation(chatId, history)

    // 응답 전송
    await sendMessage(chatId, finalMessage)
    console.log(`[${chatId}] Bot: ${finalMessage.slice(0, 100)}...`)

  } catch (err) {
    console.error('Error handling message:', err)
    await sendMessage(chatId, '⚠️ 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
  }
}

// ============================================================
// Telegram polling loop
// ============================================================
async function getUpdates(offset: number): Promise<any[]> {
  try {
    const res = await fetch(`${TELEGRAM_API}/getUpdates?offset=${offset}&timeout=30`, {
      signal: AbortSignal.timeout(35000),
    })
    const data = await res.json()
    return data.ok ? data.result : []
  } catch {
    return []
  }
}

async function main() {
  console.log('🌿 윌로우 에이전트 시작...')

  // 중복 실행 방지
  if (!acquireLock()) {
    process.exit(1)
  }

  // 종료 시 lock 해제
  const cleanup = () => {
    releaseLock()
    process.exit(0)
  }
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
  process.on('exit', releaseLock)

  // Bot 정보 확인
  const me = await tg('getMe', {})
  if (!me.ok) {
    console.error('Bot token invalid:', me)
    releaseLock()
    process.exit(1)
  }
  console.log(`✅ Bot: @${me.result.username} (${me.result.first_name}) [PID: ${process.pid}]`)

  // CEO chat_id 복원
  await loadCeoChatId()

  // 자율 점검 루프 시작
  console.log(`🔄 자율 점검 활성화 (${PROACTIVE_CHECK_INTERVAL / 60000}분 간격)`)
  setInterval(proactiveCheck, PROACTIVE_CHECK_INTERVAL)
  // 시작 직후 1회 점검
  setTimeout(proactiveCheck, 5000)

  // 저장된 offset 복원 (재시작 시 이전 메시지 건너뛰기)
  let offset = loadOffset()
  if (offset > 0) {
    console.log(`📌 저장된 offset 복원: ${offset}`)
  }

  console.log('📡 텔레그램 메시지 대기 중...\n')

  while (true) {
    const updates = await getUpdates(offset)

    for (const update of updates) {
      offset = update.update_id + 1
      saveOffset(offset)

      const msg = update.message
      if (!msg?.text) continue

      // 중복 메시지 처리 방지
      if (processingMessages.has(update.update_id)) {
        console.log(`⏭️ 중복 update 스킵: ${update.update_id}`)
        continue
      }
      processingMessages.add(update.update_id)
      // 5분 후 Set에서 제거 (메모리 누수 방지)
      setTimeout(() => processingMessages.delete(update.update_id), 5 * 60 * 1000)

      // CEO chat_id 등록
      if (!ceoChatId) {
        ceoChatId = msg.chat.id
        console.log(`📌 CEO chat_id 등록: ${ceoChatId}`)
      }

      // /start 명령어
      if (msg.text === '/start') {
        await sendMessage(msg.chat.id,
          `안녕하세요, 윌로우 에이전트입니다. 🌿\n\n` +
          `사업 현황 보고, 전략 논의, 일정/위키 관리를 담당합니다.\n\n` +
          `💬 대화 예시:\n` +
          `• "오늘 브리핑해줘"\n` +
          `• "사업 전략 같이 논의하자"\n` +
          `• "내일 14시에 아크로스 미팅 잡아줘"\n` +
          `• "지금 가장 위험한 게 뭐야?"\n\n` +
          `🔔 자율 알림:\n` +
          `• 매일 오전 아침 브리핑\n` +
          `• 마일스톤 지연/긴급 상황 자동 감지\n\n` +
          `/clear - 대화 초기화`
        )
        continue
      }

      // /clear - 대화 초기화
      if (msg.text === '/clear') {
        await saveConversation(msg.chat.id, [])
        await sendMessage(msg.chat.id, '대화 기록이 초기화되었습니다.')
        continue
      }

      // 인용 답장(reply) 처리 — 원본 메시지를 맥락에 포함
      let messageText = msg.text
      if (msg.reply_to_message?.text) {
        const replyFrom = msg.reply_to_message.from?.is_bot ? '윌로우 에이전트' : 'CEO'
        messageText = `[인용된 메시지 (${replyFrom})]\n${msg.reply_to_message.text}\n\n[CEO 답장]\n${msg.text}`
      }

      // 일반 메시지 처리
      await handleMessage(msg.chat.id, messageText)
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  releaseLock()
  process.exit(1)
})
