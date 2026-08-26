/**
 * Umami Cloud — 웹 트래픽 조회 + "검색 수요 포착" 집계.
 *
 * 목적은 방문자 수 자체가 아니라, 발행한 페이지가 실제 검색 수요를 얼마나 잡아내고 있는지다.
 * 그래서 지표를 세 층으로 나눈다.
 *   1) 유입 채널 구성  — 검색이 유입의 몇 %인가 (검색 의존/미개척 판단)
 *   2) 커버리지        — 사이트맵에 발행된 페이지 중 실제 유입이 붙은 비율 (콘텐츠가 노는지)
 *   3) 진입 후 행동    — 검색 진입 세션의 이탈률/체류 (수요는 잡았는데 새는지)
 *
 * 한계: Umami는 리퍼러(google.com)까지만 보이고 검색어는 안 넘어온다. 키워드 단위 수요는
 * lib/gsc.ts(Search Console)가 맡는다 — 같은 화면의 위 섹션이다.
 */

const UMAMI_API = 'https://api.umami.is/v1'

export interface UmamiSiteConfig {
  key: string
  name: string
  domain: string
  websiteId: string
}

// 사이트별 websiteId는 env로 주입 (키 회전/사이트 교체 시 코드 수정 불필요)
const SITE_DEFS: Array<Omit<UmamiSiteConfig, 'websiteId'> & { envKey: string }> = [
  { key: 'voicecards', name: 'VoiceCards', domain: 'voicecards.quest', envKey: 'UMAMI_WEBSITE_VOICECARDS' },
  { key: 'reviewnotes', name: 'ReviewNotes', domain: 'reviewnotes.app', envKey: 'UMAMI_WEBSITE_REVIEWNOTES' },
  { key: 'valuechain', name: 'ValueChain.wiki', domain: 'valuechain.wiki', envKey: 'UMAMI_WEBSITE_VALUECHAIN' },
  { key: 'portle', name: 'Portle', domain: 'portle.quest', envKey: 'UMAMI_WEBSITE_PORTLE' },
  { key: 'scripta', name: 'Scripta', domain: 'scripta.quest', envKey: 'UMAMI_WEBSITE_SCRIPTA' },
]

export type UmamiSiteKey = 'voicecards' | 'reviewnotes' | 'valuechain' | 'portle' | 'scripta'

export function getUmamiSite(key: string): UmamiSiteConfig | null {
  const def = SITE_DEFS.find(s => s.key === key)
  if (!def) return null
  const websiteId = process.env[def.envKey]
  if (!websiteId) return null
  return { key: def.key, name: def.name, domain: def.domain, websiteId }
}

// ─── 저수준 호출 ──────────────────────────────────────────────────────────────

async function umamiFetch<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
  const apiKey = process.env.UMAMI_API_KEY
  if (!apiKey) throw new Error('UMAMI_API_KEY 미설정')

  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v))
  }
  const res = await fetch(`${UMAMI_API}${path}?${qs.toString()}`, {
    headers: { 'x-umami-api-key': apiKey, Accept: 'application/json' },
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Umami ${res.status}: ${body.slice(0, 200)}`)
  }
  return res.json() as Promise<T>
}

interface UmamiStats {
  pageviews: number
  visitors: number
  visits: number
  bounces: number
  totaltime: number
}
interface UmamiMetric { x: string | null; y: number }
interface UmamiSeries { pageviews: Array<{ x: string; y: number }>; sessions: Array<{ x: string; y: number }> }

// ─── 채널 분류 ────────────────────────────────────────────────────────────────

const SEARCH_HOSTS = [
  'google.', 'bing.com', 'duckduckgo.com', 'search.yahoo', 'yahoo.co', 'naver.com',
  'daum.net', 'baidu.com', 'yandex.', 'ecosia.org', 'brave.com', 'startpage.com',
  'qwant.com', 'search.marginalia', 'perplexity.ai', 'chatgpt.com', 'chat.openai.com',
  'claude.ai', 'gemini.google', 'copilot.microsoft',
]
const SOCIAL_HOSTS = [
  'facebook.com', 'instagram.com', 'twitter.com', 't.co', 'x.com', 'linkedin.com',
  'reddit.com', 'youtube.com', 'tiktok.com', 'threads.net', 'pinterest.', 'news.ycombinator',
  'discord.com', 'telegram', 'kakao',
]

// LLM 답변에서 오는 유입은 검색 수요의 일부로 보되 별도 집계도 남긴다.
// 목록이 낡으면 AI 유입이 'referral'로 새서 채널 비중이 틀어진다
// (2026-07-28: notebooklm.google.com이 referral로 잡히던 걸 발견해 확장).
const AI_HOSTS = [
  'perplexity.ai',
  'chatgpt.com', 'chat.openai.com', 'openai.com',
  'claude.ai',
  'gemini.google', 'bard.google', 'notebooklm.google',
  'copilot.microsoft', 'bing.com/chat',
  'grok.com', 'x.ai',
  'deepseek.com',
  'you.com', 'phind.com', 'poe.com', 'kagi.com',
  'mistral.ai', 'chat.qwen', 'doubao.com', 'kimi.moonshot',
  'clova-x.naver', 'cue.search.naver',
]

/**
 * 답변엔진이 인용 링크에 붙이는 파라미터. 리퍼러 호스트만 보면 놓친다.
 * ChatGPT는 utm_source=chatgpt.com을 붙여 보내는데, 앱 내 이동을 거치면
 * 리퍼러는 우리 도메인이 되고 이 파라미터만 남는다.
 */
const AI_UTM_HINTS = ['chatgpt.com', 'perplexity', 'copilot', 'gemini', 'claude', 'notebooklm']

export type Channel = 'search' | 'ai' | 'social' | 'referral' | 'direct'

export function classifyReferrer(referrer: string | null | undefined): Channel {
  const r = (referrer || '').toLowerCase().trim()
  if (!r) return 'direct'
  if (AI_HOSTS.some(h => r.includes(h))) return 'ai'
  // utm_source=chatgpt.com 처럼 인용 링크가 남긴 흔적. 자기 도메인 리퍼러여도 AI 유입이다.
  if (r.includes('utm_source=') && AI_UTM_HINTS.some(h => r.includes(h))) return 'ai'
  if (SEARCH_HOSTS.some(h => r.includes(h))) return 'search'
  if (SOCIAL_HOSTS.some(h => r.includes(h))) return 'social'
  return 'referral'
}

// ─── 경로 정규화 ──────────────────────────────────────────────────────────────

/**
 * 로케일로 인정하는 2자 코드. 경로 앞 세그먼트가 여기 있어야 로케일 변형으로 친다
 * (`/cdl/...` 같은 슬러그를 로케일로 오인하지 않기 위해).
 *
 * DB의 seo_index_trend RPC도 같은 판정을 하는데, 목록을 SQL에 박으면 두 곳이 갈라지므로
 * 이 집합을 인자로 넘긴다. 여기가 단일 진실원이다.
 */
export const LOCALES = new Set([
  'en', 'ko', 'ja', 'zh', 'es', 'fr', 'de', 'pt', 'it', 'ru', 'ar', 'hi', 'id', 'vi',
  'th', 'tr', 'pl', 'nl', 'sv', 'da', 'fi', 'no', 'cs', 'uk', 'he', 'ms', 'fa', 'ro',
  'hu', 'el', 'bn', 'ta', 'ur', 'tl', 'sw', 'ca', 'sk', 'bg', 'hr', 'sr', 'lt', 'lv', 'et',
])

/** 쿼리스트링·트레일링 슬래시 제거한 경로 */
export function normalizePath(input: string): string {
  let p = (input || '').trim()
  if (!p) return '/'
  if (/^https?:\/\//i.test(p)) {
    try { p = new URL(p).pathname } catch { /* noop */ }
  }
  p = p.split('?')[0].split('#')[0]
  if (!p.startsWith('/')) p = `/${p}`
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
  return p || '/'
}

/** 앞의 로케일 세그먼트를 떼어 콘텐츠 단위로 묶는다. /ko/guides/x → /guides/x */
export function canonicalPath(input: string): string {
  const p = normalizePath(input)
  const m = p.match(/^\/([a-z]{2})(?:-[a-zA-Z]{2})?(\/|$)/)
  if (m && LOCALES.has(m[1])) {
    const rest = p.slice(m[0].length - (m[2] === '/' ? 1 : 0))
    return rest || '/'
  }
  return p
}

// .md/.json/.txt 등은 에이전트·기계용으로 일부러 발행한 것이라 검색 노출이 없는 게 정상이다.
// 이걸 커버리지 분모에 넣으면 "미포착"이 부풀려지므로 사람이 읽는 페이지만 센다.
const NON_PAGE_EXT = /\.(md|json|txt|xml|svg|png|jpe?g|gif|webp|ico|css|js|pdf|zip|rss|atom)$/i

/** 사람이 보는 HTML 페이지인지 (커버리지 집계 대상) */
export function isHtmlPath(input: string): boolean {
  return !NON_PAGE_EXT.test(normalizePath(input))
}

/** 경로의 로케일 (없으면 default) */
export function pathLocale(input: string): string {
  const p = normalizePath(input)
  const m = p.match(/^\/([a-z]{2})(?:-[a-zA-Z]{2})?(\/|$)/)
  return m && LOCALES.has(m[1]) ? m[1] : 'default'
}

// ─── 사이트맵 (발행 페이지 인벤토리) ──────────────────────────────────────────

/** sitemap.xml(인덱스면 하위 sitemap까지) 의 <loc> 경로 목록 */
export async function fetchSitemapPaths(domain: string): Promise<string[]> {
  const seen = new Set<string>()
  const out: string[] = []

  const load = async (url: string, depth: number): Promise<void> => {
    if (depth > 2) return
    const res = await fetch(url, {
      headers: { 'User-Agent': 'WillowDashboard/1.0 (+sitemap-coverage)' },
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`sitemap ${res.status} ${url}`)
    const xml = await res.text()
    const locs = Array.from(xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)).map(m => m[1])
    const isIndex = /<sitemapindex/i.test(xml)
    if (isIndex) {
      for (const child of locs.slice(0, 20)) await load(child, depth + 1)
      return
    }
    for (const loc of locs) {
      const p = normalizePath(loc)
      if (seen.has(p)) continue
      seen.add(p)
      out.push(p)
    }
  }

  await load(`https://${domain}/sitemap.xml`, 0)
  return out
}

// ─── 집계 결과 타입 ───────────────────────────────────────────────────────────

export interface SearchDemandPage {
  path: string
  views: number
  searchViews: number
  /** 마지막 조회 시각(ISO). 최근 이벤트 창 밖의 페이지는 null */
  lastViewedAt: string | null
}

export interface SearchDemandStats {
  site: { key: string; name: string; domain: string; umamiUrl: string }
  range: { days: number; startAt: number; endAt: number }
  totals: {
    visitors: number
    visits: number
    pageviews: number
    bounceRate: number      // %
    avgSeconds: number      // 세션당 평균 체류
    viewsPerVisit: number
  }
  search: {
    visits: number          // 검색+AI 유입 (리퍼러 기준)
    share: number           // 전체 대비 %
    bounceRate: number      // 검색 진입 세션 이탈률 %
    avgSeconds: number
    referrers: Array<{ host: string; visits: number; channel: Channel }>
  }
  channels: Array<{ channel: Channel; visits: number; share: number }>
  coverage: {
    sitemapPages: number      // 발행 페이지 (로케일 변형 포함)
    sitemapContents: number   // 로케일 제거 콘텐츠 수
    touchedPages: number      // 유입이 1회라도 붙은 페이지
    touchedContents: number
    searchTouchedPages: number
    pagePct: number
    contentPct: number
    searchPct: number
    orphanPaths: string[]     // 사이트맵에 없는데 유입이 있는 경로 (추적 누락/노이즈 점검용)
  }
  entryPages: SearchDemandPage[]
  searchPages: SearchDemandPage[]
  daily: Array<{ date: string; pageviews: number; sessions: number; searchSessions: number }>
  countries: Array<{ code: string; visits: number }>
  languages: Array<{ code: string; visits: number }>
  notes: string[]
  fetchedAt: string
}

// ─── 집계 ─────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000

function toDateKey(iso: string): string {
  // Umami는 UTC 타임스탬프를 주지만 timezone=Asia/Seoul로 버킷팅된 값이라 그대로 KST 날짜로 환산한다.
  const d = new Date(iso)
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10)
}

interface UmamiEventRow { createdAt: string; urlPath: string }
interface UmamiEventPage { data: UmamiEventRow[]; count: number; page: number; pageSize: number }

/**
 * 경로별 마지막 조회 시각.
 *
 * metrics 계열은 합계만 주고 시각을 안 준다. 원시 이벤트는 최신순으로 오므로
 * 경로가 처음 나온 지점이 곧 그 경로의 마지막 조회다.
 * 최근 EVENT_SCAN_MAX건만 훑기 때문에 그보다 오래된 페이지는 null이 되고,
 * 화면에서는 값 없음으로 표시된다(틀린 시각을 지어내는 것보다 낫다).
 */
const EVENT_PAGE = 1_000
const EVENT_SCAN_MAX = 5_000

async function fetchLastViewedByPath(
  base: string, range: { startAt: number; endAt: number },
): Promise<Map<string, string>> {
  const last = new Map<string, string>()
  for (let page = 1; page <= EVENT_SCAN_MAX / EVENT_PAGE; page++) {
    let res: UmamiEventPage
    try {
      res = await umamiFetch<UmamiEventPage>(`${base}/events`, { ...range, page, pageSize: EVENT_PAGE })
    } catch {
      break // 이벤트 조회가 막혀도 나머지 지표는 그대로 보여준다
    }
    for (const row of res.data ?? []) {
      const path = normalizePath(row.urlPath)
      if (!last.has(path)) last.set(path, row.createdAt)
    }
    if (!res.data || res.data.length < EVENT_PAGE) break
  }
  return last
}

export async function getSearchDemandStats(
  site: UmamiSiteConfig,
  days = 30,
): Promise<SearchDemandStats> {
  const endAt = Date.now()
  const startAt = endAt - days * DAY_MS
  const base = `/websites/${site.websiteId}`
  const range = { startAt, endAt }

  const [totals, referrers, urls, series, countries, languages, lastViewed] = await Promise.all([
    umamiFetch<UmamiStats>(`${base}/stats`, range),
    umamiFetch<UmamiMetric[]>(`${base}/metrics`, { ...range, type: 'referrer', limit: 100 }),
    umamiFetch<UmamiMetric[]>(`${base}/metrics`, { ...range, type: 'url', limit: 500 }),
    umamiFetch<UmamiSeries>(`${base}/pageviews`, { ...range, unit: 'day', timezone: 'Asia/Seoul' }),
    umamiFetch<UmamiMetric[]>(`${base}/metrics`, { ...range, type: 'country', limit: 20 }),
    umamiFetch<UmamiMetric[]>(`${base}/metrics`, { ...range, type: 'language', limit: 20 }),
    fetchLastViewedByPath(base, range),
  ])

  // 검색/AI 리퍼러만 추려 페이지·시계열·이탈률을 리퍼러별로 다시 조회한다.
  // (Umami 필터는 정확값 매칭이라 채널 단위 필터가 없다 → 호스트별로 돌려 합산)
  const searchRefs = referrers
    .map(r => ({ host: (r.x || '').trim(), visits: r.y, channel: classifyReferrer(r.x) }))
    .filter(r => r.host && (r.channel === 'search' || r.channel === 'ai'))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 12)

  const perRef = await Promise.all(searchRefs.map(async ref => {
    const [stats, refUrls, refSeries] = await Promise.all([
      umamiFetch<UmamiStats>(`${base}/stats`, { ...range, referrer: ref.host }).catch(() => null),
      umamiFetch<UmamiMetric[]>(`${base}/metrics`, { ...range, type: 'url', limit: 200, referrer: ref.host }).catch(() => [] as UmamiMetric[]),
      umamiFetch<UmamiSeries>(`${base}/pageviews`, { ...range, unit: 'day', timezone: 'Asia/Seoul', referrer: ref.host }).catch(() => null),
    ])
    return { ref, stats, refUrls, refSeries }
  }))

  // 검색 진입 페이지 합산
  const searchViewsByPath = new Map<string, number>()
  for (const { refUrls } of perRef) {
    for (const m of refUrls) {
      const p = normalizePath(m.x || '/')
      searchViewsByPath.set(p, (searchViewsByPath.get(p) ?? 0) + m.y)
    }
  }

  // 검색 세션 합계·이탈률·체류
  let searchVisits = 0, searchBounces = 0, searchTime = 0
  for (const { ref, stats } of perRef) {
    if (stats) {
      searchVisits += stats.visits
      searchBounces += stats.bounces
      searchTime += stats.totaltime
    } else {
      searchVisits += ref.visits
    }
  }

  // 채널 믹스 — 리퍼러에 안 잡히는 나머지는 direct로 본다
  const channelVisits: Record<Channel, number> = { search: 0, ai: 0, social: 0, referral: 0, direct: 0 }
  let referredTotal = 0
  for (const r of referrers) {
    const ch = classifyReferrer(r.x)
    if (ch === 'direct') continue
    channelVisits[ch] += r.y
    referredTotal += r.y
  }
  channelVisits.direct = Math.max(0, totals.visits - referredTotal)

  // 일별 시계열 (검색 세션 오버레이)
  const dailyMap = new Map<string, { date: string; pageviews: number; sessions: number; searchSessions: number }>()
  const ensure = (date: string) => {
    let row = dailyMap.get(date)
    if (!row) { row = { date, pageviews: 0, sessions: 0, searchSessions: 0 }; dailyMap.set(date, row) }
    return row
  }
  for (const p of series.pageviews) ensure(toDateKey(p.x)).pageviews += p.y
  for (const s of series.sessions) ensure(toDateKey(s.x)).sessions += s.y
  for (const { refSeries } of perRef) {
    for (const s of refSeries?.sessions ?? []) ensure(toDateKey(s.x)).searchSessions += s.y
  }
  // 빈 날짜 채우기 — 추이 차트가 실제 기간을 반영하도록
  for (let i = 0; i < days; i++) {
    const d = new Date(startAt + i * DAY_MS + 9 * 3600_000).toISOString().slice(0, 10)
    ensure(d)
  }
  const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)).slice(-days)

  // 커버리지 — 사이트맵(발행) 대비 실제 유입
  let sitemapPaths: string[] = []
  const notes: string[] = []
  try {
    sitemapPaths = (await fetchSitemapPaths(site.domain)).filter(isHtmlPath)
  } catch (err) {
    notes.push(`사이트맵을 읽지 못해 커버리지는 집계에서 제외됨 (${String(err).slice(0, 80)})`)
  }

  const viewedByPath = new Map<string, number>()
  for (const m of urls) {
    const p = normalizePath(m.x || '/')
    if (!isHtmlPath(p)) continue
    viewedByPath.set(p, (viewedByPath.get(p) ?? 0) + m.y)
  }

  const sitemapSet = new Set(sitemapPaths)
  const sitemapContentSet = new Set(sitemapPaths.map(canonicalPath))
  const touchedPaths = Array.from(viewedByPath.keys())
  const touchedInSitemap = touchedPaths.filter(p => sitemapSet.has(p))
  const touchedContentSet = new Set(touchedPaths.map(canonicalPath).filter(c => sitemapContentSet.has(c)))
  const searchTouchedInSitemap = Array.from(searchViewsByPath.keys()).filter(p => sitemapSet.has(p))
  const orphanPaths = touchedPaths.filter(p => !sitemapSet.has(p)).slice(0, 20)

  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0)

  const entryPages: SearchDemandPage[] = touchedPaths
    .map(p => ({
      path: p,
      views: viewedByPath.get(p) ?? 0,
      searchViews: searchViewsByPath.get(p) ?? 0,
      lastViewedAt: lastViewed.get(p) ?? null,
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 100)

  const searchPages: SearchDemandPage[] = Array.from(searchViewsByPath.entries())
    .map(([path, searchViews]) => ({
      path, searchViews,
      views: viewedByPath.get(path) ?? searchViews,
      lastViewedAt: lastViewed.get(path) ?? null,
    }))
    .sort((a, b) => b.searchViews - a.searchViews)
    .slice(0, 100)

  return {
    site: {
      key: site.key, name: site.name, domain: site.domain,
      umamiUrl: `https://cloud.umami.is/websites/${site.websiteId}`,
    },
    range: { days, startAt, endAt },
    totals: {
      visitors: totals.visitors,
      visits: totals.visits,
      pageviews: totals.pageviews,
      bounceRate: pct(totals.bounces, totals.visits),
      avgSeconds: totals.visits > 0 ? Math.round(totals.totaltime / totals.visits) : 0,
      viewsPerVisit: totals.visits > 0 ? Math.round((totals.pageviews / totals.visits) * 10) / 10 : 0,
    },
    search: {
      visits: searchVisits,
      share: pct(searchVisits, totals.visits),
      bounceRate: pct(searchBounces, searchVisits),
      avgSeconds: searchVisits > 0 ? Math.round(searchTime / searchVisits) : 0,
      referrers: searchRefs,
    },
    channels: (['search', 'ai', 'social', 'referral', 'direct'] as Channel[])
      .map(channel => ({ channel, visits: channelVisits[channel], share: pct(channelVisits[channel], totals.visits) }))
      .filter(c => c.visits > 0),
    coverage: {
      sitemapPages: sitemapSet.size,
      sitemapContents: sitemapContentSet.size,
      touchedPages: touchedInSitemap.length,
      touchedContents: touchedContentSet.size,
      searchTouchedPages: searchTouchedInSitemap.length,
      pagePct: pct(touchedInSitemap.length, sitemapSet.size),
      contentPct: pct(touchedContentSet.size, sitemapContentSet.size),
      searchPct: pct(searchTouchedInSitemap.length, sitemapSet.size),
      orphanPaths,
    },
    entryPages,
    searchPages,
    daily,
    countries: countries.map(c => ({ code: (c.x || '').toUpperCase(), visits: c.y })).filter(c => c.code),
    languages: languages.map(l => ({ code: (l.x || '').toLowerCase(), visits: l.y })).filter(l => l.code),
    notes,
    fetchedAt: new Date().toISOString(),
  }
}
