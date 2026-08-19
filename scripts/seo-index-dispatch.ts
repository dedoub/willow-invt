#!/usr/bin/env -S npx tsx
// VoiceCards + ReviewNotes GSC 수동 색인 요청을 매일 워크스테이션 Codex에 맡긴다.
// 실제 요청은 GSC UI가 필요하므로 이 스크립트는 ws_commands에 하루 한 번만 등록한다.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = 'scheduled:gsc-indexing'
const PROJECT = 'willow-invt'
const CWD = ROOT

function loadEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {}
  let raw = ''
  try { raw = readFileSync(path, 'utf8') } catch { return out }
  for (const line of raw.split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!match) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out[match[1]] = value
  }
  return out
}

const env = loadEnv(join(ROOT, '.env.local'))
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SECRET_KEY
const defaultChatId = Number(env.WILLY_TELEGRAM_CHAT_ID || process.env.WILLY_TELEGRAM_CHAT_ID || '7586966475')

if (!supabaseUrl || !serviceKey) {
  console.error('GSC 스케줄 등록 실패: .env.local Supabase 크레덴셜 없음')
  process.exit(1)
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
}

function kstParts(now = new Date()): { date: string; weekday: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(now)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || ''
  return { date: `${value('year')}-${value('month')}-${value('day')}`, weekday: value('weekday') }
}

function kstMidnightUtc(date: string): string {
  return new Date(`${date}T00:00:00+09:00`).toISOString()
}

async function request(path: string, init: RequestInit = {}): Promise<any> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  })
  if (!response.ok) throw new Error(`Supabase REST ${response.status}: ${await response.text()}`)
  const body = await response.text()
  return body ? JSON.parse(body) : null
}

async function main() {
  const { date, weekday } = kstParts()
  const since = encodeURIComponent(kstMidnightUtc(date))
  const existing = await request(
    `ws_commands?source=eq.${encodeURIComponent(SOURCE)}&created_at=gte.${since}&select=id,status,created_at&limit=1`,
  )
  if (Array.isArray(existing) && existing.length) {
    console.log(`GSC 색인 스케줄: ${date} 이미 등록됨 (${existing[0].status})`)
    return
  }

  // 일요일에도 작업은 실행하되 sunday_no_message 정책에 따라 텔레그램 결과 전송은 생략한다.
  const sourceChatId = weekday === 'Sun' ? null : defaultChatId
  const instruction = `docs/seo-indexing-plan.md의 실행 프로토콜에 따라 오늘(${date}, KST) VoiceCards와 ReviewNotes GSC 색인 요청 배치를 실제로 실행하세요.

필수 절차:
1. 당일 seo_index_status 최신 스냅샷과 docs/seo-indexing-plan.md 최근 요청 로그를 먼저 확인하세요.
2. 최근 요청 URL과 이미 색인된 URL을 제외하고 대기열에서 후보를 다시 고르세요. 기본 배분은 VoiceCards 5건, ReviewNotes 6건이지만 유효 후보와 남은 쿼터에 맞게 조정하세요.
3. GSC URL Inspection 화면에서 각 URL을 검사하고 Request indexing을 실제 클릭해 성공 메시지를 확인하세요. 스냅샷만 만들고 완료했다고 보고하면 안 됩니다.
4. 계정 합산 rolling 24시간 쿼터를 지키세요. Quota Exceeded가 나오면 즉시 중단하고 성공 건수와 막힌 URL을 정확히 기록하세요. 같은 날 재시도하지 마세요.
5. docs/seo-indexing-plan.md 실행 로그·대기열과 docs/seo-indexing.md 조치 이력을 실제 결과와 동일하게 갱신하세요.
6. 성공/쿼터/문서 갱신 결과만 간결하게 보고하세요. 후보 준비만으로 완료라고 표현하지 마세요.`

  if (process.env.SEO_INDEX_DISPATCH_DRY_RUN === '1') {
    console.log(`GSC 색인 스케줄 점검: ${date} 등록 가능${sourceChatId ? '' : ' (일요일 무알림)'}`)
    return
  }

  await request('ws_commands', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      source: SOURCE,
      source_chat_id: Number.isFinite(sourceChatId as number) ? sourceChatId : null,
      project: PROJECT,
      cwd: CWD,
      instruction,
      created_by: 'willy-scheduler',
    }),
  })
  console.log(`GSC 색인 스케줄: ${date} 명령 등록 완료${sourceChatId ? '' : ' (일요일 무알림)'}`)
}

main().catch(error => {
  console.error(`GSC 색인 스케줄 실패: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
