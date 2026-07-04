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
    recent: { slug: string; name: string; ticker: string | null; rev: number; cost: number; pass: number; tier: string; updated_at: string | null }[]
  }
  crawl: {
    total: number
    ai: number
    last24h: number
    last7d: number
    lastTs: string | null
    topBots: { bot: string; count: number; days: number }[]
    topResources: { resource: string; count: number; bots: number }[]
    // AI 인용 퍼널: 학습 수집 → 답변 인덱싱 → 사용자 질문 인용 (wiki /crawls와 동일 분류)
    funnel: {
      train: FunnelTier
      index: FunnelTier
      cite: FunnelTier
    }
    citedFetches: { ts: string; path: string; bot: string | null }[] // ③ 실사용자 질문이 가져간 페이지
  }
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
  ] = await Promise.all([
    supabase.from('vc_companies').select('*', { count: 'exact', head: true }),
    supabase.from('vc_edges').select('*', { count: 'exact', head: true }),
    supabase.from('vc_sources').select('*', { count: 'exact', head: true }),
    supabase.from('vc_articles').select('*', { count: 'exact', head: true }),
    supabase
      .from('vc_companies')
      .select('slug,name,ticker,kicker,lead,segments,updated_at, vc_edges!company_id(direction,counterparty_id,confidence,metric, vc_edge_sources(stance,metric, vc_sources(kind,published_at,lang)))'),
    supabase.from('vc_crawl_log').select('ts,path,bot,category').neq('category', 'attack').order('ts', { ascending: false }).limit(3000),
    supabase.from('vc_companies').select('created_at').gte('created_at', windowStartKey).limit(100000),
    supabase.from('vc_edges').select('created_at').gte('created_at', windowStartKey).limit(100000),
    supabase.from('vc_sources').select('created_at').gte('created_at', windowStartKey).limit(100000),
    supabase.from('vc_articles').select('updated_at').gte('updated_at', windowStartKey).limit(100000),
  ])

  // ── 성숙도 집계 ──
  type MRow = MNode & { slug: string; name: string; ticker: string | null; updated_at: string | null }
  const mrows = ((maturityRes.data ?? []) as unknown as MRow[]).map((n) => {
    const edges = n.vc_edges || []
    return {
      slug: n.slug, name: n.name, ticker: n.ticker, updated_at: n.updated_at,
      rev: edges.filter((e) => e.direction === 'revenue').length,  // 매출처
      cost: edges.filter((e) => e.direction === 'cost').length,    // 지급처
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
    .map((r) => ({ slug: r.slug, name: r.name, ticker: r.ticker, rev: r.rev, cost: r.cost, pass: r.m.pass, tier: r.m.tierShort, updated_at: r.updated_at }))

  // ── 크롤 / AI 의존도 ──
  type CrawlRow = { ts: string; path: string; bot: string | null; category: string | null }
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
  const resOf = (p: string) => p.replace(/\.(md|json)$/, '') || '/'
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
  type TierAgg = { total: number; last7d: number; last: string; bots: Map<string, number> }
  const mkTier = (): TierAgg => ({ total: 0, last7d: 0, last: '', bots: new Map() })
  const tierAgg = { train: mkTier(), index: mkTier(), cite: mkTier() }
  const citedFetches: { ts: string; path: string; bot: string | null }[] = []
  for (const x of crawl) {
    const tier = tierOf(x.bot)
    if (!tier) continue
    const e = tierAgg[tier]
    e.total++
    if (now - new Date(x.ts).getTime() <= 7 * dayMs) e.last7d++
    if (x.ts > e.last) e.last = x.ts
    e.bots.set(x.bot ?? '?', (e.bots.get(x.bot ?? '?') ?? 0) + 1)
    if (tier === 'cite' && citedFetches.length < 12) citedFetches.push({ ts: x.ts, path: x.path, bot: x.bot })
  }
  const packTier = (e: TierAgg): FunnelTier => ({
    total: e.total, last7d: e.last7d, last: e.last || null,
    bots: [...e.bots.entries()].map(([bot, count]) => ({ bot, count })).sort((a, b) => b.count - a.count),
  })
  const funnel = { train: packTier(tierAgg.train), index: packTier(tierAgg.index), cite: packTier(tierAgg.cite) }

  // ── 메트릭별 추이 (14일 누적 스파크라인 + 오늘/7일 신규) ──
  const buildTrend = (
    rows: Array<{ created_at?: string | null; updated_at?: string | null }> | null,
    total: number,
    key: 'created_at' | 'updated_at',
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
    articles: buildTrend(articlesRecent.data ?? null, articlesHead.count ?? 0, 'updated_at'),
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
      recent,
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
    },
  }
}
