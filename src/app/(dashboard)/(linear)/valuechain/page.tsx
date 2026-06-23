'use client'

import { useState, useEffect, useCallback } from 'react'
import { t, tonePalettes, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
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

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <LCard style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 'calc(10.5px * var(--fz, 1))', fontWeight: t.weight.semibold, letterSpacing: 0.6, textTransform: 'uppercase' as const, color: t.neutrals.subtle, fontFamily: t.font.mono }}>{label}</span>
      <span style={{ fontSize: 'calc(24px * var(--fz, 1))', fontWeight: t.weight.bold, fontFamily: t.font.mono, color: t.neutrals.text, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      {sub && <span style={{ fontSize: 'calc(11px * var(--fz, 1))', color: t.neutrals.muted }}>{sub}</span>}
    </LCard>
  )
}

// 라벨 + 값 + 비례 바 (가로 막대 한 줄)
function BarRow({ label, value, max, tone, right }: { label: string; value: number; max: number; tone: { bg: string; fg: string }; right?: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 'calc(11.5px * var(--fz, 1))', color: t.neutrals.text, width: 130, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: 8, background: t.neutrals.inner, borderRadius: t.radius.pill, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: tone.fg, borderRadius: t.radius.pill }} />
      </div>
      <span style={{ fontSize: 'calc(11px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted, width: 56, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{right ?? value.toLocaleString()}</span>
    </div>
  )
}

// ─── 페이지 ─────────────────────────────────────────────────────────────────────

export default function ValueChainPage() {
  const mobile = useIsMobile()
  const [stats, setStats] = useState<ValueChainStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  const { summary, maturity, updates, crawl } = stats
  const maxDaily = Math.max(1, ...updates.daily.map(d => d.count))
  const maxBot = Math.max(1, ...crawl.topBots.map(b => b.count))
  const maxRes = Math.max(1, ...crawl.topResources.map(r => r.count))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)', gap: 14 }}>
        <KpiCard label="노드" value={summary.nodes.toLocaleString()} sub="기업·기관" />
        <KpiCard label="관계" value={summary.edges.toLocaleString()} sub="매출·비용 엣지" />
        <KpiCard label="출처" value={summary.sources.toLocaleString()} sub="검증 소스" />
        <KpiCard label="아티클" value={summary.articles.toLocaleString()} sub="해설 글" />
        <KpiCard label="완성도" value={`${maturity.completeness}%`} sub={`평균 ${maturity.avgPass}/${maturity.checks} 체크`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(3, 1fr)', gap: 14, alignItems: 'start' }}>
        {/* 업데이트 추이 */}
        <LCard>
          <LSectionHead eyebrow="ACTIVITY" title="업데이트 추이" action={
            <div style={{ display: 'flex', gap: 12 }}>
              <span style={{ fontSize: 'calc(11px * var(--fz, 1))', color: t.neutrals.muted }}>7일 <b style={{ fontFamily: t.font.mono, color: t.neutrals.text }}>{updates.last7d}</b></span>
              <span style={{ fontSize: 'calc(11px * var(--fz, 1))', color: t.neutrals.muted }}>30일 <b style={{ fontFamily: t.font.mono, color: t.neutrals.text }}>{updates.last30d}</b></span>
            </div>
          } />
          {/* 14일 미니 바차트 */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 72 }}>
            {updates.daily.map(d => (
              <div key={d.date} title={`${d.date}: ${d.count}건`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', height: '100%' }}>
                <div style={{ width: '100%', height: `${(d.count / maxDaily) * 100}%`, minHeight: d.count > 0 ? 3 : 0, background: t.brand[400], borderRadius: 2 }} />
              </div>
            ))}
          </div>
          <div style={{ fontSize: 'calc(10px * var(--fz, 1))', color: t.neutrals.subtle, marginTop: 6 }}>최근 14일 노드 업데이트</div>
        </LCard>

        {/* AI 의존도 */}
        <LCard>
          <LSectionHead eyebrow="AGENT-NATIVE" title="AI 크롤 의존도" action={
            <div style={{ display: 'flex', gap: 10 }}>
              <span style={{ fontSize: 'calc(11px * var(--fz, 1))', color: t.neutrals.muted }}>AI <b style={{ fontFamily: t.font.mono, color: t.neutrals.text }}>{crawl.ai.toLocaleString()}</b></span>
              <span style={{ fontSize: 'calc(11px * var(--fz, 1))', color: t.neutrals.muted }}>24h <b style={{ fontFamily: t.font.mono, color: t.neutrals.text }}>{crawl.last24h}</b></span>
              <span style={{ fontSize: 'calc(11px * var(--fz, 1))', color: t.neutrals.muted }}>7d <b style={{ fontFamily: t.font.mono, color: t.neutrals.text }}>{crawl.last7d}</b></span>
            </div>
          } />
          <div style={{ fontSize: 'calc(11px * var(--fz, 1))', color: t.neutrals.subtle, marginBottom: 8 }}>봇별 가져간 횟수 (Top {crawl.topBots.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            {crawl.topBots.map(b => (
              <BarRow key={b.bot} label={b.bot} value={b.count} max={maxBot} tone={tonePalettes.brand} />
            ))}
            {crawl.topBots.length === 0 && <span style={{ fontSize: 'calc(12px * var(--fz, 1))', color: t.neutrals.subtle }}>AI 크롤 기록 없음</span>}
          </div>
          <div style={{ fontSize: 'calc(11px * var(--fz, 1))', color: t.neutrals.subtle, marginBottom: 8 }}>가장 많이 의존되는 리소스</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {crawl.topResources.slice(0, 8).map(r => (
              <BarRow key={r.resource} label={r.resource} value={r.count} max={maxRes} tone={tonePalettes.info} right={`${r.count} · ${r.bots}봇`} />
            ))}
          </div>
        </LCard>

        {/* 업데이트 내역 */}
        <LCard>
        <LSectionHead eyebrow="UPDATES" title="업데이트 내역" />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {updates.recent.map((n, i) => (
            <a key={n.slug} href={`${SITE_URL}/${n.slug}`} target="_blank" rel="noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', textDecoration: 'none', borderTop: i === 0 ? 'none' : `1px solid ${t.neutrals.line}` }}>
              <span style={{ fontSize: 'calc(11px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.subtle, width: 56, flexShrink: 0 }}>{(n.updated_at ?? '').slice(5, 10)}</span>
              <span style={{ flex: 1, fontSize: 'calc(12.5px * var(--fz, 1))', color: t.neutrals.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.name}</span>
              <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: TIER_TONE[n.tier].fg, fontWeight: t.weight.semibold, flexShrink: 0 }}>{n.tier} {n.pass}/{maturity.checks}</span>
            </a>
          ))}
          {updates.recent.length === 0 && <span style={{ fontSize: 'calc(12px * var(--fz, 1))', color: t.neutrals.subtle }}>업데이트 내역 없음</span>}
        </div>
        </LCard>
      </div>
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
