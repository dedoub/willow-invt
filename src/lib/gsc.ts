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
  /**
   * 색인 스캔에서 로케일 변형까지 전수 검사할지.
   *
   * 기본은 false — 로케일 변형을 대표 하나로 접어 쿼터를 아낀다. 보이스카드만
   * 켠 이유는 그 전제가 거기서 깨졌기 때문이다: 2026-08-04 스냅샷에서 추적
   * 217건 중 영어 원본은 37건이 색인됐는데 로컬라이즈 URL은 2건뿐이었다.
   * 영어판의 색인 여부가 로케일 변형의 색인 여부를 대변하지 못하고, 접는
   * 순간 사이트맵 670건 중 450여 건이 관측 사각으로 남는다.
   *
   * 리뷰노트도 같은 이유로 켰다(2026-08-05). 끄고 있는 동안 34쪽만 추적했는데 GSC는
   * 102쪽을 색인했다고 했고, 실제로 노출을 받은 57쪽이 12개 언어에 흩어져 있었다
   * (`/en/`은 12쪽뿐). 사이트맵 442쪽 중 408쪽이 관측 밖이었다는 뜻이다.
   *
   * 사이트별 플래그인 이유는 켤 실익이 사이트마다 다르기 때문이다. 전수 검사는
   * 상한(1,400) 안에 들어올 때만 실제로 적용되고 넘으면 접어서 대표만 본다.
   * 보이스카드는 665쪽이라 들어간다(대표 229 → 전수 665, 검사 약 44초 추가).
   * 리뷰노트는 442쪽(13로케일 × 33)이라 들어간다. 밸류체인은 대표만 세도
   * 1,394쪽이라 켜 봐야 폴백된다.
   */
  scanLocales: boolean
  /**
   * 기본 로케일의 URL 프리픽스. 프리픽스 없이 원본을 내면 null.
   *
   * 색인 지표는 원본을 대표로, 로케일 변형을 병기로 낸다. "원본"을 프리픽스 유무로만
   * 판정하면 리뷰노트처럼 기본 로케일도 프리픽스를 다는 사이트에서 원본이 0이 된다 —
   * 34쪽 전부가 `/en/` 아래라 색인율이 0/0으로 찍혔다(2026-08-05). 사이트가 원본을
   * 어디에 두는지는 사이트마다 다르므로 설정으로 받는다.
   */
  defaultLocale: string | null
}

const SITE_DEFS: Array<Omit<GscSiteConfig, 'property'> & { envKey: string; fallback: string }> = [
  { key: 'voicecards', name: 'VoiceCards', domain: 'voicecards.quest', envKey: 'GSC_PROPERTY_VOICECARDS', fallback: 'sc-domain:voicecards.quest', scanLocales: true, defaultLocale: null },
  { key: 'reviewnotes', name: 'ReviewNotes', domain: 'reviewnotes.app', envKey: 'GSC_PROPERTY_REVIEWNOTES', fallback: 'https://reviewnotes.app/', scanLocales: true, defaultLocale: 'en' },
  { key: 'portle', name: 'Portle', domain: 'portle.quest', envKey: 'GSC_PROPERTY_PORTLE', fallback: 'sc-domain:portle.quest', scanLocales: true, defaultLocale: null },
  { key: 'valuechain', name: 'ValueChain.wiki', domain: 'valuechain.wiki', envKey: 'GSC_PROPERTY_VALUECHAIN', fallback: 'https://valuechain.wiki/', scanLocales: false, defaultLocale: null },
]

export function getGscSite(key: string): GscSiteConfig | null {
  const def = SITE_DEFS.find(s => s.key === key)
  if (!def) return null
  return {
    key: def.key, name: def.name, domain: def.domain,
    property: process.env[def.envKey] || def.fallback,
    scanLocales: def.scanLocales,
    defaultLocale: def.defaultLocale,
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
