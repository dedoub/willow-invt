#!/usr/bin/env tsx
/**
 * Claude Code `claude -p` (sdk-cli) 사용량 추정
 *
 * 2026-06-15부터 Agent SDK 호출은 구독 한도와 분리된 별도 크레딧을 사용.
 * - Max 20x: 월 $200
 * - 크레딧 소진 시 → 다음 정산까지 중단 OR extra usage(API 요율)
 *
 * 이 스크립트는 ~/.claude/projects/ 의 모든 세션 JSONL에서
 * entrypoint === "sdk-cli" 항목만 골라서 비용을 추정한다.
 */

import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

// ─── Pricing (USD per 1M tokens, 2026) ─────────────────────────────────────
const PRICING: Record<string, { in: number; cacheWrite5m: number; cacheWrite1h: number; cacheRead: number; out: number }> = {
  'claude-opus-4-7':    { in: 15, cacheWrite5m: 18.75, cacheWrite1h: 30,  cacheRead: 1.50, out: 75 },
  'claude-opus-4-6':    { in: 15, cacheWrite5m: 18.75, cacheWrite1h: 30,  cacheRead: 1.50, out: 75 },
  'claude-sonnet-4-6':  { in: 3,  cacheWrite5m: 3.75,  cacheWrite1h: 6,   cacheRead: 0.30, out: 15 },
  'claude-sonnet-4-5':  { in: 3,  cacheWrite5m: 3.75,  cacheWrite1h: 6,   cacheRead: 0.30, out: 15 },
  'claude-haiku-4-5':   { in: 1,  cacheWrite5m: 1.25,  cacheWrite1h: 2,   cacheRead: 0.10, out: 5 },
}
const FALLBACK = PRICING['claude-sonnet-4-6']  // 모델 식별 안 될 때 기본값

function priceOf(modelId: string) {
  if (!modelId) return FALLBACK
  for (const key of Object.keys(PRICING)) {
    if (modelId.includes(key)) return PRICING[key]
  }
  // 'claude-sonnet-4-5-20250929' 같은 변형 정규화
  if (modelId.includes('opus'))   return PRICING['claude-opus-4-7']
  if (modelId.includes('sonnet')) return PRICING['claude-sonnet-4-6']
  if (modelId.includes('haiku'))  return PRICING['claude-haiku-4-5']
  return FALLBACK
}

interface DailyUsage {
  date: string
  cost: number
  inputTokens: number
  cacheWriteTokens: number
  cacheReadTokens: number
  outputTokens: number
  sessions: Set<string>
}

// 첫 prompt 내용으로 어느 스크립트인지 식별
function classifyScript(promptContent: string): string {
  if (!promptContent) return 'unknown'
  const p = promptContent.slice(0, 2000)

  // 텔레그램 봇 관련 (가장 비용 큼 - 우선 분류)
  if (/photo_\d+\.jpg/.test(p) || (p.includes('Read tool로 읽어서 분석') && p.includes('사용자가 함께 보낸'))) {
    return 'telegram-bot (image)'
  }
  if (p.includes('공부친구') || p.includes('리나(Rina)') || p.includes('류하의 학습')) return 'ryuha-bot'

  // 마켓/리서치
  if (p.includes('포트폴리오 현황을 브리핑') || p.includes('포트폴리오 브리핑')) return 'portfolio-briefing'
  if (p.includes('뉴스/유튜브 검색 결과') || p.includes('시장 데이터를 CEO에게')) return 'market-research-scan'
  if (p.includes('비보유 신규 후보 종목')) return 'market-research (post-process)'
  if (p.includes('knowledge extraction assistant') || (p.includes('Extract structured knowledge') && p.includes('stock research'))) {
    return 'stock-research-extract'
  }
  if (p.includes('소형주') || p.includes('smallcap')) return 'smallcap-screen'
  if (p.includes('부동산') && p.includes('호가')) return 'real-estate-sync'
  if (p.includes('Reddit') && p.includes('buzz')) return 'reddit-buzz'
  if (p.includes('네이버') && p.includes('listing')) return 'naver-listings-sync'

  // 텐소프트웍스 관련
  if (p.includes('태스크에 대해 담당자에게') || p.includes('자동 알림 봇')) return 'tensw-todo (reminder)'
  if (p.includes('커밋-태스크 매핑')) return 'tensw-todo (commit-map)'
  if (p.includes('소프트웨어 프로젝트 진단') || p.includes('주간 리포트')) return 'tensw-todo (weekly-report)'
  if (p.includes('텐소프트웍스 CEO 대시보드') || p.includes('get_ceo_dashboard')) return 'tensw-todo (dashboard)'

  // Gmail
  if (p.includes('이메일 분류 전문가') || p.includes('gmail-auto-label')) return 'gmail-auto-label'

  // Willy 일반
  if (p.includes('윌리') || p.includes('Willy')) return 'telegram-bot (willy)'
  return 'other'
}

const projectsDir = join(homedir(), '.claude', 'projects')

function* walkSessions(): Generator<string> {
  for (const projDir of readdirSync(projectsDir)) {
    const full = join(projectsDir, projDir)
    if (!statSync(full).isDirectory()) continue
    for (const file of readdirSync(full)) {
      if (file.endsWith('.jsonl')) yield join(full, file)
    }
  }
}

// 마지막 30일치 계산
const now = new Date()
const cutoff = new Date(now)
cutoff.setDate(cutoff.getDate() - 30)

const daily = new Map<string, DailyUsage>()
let totalSessions = 0
let sdkSessions = 0
let totalCost = 0
const projectBreakdown = new Map<string, number>()
const scriptBreakdown = new Map<string, { cost: number; sessions: number }>()

for (const filePath of walkSessions()) {
  totalSessions++
  const projectKey = filePath.split('/').slice(-2, -1)[0]
  let sessionHasSdkCli = false
  let sessionCost = 0
  let sessionScript = 'unknown'
  let scriptResolved = false

  const content = readFileSync(filePath, 'utf-8')
  for (const line of content.split('\n')) {
    if (!line.trim()) continue
    let entry: Record<string, unknown>
    try { entry = JSON.parse(line) } catch { continue }

    // 첫 prompt 내용으로 스크립트 식별 (queue-operation의 content)
    if (!scriptResolved && entry.type === 'queue-operation' && typeof entry.content === 'string') {
      sessionScript = classifyScript(entry.content)
      scriptResolved = true
    }

    if (entry.entrypoint !== 'sdk-cli') continue

    const ts = entry.timestamp as string | undefined
    if (!ts) continue
    const d = new Date(ts)
    if (d < cutoff) continue
    const dateKey = ts.slice(0, 10)

    // usage 데이터 추출 (assistant 응답에만 있음)
    const message = entry.message as Record<string, unknown> | undefined
    if (!message) continue
    const usage = message.usage as Record<string, unknown> | undefined
    if (!usage) continue

    const input = Number(usage.input_tokens) || 0
    const cacheCreation = Number(usage.cache_creation_input_tokens) || 0
    const cacheRead = Number(usage.cache_read_input_tokens) || 0
    const output = Number(usage.output_tokens) || 0
    const cacheBreakdown = usage.cache_creation as Record<string, unknown> | undefined
    const cache1h = Number(cacheBreakdown?.ephemeral_1h_input_tokens) || 0
    const cache5m = Number(cacheBreakdown?.ephemeral_5m_input_tokens) || cacheCreation - cache1h

    const model = (message.model as string) || ''
    const p = priceOf(model)
    const cost =
      (input * p.in +
       cache5m * p.cacheWrite5m +
       cache1h * p.cacheWrite1h +
       cacheRead * p.cacheRead +
       output * p.out) / 1_000_000

    sessionCost += cost
    sessionHasSdkCli = true

    if (!daily.has(dateKey)) {
      daily.set(dateKey, {
        date: dateKey, cost: 0,
        inputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 0,
        sessions: new Set(),
      })
    }
    const day = daily.get(dateKey)!
    day.cost += cost
    day.inputTokens += input
    day.cacheWriteTokens += cacheCreation
    day.cacheReadTokens += cacheRead
    day.outputTokens += output
    day.sessions.add(entry.sessionId as string)
  }

  if (sessionHasSdkCli) {
    sdkSessions++
    totalCost += sessionCost
    projectBreakdown.set(projectKey, (projectBreakdown.get(projectKey) || 0) + sessionCost)
    const prev = scriptBreakdown.get(sessionScript) || { cost: 0, sessions: 0 }
    scriptBreakdown.set(sessionScript, { cost: prev.cost + sessionCost, sessions: prev.sessions + 1 })
  }
}

// ─── Output ─────────────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 })

const days = [...daily.values()].sort((a, b) => a.date.localeCompare(b.date))
const dailyAvg = days.length > 0 ? totalCost / days.length : 0
const projected30 = dailyAvg * 30

console.log('═══════════════════════════════════════════════════════════════')
console.log('  Claude Code  `claude -p` (sdk-cli) 사용량 추정 — 지난 30일')
console.log('═══════════════════════════════════════════════════════════════\n')

console.log(`전체 세션:         ${totalSessions}`)
console.log(`sdk-cli 세션:      ${sdkSessions}`)
console.log(`활동 일자:          ${days.length}일\n`)

console.log('▶ 비용 추정')
console.log(`  실제 30일 누적:   $${fmt(totalCost)}`)
console.log(`  일평균:            $${fmt(dailyAvg)}`)
console.log(`  월 환산(30일):    $${fmt(projected30)}\n`)

console.log('▶ Max 20x 한도 ($200/월)')
const usedPct = (projected30 / 200) * 100
const remaining = 200 - projected30
console.log(`  사용률 예상:       ${fmt(usedPct)}%`)
console.log(`  여유:              ${remaining >= 0 ? `$${fmt(remaining)} 남음` : `$${fmt(Math.abs(remaining))} 초과!`}\n`)

console.log('▶ 일별 (최근 14일)')
const recent = days.slice(-14)
for (const d of recent) {
  const bar = '█'.repeat(Math.min(40, Math.round(d.cost / 3)))
  console.log(`  ${d.date}  $${fmt(d.cost).padStart(7)}  ${d.sessions.size}세션  ${bar}`)
}

console.log('\n▶ 스크립트별 breakdown')
const scripts = [...scriptBreakdown.entries()].sort((a, b) => b[1].cost - a[1].cost)
const maxScriptCost = scripts[0]?.[1].cost || 1
for (const [script, { cost, sessions }] of scripts) {
  const pct = (cost / totalCost) * 100
  const bar = '█'.repeat(Math.min(30, Math.round((cost / maxScriptCost) * 30)))
  console.log(`  $${fmt(cost).padStart(8)}  ${fmt(pct).padStart(5)}%  ${sessions.toString().padStart(4)}세션  ${script.padEnd(28)}  ${bar}`)
}

console.log('\n▶ 프로젝트별 (상위 5개)')
const projects = [...projectBreakdown.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
for (const [proj, cost] of projects) {
  const name = proj.replace(/^-/, '').slice(0, 50)
  console.log(`  $${fmt(cost).padStart(7)}  ${name}`)
}

console.log('\n▶ 토큰 합계 (M tokens, 백만)')
const sumIn = days.reduce((s, d) => s + d.inputTokens, 0)
const sumCacheW = days.reduce((s, d) => s + d.cacheWriteTokens, 0)
const sumCacheR = days.reduce((s, d) => s + d.cacheReadTokens, 0)
const sumOut = days.reduce((s, d) => s + d.outputTokens, 0)
console.log(`  Input:             ${fmt(sumIn / 1_000_000)}M`)
console.log(`  Cache write:       ${fmt(sumCacheW / 1_000_000)}M`)
console.log(`  Cache read:        ${fmt(sumCacheR / 1_000_000)}M`)
console.log(`  Output:            ${fmt(sumOut / 1_000_000)}M`)

console.log('\n💡 참고')
console.log('  - sdk-cli = `claude -p` / Agent SDK 호출 (백그라운드 스크립트)')
console.log('  - cli = 대화형 Claude Code (이 변경 영향 없음)')
console.log('  - 2026-06-15부터 sdk-cli는 별도 크레딧으로 분리됨')
console.log('  - 이 추정은 모든 프로젝트의 sdk-cli 사용을 합산')
