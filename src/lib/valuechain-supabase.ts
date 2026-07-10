import { getServiceSupabase } from '@/lib/supabase'

// ─── 노드 성숙도 티어 (valuechain-wiki/lib/maturity.ts와 동일한 13개 체크) ──────────
// 원본을 willow 대시보드로 옮긴 것. 원본 규칙이 바뀌면 여기도 맞춰야 한다.

type MSrc = { stance?: string | null; metric?: unknown; vc_sources?: { kind?: string | null; published_at?: string | null; lang?: string | null } | null }
type MEdge = { direction: 'revenue' | 'cost'; counterparty_id?: string | null; confidence?: string | null; metric?: unknown; vc_edge_sources?: MSrc[] | null }
type MNode = { name?: string | null; kicker?: string | null; lead?: string | null; segments?: { total?: string; parts?: unknown[]; private?: boolean } | null; vc_edges?: MEdge[] | null }

export type Maturity = {
  tier: string
  tierShort: 'T0' | 'T1' | 'T2' | 'T3' | 'T4'
  pass: number
  total: number
  fails: string[]
}

function auditNode(n: MNode): Maturity {
  const edges = n.vc_edges || []
  const rev = edges.filter((e) => e.direction === 'revenue')
  const cost = edges.filter((e) => e.direction === 'cost')
  const allSrc = edges.flatMap((e) => (e.vc_edge_sources || []).map((s) => ({ ...s, pub: s.vc_sources })))
  const langs = new Set(allSrc.map((s) => s.pub?.lang).filter(Boolean))
  const kinds = new Set(allSrc.map((s) => s.pub?.kind || 'news'))
  const hasFiling = kinds.has('filing')
  const isPrivate = !!n.segments?.private
  const mediaCrossVerified = allSrc.filter((s) => s.stance === 'confirms').length >= 2
  const hasFilingOrPrivateVerify = hasFiling || (isPrivate && mediaCrossVerified)
  const dates = allSrc.map((s) => s.pub?.published_at).filter(Boolean).sort() as string[]
  const latest = dates[dates.length - 1] || null
  const quantObs = allSrc.filter((s) => /share|amount|value|count/.test(JSON.stringify(s.metric || '')) || s.metric)
  const verifiedEdges = edges.filter((e) => {
    const ss = e.vc_edge_sources || []
    const confirms = ss.filter((s) => s.stance === 'confirms').length
    const filing = ss.some((s) => s.vc_sources?.kind === 'filing')
    return (ss.length >= 2 && confirms >= 1 && filing) || (isPrivate && confirms >= 2)
  })
  const tiered = edges.filter((e) => e.confidence).length

  const checks: Record<string, boolean> = {
    '정체성': !!n.name,
    '목록 메타': !!(n.kicker && n.lead),
    '세그먼트+총매출': !!(n.segments && (n.segments.total || n.segments.parts?.length)),
    '매출 엣지': rev.length >= 1,
    '비용 엣지': cost.length >= 1,
    '출처 ≥3': allSrc.length >= 3,
    '다국어(KO+EN)': langs.size >= 2,
    '1차공시/매체검증': hasFilingOrPrivateVerify,
    '교차검증 엣지': verifiedEdges.length >= 1,
    '정규화 metric': quantObs.length >= 1,
    '신뢰등급 전부': tiered === edges.length && edges.length > 0,
    '최신성(2025+)': !!(latest && latest >= '2025-01-01'),
    '엣지 폭(각 ≥2)': rev.length >= 2 && cost.length >= 2,
  }
  const pass = Object.values(checks).filter(Boolean).length
  const total = Object.keys(checks).length
  const fails = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k)
  let tier: string, tierShort: Maturity['tierShort']
  if (pass <= 2) { tier = 'T0 Stub'; tierShort = 'T0' }
  else if (pass <= 6) { tier = 'T1 Seeded'; tierShort = 'T1' }
  else if (pass <= 9) { tier = 'T2 Sourced'; tierShort = 'T2' }
  else if (pass <= 11) { tier = 'T3 Verified'; tierShort = 'T3' }
  else { tier = 'T4 Reference'; tierShort = 'T4' }
  return { tier, tierShort, pass, total, fails }
}

// ─── 타입 ───────────────────────────────────────────────────────────────────────

export interface TrendBlock {
  series: { date: string; value: number }[] // 최근 14일 누적
  today: number // 오늘 신규
  last7: number // 최근 7일 신규
}

export interface FunnelTier {
  total: number
  last7d: number
  last: string | null
  bots: { bot: string; count: number }[]
  series7d: number[] // 최근 7일 일별 건수 (오래된→최신, 길이 7) — 인라인 바차트용
}

export interface ValueChainStats {
  summary: {
    nodes: number
    edges: number
    sources: number
    articles: number
  }
  maturity: {
    checks: number // 노드당 총 체크 수 (13)
    avgPass: number // 평균 통과 체크 수
    completeness: number // 평균 완성도 % (avgPass / checks)
    tiers: { tier: 'T0' | 'T1' | 'T2' | 'T3' | 'T4'; label: string; count: number }[]
    topFails: { check: string; count: number }[] // 완성도를 막는 가장 흔한 미통과 체크
  }
  updates: {
    last7d: number
    last30d: number
    daily: { date: string; count: number }[] // 최근 14일
    recent: { slug: string; name: string; ticker: string | null; rev: number; cost: number; pass: number; tier: string; created_at: string | null; updated_at: string | null; hasReport: boolean; hasChainImpact: boolean; funnel: { train: number; index: number; cite: number; visit: number } }[]
  }
  crawl: {
    total: number
    ai: number
    last24h: number
    last7d: number
    lastTs: string | null
    topBots: { bot: string; count: number; days: number }[]
    topResources: { resource: string; count: number; bots: number }[]
    // AI 인용 퍼널: 학습 수집 → 답변 인덱싱 → 사용자 질문 인용 → 사용자 방문(referral)
    funnel: {
      train: FunnelTier
      index: FunnelTier
      cite: FunnelTier
      visit: FunnelTier // ④ 인용 링크를 통해 실제 사람이 방문 (vc_crawl_log category='referral')
    }
    citedFetches: { ts: string; path: string; bot: string | null }[] // ③ 실사용자 질문이 가져간 페이지
    // 질문 역설계 (valuechain-wiki docs/traffic-capture.md): 유형=패싯 fetch, 방향=panel_nav, 묶음=co-fetch 세션
    questionTypes: { facet: string; total: number; top: string | null }[]
    panelSignal: { revenue: number; cost: number; recent: { from: string; to: string; side: 'in' | 'out' }[] }
    cofetch: { total: number; multi: number; relation: number; recent: { start: string; bot: string; cls: 'relation' | 'theme'; seq: string[] }[] }
  }
  // 분석 아티클 업데이트 현황 (vc_articles)
  articleUpdates: {
    slug: string
    title: string
    publishedAt: string | null
    updatedAt: string | null
    changelogCount: number
    funnel: { train: number; index: number; cite: number; visit: number }
  }[]
  trends: {
    nodes: TrendBlock
    edges: TrendBlock
    sources: TrendBlock
    articles: TrendBlock
    crawl: TrendBlock
  }
}

const TIER_LABEL: Record<string, string> = {
  T0: 'Stub', T1: 'Seeded', T2: 'Sourced', T3: 'Verified', T4: 'Reference',
}

export async function getValueChainStats(): Promise<ValueChainStats> {
  const supabase = getServiceSupabase()

  // 추이용 윈도우 시작일(최근 14일). 윈도우 내 신규 행만 가져와 누적 추이를 계산(전수 스캔 회피).
  const windowStartKey = new Date(Date.now() - 13 * 86400000).toISOString().slice(0, 10)

  const [
    nodesHead, edgesHead, sourcesHead, articlesHead,
    maturityRes, crawlRes,
    nodesRecent, edgesRecent, sourcesRecent, articlesRecent,
    articlesFull,
  ] = await Promise.all([
    supabase.from('vc_companies').select('*', { count: 'exact', head: true }),
    supabase.from('vc_edges').select('*', { count: 'exact', head: true }),
    supabase.from('vc_sources').select('*', { count: 'exact', head: true }),
    supabase.from('vc_articles').select('*', { count: 'exact', head: true }),
    supabase
      .from('vc_companies')
      .select('slug,name,ticker,kicker,lead,segments,updated_at,created_at, vc_analyst_ratings(id), vc_edges!company_id(direction,counterparty_id,confidence,metric, vc_edge_sources(stance,metric, vc_sources(kind,published_at,lang)))'),
    supabase.from('vc_crawl_log').select('ts,path,bot,category,referer,country').neq('category', 'attack').order('ts', { ascending: false }).limit(3000),
    supabase.from('vc_companies').select('created_at').gte('created_at', windowStartKey).limit(100000),
    supabase.from('vc_edges').select('created_at').gte('created_at', windowStartKey).limit(100000),
    supabase.from('vc_sources').select('created_at').gte('created_at', windowStartKey).limit(100000),
    supabase.from('vc_articles').select('published_at').gte('published_at', windowStartKey).limit(100000),
    supabase.from('vc_articles').select('slug,title,published_at,updated_at,changelog').order('updated_at', { ascending: false, nullsFirst: false }).limit(100),
  ])

  // ── 성숙도 집계 ──
  type MRow = MNode & { slug: string; name: string; ticker: string | null; updated_at: string | null; created_at: string | null; vc_analyst_ratings?: { id: string }[] | null }
  const mrows = ((maturityRes.data ?? []) as unknown as MRow[]).map((n) => {
    const edges = n.vc_edges || []
    return {
      slug: n.slug, name: n.name, ticker: n.ticker, updated_at: n.updated_at, created_at: n.created_at,
      rev: edges.filter((e) => e.direction === 'revenue').length,  // 매출처
      cost: edges.filter((e) => e.direction === 'cost').length,    // 지급처
      // 노드 페이지 섹션 유무와 동일: 증권사 리포트 = vc_analyst_ratings 존재 / 가치사슬 파급 = 매출처·지급처 counterparty(등록노드) 존재
      hasReport: (n.vc_analyst_ratings?.length ?? 0) > 0,
      hasChainImpact: edges.some((e) => !!e.counterparty_id && (e.direction === 'revenue' || e.direction === 'cost')),
      m: auditNode(n),
    }
  })
  const tierCounts: Record<string, number> = { T0: 0, T1: 0, T2: 0, T3: 0, T4: 0 }
  const failTally = new Map<string, number>()
  let passSum = 0
  for (const r of mrows) {
    tierCounts[r.m.tierShort]++
    passSum += r.m.pass
    for (const f of r.m.fails) failTally.set(f, (failTally.get(f) ?? 0) + 1)
  }
  const checks = mrows[0]?.m.total ?? 13
  const avgPass = mrows.length ? passSum / mrows.length : 0
  const topFails = [...failTally.entries()]
    .map(([check, count]) => ({ check, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)

  // ── 업데이트 추이 ──
  const now = Date.now()
  const dayMs = 86400000
  const dayKey = (d: Date) => d.toISOString().slice(0, 10)
  const last7 = mrows.filter((r) => r.updated_at && now - new Date(r.updated_at).getTime() <= 7 * dayMs).length
  const last30 = mrows.filter((r) => r.updated_at && now - new Date(r.updated_at).getTime() <= 30 * dayMs).length
  const dailyMap = new Map<string, number>()
  for (let i = 13; i >= 0; i--) dailyMap.set(dayKey(new Date(now - i * dayMs)), 0)
  for (const r of mrows) {
    if (!r.updated_at) continue
    const k = r.updated_at.slice(0, 10)
    if (dailyMap.has(k)) dailyMap.set(k, (dailyMap.get(k) ?? 0) + 1)
  }
  const daily = [...dailyMap.entries()].map(([date, count]) => ({ date, count }))
  const recent = [...mrows]
    .filter((r) => r.updated_at)
    .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
    .slice(0, 50)
    .map((r) => ({ slug: r.slug, name: r.name, ticker: r.ticker, rev: r.rev, cost: r.cost, pass: r.m.pass, tier: r.m.tierShort, created_at: r.created_at, updated_at: r.updated_at, hasReport: r.hasReport, hasChainImpact: r.hasChainImpact }))

  // ── 크롤 / AI 의존도 ──
  type CrawlRow = { ts: string; path: string; bot: string | null; category: string | null; referer: string | null; country: string | null }
  const crawl = (crawlRes.data ?? []) as CrawlRow[]
  const aiRows = crawl.filter((x) => x.category === 'ai')
  const since = (days: number) => crawl.filter((x) => now - new Date(x.ts).getTime() <= days * dayMs).length
  const botTally = new Map<string, number>()
  const botDays = new Map<string, Set<string>>() // 봇별 방문한 distinct 날짜 = 재방문(일수)
  for (const x of aiRows) {
    const b = x.bot ?? '?'
    botTally.set(b, (botTally.get(b) ?? 0) + 1)
    if (!botDays.has(b)) botDays.set(b, new Set())
    botDays.get(b)!.add(x.ts.slice(0, 10))
  }
  const topBots = [...botTally.entries()]
    .map(([bot, count]) => ({ bot, count, days: botDays.get(bot)?.size ?? 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
  const FACET_RE = /^\/([a-z0-9-]+)\/(customers|suppliers|ripple|consensus)(\.md)?$/
  const resOf = (p: string) => {
    const q = p.replace(/\.(md|json)$/, '') || '/'
    const fm = q.match(/^\/([a-z0-9-]+)\/(customers|suppliers|ripple|consensus)$/)
    return fm ? `/${fm[1]}` : q
  }
  const resMap = new Map<string, { count: number; bots: Set<string> }>()
  for (const x of aiRows) {
    const res = resOf(x.path)
    const e = resMap.get(res) ?? { count: 0, bots: new Set<string>() }
    e.count++; e.bots.add(x.bot ?? '?'); resMap.set(res, e)
  }
  const topResources = [...resMap.entries()]
    .map(([resource, e]) => ({ resource, count: e.count, bots: e.bots.size }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)

  // ── AI 인용 퍼널 (wiki lib/queries.ts getCrawlStats와 동일 분류 — 원본이 바뀌면 여기도 맞출 것) ──
  const tierOf = (bot: string | null): 'train' | 'index' | 'cite' | null => {
    const b = (bot ?? '').toLowerCase()
    if (/chatgpt-user|claude-user|perplexity-user|externalfetcher|mistralai-user/.test(b)) return 'cite'
    if (/searchbot|duckassist|perplexitybot|youbot|petalbot/.test(b)) return 'index'
    if (/gptbot|claudebot|anthropic|ccbot|bytespider|google-extended|meta-external|applebot-extended|cohere|diffbot|omgili|timpibot|amazonbot/.test(b)) return 'train'
    return null
  }
  type TierAgg = { total: number; last7d: number; last: string; bots: Map<string, number>; series: number[] }
  const mkTier = (): TierAgg => ({ total: 0, last7d: 0, last: '', bots: new Map(), series: Array(7).fill(0) })
  const tierAgg = { train: mkTier(), index: mkTier(), cite: mkTier(), visit: mkTier() }
  // 최근 7일 일별 버킷 (오래된→최신)
  const day7 = Array.from({ length: 7 }, (_, i) => dayKey(new Date(now - (6 - i) * dayMs)))
  const day7Idx = new Map(day7.map((k, i) => [k, i]))
  const citedFetches: { ts: string; path: string; bot: string | null }[] = []
  // 경로(resource)별 퍼널 수치 — 노드(/slug)·아티클(/analysis/slug) 행에 붙임
  type PathFunnel = { train: number; index: number; cite: number; visit: number }
  const pathFunnel = new Map<string, PathFunnel>()
  for (const x of crawl) {
    // referral = 인용 링크로 들어온 실제 사람 방문(④). 그 외는 봇 UA로 학습/인덱싱/인용 분류.
    const tier: 'train' | 'index' | 'cite' | 'visit' | null = x.category === 'referral' ? 'visit' : tierOf(x.bot)
    if (!tier) continue
    const e = tierAgg[tier]
    e.total++
    if (now - new Date(x.ts).getTime() <= 7 * dayMs) e.last7d++
    if (x.ts > e.last) e.last = x.ts
    e.bots.set(x.bot ?? '?', (e.bots.get(x.bot ?? '?') ?? 0) + 1)
    const di = day7Idx.get(x.ts.slice(0, 10))
    if (di !== undefined) e.series[di]++
    const res = resOf(x.path)
    let pfe = pathFunnel.get(res)
    if (!pfe) { pfe = { train: 0, index: 0, cite: 0, visit: 0 }; pathFunnel.set(res, pfe) }
    pfe[tier]++
    if (tier === 'cite' && citedFetches.length < 12) citedFetches.push({ ts: x.ts, path: x.path, bot: x.bot })
  }
  const pf = (res: string): PathFunnel => pathFunnel.get(res) ?? { train: 0, index: 0, cite: 0, visit: 0 }
  const packTier = (e: TierAgg): FunnelTier => ({
    total: e.total, last7d: e.last7d, last: e.last || null,
    bots: [...e.bots.entries()].map(([bot, count]) => ({ bot, count })).sort((a, b) => b.count - a.count),
    series7d: e.series,
  })
  const funnel = { train: packTier(tierAgg.train), index: packTier(tierAgg.index), cite: packTier(tierAgg.cite), visit: packTier(tierAgg.visit) }

  // ── 질문 역설계: 트래픽을 질문 유형 × 방향 × 엔티티 묶음으로 해석 ──
  // (a) 질문 유형 = 패싯 fetch
  const facetCnt = new Map<string, { total: number; nodes: Map<string, number> }>()
  for (const f of ['customers', 'suppliers', 'ripple', 'consensus']) facetCnt.set(f, { total: 0, nodes: new Map() })
  for (const x of crawl) {
    const fm = x.path.split('?')[0].match(FACET_RE)
    if (!fm || x.category !== 'ai') continue
    const e = facetCnt.get(fm[2])!
    e.total++; e.nodes.set(fm[1], (e.nodes.get(fm[1]) ?? 0) + 1)
  }
  const questionTypes = [...facetCnt.entries()].map(([facet, e]) => ({
    facet, total: e.total,
    top: [...e.nodes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
  }))
  // (b) 질문 방향 = 사람의 패널 확장 (panel_nav)
  const pn = crawl.filter((x) => x.category === 'panel_nav')
  const panelSignal = {
    revenue: pn.filter((x) => x.bot === 'panel-revenue').length,
    cost: pn.filter((x) => x.bot === 'panel-cost').length,
    recent: pn.slice(0, 6).map((x) => ({ from: (x.referer ?? '?').replace(/^\//, ''), to: x.path.replace(/^\//, ''), side: (x.bot === 'panel-revenue' ? 'in' : 'out') as 'in' | 'out' })),
  }
  // (c) 질문의 엔티티 묶음 = co-fetch 세션 (봇+국가, 10분 간격, 그래프 연결 쌍이면 관계형)
  const [eg1, eg2, eg3, compRows] = await Promise.all([
    supabase.from('vc_edges').select('company_id,counterparty_id').not('counterparty_id', 'is', null).range(0, 999),
    supabase.from('vc_edges').select('company_id,counterparty_id').not('counterparty_id', 'is', null).range(1000, 1999),
    supabase.from('vc_edges').select('company_id,counterparty_id').not('counterparty_id', 'is', null).range(2000, 2999),
    supabase.from('vc_companies').select('id,slug').range(0, 999),
  ])
  const slugById = new Map(((compRows.data ?? []) as { id: string; slug: string }[]).map((c) => [c.id, c.slug]))
  const linkedPairs = new Set<string>()
  for (const e of [...(eg1.data ?? []), ...(eg2.data ?? []), ...(eg3.data ?? [])] as { company_id: string; counterparty_id: string }[]) {
    linkedPairs.add(`${slugById.get(e.company_id)}|${slugById.get(e.counterparty_id)}`)
  }
  const isLinkedSlug = (a: string, b: string) => linkedPairs.has(`${a}|${b}`) || linkedPairs.has(`${b}|${a}`)
  const RESERVED_RES = new Set(['sources', 'roadmap', 'crawls', 'schema', 'analysis', 'llms.txt'])
  const nodeSlugOf = (p: string) => {
    const m = resOf(p.split('?')[0]).match(/^\/([a-z0-9-]+)$/)
    return m && !RESERVED_RES.has(m[1]) ? m[1] : null
  }
  const byKeySes = new Map<string, { ts: string; slug: string; bot: string }[]>()
  for (let i = crawl.length - 1; i >= 0; i--) { // 시간 오름차순
    const x = crawl[i]
    if (x.category !== 'ai' && tierOf(x.bot) !== 'cite') continue
    const slug = nodeSlugOf(x.path); if (!slug) continue
    const key = `${x.bot ?? '?'}|${x.country ?? ''}`
    if (!byKeySes.has(key)) byKeySes.set(key, [])
    byKeySes.get(key)!.push({ ts: x.ts, slug, bot: x.bot ?? '?' })
  }
  type Ses = { bot: string; start: string; seq: string[] }
  const sesAll: Ses[] = []
  for (const list of byKeySes.values()) {
    let cur: Ses | null = null; let lastTs = ''
    for (const x of list) {
      if (!cur || new Date(x.ts).getTime() - new Date(lastTs).getTime() > 10 * 60e3) { cur = { bot: x.bot, start: x.ts, seq: [] }; sesAll.push(cur) }
      lastTs = x.ts
      if (cur.seq[cur.seq.length - 1] !== x.slug) cur.seq.push(x.slug)
    }
  }
  const clsOf = (seq: string[]): 'relation' | 'theme' => {
    const nodes = [...new Set(seq)]
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) if (isLinkedSlug(nodes[i], nodes[j])) return 'relation'
    return 'theme'
  }
  const multiSes = sesAll.filter((x) => new Set(x.seq).size >= 2)
  const cofetch = {
    total: sesAll.length,
    multi: multiSes.length,
    relation: multiSes.filter((x) => clsOf(x.seq) === 'relation').length,
    recent: [...multiSes].sort((a, b) => b.start.localeCompare(a.start)).slice(0, 5)
      .map((x) => ({ start: x.start, bot: x.bot, cls: clsOf(x.seq), seq: x.seq.slice(0, 6) })),
  }

  // ── 분석 아티클 업데이트 현황 (vc_articles) ──
  const articleUpdates = ((articlesFull.data ?? []) as Array<{ slug: string; title: string; published_at: string | null; updated_at: string | null; changelog: unknown }>).map((a) => ({
    slug: a.slug,
    title: a.title,
    publishedAt: a.published_at,
    updatedAt: a.updated_at,
    changelogCount: Array.isArray(a.changelog) ? a.changelog.length : 0,
    funnel: pf(`/analysis/${a.slug}`),
  }))

  // ── 메트릭별 추이 (14일 누적 스파크라인 + 오늘/7일 신규) ──
  const buildTrend = (
    rows: Array<{ created_at?: string | null; updated_at?: string | null; published_at?: string | null }> | null,
    total: number,
    key: 'created_at' | 'updated_at' | 'published_at',
  ): TrendBlock => {
    const days = (rows ?? []).map(r => r[key] ?? '').filter(Boolean).map(s => (s as string).slice(0, 10)).sort()
    const baseline = Math.max(0, total - days.length)
    const series: { date: string; value: number }[] = []
    for (let i = 13; i >= 0; i--) {
      const d = dayKey(new Date(now - i * dayMs))
      series.push({ date: d, value: baseline + days.filter(x => x <= d).length })
    }
    const todayK = dayKey(new Date(now))
    const sevenK = dayKey(new Date(now - 6 * dayMs))
    return { series, today: days.filter(x => x === todayK).length, last7: days.filter(x => x >= sevenK).length }
  }
  const crawlDayMap = new Map<string, number>()
  for (let i = 13; i >= 0; i--) crawlDayMap.set(dayKey(new Date(now - i * dayMs)), 0)
  for (const x of aiRows) { const k = x.ts.slice(0, 10); if (crawlDayMap.has(k)) crawlDayMap.set(k, (crawlDayMap.get(k) ?? 0) + 1) }
  const trends = {
    nodes: buildTrend(nodesRecent.data ?? null, nodesHead.count ?? mrows.length, 'created_at'),
    edges: buildTrend(edgesRecent.data ?? null, edgesHead.count ?? 0, 'created_at'),
    sources: buildTrend(sourcesRecent.data ?? null, sourcesHead.count ?? 0, 'created_at'),
    articles: buildTrend(articlesRecent.data ?? null, articlesHead.count ?? 0, 'published_at'),
    crawl: {
      series: [...crawlDayMap.entries()].map(([date, value]) => ({ date, value })),
      today: aiRows.filter(x => x.ts.slice(0, 10) === dayKey(new Date(now))).length,
      last7: aiRows.filter(x => now - new Date(x.ts).getTime() <= 7 * dayMs).length,
    },
  }

  return {
    trends,
    summary: {
      nodes: nodesHead.count ?? mrows.length,
      edges: edgesHead.count ?? 0,
      sources: sourcesHead.count ?? 0,
      articles: articlesHead.count ?? 0,
    },
    maturity: {
      checks,
      avgPass: Math.round(avgPass * 10) / 10,
      completeness: checks ? Math.round((avgPass / checks) * 1000) / 10 : 0,
      tiers: (['T0', 'T1', 'T2', 'T3', 'T4'] as const).map((tier) => ({ tier, label: TIER_LABEL[tier], count: tierCounts[tier] })),
      topFails,
    },
    updates: {
      last7d: last7,
      last30d: last30,
      daily,
      recent: recent.map((r) => ({ ...r, funnel: pf(`/${r.slug}`) })),
    },
    crawl: {
      total: crawl.length,
      ai: aiRows.length,
      last24h: since(1),
      last7d: since(7),
      lastTs: crawl[0]?.ts ?? null,
      topBots,
      topResources,
      funnel,
      citedFetches,
      questionTypes,
      panelSignal,
      cofetch,
    },
    articleUpdates,
  }
}
