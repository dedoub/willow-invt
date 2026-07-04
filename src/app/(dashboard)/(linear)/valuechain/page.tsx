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
  const [updatePage, setUpdatePage] = useState(1)
  const [updatePerPage, setUpdatePerPage] = useState(8)
  const [updatePerPageInput, setUpdatePerPageInput] = useState('8')

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
  const UPDATE_COLS = '44px 44px minmax(76px,1fr) 58px 40px 40px 30px 44px 34px 34px'
  const UPDATE_MIN_WIDTH = 540
  const headCell: React.CSSProperties = {
    fontSize: 'calc(9px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.subtle,
    letterSpacing: 0.3, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden',
  }

  // ── 클릭 정렬 헤더 ──
  const numDescKeys = new Set(['date', 'created', 'rev', 'cost', 'pass', 'count', 'pct', 'days'])
  const defaultDir = (key: string): 'asc' | 'desc' => (numDescKeys.has(key) ? 'desc' : 'asc')
  const onUpdateSort = (key: string) => { setUpdatePage(1); setUpdateSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: defaultDir(key) }) }
  const commitUpdatePerPage = () => {
    const n = Math.max(5, Math.min(100, Number(updatePerPageInput) || 8))
    setUpdatePerPageInput(String(n)); setUpdatePerPage(n); setUpdatePage(1)
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
      case 'ticker': r = (a.ticker || '').localeCompare(b.ticker || ''); break
      case 'rev': r = a.rev - b.rev; break
      case 'cost': r = a.cost - b.cost; break
      case 'tier': r = a.tier.localeCompare(b.tier); break
      case 'pass': r = a.pass - b.pass; break
      case 'created': r = (a.created_at || '').localeCompare(b.created_at || ''); break
      case 'date':
      default: r = (a.updated_at || '').localeCompare(b.updated_at || '')
    }
    return r !== 0 ? r * updateDir : (b.updated_at || '').localeCompare(a.updated_at || '')
  })
  // ── 페이지네이션 ──
  const updatePages = Math.max(1, Math.ceil(updateSorted.length / updatePerPage))
  const updSafe = Math.min(updatePage, updatePages)
  const updateRows = updateSorted.slice((updSafe - 1) * updatePerPage, updSafe * updatePerPage)
  const chevBtn = (disabled: boolean): React.CSSProperties => ({
    background: 'transparent', border: 'none', cursor: disabled ? 'default' : 'pointer',
    padding: 4, borderRadius: 4, color: disabled ? t.neutrals.line : t.neutrals.muted, opacity: disabled ? 0.4 : 1,
  })

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

        {/* AI 인용 퍼널 — 학습 수집 → 답변 인덱싱 → 사용자 질문 인용 (/crawls 요약) */}
        <div style={{ padding: `12px ${t.density.cardPad}px 12px` }}>
          <div style={sectionLabel}>AI 인용 퍼널</div>
          <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 420, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* 헤더행 */}
            <div style={{ display: 'grid', gridTemplateColumns: '128px 56px 56px 56px minmax(0,1fr)', gap: 8, alignItems: 'center', padding: '0 8px 5px' }}>
              <span style={headCell}>단계</span>
              <span style={headCell}>7일</span>
              <span style={headCell}>총</span>
              <span style={headCell}>최근</span>
              <span style={headCell}>상위봇</span>
            </div>
            {([['①', '학습 수집', crawl.funnel.train], ['②', '답변 인덱싱', crawl.funnel.index], ['③', '사용자 질문 인용', crawl.funnel.cite]] as const).map(([num, label, tier]) => (
              <div key={label} style={{ display: 'grid', gridTemplateColumns: '128px 56px 56px 56px minmax(0,1fr)', gap: 8, alignItems: 'center', padding: '6px 8px', borderRadius: t.radius.sm, background: t.neutrals.inner }}>
                <span style={{ fontSize: 'calc(11.5px * var(--fz, 1))', color: t.neutrals.text, whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 'calc(9px * var(--fz, 1))', color: t.neutrals.subtle, marginRight: 3 }}>{num}</span>{label}
                </span>
                <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{tier.last7d.toLocaleString()}</span>
                <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{tier.total.toLocaleString()}</span>
                <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.subtle, whiteSpace: 'nowrap' }}>{tier.last ? tier.last.slice(5, 10) : '—'}</span>
                <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.subtle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                  {tier.bots.length ? tier.bots.slice(0, 3).map(b => `${b.bot} ${b.count.toLocaleString()}×`).join(' · ') : '아직 없음'}
                </span>
              </div>
            ))}
          </div>
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
              {sortHead('created', '최초', 'left', updateSort, onUpdateSort)}
              {sortHead('date', '수정', 'left', updateSort, onUpdateSort)}
              {sortHead('name', '노드', 'left', updateSort, onUpdateSort)}
              {sortHead('ticker', '티커', 'left', updateSort, onUpdateSort)}
              {sortHead('rev', '매출처', 'center', updateSort, onUpdateSort)}
              {sortHead('cost', '지급처', 'center', updateSort, onUpdateSort)}
              {sortHead('tier', '티어', 'center', updateSort, onUpdateSort)}
              {sortHead('pass', '완성도', 'center', updateSort, onUpdateSort)}
              <span style={{ ...headCell, textAlign: 'center' }}>리포트</span>
              <span style={{ ...headCell, textAlign: 'center' }}>파급</span>
            </div>
            {updateRows.map(n => (
              <a key={n.slug} href={`${SITE_URL}/${n.slug}`} target="_blank" rel="noreferrer"
                style={{ display: 'grid', gridTemplateColumns: UPDATE_COLS, gap: 8, alignItems: 'center', padding: '6px 8px', borderRadius: t.radius.sm, background: t.neutrals.inner, textDecoration: 'none' }}>
                <span style={{ fontSize: 'calc(11px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.subtle, whiteSpace: 'nowrap' }}>{(n.created_at ?? '').slice(5, 10) || '—'}</span>
                <span style={{ fontSize: 'calc(11px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.subtle, whiteSpace: 'nowrap' }}>{(n.updated_at ?? '').slice(5, 10)}</span>
                <span style={{ fontSize: 'calc(12.5px * var(--fz, 1))', color: t.neutrals.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{n.name}</span>
                <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: n.ticker ? t.neutrals.muted : t.neutrals.line, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.ticker || '—'}</span>
                <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted, textAlign: 'center', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{n.rev}</span>
                <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted, textAlign: 'center', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{n.cost}</span>
                <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: TIER_TONE[n.tier].fg, fontWeight: t.weight.semibold, textAlign: 'center', whiteSpace: 'nowrap' }}>{n.tier}</span>
                <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted, textAlign: 'center', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{n.pass}/{maturity.checks}</span>
                <span style={{ fontSize: 'calc(10px * var(--fz, 1))', textAlign: 'center', color: n.hasReport ? '#10b981' : t.neutrals.line, whiteSpace: 'nowrap' }} title={n.hasReport ? '증권사 리포트 섹션 있음' : '없음'}>{n.hasReport ? '●' : '—'}</span>
                <span style={{ fontSize: 'calc(10px * var(--fz, 1))', textAlign: 'center', color: n.hasChainImpact ? '#3b82f6' : t.neutrals.line, whiteSpace: 'nowrap' }} title={n.hasChainImpact ? '가치사슬 파급 섹션 있음' : '없음'}>{n.hasChainImpact ? '●' : '—'}</span>
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
