'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'
import { t, tonePalettes, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { ValueChainSkeleton } from '@/app/(dashboard)/_components/linear-skeleton'
import { useAgentRefresh } from '@/hooks/use-agent-refresh'
import { useDashCols } from '@/app/(dashboard)/(linear)/monor/_components/cols-toggle'
import type { ValueChainStats } from '@/lib/valuechain-supabase'

const SITE_URL = 'https://valuechain.wiki'

const TIER_TONE: Record<string, { bg: string; fg: string }> = {
  T0: tonePalettes.neutral,
  T1: tonePalettes.pending,
  T2: tonePalettes.info,
  T3: tonePalettes.brand,
  T4: tonePalettes.pos,
}

// 질문형 패싯 → 사용자 질문 해석 (valuechain-wiki docs/traffic-capture.md)
const FACET_META: Record<string, { q: string }> = {
  customers: { q: '고객이 누구인가' },
  suppliers: { q: '공급사가 누구인가' },
  ripple: { q: '파급이 어디로 번지나' },
  consensus: { q: '시장 컨센서스는 어떤가' },
}

// ─── 작은 프리미티브 ─────────────────────────────────────────────────────────────

// ─── 페이지 ─────────────────────────────────────────────────────────────────────

export default function ValueChainPage() {
  const mobile = useIsMobile()
  const cols = useDashCols()
  const [stats, setStats] = useState<ValueChainStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updateSort, setUpdateSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' })
  const [articleSort, setArticleSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'updated', dir: 'desc' })
  const [updatePage, setUpdatePage] = useState(1)
  const [updatePerPage, setUpdatePerPage] = useState(8)
  const [updatePerPageInput, setUpdatePerPageInput] = useState('8')
  const [articlePage, setArticlePage] = useState(1)
  const [articlePerPage, setArticlePerPage] = useState(8)
  const [articlePerPageInput, setArticlePerPageInput] = useState('8')

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

  const { summary, maturity, updates, crawl, trends, articleUpdates } = stats

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
  // 업데이트 테이블 — 위키 /roadmap 노드 현황과 동일 항목:
  // 최초 | 수정 | 노드 | 신뢰도 | 증명·파급 | 사업구조 | 매출 | 비용 | 투자 | 리서치 | 파급 | 출처 | 교차검증 | 인용퍼널 4
  const UPDATE_COLS = '44px 44px minmax(76px,1fr) 60px 74px 40px 34px 34px 34px 40px 34px 34px 44px 40px 40px 40px 40px'
  const UPDATE_MIN_WIDTH = 880
  const headCell: React.CSSProperties = {
    fontSize: 'calc(9px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.subtle,
    letterSpacing: 0.3, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden',
  }
  // 질문 역설계 블록 공통 스타일
  const qBox: React.CSSProperties = { padding: '8px 10px', borderRadius: t.radius.sm, background: t.neutrals.inner, minWidth: 0 }
  const qTitle: React.CSSProperties = { fontSize: 'calc(11.5px * var(--fz, 1))', fontWeight: 600, color: t.neutrals.text, marginBottom: 6 }
  const qTitleSub: React.CSSProperties = { fontWeight: 400, color: t.neutrals.subtle, fontSize: 'calc(10px * var(--fz, 1))' }
  const qEmpty: React.CSSProperties = { fontSize: 'calc(10.5px * var(--fz, 1))', color: t.neutrals.subtle, marginTop: 5, lineHeight: 1.5 }
  const ellip: React.CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }

  // ── 클릭 정렬 헤더 ──
  const numDescKeys = new Set(['date', 'created', 'tier', 'axis', 'seg', 'rev', 'cost', 'inv', 'research', 'linked', 'src', 'verified', 'f_train', 'f_index', 'f_cite', 'f_visit', 'changelog', 'published', 'updated'])
  const defaultDir = (key: string): 'asc' | 'desc' => (numDescKeys.has(key) ? 'desc' : 'asc')
  const onUpdateSort = (key: string) => { setUpdatePage(1); setUpdateSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: defaultDir(key) }) }
  const commitUpdatePerPage = () => {
    const n = Math.max(5, Math.min(100, Number(updatePerPageInput) || 8))
    setUpdatePerPageInput(String(n)); setUpdatePerPage(n); setUpdatePage(1)
  }
  const commitArticlePerPage = () => {
    const n = Math.max(5, Math.min(100, Number(articlePerPageInput) || 8))
    setArticlePerPageInput(String(n)); setArticlePerPage(n); setArticlePage(1)
  }
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
      case 'tier': r = a.pass - b.pass; break
      case 'axis': r = (a.proof + a.prop) - (b.proof + b.prop); break
      case 'seg': r = a.seg - b.seg; break
      case 'rev': r = a.rev - b.rev; break
      case 'cost': r = a.cost - b.cost; break
      case 'inv': r = a.inv - b.inv; break
      case 'research': r = a.research - b.research; break
      case 'linked': r = a.linked - b.linked; break
      case 'src': r = a.src - b.src; break
      case 'verified': r = a.verified - b.verified; break
      case 'created': r = (a.created_at || '').localeCompare(b.created_at || ''); break
      case 'f_train': r = a.funnel.train - b.funnel.train; break
      case 'f_index': r = a.funnel.index - b.funnel.index; break
      case 'f_cite': r = a.funnel.cite - b.funnel.cite; break
      case 'f_visit': r = a.funnel.visit - b.funnel.visit; break
      case 'date':
      default: r = (a.updated_at || '').localeCompare(b.updated_at || '')
    }
    return r !== 0 ? r * updateDir : (b.updated_at || '').localeCompare(a.updated_at || '')
  })
  // 인용퍼널 공통 컬럼 정의 (학습·인덱싱·인용·방문) — 두 테이블 헤더/셀 공용
  const FUNNEL_HEADS = [
    { key: 'f_train', label: '학습', color: t.neutrals.muted, get: (f: { train: number; index: number; cite: number; visit: number }) => f.train },
    { key: 'f_index', label: '인덱싱', color: t.neutrals.muted, get: (f: { train: number; index: number; cite: number; visit: number }) => f.index },
    { key: 'f_cite', label: '인용', color: t.brand[500], get: (f: { train: number; index: number; cite: number; visit: number }) => f.cite },
    { key: 'f_visit', label: '방문', color: '#10b981', get: (f: { train: number; index: number; cite: number; visit: number }) => f.visit },
  ] as const
  // ── 페이지네이션 ──
  const updatePages = Math.max(1, Math.ceil(updateSorted.length / updatePerPage))
  const updSafe = Math.min(updatePage, updatePages)
  const updateRows = updateSorted.slice((updSafe - 1) * updatePerPage, updSafe * updatePerPage)
  const onArticleSort = (key: string) => { setArticlePage(1); setArticleSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: defaultDir(key) }) }
  const articleDir = articleSort.dir === 'asc' ? 1 : -1
  const articleSorted = [...articleUpdates].sort((a, b) => {
    let r = 0
    switch (articleSort.key) {
      case 'title': r = a.title.localeCompare(b.title, 'ko'); break
      case 'published': r = (a.publishedAt || '').localeCompare(b.publishedAt || ''); break
      case 'changelog': r = a.changelogCount - b.changelogCount; break
      case 'f_train': r = a.funnel.train - b.funnel.train; break
      case 'f_index': r = a.funnel.index - b.funnel.index; break
      case 'f_cite': r = a.funnel.cite - b.funnel.cite; break
      case 'f_visit': r = a.funnel.visit - b.funnel.visit; break
      case 'updated':
      default: r = (a.updatedAt || '').localeCompare(b.updatedAt || '')
    }
    return r !== 0 ? r * articleDir : (b.updatedAt || '').localeCompare(a.updatedAt || '')
  })
  const articlePages = Math.max(1, Math.ceil(articleSorted.length / articlePerPage))
  const artSafe = Math.min(articlePage, articlePages)
  const articleRows = articleSorted.slice((artSafe - 1) * articlePerPage, artSafe * articlePerPage)
  const chevBtn = (disabled: boolean): React.CSSProperties => ({
    background: 'transparent', border: 'none', cursor: disabled ? 'default' : 'pointer',
    padding: 4, borderRadius: 4, color: disabled ? t.neutrals.line : t.neutrals.muted, opacity: disabled ? 0.4 : 1,
  })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : (cols === 1 ? '1fr' : '1fr 1fr'), gap: 14, alignItems: 'start' }}>
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

        {/* AI 인용 퍼널 — 학습 수집 → 답변 인덱싱 → 사용자 질문 인용 (/crawls 요약) */}
        <div style={{ padding: `12px ${t.density.cardPad}px 12px` }}>
          <div style={sectionLabel}>AI 인용 퍼널</div>
          <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 500, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* 헤더행 */}
            <div style={{ display: 'grid', gridTemplateColumns: '120px 44px 44px 48px 66px minmax(0,1fr)', gap: 8, alignItems: 'center', padding: '0 8px 5px' }}>
              <span style={headCell}>단계</span>
              <span style={headCell}>7일</span>
              <span style={headCell}>총</span>
              <span style={headCell}>최근</span>
              <span style={headCell}>7일추이</span>
              <span style={headCell}>상위봇</span>
            </div>
            {([['①', '학습 수집', crawl.funnel.train], ['②', '답변 인덱싱', crawl.funnel.index], ['③', '사용자 질문 인용', crawl.funnel.cite], ['④', '사용자 방문', crawl.funnel.visit]] as const).map(([num, label, tier]) => (
              <div key={label} style={{ display: 'grid', gridTemplateColumns: '120px 44px 44px 48px 66px minmax(0,1fr)', gap: 8, alignItems: 'center', padding: '6px 8px', borderRadius: t.radius.sm, background: t.neutrals.inner }}>
                <span style={{ fontSize: 'calc(11.5px * var(--fz, 1))', color: t.neutrals.text, whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 'calc(9px * var(--fz, 1))', color: t.neutrals.subtle, marginRight: 3 }}>{num}</span>{label}
                </span>
                <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{tier.last7d.toLocaleString()}</span>
                <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{tier.total.toLocaleString()}</span>
                <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.subtle, whiteSpace: 'nowrap' }}>{tier.last ? tier.last.slice(5, 10) : '—'}</span>
                <span style={{ display: 'flex', alignItems: 'center' }} title="최근 7일 일별 추이"><MiniBars data={tier.series7d} /></span>
                <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.subtle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                  {tier.bots.length ? tier.bots.slice(0, 3).map(b => `${b.bot} ${b.count.toLocaleString()}×`).join(' · ') : '아직 없음'}
                </span>
              </div>
            ))}
          </div>
          </div>
        </div>

        {/* 질문 역설계 — fetch 흔적을 사용자 질문으로 되짚는 관측 신호 (valuechain-wiki docs/traffic-capture.md) */}
        <div style={{ padding: `12px ${t.density.cardPad}px 12px` }}>
          <div style={sectionLabel}>질문 역설계</div>
          <div style={{ fontSize: 'calc(11px * var(--fz, 1))', color: t.neutrals.muted, lineHeight: 1.55, marginBottom: 8 }}>
            AI가 답변에 위키를 인용할 때 남는 fetch 흔적으로, 사용자가 기업에 대해 <b style={{ fontWeight: 600 }}>어떤 측면을</b> · <b style={{ fontWeight: 600 }}>어느 방향으로</b> · <b style={{ fontWeight: 600 }}>무엇과 엮어</b> 물었는지 되짚는다. 이 질문 수요 데이터가 위키를 관측소로 만드는 핵심 신호.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

            {/* ① 측면: 질문형 패싯 fetch */}
            <div style={qBox}>
              <div style={qTitle}>① 어떤 측면을 물었나 <span style={qTitleSub}>— AI가 가져간 질문형 패싯 페이지 집계</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {crawl.questionTypes.map(q => {
                  const on = q.total > 0
                  return (
                    <div key={q.facet} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 34px minmax(0,0.7fr)', gap: 8, alignItems: 'baseline' }}>
                      <span style={{ fontSize: 'calc(11px * var(--fz, 1))', color: on ? t.neutrals.text : t.neutrals.subtle, ...ellip }}>
                        “{FACET_META[q.facet]?.q ?? q.facet}” <span style={{ fontSize: 'calc(9px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.subtle }}>/{q.facet}</span>
                      </span>
                      <span style={{ fontSize: 'calc(11px * var(--fz, 1))', fontFamily: t.font.mono, fontVariantNumeric: 'tabular-nums', textAlign: 'right', color: on ? t.brand[500] : t.neutrals.line, fontWeight: on ? t.weight.semibold : t.weight.regular }}>{on ? q.total : '·'}</span>
                      <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.subtle, ...ellip }}>{on && q.top ? `최다 ${q.top}` : ''}</span>
                    </div>
                  )
                })}
              </div>
              {crawl.questionTypes.every(q => q.total === 0) && (
                <div style={qEmpty}>아직 신호 없음 — AI가 노드의 패싯 페이지(고객·공급·파급·컨센서스)를 인용에 가져가기 시작하면 질문 유형별로 쌓인다 (패싯 7/11 배포)</div>
              )}
            </div>

            {/* ② 방향: 방문자 패널 확장 */}
            <div style={qBox}>
              <div style={qTitle}>② 어느 방향을 파고드나 <span style={qTitleSub}>— 방문자가 노드에서 펼친 거래처 패널</span></div>
              <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'minmax(0,1fr)' : 'minmax(0,1fr) minmax(0,1fr)', gap: 8 }}>
                {([
                  ['매출쪽', '누가 사주나 · 수요 관심', crawl.panelSignal.revenue, t.brand[500]],
                  ['비용쪽', '어디에 의존하나 · 공급 관심', crawl.panelSignal.cost, '#10b981'],
                ] as const).map(([label, desc, v, color]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 'calc(11px * var(--fz, 1))', color: t.neutrals.text, whiteSpace: 'nowrap' }}>{label}</span>
                    <span style={{ fontSize: 'calc(10px * var(--fz, 1))', color: t.neutrals.subtle, ...ellip }}>{desc}</span>
                    <span style={{ fontSize: 'calc(11px * var(--fz, 1))', fontFamily: t.font.mono, fontVariantNumeric: 'tabular-nums', color: v > 0 ? color : t.neutrals.line, fontWeight: v > 0 ? t.weight.semibold : t.weight.regular, marginLeft: 'auto' }}>{v > 0 ? v : '·'}</span>
                  </div>
                ))}
              </div>
              {crawl.panelSignal.revenue + crawl.panelSignal.cost === 0 ? (
                <div style={qEmpty}>아직 신호 없음 — 방문자가 노드 페이지에서 매출처/지급처 패널을 펼치면 관심 방향(수요/공급)이 집계된다</div>
              ) : (
                <div style={{ marginTop: 5, fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.subtle, ...ellip }}>
                  최근 {crawl.panelSignal.recent.map(x => `${x.from} →${x.side === 'in' ? '매출' : '비용'}→ ${x.to}`).join(' · ')}
                </div>
              )}
            </div>

            {/* ③ 묶음: co-fetch 세션 */}
            <div style={qBox}>
              <div style={qTitle}>③ 무엇과 엮어 물었나 <span style={qTitleSub}>— 한 질문(세션)이 함께 가져간 기업 묶음</span></div>
              {crawl.cofetch.multi === 0 ? (
                <div style={{ ...qEmpty, marginTop: 0 }}>최근 로그 창에는 여러 기업을 함께 가져간 세션 없음 — 한 질문이 여러 기업을 비교·연결하면 그 묶음이 여기에 보인다</div>
              ) : (
                <>
                  <div style={{ fontSize: 'calc(10.5px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted, marginBottom: 5 }}>
                    {crawl.cofetch.multi}묶음 / {crawl.cofetch.total}세션 · 관계형(밸류체인으로 연결된 기업끼리) {crawl.cofetch.relation} · 테마형 {crawl.cofetch.multi - crawl.cofetch.relation}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {crawl.cofetch.recent.map((x, i) => (
                      <div key={i} title={x.bot} style={{ display: 'grid', gridTemplateColumns: '80px 34px minmax(0,1fr)', gap: 8, alignItems: 'baseline', fontSize: 'calc(10.5px * var(--fz, 1))', fontFamily: t.font.mono }}>
                        <span style={{ color: t.neutrals.subtle, whiteSpace: 'nowrap', ...ellip }}>{x.start.slice(5, 16).replace('T', ' ')}</span>
                        <span style={{ color: x.cls === 'relation' ? t.brand[500] : t.neutrals.subtle, whiteSpace: 'nowrap' }}>{x.cls === 'relation' ? '관계' : '테마'}</span>
                        <span style={{ color: t.neutrals.text, ...ellip }}>{x.seq.join(' + ')}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

          </div>
        </div>

        {/* 기업 노드 업데이트 */}
        <div style={{ padding: `12px ${t.density.cardPad}px 12px` }}>
          <div style={sectionLabel}>기업 노드 업데이트 <span style={{ color: t.neutrals.subtle, fontWeight: 400, textTransform: 'none' }}>증명(P) · 파급(R) 각 6점</span></div>
          {/* 최근 업데이트 내역 — 위키 /roadmap 노드 현황과 동일 항목 + 인용퍼널 */}
          <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: UPDATE_MIN_WIDTH, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* 테이블 헤더 — 클릭 정렬 */}
            <div style={{ display: 'grid', gridTemplateColumns: UPDATE_COLS, gap: 8, alignItems: 'center', padding: '0 8px 5px' }}>
              {sortHead('created', '최초', 'left', updateSort, onUpdateSort)}
              {sortHead('date', '수정', 'left', updateSort, onUpdateSort)}
              {sortHead('name', '노드', 'left', updateSort, onUpdateSort)}
              {sortHead('tier', '신뢰도', 'left', updateSort, onUpdateSort)}
              {sortHead('axis', '증명·파급', 'left', updateSort, onUpdateSort)}
              {sortHead('seg', '사업구조', 'center', updateSort, onUpdateSort)}
              {sortHead('rev', '매출', 'center', updateSort, onUpdateSort)}
              {sortHead('cost', '비용', 'center', updateSort, onUpdateSort)}
              {sortHead('inv', '투자', 'center', updateSort, onUpdateSort)}
              {sortHead('research', '리서치', 'center', updateSort, onUpdateSort)}
              {sortHead('linked', '파급', 'center', updateSort, onUpdateSort)}
              {sortHead('src', '출처', 'center', updateSort, onUpdateSort)}
              {sortHead('verified', '교차검증', 'center', updateSort, onUpdateSort)}
              {FUNNEL_HEADS.map(h => <Fragment key={h.key}>{sortHead(h.key, h.label, 'center', updateSort, onUpdateSort)}</Fragment>)}
            </div>
            {updateRows.map(n => (
              <a key={n.slug} href={`${SITE_URL}/${n.slug}`} target="_blank" rel="noreferrer"
                style={{ display: 'grid', gridTemplateColumns: UPDATE_COLS, gap: 8, alignItems: 'center', padding: '6px 8px', borderRadius: t.radius.sm, background: t.neutrals.inner, textDecoration: 'none' }}>
                <span style={{ fontSize: 'calc(11px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.subtle, whiteSpace: 'nowrap' }}>{(n.created_at ?? '').slice(5, 10) || '—'}</span>
                <span style={{ fontSize: 'calc(11px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.subtle, whiteSpace: 'nowrap' }}>{(n.updated_at ?? '').slice(5, 10)}</span>
                <span style={{ fontSize: 'calc(12.5px * var(--fz, 1))', color: t.neutrals.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{n.name}</span>
                <span style={{ whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: TIER_TONE[n.tier].fg, fontWeight: t.weight.semibold }}>{n.tier}</span>
                  <span style={{ fontSize: 'calc(9px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.subtle, marginLeft: 4, fontVariantNumeric: 'tabular-nums' }}>{n.pass}/{maturity.checks}</span>
                </span>
                <AxisMini proof={n.proof} prop={n.prop} />
                {([n.seg, n.rev, n.cost, n.inv, n.research, n.linked, n.src, n.verified] as const).map((v, i) => (
                  <span key={i} style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, textAlign: 'center', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: v > 0 ? t.neutrals.muted : t.neutrals.line }}>{v || '·'}</span>
                ))}
                {FUNNEL_HEADS.map(h => { const v = h.get(n.funnel); return <span key={h.key} style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, fontVariantNumeric: 'tabular-nums', textAlign: 'center', whiteSpace: 'nowrap', color: v > 0 ? h.color : t.neutrals.line }}>{v || '—'}</span> })}
              </a>
            ))}
            {updates.recent.length === 0 && <span style={{ fontSize: 'calc(12px * var(--fz, 1))', color: t.neutrals.subtle, paddingTop: 7 }}>업데이트 내역 없음</span>}
          </div>
          </div>
          {/* 페이저 — N개씩 보기(좌) + 페이지 이동(우), 다른 테이블과 동일 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '8px 8px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                value={updatePerPageInput}
                onChange={e => setUpdatePerPageInput(e.target.value.replace(/\D/g, ''))}
                onBlur={commitUpdatePerPage}
                onKeyDown={e => { if (e.key === 'Enter') commitUpdatePerPage() }}
                style={{ width: 32, textAlign: 'center', border: 'none', background: t.neutrals.inner, borderRadius: t.radius.sm, fontSize: 'calc(11px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted, padding: '2px 0', outline: 'none' }}
              />
              <span style={{ fontSize: 'calc(10px * var(--fz, 1))', color: t.neutrals.subtle, fontFamily: t.font.sans }}>개씩</span>
            </div>
            {updatePages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button disabled={updSafe === 1} onClick={() => setUpdatePage(p => Math.max(1, p - 1))} style={chevBtn(updSafe === 1)}><LIcon name="chevronLeft" size={13} stroke={2} /></button>
                <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted, whiteSpace: 'nowrap' }}>{(updSafe - 1) * updatePerPage + 1}-{Math.min(updSafe * updatePerPage, updateSorted.length)} / {updateSorted.length}</span>
                <button disabled={updSafe >= updatePages} onClick={() => setUpdatePage(p => Math.min(updatePages, p + 1))} style={chevBtn(updSafe >= updatePages)}><LIcon name="chevronRight" size={13} stroke={2} /></button>
              </div>
            )}
          </div>
        </div>

        {/* 분석 아티클 업데이트 현황 (vc_articles) */}
        <div style={{ padding: `12px ${t.density.cardPad}px 12px` }}>
          <div style={sectionLabel}>분석 아티클 업데이트 <span style={{ color: t.neutrals.subtle, fontWeight: 400 }}>{articleUpdates.length}건</span></div>
          <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 540, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* 헤더 (정렬 가능) — 최초 | 수정 | 제목 | 변경 | 학습·인덱싱·인용·방문 */}
            <div style={{ display: 'grid', gridTemplateColumns: '52px 52px minmax(0,1fr) 40px 40px 40px 40px 40px', gap: 8, alignItems: 'center', padding: '0 8px 5px' }}>
              {sortHead('published', '최초', 'left', articleSort, onArticleSort)}
              {sortHead('updated', '수정', 'left', articleSort, onArticleSort)}
              {sortHead('title', '제목', 'left', articleSort, onArticleSort)}
              {sortHead('changelog', '변경', 'center', articleSort, onArticleSort)}
              {FUNNEL_HEADS.map(h => <Fragment key={h.key}>{sortHead(h.key, h.label, 'center', articleSort, onArticleSort)}</Fragment>)}
            </div>
            {articleRows.map(a => (
              <a key={a.slug} href={`${SITE_URL}/analysis/${a.slug}`} target="_blank" rel="noreferrer"
                style={{ display: 'grid', gridTemplateColumns: '52px 52px minmax(0,1fr) 40px 40px 40px 40px 40px', gap: 8, alignItems: 'center', padding: '6px 8px', borderRadius: t.radius.sm, background: t.neutrals.inner, textDecoration: 'none' }}>
                <span style={{ fontSize: 'calc(11px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.subtle, whiteSpace: 'nowrap' }}>{(a.publishedAt ?? '').slice(5, 10) || '—'}</span>
                <span style={{ fontSize: 'calc(11px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.subtle, whiteSpace: 'nowrap' }}>{(a.updatedAt ?? '').slice(5, 10) || '—'}</span>
                <span style={{ fontSize: 'calc(12.5px * var(--fz, 1))', color: t.neutrals.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{a.title}</span>
                <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: a.changelogCount ? t.neutrals.muted : t.neutrals.line, textAlign: 'center', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{a.changelogCount || '—'}</span>
                {FUNNEL_HEADS.map(h => { const v = h.get(a.funnel); return <span key={h.key} style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, fontVariantNumeric: 'tabular-nums', textAlign: 'center', whiteSpace: 'nowrap', color: v > 0 ? h.color : t.neutrals.line }}>{v || '—'}</span> })}
              </a>
            ))}
            {articleUpdates.length === 0 && <span style={{ fontSize: 'calc(12px * var(--fz, 1))', color: t.neutrals.subtle, paddingTop: 7 }}>아티클 없음</span>}
          </div>
          </div>
          {/* 페이저 — N개씩(좌) + 이동(우), 업데이트 테이블과 동일 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '8px 8px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                value={articlePerPageInput}
                onChange={e => setArticlePerPageInput(e.target.value.replace(/\D/g, ''))}
                onBlur={commitArticlePerPage}
                onKeyDown={e => { if (e.key === 'Enter') commitArticlePerPage() }}
                style={{ width: 32, textAlign: 'center', border: 'none', background: t.neutrals.inner, borderRadius: t.radius.sm, fontSize: 'calc(11px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted, padding: '2px 0', outline: 'none' }}
              />
              <span style={{ fontSize: 'calc(10px * var(--fz, 1))', color: t.neutrals.subtle, fontFamily: t.font.sans }}>개씩</span>
            </div>
            {articlePages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button disabled={artSafe === 1} onClick={() => setArticlePage(p => Math.max(1, p - 1))} style={chevBtn(artSafe === 1)}><LIcon name="chevronLeft" size={13} stroke={2} /></button>
                <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted, whiteSpace: 'nowrap' }}>{(artSafe - 1) * articlePerPage + 1}-{Math.min(artSafe * articlePerPage, articleUpdates.length)} / {articleUpdates.length}</span>
                <button disabled={artSafe >= articlePages} onClick={() => setArticlePage(p => Math.min(articlePages, p + 1))} style={chevBtn(artSafe >= articlePages)}><LIcon name="chevronRight" size={13} stroke={2} /></button>
              </div>
            )}
          </div>
        </div>

      </LCard>
    </div>
  )
}

// ─── helpers ─────────────────────────────────────────────────────────────────────

// 증명(P)·파급(R) 2축 미니 게이지 — 위키 /roadmap Axis2의 대시보드 버전 (각 6점)
function AxisMini({ proof, prop }: { proof: number; prop: number }) {
  const rows: [string, number, string][] = [['증', proof, t.brand[500]], ['파', prop, '#10b981']]
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }} title={`증명 ${proof}/6 · 파급 ${prop}/6`}>
      {rows.map(([lbl, v, color]) => (
        <span key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ fontSize: 'calc(8.5px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.subtle, whiteSpace: 'nowrap' }}>{lbl}</span>
          <span style={{ flex: 1, height: 3, borderRadius: 2, background: t.neutrals.line, overflow: 'hidden' }}>
            <span style={{ display: 'block', width: `${(v / 6) * 100}%`, height: '100%', borderRadius: 2, background: color }} />
          </span>
          <span style={{ fontSize: 'calc(8.5px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
        </span>
      ))}
    </span>
  )
}

// 최근 7일 추이 미니 바차트 (인라인, SVG)
function MiniBars({ data }: { data: number[] }) {
  const max = Math.max(1, ...data)
  const H = 16, W = 58, n = data.length || 1, gap = 2
  const bw = (W - gap * (n - 1)) / n
  return (
    <svg width={W} height={H} style={{ display: 'block' }} aria-hidden="true">
      {data.map((v, i) => {
        const h = Math.max(1, Math.round((v / max) * (H - 1)))
        return <rect key={i} x={i * (bw + gap)} y={H - h} width={bw} height={h} rx={1} fill={v > 0 ? t.brand[400] : t.neutrals.line} />
      })}
    </svg>
  )
}

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
