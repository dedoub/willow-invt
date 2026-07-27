/**
 * Google Search Console — 검색 수요의 앞단(노출·클릭·순위) 조회.
 *
 * Umami는 "들어온 뒤"만 보여준다. GSC는 그 앞을 본다.
 *   노출(impressions) = 구글이 우리 페이지를 보여준 검색 수요의 양
 *   클릭(clicks)      = 그중 실제로 잡은 양
 *   CTR / 순위        = 포착률과 위치
 *
 * 그래서 이 파일의 목적 지표는 총합이 아니라 세 가지 갭이다.
 *   1) 발행했는데 노출조차 없는 콘텐츠  → 색인/주제 미스
 *   2) 노출은 있는데 클릭이 없는 쿼리    → 제목·설명이 의도에 못 답함
 *   3) 순위 8~30위 구간의 노출 큰 쿼리   → 조금만 올리면 잡히는 수요
 *
 * 인증: 서비스 계정(willow-invt-voice-cards@…)을 각 GSC 속성에 사용자로 추가해 둠.
 * 키는 GOOGLE_SA_JSON_B64(base64 JSON) 우선, 없으면 PLAY_STATS_SA_KEY_PATH 파일.
 */

import { GoogleAuth } from 'google-auth-library'
import { canonicalPath, normalizePath, fetchSitemapPaths, isHtmlPath } from './umami'

const GSC_API = 'https://www.googleapis.com/webmasters/v3'
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly'

// GSC 데이터는 2~3일 지연된다. 최신 이틀은 부분 집계라 아예 제외한다.
const LAG_DAYS = 2

export interface GscSiteConfig {
  key: string
  name: string
  domain: string
  property: string   // sc-domain:example.com 또는 https://example.com/
}

const SITE_DEFS: Array<Omit<GscSiteConfig, 'property'> & { envKey: string; fallback: string }> = [
  { key: 'voicecards', name: 'VoiceCards', domain: 'voicecards.quest', envKey: 'GSC_PROPERTY_VOICECARDS', fallback: 'sc-domain:voicecards.quest' },
  { key: 'reviewnotes', name: 'ReviewNotes', domain: 'reviewnotes.app', envKey: 'GSC_PROPERTY_REVIEWNOTES', fallback: 'https://reviewnotes.app/' },
  { key: 'valuechain', name: 'ValueChain.wiki', domain: 'valuechain.wiki', envKey: 'GSC_PROPERTY_VALUECHAIN', fallback: 'https://valuechain.wiki/' },
]

export function getGscSite(key: string): GscSiteConfig | null {
  const def = SITE_DEFS.find(s => s.key === key)
  if (!def) return null
  return {
    key: def.key, name: def.name, domain: def.domain,
    property: process.env[def.envKey] || def.fallback,
  }
}

// ─── 인증 ─────────────────────────────────────────────────────────────────────

let cachedAuth: GoogleAuth | null = null

function getAuth(): GoogleAuth {
  if (cachedAuth) return cachedAuth
  const b64 = process.env.GOOGLE_SA_JSON_B64
  if (b64) {
    const credentials = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
    cachedAuth = new GoogleAuth({ credentials, scopes: [SCOPE] })
    return cachedAuth
  }
  const keyFile = process.env.PLAY_STATS_SA_KEY_PATH
  if (!keyFile) throw new Error('GOOGLE_SA_JSON_B64 또는 PLAY_STATS_SA_KEY_PATH 미설정')
  cachedAuth = new GoogleAuth({ keyFile, scopes: [SCOPE] })
  return cachedAuth
}

async function gscQuery(property: string, body: Record<string, unknown>): Promise<GscRow[]> {
  const client = await getAuth().getClient()
  const token = (await client.getAccessToken()).token
  const res = await fetch(
    `${GSC_API}/sites/${encodeURIComponent(property)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    },
  )
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let msg = text.slice(0, 300)
    try { msg = JSON.parse(text)?.error?.message ?? msg } catch { /* raw */ }
    throw new Error(`GSC ${res.status}: ${msg}`)
  }
  const json = await res.json() as { rows?: GscRow[] }
  return json.rows ?? []
}

interface GscRow {
  keys?: string[]
  clicks: number
  impressions: number
  ctr: number
  position: number
}

// ─── 결과 타입 ────────────────────────────────────────────────────────────────

export interface GscTotals {
  clicks: number
  impressions: number
  ctr: number        // %
  position: number
}

export interface GscQueryRow {
  query: string
  clicks: number
  impressions: number
  ctr: number        // %
  position: number
}

export interface GscPageRow {
  path: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface SearchConsoleStats {
  site: { key: string; name: string; domain: string; property: string; consoleUrl: string }
  range: { days: number; startDate: string; endDate: string; lagDays: number }
  totals: GscTotals
  previous: GscTotals          // 직전 동일 길이 기간
  daily: Array<{ date: string; clicks: number; impressions: number; ctr: number; position: number }>
  queries: GscQueryRow[]
  pages: GscPageRow[]
  countries: Array<{ code: string; clicks: number; impressions: number }>
  devices: Array<{ device: string; clicks: number; impressions: number }>
  /** 발행 → 노출 → 클릭 퍼널 */
  capture: {
    sitemapContents: number
    impressedContents: number
    clickedContents: number
    impressedPct: number
    clickedPct: number
    /** 발행했는데 노출이 0인 콘텐츠 표본 */
    invisibleSample: string[]
    invisibleCount: number
  }
  fetchedAt: string
}

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000
const dateKey = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const pct1 = (v: number) => Math.round(v * 1000) / 10          // 0.0832 → 8.3
const round1 = (v: number) => Math.round(v * 10) / 10

function aggregate(rows: GscRow[]): GscTotals {
  const clicks = rows.reduce((s, r) => s + r.clicks, 0)
  const impressions = rows.reduce((s, r) => s + r.impressions, 0)
  // 평균 게재순위는 노출 가중 평균이어야 맞다 (단순 평균은 노출 1짜리 쿼리에 끌려간다)
  const posWeighted = impressions > 0
    ? rows.reduce((s, r) => s + r.position * r.impressions, 0) / impressions
    : 0
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? pct1(clicks / impressions) : 0,
    position: round1(posWeighted),
  }
}

// ─── 집계 ─────────────────────────────────────────────────────────────────────

export async function getSearchConsoleStats(
  site: GscSiteConfig,
  days = 30,
): Promise<SearchConsoleStats> {
  const endMs = Date.now() - LAG_DAYS * DAY_MS
  const startMs = endMs - (days - 1) * DAY_MS
  const prevEndMs = startMs - DAY_MS
  const prevStartMs = prevEndMs - (days - 1) * DAY_MS

  const startDate = dateKey(startMs)
  const endDate = dateKey(endMs)
  const range = { startDate, endDate }

  const [dailyRows, queryRows, pageRows, countryRows, deviceRows, prevRows] = await Promise.all([
    gscQuery(site.property, { ...range, dimensions: ['date'], rowLimit: 500 }),
    gscQuery(site.property, { ...range, dimensions: ['query'], rowLimit: 500 }),
    gscQuery(site.property, { ...range, dimensions: ['page'], rowLimit: 500 }),
    gscQuery(site.property, { ...range, dimensions: ['country'], rowLimit: 30 }),
    gscQuery(site.property, { ...range, dimensions: ['device'], rowLimit: 10 }),
    gscQuery(site.property, {
      startDate: dateKey(prevStartMs), endDate: dateKey(prevEndMs),
      dimensions: ['date'], rowLimit: 500,
    }).catch(() => [] as GscRow[]),
  ])

  const queries: GscQueryRow[] = queryRows
    .map(r => ({
      query: r.keys?.[0] ?? '',
      clicks: r.clicks, impressions: r.impressions,
      ctr: pct1(r.ctr), position: round1(r.position),
    }))
    .sort((a, b) => b.impressions - a.impressions)

  // 도메인 속성은 www/non-www·http/https가 각각 다른 URL로 오므로 경로 기준으로 합친다.
  // 순위는 노출 가중 평균, CTR은 합계로 재계산해야 맞다.
  const pageAcc = new Map<string, { clicks: number; impressions: number; posSum: number }>()
  for (const r of pageRows) {
    const path = normalizePath(r.keys?.[0] ?? '/')
    if (!isHtmlPath(path)) continue
    const cur = pageAcc.get(path) ?? { clicks: 0, impressions: 0, posSum: 0 }
    cur.clicks += r.clicks
    cur.impressions += r.impressions
    cur.posSum += r.position * r.impressions
    pageAcc.set(path, cur)
  }
  const pages: GscPageRow[] = Array.from(pageAcc.entries())
    .map(([path, v]) => ({
      path,
      clicks: v.clicks,
      impressions: v.impressions,
      ctr: v.impressions > 0 ? pct1(v.clicks / v.impressions) : 0,
      position: v.impressions > 0 ? round1(v.posSum / v.impressions) : 0,
    }))
    .sort((a, b) => b.impressions - a.impressions)

  // 발행 → 노출 → 클릭 커버리지. 사이트맵을 못 읽으면 0으로 두고 화면에서 '—' 처리.
  let sitemapContents = new Set<string>()
  try {
    const paths = await fetchSitemapPaths(site.domain)
    sitemapContents = new Set(paths.filter(isHtmlPath).map(canonicalPath))
  } catch { /* 사이트맵 실패는 치명적이지 않다 */ }

  const impressedContents = new Set(pages.filter(p => p.impressions > 0).map(p => canonicalPath(p.path)))
  const clickedContents = new Set(pages.filter(p => p.clicks > 0).map(p => canonicalPath(p.path)))
  const invisible = Array.from(sitemapContents).filter(c => !impressedContents.has(c))

  const inSitemap = (s: Set<string>) => Array.from(s).filter(c => sitemapContents.has(c)).length
  const pctOf = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0)

  return {
    site: {
      key: site.key, name: site.name, domain: site.domain, property: site.property,
      consoleUrl: `https://search.google.com/search-console/performance/search-analytics?resource_id=${encodeURIComponent(site.property)}`,
    },
    range: { days, startDate, endDate, lagDays: LAG_DAYS },
    totals: aggregate(dailyRows),
    previous: aggregate(prevRows),
    daily: dailyRows
      .map(r => ({
        date: r.keys?.[0] ?? '',
        clicks: r.clicks, impressions: r.impressions,
        ctr: pct1(r.ctr), position: round1(r.position),
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    queries: queries.slice(0, 100),
    pages: pages.slice(0, 100),
    countries: countryRows.map(r => ({
      code: (r.keys?.[0] ?? '').toUpperCase(), clicks: r.clicks, impressions: r.impressions,
    })).filter(c => c.code),
    devices: deviceRows.map(r => ({
      device: (r.keys?.[0] ?? '').toLowerCase(), clicks: r.clicks, impressions: r.impressions,
    })).filter(d => d.device),
    capture: {
      sitemapContents: sitemapContents.size,
      impressedContents: inSitemap(impressedContents),
      clickedContents: inSitemap(clickedContents),
      impressedPct: pctOf(inSitemap(impressedContents), sitemapContents.size),
      clickedPct: pctOf(inSitemap(clickedContents), sitemapContents.size),
      invisibleSample: invisible.slice(0, 12),
      invisibleCount: invisible.length,
    },
    fetchedAt: new Date().toISOString(),
  }
}
