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
// --print 는 보내지 않고 메시지만 찍는다.

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

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
    const list = await rest(`re_naver_listings?snapshot_date=eq.${date}&select=complex_no`)
    return new Set(list.map(r => r.complex_no)).size
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

/** 매매 시세 — 실거래 평당가·괴리율·시가총액을 7일 전과 견준다. */
async function marketState() {
  const query = `districts=${encodeURIComponent(DISTRICTS)}&period=12`
  // 이 API는 로그인 쿠키 아니면 CRON_SECRET 을 요구한다(공개 상태였던 것을 2026-08-27 닫음).
  const secret = process.env.CRON_SECRET
  const get = type => fetch(`${SITE}/api/willow-mgmt/real-estate?type=${type}&${query}`, {
    headers: secret ? { Authorization: `Bearer ${secret}` } : {},
  })
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null)

  const [summaryRes, capRes] = await Promise.all([get('summary'), get('market-cap')])
  const trend = capRes?.trend ?? []
  const last = trend[trend.length - 1]
  if (!last) return null

  // 7일 전 정확한 날짜가 없을 수 있다(주말·수집 중단). 그 이전 중 가장 가까운 관측을 쓴다.
  const target = new Date(Date.parse(`${last.date}T00:00:00+09:00`) - 7 * 86400000)
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
  const earlier = trend.filter(p => p.date <= target)
  const prev = earlier.length ? earlier[earlier.length - 1] : null

  const gapOf = p => (p.actualValue > 0 ? (p.listingValue / p.actualValue - 1) * 100 : null)
  return {
    date: last.date,
    prevDate: prev?.date ?? null,
    complexCount: capRes?.complexCount ?? null,
    // 평당가 수준은 화면 요약값을 그대로 쓴다.
    tradePpp: summaryRes?.summary?.avgTradePpp ?? null,
    // 면적 가중치가 상수라 실거래 시총의 변화율이 곧 실거래 평당가의 변화율이다.
    actual: last.actualValue,
    actualPct: prev && prev.actualValue > 0 ? (last.actualValue / prev.actualValue - 1) * 100 : null,
    listing: last.listingValue,
    listingPct: prev && prev.listingValue > 0 ? (last.listingValue / prev.listingValue - 1) * 100 : null,
    gap: gapOf(last),
    prevGap: prev ? gapOf(prev) : null,
  }
}

const signed = (value, digits = 1, unit = '%') =>
  `${value > 0 ? '+' : ''}${value.toFixed(digits)}${unit}`

function line(label, value) {
  return `· ${label} ${value}`
}

function buildMessage({ status, listing, trade, market, tail }) {
  const ok = status === 'ok'
  const today = kstDate()
  const out = [ok ? '✅ 부동산 수집 완료' : '🚨 부동산 수집 실패', '']

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

  if (market) {
    const when = market.prevDate ? market.prevDate.slice(5).replace('-', '.') : '기준 없음'
    out.push('', `[매매 시세 · ${when} 대비]`)
    if (market.tradePpp) {
      const pct = market.actualPct != null ? ` (${signed(market.actualPct)})` : ''
      out.push(line('실거래 평당가', `${market.tradePpp.toLocaleString()}만원${pct}`))
    }
    if (market.gap != null) {
      const was = market.prevGap != null ? ` (${signed(market.gap - market.prevGap, 1, '%p')})` : ''
      out.push(line('괴리율', `${market.gap.toFixed(1)}%${was}`))
    }
    // 두 시총에 각자의 변화율을 붙인다 — 하나만 달면 어느 쪽 값인지 읽는 사람이 헷갈린다.
    const cap = (label, value, pct) =>
      `${label} ${value.toFixed(1)}조${pct != null ? ` ${signed(pct)}` : ''}`
    out.push(line('시가총액',
      `${cap('실거래', market.actual, market.actualPct)} · ${cap('호가', market.listing, market.listingPct)}`))
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

async function ceoChatId() {
  const rows = await rest('telegram_conversations?bot_type=eq.ceo&select=chat_id&order=updated_at.desc&limit=1')
  return rows[0]?.chat_id ?? null
}

async function run() {
  if (!url || !key) throw new Error('Supabase 환경변수가 없어요.')
  const status = argument('status') || 'ok'

  // 한쪽 조회가 깨져도 알림 자체는 나가야 한다.
  const [listing, trade, market, tail] = await Promise.all([
    listingState().catch(() => null),
    tradeState().catch(() => null),
    marketState().catch(() => null),
    logTail(argument('log')),
  ])
  const message = buildMessage({ status, listing, trade, market, tail })

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
  console.log(`[realestate-notify] status=${status} 전송 완료`)
}

run().catch(error => {
  // 알림이 실패해도 수집 결과까지 죽일 이유는 없다. 로그만 남긴다.
  console.error(`[realestate-notify] ${error instanceof Error ? error.message : String(error)}`)
})
