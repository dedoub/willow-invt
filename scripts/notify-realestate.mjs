#!/usr/bin/env node
// 부동산 수집 결과를 CEO 봇으로 보낸다. 재무 자동화 알림과 같은 문법이다.
//
//   node scripts/notify-realestate.mjs --status ok
//   node scripts/notify-realestate.mjs --status fail --log scripts/logs/naver-listings-sync.log
//   node scripts/notify-realestate.mjs --status ok --print
//
// 호가(네이버 크롤)와 실거래(국토부 크론)를 한 통에 담는다. 둘은 다른 스케줄러가 돌리는데
// "부동산이 오늘 갱신됐나"는 하나의 질문이라, 나뉘어 오면 매일 두 통을 맞춰 봐야 한다.
// 호가 러너가 끝나는 10:40 KST 는 실거래 크론(07:13 KST) 뒤라 그때는 양쪽이 다 끝나 있다.
//
// 숫자 요약은 최종 보고서가 아니라 **분석 재료**다. agent_prompt_sections 의
// real_estate_monitoring 프롬프트(윌리가 CEO 피드백으로 자기수정하는 그 프롬프트)를 읽어
// 같은 codex 스택으로 해석형 보고서를 만들고, 그걸 보낸다.
//
// 왜 이렇게 바뀌었나(2026-09-08): 이 스크립트가 텔레그램 sendMessage 로 직접 쏘고 있어서
// 윌리를 한 번도 거치지 않았다. CEO 가 "이렇게 써라"라고 해서 윌리가 프롬프트를 v5→v6 까지
// 올려도 매일 나가는 건 여기서 만든 숫자 요약이라 영원히 반영되지 않았다.
// (v6 본문에 "자동 생성된 숫자 요약은 분석 재료일 뿐 최종 보고서로 발송하지 않는다"가 있다.)
//
// --print 는 보내지 않고 메시지만 찍는다. --raw 는 해석 없이 숫자 요약만 낸다.

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { buildRealEstateReport, trendSnapshot } from './lib/realestate-report.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true })

function argument(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : null
}

// 시세 숫자는 대시보드가 그리는 것과 같아야 한다. 여기서 다시 계산하면 정의가 갈라지므로
// 화면이 쓰는 API를 그대로 부른다 — 괴리율·시가총액의 필터·이상치 규칙이 한 곳에만 산다.
const SITE = process.env.REALESTATE_NOTIFY_BASE_URL || 'https://dash.willowinvt.com'
const DISTRICTS = '강남구,서초구,송파구'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY

async function rest(pathAndQuery, { head = false } = {}) {
  const response = await fetch(`${url}/rest/v1/${pathAndQuery}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(head ? { Prefer: 'count=exact', Range: '0-0' } : {}),
    },
  })
  if (!response.ok) throw new Error(`${pathAndQuery}: ${response.status}`)
  if (head) {
    const range = response.headers.get('content-range') || '0-0/0'
    return Number(range.split('/')[1]) || 0
  }
  return response.json()
}

function kstDate(offsetDays = 0) {
  const now = new Date(Date.now() + offsetDays * 86400000)
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
}

/** KST 자정을 UTC ISO 로. PostgREST 쿼리스트링에서 `+09:00` 의 +는 공백으로 풀려 못 쓴다. */
function kstMidnightUtc(offsetDays = 0) {
  return new Date(Date.parse(`${kstDate(offsetDays)}T00:00:00+09:00`)).toISOString()
}

function daysBetween(a, b) {
  return Math.round((Date.parse(`${a}T00:00:00+09:00`) - Date.parse(`${b}T00:00:00+09:00`)) / 86400000)
}

/** 호가 — 오늘 스냅샷이 들어왔는지, 단지·건수는 어제와 어떻게 다른지 */
async function listingState() {
  const today = kstDate()
  const rows = await rest('re_naver_listings?select=snapshot_date&order=snapshot_date.desc&limit=1')
  const latest = rows[0]?.snapshot_date ?? null
  if (!latest) return { latest: null, stale: null }

  const countOn = date => rest(`re_naver_listings?snapshot_date=eq.${date}&select=id`, { head: true })
  const complexesOn = async date => {
    // 원본 매물은 1만 건이 넘어 PostgREST 기본 1,000행 한도에서 단지 수가 잘린다.
    // 1일 200여 행인 밴드 요약표에서 세면 페이지네이션 없이도 전체를 정확히 센다.
    const list = await rest(`re_listing_daily_summary?snapshot_date=eq.${date}&select=complex_name`)
    return new Set(list.map(r => r.complex_name).filter(Boolean)).size
  }
  // 비교 대상은 "어제"가 아니라 "직전에 실제로 있는 스냅샷"이다. 수집이 며칠 멈췄던
  // 뒤에는 어제가 비어 있어서, 어제와 비교하면 전량이 증가분처럼 보인다.
  const prevRows = await rest(
    `re_naver_listings?snapshot_date=lt.${latest}&select=snapshot_date&order=snapshot_date.desc&limit=1`,
  ).catch(() => [])
  const prevDate = prevRows[0]?.snapshot_date ?? null
  const [count, complexes, prevCount] = await Promise.all([
    countOn(latest),
    complexesOn(latest),
    prevDate ? countOn(prevDate) : Promise.resolve(null),
  ])
  return { latest, stale: daysBetween(today, latest), count, complexes, prevDate, prevCount }
}

/** 실거래 — 국토부 크론이 오늘 돌았는지, 새 계약이 몇 건 들어왔는지 */
async function tradeState() {
  const since = kstMidnightUtc()
  // 오늘 적재량은 크론이 남긴 원장을 그대로 읽는다. re_trades.created_at 을 세도 되지만
  // 그건 "행이 언제 들어왔나"이고, 크론이 돌았는지·몇 건을 넣었는지는 이 표가 정본이다.
  const [last, todayRuns] = await Promise.all([
    rest('re_sync_log?select=created_at,status&order=created_at.desc&limit=1'),
    rest(`re_sync_log?created_at=gte.${since}&select=sync_type,status,records_inserted`),
  ])
  const sum = type => todayRuns
    .filter(r => r.sync_type === type)
    .reduce((total, r) => total + (Number(r.records_inserted) || 0), 0)
  return {
    last: last[0]?.created_at ?? null,
    runs: todayRuns.length,
    trades: sum('trade'),
    rentals: sum('rental'),
    failed: todayRuns.filter(r => r.status !== 'success').length,
  }
}

/** 매매·전세 괴리율 — 전체와 50평대를 각각 7일 전과 견준다. */
async function marketState() {
  const baseQuery = `districts=${encodeURIComponent(DISTRICTS)}&period=12`
  // 이 API는 로그인 쿠키 아니면 CRON_SECRET 을 요구한다(공개 상태였던 것을 2026-08-27 닫음).
  const secret = process.env.CRON_SECRET
  const get = (type, params = '') => fetch(`${SITE}/api/willow-mgmt/real-estate?type=${type}&${baseQuery}${params}`, {
    headers: secret ? { Authorization: `Bearer ${secret}` } : {},
  })
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null)

  const [summaryRes, fiftyRes, tradeTrendRes, jeonseTrendRes, tradeFiftyTrendRes, jeonseFiftyTrendRes] = await Promise.all([
    get('summary'),
    get('summary', '&areaRange=50'),
    get('listing-trend', '&tradeType=%EB%A7%A4%EB%A7%A4'),
    get('listing-trend', '&tradeType=%EC%A0%84%EC%84%B8'),
    get('listing-trend', '&tradeType=%EB%A7%A4%EB%A7%A4&areaRange=50'),
    get('listing-trend', '&tradeType=%EC%A0%84%EC%84%B8&areaRange=50'),
  ])
  const summary = summaryRes?.summary
  const fifty = fiftyRes?.summary
  if (!summary || !fifty) return null

  const withChange = (gap, pairs, deals, trend) => ({
    gap,
    pairs,
    deals,
    change: trendSnapshot(trend)?.change ?? null,
  })
  return {
    trackedComplexes: summary.trackedComplexes,
    overall: {
      trade: withChange(summary.tradeListingGap, summary.tradeGapPairs, summary.tradeGapDeals, tradeTrendRes?.trend),
      jeonse: withChange(summary.jeonseListingGap, summary.jeonseGapPairs, summary.jeonseGapDeals, jeonseTrendRes?.trend),
    },
    fifty: {
      trade: withChange(fifty.tradeListingGap, fifty.tradeGapPairs, fifty.tradeGapDeals, tradeFiftyTrendRes?.trend),
      jeonse: withChange(fifty.jeonseListingGap, fifty.jeonseGapPairs, fifty.jeonseGapDeals, jeonseFiftyTrendRes?.trend),
    },
  }
}

// 권역 지수 — 강남3구 vs 외곽. 추적 단지와 무관한 구 전량 실거래 지수라 districts·period 를
// 붙이지 않는다. 격차는 확정된 달만 쓴다 — 최근 두 달은 신고가 아직 들어오는 중이다.
async function zoneState() {
  const secret = process.env.CRON_SECRET
  const res = await fetch(`${SITE}/api/willow-mgmt/real-estate?type=zone-index`, {
    headers: secret ? { Authorization: `Bearer ${secret}` } : {},
  }).then(r => (r.ok ? r.json() : null)).catch(() => null)

  const finals = (res?.series ?? []).filter(r => !r.provisional)
  const last = finals[finals.length - 1]
  if (!last) return null

  const spreadOf = row => {
    const core = row?.zones?.['강남3구']?.idx
    const outer = ['노도강', '금관구'].map(z => row?.zones?.[z]?.idx).filter(v => typeof v === 'number')
    if (typeof core !== 'number' || outer.length === 0) return null
    return Math.round((core - outer.reduce((a, b) => a + b, 0) / outer.length) * 10) / 10
  }

  const index = {}
  for (const z of res.zones ?? []) {
    const v = last.zones?.[z]?.idx
    if (typeof v === 'number') index[z] = v
  }
  if (Object.keys(index).length === 0) return null

  return {
    month: last.month,
    index,
    spread: spreadOf(last),
    spreadPrev: spreadOf(finals[finals.length - 4]),
  }
}

function line(label, value) {
  return `· ${label} ${value}`
}

function buildMessage({ status, listing, trade, market, zone, tail }) {
  const ok = status === 'ok'
  const today = kstDate()
  if (ok && listing && trade && market) {
    return buildRealEstateReport({
      date: listing.latest,
      overall: market.overall,
      fifty: market.fifty,
      listing: {
        trackedComplexes: market.trackedComplexes,
        updatedComplexes: listing.complexes,
        count: listing.count,
        previousCount: listing.prevCount,
      },
      sync: { trades: trade.trades, rentals: trade.rentals },
      zone,
    })
  }

  const out = [ok ? '⚠️ 부동산 수집 완료 · 분석 데이터 조회 실패' : '🚨 부동산 수집 실패', '']

  out.push('[호가 · 네이버]')
  if (!listing?.latest) {
    out.push('· 스냅샷 없음')
  } else if (listing.stale === 0) {
    out.push(line('오늘', `${listing.complexes}개 단지 · 매물 ${listing.count.toLocaleString()}건`))
    if (listing.prevCount != null) {
      const delta = listing.count - listing.prevCount
      const sign = delta > 0 ? `+${delta.toLocaleString()}` : delta.toLocaleString()
      const gap = daysBetween(listing.latest, listing.prevDate)
      out.push(line('직전 대비', `${sign} (${listing.prevDate}${gap > 1 ? `, ${gap}일 전` : ''})`))
    }
  } else {
    out.push(line('마지막', `${listing.latest} · ${listing.stale}일 정체`))
    out.push(line('오늘', '수집 없음'))
  }

  out.push('', '[실거래 · 국토부]')
  if (!trade?.last) {
    out.push('· 동기화 기록 없음')
  } else {
    const ranToday = trade.last.slice(0, 10) >= kstDate(-1)
    const when = new Date(trade.last).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    })
    out.push(line('마지막 동기화', ranToday ? when : `${when} (지연)`))
    if (trade.runs === 0) out.push(line('오늘', '크론 실행 없음'))
    else out.push(line('오늘 신규', `매매 ${trade.trades}건 · 전월세 ${trade.rentals}건`))
    if (trade.failed > 0) out.push(line('실패', `${trade.failed}건`))
  }

  if (!ok && tail) out.push('', '[오류]', tail)
  out.push('', today)
  return out.join('\n')
}

async function logTail(file, lines = 8) {
  if (!file) return null
  const text = await fs.readFile(file, 'utf8').catch(() => null)
  if (!text) return null
  const tail = text.trimEnd().split('\n').filter(l => l.trim()).slice(-lines).join('\n')
  return tail.length > 900 ? `…\n${tail.slice(-900)}` : tail
}

const PROMPT_KEY = 'real_estate_monitoring'
const REPORT_TYPE = 'daily_report'

/** CEO 피드백으로 계속 바뀌는 프롬프트. 여기서 읽어야 프롬프트 수정이 실제로 반영된다. */
async function analysisPrompt() {
  const rows = await rest(`agent_prompt_sections?section_key=eq.${PROMPT_KEY}&select=content,version`)
  return rows[0] ?? null
}

/** 전일 보고 — 프롬프트가 "전일 대비 변화"와 "연속 참조"를 요구한다. */
async function previousReport() {
  const rows = await rest(
    `investment_real_estate_insights?insight_type=eq.${REPORT_TYPE}` +
    '&select=content,properties,created_at&order=created_at.desc&limit=1',
  )
  return rows[0] ?? null
}

async function saveReport(text, facts) {
  // 같은 날짜는 교체한다. CEO 가 재전송을 요청하면 그때마다 새 행이 쌓이고, 다음 날
  // "전일 대비"가 참조할 하루치가 여러 벌이 된다(2026-09-08 실제로 2건 쌓였다).
  const today = kstDate()
  await fetch(
    `${url}/rest/v1/investment_real_estate_insights` +
    `?insight_type=eq.${REPORT_TYPE}&properties->>date=eq.${today}`,
    {
      method: 'DELETE',
      headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal' },
    },
  ).catch(() => null)

  await fetch(`${url}/rest/v1/investment_real_estate_insights`, {
    method: 'POST',
    headers: {
      apikey: key, Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      insight_type: REPORT_TYPE,
      content: text,
      source: 'notify-realestate.mjs / real_estate_monitoring',
      importance: 'medium',
      tags: ['부동산', '일일보고'],
      properties: { date: today, facts },
    }),
  }).catch(() => null)
}

/**
 * 숫자 재료 + 프롬프트 + 전일 보고 → 해석형 보고서.
 * 봇과 같은 스택(codex CLI, BOT_MODEL)을 쓴다. AI 호출은 Codex CLI 로만 한다는 정책 그대로다.
 * tsx 로 실행되므로 TS 모듈을 그대로 import 한다 — --raw/plain node 경로에서는 부르지 않는다.
 */
async function composeReport(facts) {
  const [{ runAgent, BOT_MODEL }, prompt, prev] = await Promise.all([
    import('./lib/agent-cli.ts'),
    analysisPrompt(),
    previousReport(),
  ])
  if (!prompt?.content) throw new Error(`프롬프트 ${PROMPT_KEY} 없음`)

  const previousBlock = prev
    ? `## 전일 보고 (${prev.properties?.date ?? prev.created_at?.slice(0, 10) ?? '날짜미상'})\n${prev.content}`
    : '## 전일 보고\n없음 — 오늘이 첫 보고다. "전일 대비" 항목은 그렇게 적어라.'

  const instruction = [
    prompt.content,
    '',
    '위 지침대로 오늘의 일일 보고서를 작성해라. 아래는 오늘 수집이 끝난 뒤 자동 집계한 숫자다.',
    '이 숫자는 대시보드와 같은 정의로 계산됐다. 숫자를 새로 만들어내지 말고 이 값만 인용해라.',
    '',
    '## 오늘 숫자 (분석 재료)',
    facts,
    '',
    previousBlock,
    '',
    '텔레그램 평문으로 보낼 본문만 출력해라. 마크다운 표·코드블록·머리말·맺음말은 넣지 마라.',
  ].join('\n')

  const text = await runAgent(instruction, { backend: 'codex', model: BOT_MODEL })
  const body = (text || '').trim()
  if (!body) throw new Error('빈 응답')
  return body
}

async function ceoChatId() {
  const rows = await rest('telegram_conversations?bot_type=eq.ceo&select=chat_id&order=updated_at.desc&limit=1')
  return rows[0]?.chat_id ?? null
}

async function run() {
  if (!url || !key) throw new Error('Supabase 환경변수가 없어요.')
  const status = argument('status') || 'ok'

  // 한쪽 조회가 깨져도 알림 자체는 나가야 한다.
  const [listing, trade, market, zone, tail] = await Promise.all([
    listingState().catch(() => null),
    tradeState().catch(() => null),
    marketState().catch(() => null),
    zoneState().catch(() => null),
    logTail(argument('log')),
  ])
  const facts = buildMessage({ status, listing, trade, market, zone, tail })

  // 수집이 실패했으면 해석하지 않는다. 그땐 "돌았나?"가 질문이라 원문 알림이 정답이다.
  // --raw 는 재료만 보고 싶을 때.
  const wantAnalysis = status === 'ok' && !!(listing && trade && market)
    && !process.argv.includes('--raw')

  let message = facts
  let composed = false
  if (wantAnalysis) {
    try {
      message = await composeReport(facts)
      composed = true
    } catch (error) {
      // 해석에 실패해도 알림 자체는 나가야 한다 — 이 알림의 1차 목적은 수집 성공 여부다.
      // 조용히 숫자 요약으로 되돌아가면 프롬프트가 반영 안 되는 걸 또 못 알아채므로 표시한다.
      const why = error instanceof Error ? error.message : String(error)
      console.error(`[realestate-notify] 분석 생성 실패: ${why}`)
      message = `${facts}\n\n⚠️ 해석 리포트 생성 실패 — 숫자 요약으로 대체 (${why})`
    }
  }

  if (process.argv.includes('--print')) {
    console.log(message)
    return
  }

  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('텔레그램 환경변수가 없어요.')
  const chatId = await ceoChatId()
  if (!chatId) throw new Error('CEO 봇 대화가 없어 보낼 곳을 찾지 못했어요.')

  const sent = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message }),
  })
  if (!sent.ok) throw new Error(`텔레그램 전송 실패: ${sent.status} ${await sent.text()}`)
  // message_id 를 남긴다. "보냈다"만 찍으면 안 왔다는 얘기가 나왔을 때 대조할 근거가 없다.
  const body = await sent.json().catch(() => null)
  const messageId = body?.result?.message_id ?? '?'
  const sentChat = body?.result?.chat?.id ?? chatId
  // 다음 보고가 "전일 대비"를 쓰려면 오늘 것이 남아 있어야 한다. 전송에 성공한 것만 저장한다.
  if (composed) await saveReport(message, facts)
  console.log(
    `[realestate-notify] status=${status} ${composed ? '해석' : '숫자'} 전송 완료 ` +
    `(chat=${sentChat}, message_id=${messageId}, ${message.length}자)`,
  )
}

run().catch(error => {
  // 알림이 실패해도 수집 결과까지 죽일 이유는 없다. 로그만 남긴다.
  console.error(`[realestate-notify] ${error instanceof Error ? error.message : String(error)}`)
})
