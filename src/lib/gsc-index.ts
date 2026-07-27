/**
 * GSC URL Inspection — 발행 페이지가 실제로 색인됐는지 추적.
 *
 * searchAnalytics(노출·클릭)는 "이미 노출된 페이지"만 알려준다. 노출이 0인 페이지가
 * 아직 안 걸린 건지, 크롤은 됐는데 구글이 색인을 거부한 건지, 아예 발견도 안 된 건지
 * 구분되지 않는다. 그 구분은 URL Inspection API로만 가능하고, 이 파일이 그걸 매일
 * 스냅샷으로 남겨 시간축(색인율 추이)으로 볼 수 있게 한다.
 *
 * 쿼터: 속성당 하루 2,000건 / 분당 600건. 사이트당 콘텐츠 수가 그보다 적어 전수 검사 가능.
 */

import { GoogleAuth } from 'google-auth-library'
import { supabase } from './supabase'
import { getGscSite } from './gsc'
import { canonicalPath, fetchSitemapPaths, isHtmlPath, normalizePath } from './umami'

const INSPECT_API = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect'
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly'

/** 한 번에 검사할 URL 상한 — 쿼터(2,000/일) 대비 여유를 크게 둔다 */
const DEFAULT_SCAN_LIMIT = 400
/** 동시 요청 수. 분당 600건 제한이라 5면 충분히 안전하다 */
const CONCURRENCY = 5

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

// ─── 색인 상태 분류 ───────────────────────────────────────────────────────────

/**
 * coverageState 문자열을 4개 상태로 접는다. 구글은 문구를 로케일·시점에 따라 조금씩
 * 바꾸므로 정확한 문자열 매칭 대신 포함 관계로 판정한다.
 *   indexed      색인됨 — 검색에 나올 수 있는 상태
 *   crawled      크롤은 됐는데 색인 안 됨 — 구글이 "실을 가치 없다"고 판단한 것
 *   discovered   발견은 됐는데 크롤 대기 — 크롤 예산 문제, 시간이 해결하기도 함
 *   unseen       구글이 URL 자체를 모름 — 사이트맵 제출·내부링크 문제 (가장 기본적인 실패)
 *   excluded     리다이렉트·중복·noindex 등으로 제외
 *
 * 이 다섯이 섞이면 처방을 못 세운다. unseen은 링크/사이트맵 문제, crawled는 콘텐츠 문제라
 * 손댈 곳이 정반대다.
 */
export type IndexBucket = 'indexed' | 'crawled' | 'discovered' | 'unseen' | 'excluded' | 'unknown'

export function bucketOf(coverageState?: string | null): IndexBucket {
  const s = (coverageState || '').toLowerCase()
  if (!s) return 'unknown'
  // 'URL is unknown to Google' — 'unknown' 매칭보다 먼저 걸러야 한다
  if (s.includes('unknown to google')) return 'unseen'
  if (s.includes('crawled') && s.includes('not indexed')) return 'crawled'
  if (s.includes('discovered')) return 'discovered'
  if (s.includes('indexed')) return 'indexed'          // 'Submitted and indexed', 'Indexed, not submitted in sitemap'
  if (s.includes('duplicate') || s.includes('redirect') || s.includes('noindex') ||
      s.includes('excluded') || s.includes('alternate') || s.includes('blocked')) return 'excluded'
  return 'unknown'
}

export const BUCKET_LABEL: Record<IndexBucket, string> = {
  indexed: '색인됨',
  crawled: '크롤됐지만 미색인',
  discovered: '발견됨 · 크롤 대기',
  unseen: '구글이 모름',
  excluded: '제외됨',
  unknown: '알 수 없음',
}

// ─── 콘텐츠 그룹 ──────────────────────────────────────────────────────────────

/**
 * 색인률은 사이트 전체 평균으로 보면 쓸모가 없다. 성경 67쪽이 통째로 안 잡히는 것과
 * 코어 페이지 5쪽이 안 잡히는 것은 원인도 처방도 다르기 때문이다. 그래서 경로를
 * 버티컬로 접어 그룹별 색인률을 따로 낸다.
 */
export interface IndexGroup {
  key: string
  label: string
  total: number
  indexed: number
  pct: number
}

type Classifier = (path: string) => { key: string; label: string }

const CLASSIFIERS: Record<string, Classifier> = {
  voicecards: path => {
    if (path.startsWith('/templates/')) {
      const slug = path.slice('/templates/'.length)
      if (slug.startsWith('memorize-surah') || slug.includes('quran') || slug.includes('juz')) {
        return { key: 'quran', label: '코란' }
      }
      if (slug.startsWith('civics') || slug.includes('naturalization')) {
        return { key: 'civics', label: '시민권' }
      }
      if (slug.startsWith('memorize-') || slug.includes('bible') || slug.includes('verse')) {
        return { key: 'bible', label: '성경' }
      }
      return { key: 'templates', label: '기타 덱' }
    }
    if (path.startsWith('/methods')) return { key: 'methods', label: '학습법' }
    return { key: 'core', label: '코어' }
  },
  reviewnotes: path => {
    if (path.includes('/practice')) return { key: 'practice', label: '연습문제' }
    if (path.includes('/guides')) return { key: 'guides', label: '가이드' }
    return { key: 'core', label: '코어' }
  },
  // 밸류체인은 루트에 노드 슬러그가 평평하게 깔린다(/nvidia, /tsmc …).
  // 경로 모양으로는 더 못 쪼개므로 노드 / 분석글 / 코어 셋으로만 접는다.
  valuechain: path => {
    if (path.startsWith('/analysis')) return { key: 'analysis', label: '분석글' }
    if (/^\/[a-z0-9-]+$/.test(path)) return { key: 'node', label: '노드' }
    return { key: 'core', label: '코어' }
  },
}

const classifierFor = (siteKey: string): Classifier =>
  CLASSIFIERS[siteKey] ?? (() => ({ key: 'all', label: '전체' }))

// ─── 검사 ─────────────────────────────────────────────────────────────────────

interface InspectionResult {
  verdict?: string
  coverageState?: string
  robotsTxtState?: string
  pageFetchState?: string
  indexingState?: string
  lastCrawlTime?: string
  googleCanonical?: string
  userCanonical?: string
}

async function inspectUrl(property: string, url: string, token: string): Promise<InspectionResult | null> {
  const res = await fetch(INSPECT_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inspectionUrl: url, siteUrl: property }),
    cache: 'no-store',
  })
  if (!res.ok) {
    // 개별 URL 실패는 스캔 전체를 죽이지 않는다 (쿼터 초과·일시 오류)
    const body = await res.text().catch(() => '')
    console.error(`[gsc-index] inspect ${res.status} ${url}: ${body.slice(0, 160)}`)
    return null
  }
  const json = await res.json() as { inspectionResult?: { indexStatusResult?: InspectionResult } }
  return json.inspectionResult?.indexStatusResult ?? null
}

/**
 * 사이트맵 경로 중 콘텐츠 단위 대표 URL 목록.
 * 로케일 변형은 하나로 묶고, 로케일 없는 기본 경로가 있으면 그걸 대표로 쓴다.
 * (모든 로케일을 검사하면 쿼터만 소모되고 판단은 같다)
 */
export async function representativePaths(domain: string): Promise<string[]> {
  const paths = (await fetchSitemapPaths(domain)).filter(isHtmlPath)
  const byContent = new Map<string, string>()
  for (const p of paths) {
    const c = canonicalPath(p)
    const cur = byContent.get(c)
    // 로케일 프리픽스가 없는 경로를 우선 (p === c 이면 기본 로케일)
    if (!cur || (p === c && cur !== c)) byContent.set(c, p)
  }
  return Array.from(byContent.values()).sort()
}

export interface ScanResult {
  siteKey: string
  checkedOn: string
  requested: number
  inspected: number
  failed: number
  buckets: Record<IndexBucket, number>
}

/** KST 기준 오늘 날짜 (검사일 키) */
function kstToday(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
}

export async function scanSiteIndexStatus(
  siteKey: string,
  limit = DEFAULT_SCAN_LIMIT,
): Promise<ScanResult> {
  const site = getGscSite(siteKey)
  if (!site) throw new Error(`알 수 없는 사이트: ${siteKey}`)

  const paths = (await representativePaths(site.domain)).slice(0, limit)
  const client = await getAuth().getClient()
  const token = (await client.getAccessToken()).token
  if (!token) throw new Error('서비스 계정 토큰 획득 실패')

  const checkedOn = kstToday()
  const buckets: Record<IndexBucket, number> = {
    indexed: 0, crawled: 0, discovered: 0, unseen: 0, excluded: 0, unknown: 0,
  }
  let failed = 0
  const rows: Array<Record<string, unknown>> = []

  // 고정 크기 워커 풀 — 분당 제한을 넘지 않으면서 전수 검사를 끝낸다
  let cursor = 0
  const worker = async () => {
    while (cursor < paths.length) {
      const idx = cursor++
      const path = paths[idx]
      const url = `https://${site.domain}${path === '/' ? '' : path}`
      const r = await inspectUrl(site.property, url, token)
      if (!r) { failed++; continue }
      const bucket = bucketOf(r.coverageState)
      buckets[bucket]++
      rows.push({
        site_key: siteKey,
        path: normalizePath(path),
        url,
        checked_on: checkedOn,
        verdict: r.verdict ?? null,
        coverage_state: r.coverageState ?? null,
        robots_txt_state: r.robotsTxtState ?? null,
        page_fetch_state: r.pageFetchState ?? null,
        indexing_state: r.indexingState ?? null,
        last_crawl_time: r.lastCrawlTime ?? null,
        google_canonical: r.googleCanonical ?? null,
        user_canonical: r.userCanonical ?? null,
        is_indexed: bucket === 'indexed',
      })
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, paths.length) }, worker))

  // 같은 날 재실행하면 덮어쓴다 (하루 1행/URL)
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200)
    const { error } = await supabase
      .from('seo_index_status')
      .upsert(chunk, { onConflict: 'site_key,path,checked_on' })
    if (error) throw new Error(`색인 스냅샷 저장 실패: ${error.message}`)
  }

  return { siteKey, checkedOn, requested: paths.length, inspected: rows.length, failed, buckets }
}

// ─── 조회 ─────────────────────────────────────────────────────────────────────

export interface IndexStatusSummary {
  siteKey: string
  domain: string
  latestDate: string | null
  total: number
  buckets: Record<IndexBucket, number>
  indexedPct: number
  /** 버티컬별 색인률 — 전체 평균보다 이쪽이 처방으로 이어진다 */
  groups: IndexGroup[]
  /** 일별 색인 수 추이 */
  trend: Array<{ date: string; indexed: number; total: number; pct: number }>
  /** 직전 스냅샷 대비 색인 증감 */
  changeFromPrev: number | null
}

interface StatusRow {
  path: string
  checked_on: string
  coverage_state: string | null
  last_crawl_time: string | null
  is_indexed: boolean | null
}

export async function getIndexStatusSummary(siteKey: string, trendDays = 30): Promise<IndexStatusSummary> {
  const site = getGscSite(siteKey)
  const since = new Date(Date.now() - trendDays * 86_400_000).toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('seo_index_status')
    .select('path, checked_on, coverage_state, last_crawl_time, is_indexed')
    .eq('site_key', siteKey)
    .gte('checked_on', since)
    .order('checked_on', { ascending: false })
  if (error) throw new Error(`색인 상태 조회 실패: ${error.message}`)

  const rows = (data ?? []) as StatusRow[]
  const empty: Record<IndexBucket, number> = { indexed: 0, crawled: 0, discovered: 0, unseen: 0, excluded: 0, unknown: 0 }

  if (rows.length === 0) {
    return {
      siteKey, domain: site?.domain ?? '', latestDate: null, total: 0,
      buckets: { ...empty }, indexedPct: 0, groups: [], trend: [],
      changeFromPrev: null,
    }
  }

  // 날짜별 집계 (추이)
  const byDate = new Map<string, { indexed: number; total: number }>()
  for (const r of rows) {
    const d = byDate.get(r.checked_on) ?? { indexed: 0, total: 0 }
    d.total++
    if (r.is_indexed) d.indexed++
    byDate.set(r.checked_on, d)
  }
  const trend = Array.from(byDate.entries())
    .map(([date, v]) => ({ date, indexed: v.indexed, total: v.total, pct: v.total > 0 ? Math.round((v.indexed / v.total) * 1000) / 10 : 0 }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const latestDate = trend[trend.length - 1]?.date ?? null
  const latestRows = rows.filter(r => r.checked_on === latestDate)

  const buckets = { ...empty }
  for (const r of latestRows) buckets[bucketOf(r.coverage_state)]++

  const classify = classifierFor(siteKey)
  const groupAcc = new Map<string, { label: string; total: number; indexed: number }>()
  for (const r of latestRows) {
    const { key, label } = classify(r.path)
    const g = groupAcc.get(key) ?? { label, total: 0, indexed: 0 }
    g.total++
    if (r.is_indexed) g.indexed++
    groupAcc.set(key, g)
  }
  const groups: IndexGroup[] = Array.from(groupAcc.entries())
    .map(([key, g]) => ({
      key, label: g.label, total: g.total, indexed: g.indexed,
      pct: g.total > 0 ? Math.round((g.indexed / g.total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total)

  const prev = trend.length >= 2 ? trend[trend.length - 2] : null
  const latest = trend[trend.length - 1]

  return {
    siteKey,
    domain: site?.domain ?? '',
    latestDate,
    total: latestRows.length,
    buckets,
    indexedPct: latest && latest.total > 0 ? latest.pct : 0,
    groups,
    trend,
    changeFromPrev: prev && latest ? latest.indexed - prev.indexed : null,
  }
}
