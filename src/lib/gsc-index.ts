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
import { canonicalPath, fetchSitemapPaths, isHtmlPath, LOCALES, normalizePath, pathLocale } from './umami'

const INSPECT_API = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect'
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly'

/**
 * 한 번에 검사할 URL 상한. 밸류체인이 1,394쪽이라 전수를 한 번에 담으려면 이만큼 필요하다.
 * 쿼터는 속성당 하루 2,000건이고 사이트끼리 나눠 쓰지 않으므로 여유가 있다.
 */
const DEFAULT_SCAN_LIMIT = 1_400
/**
 * 동시 요청 수.
 *
 * 10으로는 부족하다는 게 2026-08-05에 드러났다. 실측 처리량이 10 워커에서 초당 1.2건이라
 * (호출당 1초가 아니라 8초 넘게 걸린다), 보이스카드 670쪽이면 약 560초 — 함수 제한 300초를
 * 넘겨 504로 죽었다. 아래 flush 주석 참조: 죽으면 그날 스냅샷이 통째로 비었다.
 *
 * 30이면 같은 실측 기준 분당 약 210건이라 GSC 분당 600건 제한 아래에 넉넉히 머물고,
 * 670쪽을 190초 안팎에 끝낸다. 하루 쿼터는 속성당 2,000건이라 전수 검사에 영향 없다.
 */
const CONCURRENCY = 30

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
  /** 기본 로케일(영어 원본)만. scanLocales를 켜기 전과 정의가 같아 시계열 비교가 성립한다. */
  total: number
  indexed: number
  pct: number
  /** 같은 버티컬의 로케일 변형. 원본과 색인률이 크게 달라 섞으면 둘 다 못 읽는다. */
  localeTotal: number
  localeIndexed: number
}

type Classifier = (path: string) => { key: string; label: string }

/**
 * 덱 클러스터 — 슬러그 프리픽스가 곧 클러스터다.
 *
 * 새 클러스터를 내면 여기에 한 줄 추가한다. 안 하면 '기타 덱'으로 들어가는데,
 * 그 칸은 잡동사니처럼 보여서 아무도 안 본다. 2026-08-05에 einbuergerungstest(49쪽)·
 * deutsch-a1(35쪽)·cdl(20쪽)이 거기 묶여 있었고, 앞의 둘은 색인 0%였는데 표에서는
 * "기타 104쪽 4%" 한 줄이라 어느 클러스터가 통째로 막힌 건지 안 보였다.
 *
 * `scripts/seo-daily-brief.mjs`의 COVERED_BY_HUB가 같은 클러스터 목록을 허브 기준으로
 * 들고 있다. 새 클러스터는 두 곳 다 넣어야 색인률 표와 요청 대기열이 같은 세계를 본다.
 */
const VC_DECK_CLUSTERS: Array<{ prefix: string; key: string; label: string }> = [
  { prefix: 'english-japanese', key: 'japanese-audience', label: '일본 사용자 덱' },
  { prefix: 'daily-english-chunks-ja', key: 'japanese-audience', label: '일본 사용자 덱' },
  { prefix: 'instant-response-english-phrases-ja', key: 'japanese-audience', label: '일본 사용자 덱' },
  { prefix: 'korean-kpop-fan-phrases-ja', key: 'japanese-audience', label: '일본 사용자 덱' },
  { prefix: 'korean-travel-phrases-ja', key: 'japanese-audience', label: '일본 사용자 덱' },
  { prefix: 'einbuergerungstest', key: 'einbuergerungstest', label: '독일 귀화시험' },
  { prefix: 'deutsch-a1', key: 'deutsch-a1', label: '독일어 A1' },
  { prefix: 'cdl', key: 'cdl', label: 'CDL 상용면허' },
  { prefix: 'spanish', key: 'spanish', label: '스페인어' },
  { prefix: 'opic', key: 'opic', label: 'OPIc' },
]

const CLASSIFIERS: Record<string, Classifier> = {
  voicecards: path => {
    if (path.startsWith('/templates/')) {
      const slug = path.slice('/templates/'.length)
      // 프리픽스가 정확한 클러스터를 먼저 본다. 아래 성경 규칙이 'verse' 같은 부분
      // 문자열을 보기 때문에, 뒤에 두면 새 클러스터가 거기 걸릴 위험이 있다.
      const deck = VC_DECK_CLUSTERS.find(c => slug === c.prefix || slug.startsWith(`${c.prefix}-`))
      if (deck) return { key: deck.key, label: deck.label }
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

/**
 * 분류는 반드시 로케일을 뗀 경로로 한다.
 *
 * 규칙이 `/templates/...` 같은 원본 경로 모양을 보는데 로케일 변형은 `/es/templates/...`라
 * 하나도 안 걸리고 전부 fallback('코어')으로 떨어진다. 2026-08-05 보이스카드에서 로케일
 * 438쪽이 통째로 코어에 들어가 코어가 9쪽(89%) → 447쪽(10%)이 됐다 — 어느 클러스터가
 * 막혔는지 보려고 만든 표가 정반대로 읽혔다.
 */
const classifierFor = (siteKey: string): Classifier => {
  const base = CLASSIFIERS[siteKey] ?? (() => ({ key: 'all', label: '전체' }))
  return path => base(canonicalPath(path))
}

export function classifyIndexGroup(siteKey: string, path: string): { key: string; label: string } {
  return classifierFor(siteKey)(path)
}

/**
 * 로케일 변형 판정기 — 사이트마다 원본을 어디에 두는지가 달라 사이트별로 만든다.
 *
 * 보이스카드는 원본에 프리픽스가 없고(`/templates/x`), 리뷰노트는 원본도 `/en/`을 단다.
 * 프리픽스 유무로만 보면 리뷰노트는 34쪽 전부가 로케일이 돼서 원본이 0/0이 된다.
 */
function localeVariantTest(siteKey: string): (path: string) => boolean {
  const base = getGscSite(siteKey)?.defaultLocale ?? null
  return path => {
    const loc = pathLocale(path)
    return loc !== 'default' && loc !== base
  }
}

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

/** 로케일 변형을 콘텐츠 하나당 대표 경로로 접는다. 기본 로케일이 있으면 그걸 쓴다. */
function collapseLocales(paths: string[]): string[] {
  const byContent = new Map<string, string>()
  for (const p of paths) {
    const c = canonicalPath(p)
    const cur = byContent.get(c)
    // 로케일 프리픽스가 없는 경로를 우선 (p === c 이면 기본 로케일)
    if (!cur || (p === c && cur !== c)) byContent.set(c, p)
  }
  return Array.from(byContent.values()).sort()
}

/**
 * 사이트맵 경로 중 콘텐츠 단위 대표 URL 목록.
 * (모든 로케일을 검사하면 쿼터만 소모되고 판단은 같다 — scanLocales가 꺼진 사이트 전제)
 */
export async function representativePaths(domain: string): Promise<string[]> {
  return collapseLocales((await fetchSitemapPaths(domain)).filter(isHtmlPath))
}

/**
 * 실제로 검사할 경로.
 *
 * scanLocales가 켜진 사이트는 로케일 변형까지 전수로 본다. "영어판이 색인됐으니
 * 로케일도 됐을 것"이 사실이 아니어서다 — 근거는 GscSiteConfig.scanLocales 주석.
 * 상한을 넘기면 접어서 대표만 본다. 관측 범위가 줄더라도 스캔이 통째로
 * 실패하는 것보다는 낫다.
 */
async function scanPaths(
  domain: string,
  scanLocales: boolean,
  limit: number,
): Promise<{ paths: string[]; mode: 'full' | 'representative' }> {
  const all = (await fetchSitemapPaths(domain)).filter(isHtmlPath)
  if (scanLocales && all.length <= limit) {
    return { paths: all.slice().sort(), mode: 'full' }
  }
  return { paths: collapseLocales(all).slice(0, limit), mode: 'representative' }
}

export interface ScanResult {
  siteKey: string
  checkedOn: string
  requested: number
  inspected: number
  failed: number
  /** 'full' = 로케일 변형까지 전수, 'representative' = 콘텐츠당 대표 하나. */
  mode: 'full' | 'representative'
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

  const { paths, mode } = await scanPaths(site.domain, site.scanLocales, limit)
  const client = await getAuth().getClient()
  const token = (await client.getAccessToken()).token
  if (!token) throw new Error('서비스 계정 토큰 획득 실패')

  const checkedOn = kstToday()
  const buckets: Record<IndexBucket, number> = {
    indexed: 0, crawled: 0, discovered: 0, unseen: 0, excluded: 0, unknown: 0,
  }
  let failed = 0
  let inspected = 0
  const rows: Array<Record<string, unknown>> = []

  // 같은 날 재실행하면 덮어쓴다 (하루 1행/URL)
  const flush = async (batch: Array<Record<string, unknown>>) => {
    for (let i = 0; i < batch.length; i += 200) {
      const chunk = batch.slice(i, i + 200)
      const { error } = await supabase
        .from('seo_index_status')
        .upsert(chunk, { onConflict: 'site_key,path,checked_on' })
      if (error) throw new Error(`색인 스냅샷 저장 실패: ${error.message}`)
    }
  }

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
      inspected++
      // 중간 저장. 예전엔 전수 검사가 끝난 뒤에 한 번에 upsert 했는데, 그러면 함수가
      // 제한시간에 걸려 죽는 순간 그날 스냅샷이 통째로 사라진다 — 부분 결과조차 안 남아
      // 브리프는 하루 묵은 데이터로 조용히 계속 돈다(2026-08-05 사고). 200건마다 흘려보내
      // 다음에 또 시간이 모자라도 거기까지는 남게 한다.
      if (rows.length >= 200) await flush(rows.splice(0, rows.length))
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, paths.length) }, worker))
  if (rows.length > 0) await flush(rows)

  return { siteKey, checkedOn, requested: paths.length, inspected, failed, mode, buckets }
}

// ─── 조회 ─────────────────────────────────────────────────────────────────────

/** 한 계열(기본 로케일 / 로케일 변형)의 색인 집계 */
export interface IndexSlice {
  total: number
  indexed: number
  pct: number
}

export interface IndexStatusSummary {
  siteKey: string
  domain: string
  latestDate: string | null
  /** 추적 중인 URL 전체 (원본 + 로케일) */
  total: number
  /** 상태별 분포 — 전체 기준. 원본만 보려면 localeBuckets를 빼면 된다. */
  buckets: Record<IndexBucket, number>
  localeBuckets: Record<IndexBucket, number>
  /** 색인률 — 원본 기준. 화면의 대표 숫자는 전부 이 기준이다(아래 base 주석) */
  indexedPct: number
  /**
   * 기본 로케일(원본)만 / 로케일 변형만.
   *
   * **화면의 대표 숫자는 전부 base 기준이고, 로케일은 옆에 병기한다.** 둘을 섞은
   * 평균은 처방으로 이어지지 않는다. 보이스카드 2026-08-05 기준 원본 44/229(19.2%)에
   * 로케일 36/436(8.3%)이라, 합쳐 놓으면 12%라는 어느 쪽도 아닌 숫자가 나온다.
   * 막힌 게 원본인지 번역본인지가 손댈 곳을 가른다.
   *
   * 기준을 섞으면 같은 화면이 두 숫자로 답한다 — "색인된 게 80이야 44야"라는 질문이
   * 실제로 나왔다(2026-08-05). 새 지표를 붙일 때도 base를 대표로 쓸 것.
   */
  base: IndexSlice
  locale: IndexSlice
  /** 버티컬별 색인률 — 전체 평균보다 이쪽이 처방으로 이어진다 */
  groups: IndexGroup[]
  /** 일별 색인 수 추이. base*는 로케일을 뺀 계열 — 스캔 범위가 바뀌어도 이어진다. */
  trend: Array<{ date: string; indexed: number; total: number; pct: number; baseIndexed: number; baseTotal: number }>
  /**
   * 직전 스냅샷 대비 색인 증감 — **기본 로케일 계열 기준**.
   *
   * 전체로 재면 스캔 범위가 넓어진 날 정의 변경분이 진척으로 둔갑한다. 08-05에
   * 로케일 전수 스캔을 켜자 전체는 39 → 80(+41)이 됐지만 실제로 새로 잡힌 건
   * 원본 5쪽이었다. 나머지 36쪽은 원래 색인돼 있었는데 그동안 안 보던 것이다.
   */
  changeFromPrev: number | null
}

interface StatusRow {
  path: string
  checked_on: string
  coverage_state: string | null
  last_crawl_time: string | null
  is_indexed: boolean | null
}

/** 날짜별 색인 집계 한 줄 — RPC `seo_index_trend`의 반환 모양 */
interface TrendRow {
  checked_on: string
  total: number
  indexed: number
  base_total: number
  base_indexed: number
}

/**
 * 날짜별 집계는 DB에서 접는다.
 *
 * 예전엔 기간 전체의 원본 행을 받아 TS에서 날짜별로 세었는데, PostgREST가 응답을
 * 1,000행에서 자른다. 보이스카드는 하루 669행이라 30일을 달라고 해도 최신 하루와
 * 직전 하루의 임의 331행만 왔다 — 추이에 점이 둘만 찍히고 그중 하나는 부분집합이었다.
 * 잘렸다는 신호가 없어서 조용히 틀린 그림이 나왔다. 집계를 DB에 두면 반환이 날짜 수
 * 만큼(30행)이라 상한에 닿지 않는다.
 *
 * 로케일 판정 목록은 TS(umami.ts LOCALES)가 단일 진실원이라 인자로 넘긴다.
 */
async function fetchTrend(siteKey: string, since: string): Promise<TrendRow[]> {
  const { data, error } = await supabase.rpc('seo_index_trend', {
    p_site_key: siteKey,
    p_since: since,
    p_locales: Array.from(LOCALES),
    p_base_locale: getGscSite(siteKey)?.defaultLocale ?? null,
  })
  if (error) throw new Error(`색인 추이 조회 실패: ${error.message}`)
  return (data ?? []) as TrendRow[]
}

const PAGE_SIZE = 1000

/**
 * 한 날짜의 스냅샷 전체 행.
 *
 * 하루치도 1,000행을 넘을 수 있어서(밸류체인 1,394쪽) 그냥 select 하면 잘린다.
 * 잘린 응답은 에러가 아니라 그냥 짧은 배열이라, 버킷 분포와 버티컬 표가 부분집합
 * 위에서 계산되고도 정상처럼 보인다. range로 끝까지 넘긴다.
 */
async function fetchSnapshot(siteKey: string, date: string): Promise<StatusRow[]> {
  const out: StatusRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('seo_index_status')
      .select('path, checked_on, coverage_state, last_crawl_time, is_indexed')
      .eq('site_key', siteKey)
      .eq('checked_on', date)
      .order('path')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`색인 스냅샷 조회 실패: ${error.message}`)
    const page = (data ?? []) as StatusRow[]
    out.push(...page)
    if (page.length < PAGE_SIZE) return out
  }
}

// 색인 수를 세는 함수는 아래 둘뿐이다: getIndexedPageStats(지표 타일용)와
// getIndexStatusSummary(색인 카드용). 세 번째를 만들지 말 것.
//
// 여기 있던 getIndexedPageCount가 그 세 번째였다. 호출부가 없는데도 남아서 규칙만
// 하나 더 들고 있었고(최신 스냅샷 전체 is_indexed = 로케일 포함), 스캔 범위가 넓어지자
// 나머지 둘과 조용히 갈라졌다. 다시 필요해지면 getIndexedPageStats().total을 쓸 것.

/**
 * 색인 수의 오늘/최근 7일 증감 — 통계 카드 보조라벨(오늘 N쪽 · 7일 N쪽)용.
 * 오늘 = 오늘 스냅샷 − 직전 스냅샷. 7일 = 최신 스냅샷 − 7일 전(또는 그 이전 가장 가까운) 스냅샷.
 * 색인 수 자체는 getIndexedPageCount와 같은 규칙(최신 스냅샷의 is_indexed)을 쓴다.
 *
 * **총계·증감 모두 기본 로케일(원본) 계열로 잰다.** 화면의 대표 숫자를 base로 통일한
 * 규칙을 따른다(IndexStatusSummary.base 주석). 이 함수의 반환값은 원래 주석대로 "대표
 * URL 수"였는데 로케일 전수 스캔이 켜지면서 조용히 로케일까지 세고 있었다. 그래서 같은
 * 화면이 색인율 19.2%(원본 44/229) 옆에 색인 페이지 80을 띄웠다.
 *
 * 증감을 전체로 재면 스캔 범위가 넓어진 날이 폭증으로도 찍힌다 — 08-05 보이스카드에서
 * 전체 +41, 실제 신규는 +5였다. `locale`은 병기용이고 대표로 쓰지 않는다.
 */
export async function getIndexedPageStats(siteKey: string): Promise<{ total: number; locale: number; today: number; last7d: number }> {
  const since = new Date(Date.now() - 9 * 86_400_000).toISOString().slice(0, 10)
  const trend = await fetchTrend(siteKey, since)
  if (trend.length === 0) return { total: 0, locale: 0, today: 0, last7d: 0 }

  const dates = trend.map(t => t.checked_on)
  const latest = trend[trend.length - 1]
  const total = latest.base_indexed
  const kstToday = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10)
  const todayIdx = dates.indexOf(kstToday)
  const today = todayIdx > 0 ? total - trend[todayIdx - 1].base_indexed : 0
  const week7Cut = new Date(Date.now() + 9 * 3_600_000 - 6 * 86_400_000).toISOString().slice(0, 10)
  let baselineIdx = 0
  for (let i = 0; i < dates.length; i++) if (dates[i] < week7Cut) baselineIdx = i
  const last7d = dates[baselineIdx] === latest.checked_on ? 0 : total - trend[baselineIdx].base_indexed
  return { total, locale: latest.indexed - latest.base_indexed, today, last7d }
}

export async function getIndexStatusSummary(siteKey: string, trendDays = 30): Promise<IndexStatusSummary> {
  const site = getGscSite(siteKey)
  const since = new Date(Date.now() - trendDays * 86_400_000).toISOString().slice(0, 10)

  // 추이는 DB 집계로, 최신 스냅샷 상세만 행 단위로 받는다 — 둘 다 1,000행 상한을 피한다.
  const trendRows = await fetchTrend(siteKey, since)

  const isLocaleVariant = localeVariantTest(siteKey)
  const empty: Record<IndexBucket, number> = { indexed: 0, crawled: 0, discovered: 0, unseen: 0, excluded: 0, unknown: 0 }

  if (trendRows.length === 0) {
    const emptySlice: IndexSlice = { total: 0, indexed: 0, pct: 0 }
    return {
      siteKey, domain: site?.domain ?? '', latestDate: null, total: 0,
      buckets: { ...empty }, localeBuckets: { ...empty }, indexedPct: 0,
      base: { ...emptySlice }, locale: { ...emptySlice },
      groups: [], trend: [],
      changeFromPrev: null,
    }
  }

  const pct = (indexed: number, total: number) => (total > 0 ? Math.round((indexed / total) * 1000) / 10 : 0)

  // 날짜별 집계 (추이). base = 로케일을 뺀 계열 — RPC가 날짜 오름차순으로 준다
  const trend = trendRows.map(r => ({
    date: r.checked_on,
    indexed: r.indexed,
    total: r.total,
    pct: pct(r.indexed, r.total),
    baseIndexed: r.base_indexed,
    baseTotal: r.base_total,
  }))

  const latestDate = trend[trend.length - 1].date
  const latestRows = await fetchSnapshot(siteKey, latestDate)

  const buckets = { ...empty }
  const localeBuckets = { ...empty }
  for (const r of latestRows) {
    const b = bucketOf(r.coverage_state)
    buckets[b]++
    if (isLocaleVariant(r.path)) localeBuckets[b]++
  }

  const classify = classifierFor(siteKey)
  const groupAcc = new Map<string, { label: string; total: number; indexed: number; localeTotal: number; localeIndexed: number }>()
  for (const r of latestRows) {
    const { key, label } = classify(r.path)
    const g = groupAcc.get(key) ?? { label, total: 0, indexed: 0, localeTotal: 0, localeIndexed: 0 }
    if (isLocaleVariant(r.path)) {
      g.localeTotal++
      if (r.is_indexed) g.localeIndexed++
    } else {
      g.total++
      if (r.is_indexed) g.indexed++
    }
    groupAcc.set(key, g)
  }
  const groups: IndexGroup[] = Array.from(groupAcc.entries())
    .map(([key, g]) => ({
      key, label: g.label, total: g.total, indexed: g.indexed, pct: pct(g.indexed, g.total),
      localeTotal: g.localeTotal, localeIndexed: g.localeIndexed,
    }))
    .sort((a, b) => (b.total + b.localeTotal) - (a.total + a.localeTotal))

  const prev = trend.length >= 2 ? trend[trend.length - 2] : null
  const latest = trend[trend.length - 1]

  const localeRows = latestRows.filter(r => isLocaleVariant(r.path))
  const localeIndexed = localeRows.filter(r => r.is_indexed).length
  const baseTotal = latestRows.length - localeRows.length
  const baseIndexed = latestRows.filter(r => r.is_indexed).length - localeIndexed

  return {
    siteKey,
    domain: site?.domain ?? '',
    latestDate,
    total: latestRows.length,
    buckets,
    localeBuckets,
    // 헤드라인 색인률도 원본 기준이다. 로케일을 섞으면 스캔 범위를 넓힌 날 색인률이
    // 떨어진 것처럼 보이는데(18.0% → 12.0%), 실제로 후퇴한 건 아무것도 없다.
    indexedPct: pct(baseIndexed, baseTotal),
    base: { total: baseTotal, indexed: baseIndexed, pct: pct(baseIndexed, baseTotal) },
    locale: { total: localeRows.length, indexed: localeIndexed, pct: pct(localeIndexed, localeRows.length) },
    groups,
    trend,
    changeFromPrev: prev && latest ? latest.baseIndexed - prev.baseIndexed : null,
  }
}
