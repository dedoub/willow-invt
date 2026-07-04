'use client'

import { useState, useEffect, useCallback } from 'react'
import { t, tonePalettes, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { ValueChainSkeleton } from '@/app/(dashboard)/_components/linear-skeleton'
import { useAgentRefresh } from '@/hooks/use-agent-refresh'
import type { ValueChainStats } from '@/lib/valuechain-supabase'

const SITE_URL = 'https://valuechain.wiki'

const TIER_TONE: Record<string, { bg: string; fg: string }> = {
  T0: tonePalettes.neutral,
  T1: tonePalettes.pending,
  T2: tonePalettes.info,
  T3: tonePalettes.brand,
  T4: tonePalettes.pos,
}

// ─── 작은 프리미티브 ─────────────────────────────────────────────────────────────

// ─── 페이지 ─────────────────────────────────────────────────────────────────────

export default function ValueChainPage() {
  const mobile = useIsMobile()
  const [stats, setStats] = useState<ValueChainStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updateSort, setUpdateSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' })
  const [crawlSort, setCrawlSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'count', dir: 'desc' })
  const [updatePage, setUpdatePage] = useState(1)
  const [crawlPage, setCrawlPage] = useState(1)

  const load = useCallback(async (refresh = false) => {
    if (!refresh) setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/valuechain/stats')
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to fetch')
      setStats(data.stats)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useAgentRefresh(['valuechain_', 'vc_'], () => load(true))

  if (loading) {
    return <ValueChainSkeleton />
  }
  if (error || !stats) {
    return (
      <LCard>
        <div style={{ color: t.accent.neg, fontSize: 'calc(13px * var(--fz, 1))' }}>통계를 불러오지 못했습니다: {error}</div>
        <button onClick={() => load(true)} style={refreshBtnStyle()}>다시 시도</button>
      </LCard>
    )
  }

  const { summary, maturity, updates, crawl, trends } = stats

  const sectionLabel: React.CSSProperties = {
    fontSize: 'calc(11px * var(--fz, 1))', fontWeight: 600, color: t.neutrals.subtle,
    fontFamily: t.font.mono, letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 10,
    whiteSpace: 'nowrap',
  }
  const iconBtn: React.CSSProperties = {
    width: 28, height: 28, borderRadius: t.radius.sm, background: t.neutrals.inner,
    border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: t.neutrals.muted, textDecoration: 'none',
  }
  // 업데이트 테이블: 날짜 | 노드 | 티커 | 매출처 | 지급처 | 티어 | 완성도
  const UPDATE_COLS = '46px minmax(80px,1fr) 72px 44px 44px 32px 46px'
  const UPDATE_MIN_WIDTH = 440
  // AI 크롤 테이블: 봇 | 횟수 | 재방문 | 비중
  const CRAWL_COLS = 'minmax(0,1fr) 56px 56px 44px'
  const headCell: React.CSSProperties = {
    fontSize: 'calc(9px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.subtle,
    letterSpacing: 0.3, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden',
  }
  const PER = 8 // 테이블 페이지당 행 수

  // ── 클릭 정렬 헤더 ──
  const numDescKeys = new Set(['date', 'rev', 'cost', 'pass', 'count', 'pct', 'days'])
  const defaultDir = (key: string): 'asc' | 'desc' => (numDescKeys.has(key) ? 'desc' : 'asc')
  const onUpdateSort = (key: string) => { setUpdatePage(1); setUpdateSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: defaultDir(key) }) }
  const onCrawlSort = (key: string) => { setCrawlPage(1); setCrawlSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: defaultDir(key) }) }
  const sortHead = (colKey: string, label: string, align: 'left' | 'center' | 'right', sortState: { key: string; dir: 'asc' | 'desc' }, onSort: (k: string) => void) => {
    const active = sortState.key === colKey
    return (
      <button onClick={() => onSort(colKey)} style={{
        ...headCell, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
        display: 'flex', alignItems: 'center', gap: 2, width: '100%',
        justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
        color: active ? t.neutrals.text : t.neutrals.subtle,
      }}>
        {label}
        <span style={{ fontSize: '0.85em', lineHeight: 1, opacity: active ? 1 : 0 }}>{sortState.dir === 'asc' ? '▲' : '▼'}</span>
      </button>
    )
  }

  // ── 정렬된 행 ──
  const updateDir = updateSort.dir === 'asc' ? 1 : -1
  const updateSorted = [...updates.recent].sort((a, b) => {
    let r = 0
    switch (updateSort.key) {
      case 'name': r = a.name.localeCompare(b.name, 'ko'); break
      case 'ticker': r = (a.ticker || '').localeCompare(b.ticker || ''); break
      case 'rev': r = a.rev - b.rev; break
      case 'cost': r = a.cost - b.cost; break
      case 'tier': r = a.tier.localeCompare(b.tier); break
      case 'pass': r = a.pass - b.pass; break
      case 'date':
      default: r = (a.updated_at || '').localeCompare(b.updated_at || '')
    }
    return r !== 0 ? r * updateDir : (b.updated_at || '').localeCompare(a.updated_at || '')
  })
  const crawlDir = crawlSort.dir === 'asc' ? 1 : -1
  const crawlSorted = [...crawl.topBots].sort((a, b) => {
    let r = 0
    switch (crawlSort.key) {
      case 'bot': r = a.bot.localeCompare(b.bot); break
      case 'days': r = a.days - b.days; break
      default: r = a.count - b.count // count, pct
    }
    return r !== 0 ? r * crawlDir : b.count - a.count
  })

  // ── 페이지네이션 ──
  const updatePages = Math.max(1, Math.ceil(updateSorted.length / PER))
  const updSafe = Math.min(updatePage, updatePages)
  const updateRows = updateSorted.slice((updSafe - 1) * PER, updSafe * PER)
  const crawlPages = Math.max(1, Math.ceil(crawlSorted.length / PER))
  const crwSafe = Math.min(crawlPage, crawlPages)
  const crawlRows = crawlSorted.slice((crwSafe - 1) * PER, crwSafe * PER)
  const chevBtn = (disabled: boolean): React.CSSProperties => ({
    background: 'transparent', border: 'none', cursor: disabled ? 'default' : 'pointer',
    padding: 4, borderRadius: 4, color: disabled ? t.neutrals.line : t.neutrals.muted, opacity: disabled ? 0.4 : 1,
  })
  const pager = (page: number, setPage: (f: (p: number) => number) => void, total: number, totalPages: number, safe: number) => (
    totalPages > 1 ? (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, padding: '8px 8px 0' }}>
        <button disabled={safe === 1} onClick={() => setPage(p => Math.max(1, p - 1))} style={chevBtn(safe === 1)}><LIcon name="chevronLeft" size={13} stroke={2} /></button>
        <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted, whiteSpace: 'nowrap' }}>{(safe - 1) * PER + 1}-{Math.min(safe * PER, total)} / {total}</span>
        <button disabled={safe >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} style={chevBtn(safe >= totalPages)}><LIcon name="chevronRight" size={13} stroke={2} /></button>
      </div>
    ) : null
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: 14, alignItems: 'start' }}>
      <LCard pad={0}>
        {/* 헤더 + 현황 */}
        <div style={{ padding: t.density.cardPad, paddingBottom: 12 }}>
          <LSectionHead
            eyebrow="VALUECHAIN"
            title="밸류체인"
            action={
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <a href={SITE_URL} target="_blank" rel="noreferrer" style={iconBtn}>
                  <LIcon name="trending" size={13} stroke={1.8} />
                </a>
                <button onClick={() => load(true)} style={iconBtn}>
                  <LIcon name="refresh" size={13} stroke={1.8} />
                </button>
              </div>
            }
          />

          {/* 인사이트 KPI */}
          <div style={sectionLabel}>인사이트</div>
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 8 }}>
            <LStat label="노드" value={summary.nodes.toLocaleString()} sub={`오늘 ${trends.nodes.today.toLocaleString()}개 · 7일 ${trends.nodes.last7.toLocaleString()}개`} sparkline={mobile ? undefined : trends.nodes.series} />
            <LStat label="관계" value={summary.edges.toLocaleString()} sub={`오늘 ${trends.edges.today.toLocaleString()}개 · 7일 ${trends.edges.last7.toLocaleString()}개`} sparkline={mobile ? undefined : trends.edges.series} />
            <LStat label="출처" value={summary.sources.toLocaleString()} sub={`오늘 ${trends.sources.today.toLocaleString()}개 · 7일 ${trends.sources.last7.toLocaleString()}개`} sparkline={mobile ? undefined : trends.sources.series} />
            <LStat label="아티클" value={summary.articles.toLocaleString()} sub={`오늘 ${trends.articles.today.toLocaleString()}개 · 7일 ${trends.articles.last7.toLocaleString()}개`} sparkline={mobile ? undefined : trends.articles.series} />
            <LStat label="완성도" value={`${maturity.completeness}%`} sub={`평균 ${maturity.avgPass}/${maturity.checks} 체크`} />
            <LStat label="AI 크롤" value={crawl.ai.toLocaleString()} sub={`오늘 ${trends.crawl.today.toLocaleString()}회 · 7일 ${trends.crawl.last7.toLocaleString()}회`} sparkline={mobile ? undefined : trends.crawl.series} />
          </div>
        </div>

        {/* 업데이트 */}
        <div style={{ padding: `12px ${t.density.cardPad}px 12px` }}>
          <div style={sectionLabel}>업데이트</div>
          {/* 최근 업데이트 내역 — 테이블 (날짜·노드·티커·매출처·지급처·티어·완성도) */}
          <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: UPDATE_MIN_WIDTH, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* 테이블 헤더 — 클릭 정렬 */}
            <div style={{ display: 'grid', gridTemplateColumns: UPDATE_COLS, gap: 8, alignItems: 'center', padding: '0 8px 5px' }}>
              {sortHead('date', '날짜', 'left', updateSort, onUpdateSort)}
              {sortHead('name', '노드', 'left', updateSort, onUpdateSort)}
              {sortHead('ticker', '티커', 'left', updateSort, onUpdateSort)}
              {sortHead('rev', '매출처', 'center', updateSort, onUpdateSort)}
              {sortHead('cost', '지급처', 'center', updateSort, onUpdateSort)}
              {sortHead('tier', '티어', 'center', updateSort, onUpdateSort)}
              {sortHead('pass', '완성도', 'center', updateSort, onUpdateSort)}
            </div>
            {updateRows.map(n => (
              <a key={n.slug} href={`${SITE_URL}/${n.slug}`} target="_blank" rel="noreferrer"
                style={{ display: 'grid', gridTemplateColumns: UPDATE_COLS, gap: 8, alignItems: 'center', padding: '6px 8px', borderRadius: t.radius.sm, background: t.neutrals.inner, textDecoration: 'none' }}>
                <span style={{ fontSize: 'calc(11px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.subtle, whiteSpace: 'nowrap' }}>{(n.updated_at ?? '').slice(5, 10)}</span>
                <span style={{ fontSize: 'calc(12.5px * var(--fz, 1))', color: t.neutrals.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{n.name}</span>
                <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: n.ticker ? t.neutrals.muted : t.neutrals.line, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.ticker || '—'}</span>
                <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted, textAlign: 'center', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{n.rev}</span>
                <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted, textAlign: 'center', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{n.cost}</span>
                <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: TIER_TONE[n.tier].fg, fontWeight: t.weight.semibold, textAlign: 'center', whiteSpace: 'nowrap' }}>{n.tier}</span>
                <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted, textAlign: 'center', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{n.pass}/{maturity.checks}</span>
              </a>
            ))}
            {updates.recent.length === 0 && <span style={{ fontSize: 'calc(12px * var(--fz, 1))', color: t.neutrals.subtle, paddingTop: 7 }}>업데이트 내역 없음</span>}
          </div>
          </div>
          {pager(updatePage, setUpdatePage, updateSorted.length, updatePages, updSafe)}
        </div>

        {/* AI 인용 퍼널 — 학습 수집 → 답변 인덱싱 → 사용자 질문 인용 (wiki /crawls와 동일 분류) */}
        <div style={{ padding: `12px ${t.density.cardPad}px 12px` }}>
          <div style={sectionLabel}>AI 인용 퍼널</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {([['① 학습 수집', crawl.funnel.train], ['② 답변 인덱싱', crawl.funnel.index], ['③ 사용자 질문 인용', crawl.funnel.cite]] as const).map(([label, tier]) => (
              <div key={label} style={{ display: 'grid', gridTemplateColumns: mobile ? '112px 52px 52px minmax(0,1fr)' : '128px 64px 64px 52px minmax(0,1fr)', gap: 8, alignItems: 'center', padding: '6px 8px', borderRadius: t.radius.sm, background: t.neutrals.inner }}>
                <span style={{ fontSize: 'calc(11.5px * var(--fz, 1))', color: t.neutrals.text, whiteSpace: 'nowrap' }}>{label}</span>
                <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>7일 {tier.last7d.toLocaleString()}</span>
                <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>총 {tier.total.toLocaleString()}</span>
                {!mobile && <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.subtle, textAlign: 'right', whiteSpace: 'nowrap' }}>{tier.last ? tier.last.slice(5, 10) : '—'}</span>}
                <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.subtle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                  {tier.bots.length ? tier.bots.slice(0, 3).map(b => `${b.bot} ${b.count.toLocaleString()}×`).join(' · ') : '아직 없음'}
                </span>
              </div>
            ))}
          </div>
          {/* ③ 실사용자 질문이 실시간으로 가져간 페이지 — 인용 전환의 직접 증거 */}
          {crawl.citedFetches.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {crawl.citedFetches.slice(0, 6).map((x, i) => (
                <a key={i} href={`${SITE_URL}${x.path}`} target="_blank" rel="noreferrer"
                  style={{ display: 'grid', gridTemplateColumns: mobile ? '78px minmax(0,1fr)' : '78px 110px minmax(0,1fr)', gap: 8, alignItems: 'center', padding: '5px 8px', borderRadius: t.radius.sm, background: t.neutrals.inner, textDecoration: 'none' }}>
                  <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.subtle, whiteSpace: 'nowrap' }}>{x.ts.slice(5, 16).replace('T', ' ')}</span>
                  {!mobile && <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.bot ?? '?'}</span>}
                  <span style={{ fontSize: 'calc(11px * var(--fz, 1))', color: t.neutrals.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{x.path}</span>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* AI 크롤 의존도 — 봇별 테이블 (봇·횟수·재방문·비중) */}
        <div style={{ padding: `12px ${t.density.cardPad}px 12px` }}>
          <div style={sectionLabel}>AI 크롤 의존도</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* 테이블 헤더 — 클릭 정렬 */}
            <div style={{ display: 'grid', gridTemplateColumns: CRAWL_COLS, gap: 8, alignItems: 'center', padding: '0 8px 5px' }}>
              {sortHead('bot', '봇', 'left', crawlSort, onCrawlSort)}
              {sortHead('count', '횟수', 'right', crawlSort, onCrawlSort)}
              {sortHead('days', '재방문', 'right', crawlSort, onCrawlSort)}
              {sortHead('pct', '비중', 'right', crawlSort, onCrawlSort)}
            </div>
            {crawlRows.map(b => {
              const pct = crawl.ai > 0 ? Math.round((b.count / crawl.ai) * 100) : 0
              return (
                <div key={b.bot} style={{ display: 'grid', gridTemplateColumns: CRAWL_COLS, gap: 8, alignItems: 'center', padding: '6px 8px', borderRadius: t.radius.sm, background: t.neutrals.inner }}>
                  <span style={{ fontSize: 'calc(11.5px * var(--fz, 1))', color: t.neutrals.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{b.bot}</span>
                  <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{b.count.toLocaleString()}</span>
                  <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{b.days.toLocaleString()}</span>
                  <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{pct}%</span>
                </div>
              )
            })}
            {crawl.topBots.length === 0 && <span style={{ fontSize: 'calc(12px * var(--fz, 1))', color: t.neutrals.subtle }}>AI 크롤 기록 없음</span>}
          </div>
          {pager(crawlPage, setCrawlPage, crawlSorted.length, crawlPages, crwSafe)}
        </div>
      </LCard>
    </div>
  )
}

// ─── helpers ─────────────────────────────────────────────────────────────────────

function refreshBtnStyle(active = false): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    background: t.neutrals.inner, color: t.neutrals.muted,
    border: 'none', borderRadius: t.radius.md, padding: '5px 10px',
    fontSize: 'calc(12px * var(--fz, 1))', fontWeight: t.weight.medium,
    cursor: active ? 'default' : 'pointer', fontFamily: t.font.sans,
    opacity: active ? 0.6 : 1, marginTop: 8,
  }
}
