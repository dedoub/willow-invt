'use client'

import { useEffect, useMemo, useState } from 'react'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { SectorRotationChartModal } from './sector-rotation-chart'

interface SectorEtf {
  ticker: string
  name: string
  group: string
  latestClose: number
  latestDate: string
  returns: Record<'1m' | '3m' | '6m' | '1y', number | null>
}

const PERIODS: Array<'1m' | '3m' | '6m' | '1y'> = ['1m', '3m', '6m', '1y']

// 내 포트와 가장 직결된 핵심 ETF만 하이라이트 (전체 ETF 중 일부만).
// 사용자 보유/감시 종목의 axis와 교집합이 있으면 하이라이트 행으로 강조.
const ETF_AXES: Record<string, string[]> = {
  SMH:  ['AI 인프라'],   // 반도체 (NVDA, AMD, SK하이닉스, 삼성전자 등)
  AIQ:  ['AI 인프라'],   // AI 종합
  URA:  ['AI 인프라'],   // 우라늄/원전 (CCJ)
  ITA:  ['지정학/안보'], // 방산 (한화에어로, 한국로템 등)
  QTUM: ['넥스트'],      // 양자컴퓨팅 (QBTS)
}

// 수익률을 [-30%, +30%] 범위로 클램프해서 0~1 normalize 후 빨강↔초록 그라데이션
function returnColor(r: number | null): { bg: string; fg: string } {
  if (r == null) return { bg: t.neutrals.inner, fg: t.neutrals.subtle }
  const clamped = Math.max(-0.3, Math.min(0.3, r))
  if (clamped >= 0) {
    // 0 → 회색, +30% → 진한 빨강 (한국 주식 +는 빨강)
    const intensity = clamped / 0.3
    const r255 = Math.round(255 - intensity * 100) // 255 → 155
    const g255 = Math.round(245 - intensity * 200) // 245 → 45
    const b255 = Math.round(245 - intensity * 200) // 245 → 45
    return {
      bg: `rgb(${r255}, ${g255}, ${b255})`,
      fg: intensity > 0.5 ? '#fff' : '#9F1239',
    }
  } else {
    // 0 → 회색, -30% → 진한 파랑 (한국 주식 -는 파랑)
    const intensity = -clamped / 0.3
    const r255 = Math.round(245 - intensity * 200) // 245 → 45
    const g255 = Math.round(245 - intensity * 130) // 245 → 115
    const b255 = Math.round(255 - intensity * 50)  // 255 → 205
    return {
      bg: `rgb(${r255}, ${g255}, ${b255})`,
      fg: intensity > 0.5 ? '#fff' : '#1E3A8A',
    }
  }
}

function fmtPct(r: number | null): string {
  if (r == null) return '—'
  const v = r * 100
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
}

type SortKey = '1m' | '3m' | '6m' | '1y' | 'group'

interface SectorRotationBlockProps {
  /** 사용자 보유/감시 중인 axis 집합 (예: {'AI 인프라','지정학/안보','넥스트'}). 매칭되는 ETF 행은 하이라이트. */
  myAxes?: Set<string>
}

export function SectorRotationBlock({ myAxes }: SectorRotationBlockProps = {}) {
  const mobile = useIsMobile()
  const [etfs, setEtfs] = useState<SectorEtf[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<SortKey>('1y')
  const [openChart, setOpenChart] = useState<{ ticker: string; name: string; period: '1m' | '3m' | '6m' | '1y' } | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/willow-mgmt/sector-rotation')
      .then(r => r.json())
      .then((data) => {
        if (!alive) return
        setEtfs(data.etfs || [])
        setLoading(false)
      })
      .catch(() => {
        if (!alive) return
        setLoading(false)
      })
    return () => { alive = false }
  }, [])

  const sorted = useMemo(() => {
    if (!etfs) return []
    if (sortBy === 'group') {
      // Benchmark → GICS → Theme, 그룹 내 1y 수익률 desc
      const order: Record<string, number> = { Benchmark: 0, GICS: 1, Theme: 2 }
      return [...etfs].sort((a, b) => {
        const ao = order[a.group] ?? 99
        const bo = order[b.group] ?? 99
        if (ao !== bo) return ao - bo
        const av = a.returns['1y'] ?? -Infinity
        const bv = b.returns['1y'] ?? -Infinity
        return bv - av
      })
    }
    return [...etfs].sort((a, b) => {
      const av = a.returns[sortBy] ?? -Infinity
      const bv = b.returns[sortBy] ?? -Infinity
      return bv - av
    })
  }, [etfs, sortBy])

  const latestDate = etfs?.[0]?.latestDate

  return (
    <div style={{ background: t.neutrals.card, borderRadius: t.radius.lg, padding: mobile ? 12 : 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
        <div>
          <div style={{ fontSize: 10, fontFamily: t.font.mono, fontWeight: 600, color: t.neutrals.subtle, letterSpacing: 0.6, textTransform: 'uppercase' as const, marginBottom: 2 }}>
            SECTOR ROTATION
          </div>
          <div style={{ fontSize: 14, fontWeight: t.weight.semibold, color: t.neutrals.text, fontFamily: t.font.sans }}>
            섹터/테마 ETF 상대 수익률
            {latestDate && (
              <span style={{ fontSize: 10, fontWeight: t.weight.regular, color: t.neutrals.subtle, marginLeft: 6, fontFamily: t.font.mono }}>
                as of {latestDate}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['group', '1m', '3m', '6m', '1y'] as const).map(key => {
            const active = sortBy === key
            return (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                style={{
                  padding: '3px 10px', fontSize: 11, fontFamily: t.font.sans, cursor: 'pointer',
                  border: 'none', borderRadius: t.radius.pill,
                  background: active ? t.brand[600] : t.neutrals.inner,
                  color: active ? '#fff' : t.neutrals.muted,
                  fontWeight: active ? t.weight.medium : t.weight.regular,
                  transition: 'all .12s',
                }}
              >
                {key === 'group' ? '그룹' : key.toUpperCase()}
              </button>
            )
          })}
        </div>
      </div>

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="l-skeleton" style={{ height: 24, borderRadius: t.radius.sm }} />
          ))}
        </div>
      )}

      {!loading && sorted.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Header row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: mobile ? '64px 1fr repeat(4, 56px)' : '70px 1fr repeat(4, 78px)',
            gap: 4, padding: '4px 6px', fontSize: 10, color: t.neutrals.subtle,
            fontFamily: t.font.mono, fontWeight: 600, textTransform: 'uppercase' as const,
          }}>
            <div>티커</div>
            <div>이름</div>
            {PERIODS.map(p => (
              <div key={p} style={{ textAlign: 'right' }}>{p.toUpperCase()}</div>
            ))}
          </div>
          {/* Data rows */}
          {sorted.map(etf => {
            const axesForEtf = ETF_AXES[etf.ticker] || []
            const isMine = !!myAxes && axesForEtf.some(a => myAxes.has(a))
            const isBenchmark = etf.group === 'Benchmark'
            // 벤치마크는 앰버, 내 포트는 인디고. (벤치마크는 항상 비교 기준이라 별도 강조)
            const rowBg = isBenchmark ? 'rgba(245, 158, 11, 0.10)' : isMine ? 'rgba(99, 102, 241, 0.10)' : 'transparent'
            const rowBorder = isBenchmark ? '2px solid #F59E0B' : isMine ? '2px solid #6366F1' : '2px solid transparent'
            const tickerColor = isBenchmark ? '#B45309' : isMine ? '#4338CA' : t.neutrals.text
            return (
            <div key={etf.ticker} style={{
              display: 'grid',
              gridTemplateColumns: mobile ? '64px 1fr repeat(4, 56px)' : '70px 1fr repeat(4, 78px)',
              gap: 4, alignItems: 'center', padding: '0 6px',
              fontSize: 11, color: t.neutrals.text,
              background: rowBg,
              borderLeft: rowBorder,
              borderRadius: t.radius.sm,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                <span style={{
                  fontSize: 8, fontWeight: 600, padding: '0 4px', borderRadius: 3,
                  background: isBenchmark ? '#FEF3C7' : etf.group === 'GICS' ? '#DBEAFE' : '#F3E8FF',
                  color: isBenchmark ? '#92400E' : etf.group === 'GICS' ? '#1E40AF' : '#7E22CE',
                  flexShrink: 0,
                }}>{isBenchmark ? 'B' : etf.group === 'GICS' ? 'G' : 'T'}</span>
                <span style={{
                  fontFamily: t.font.mono, fontWeight: (isMine || isBenchmark) ? t.weight.semibold : t.weight.medium,
                  fontSize: 11, color: tickerColor,
                }}>{etf.ticker}</span>
              </div>
              <div style={{
                fontSize: 11, color: t.neutrals.muted,
                whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {etf.name}
              </div>
              {PERIODS.map(p => {
                const r = etf.returns[p]
                const c = returnColor(r)
                const clickable = r != null
                return (
                  <button
                    key={p}
                    onClick={clickable ? () => setOpenChart({ ticker: etf.ticker, name: etf.name, period: p }) : undefined}
                    disabled={!clickable}
                    style={{
                      padding: '3px 6px', borderRadius: t.radius.sm,
                      background: c.bg, color: c.fg,
                      fontSize: mobile ? 10 : 10.5, fontWeight: t.weight.medium,
                      fontFamily: t.font.mono, textAlign: 'right' as const,
                      lineHeight: 1.4, border: 'none',
                      cursor: clickable ? 'pointer' : 'default',
                      transition: 'transform .08s',
                    }}
                    onMouseEnter={(e) => { if (clickable) e.currentTarget.style.transform = 'scale(1.05)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
                    title={clickable ? `${etf.ticker} ${p.toUpperCase()} 추이 차트 보기` : undefined}
                  >
                    {fmtPct(r)}
                  </button>
                )
              })}
            </div>
            )
          })}
        </div>
      )}

      {!loading && sorted.length === 0 && (
        <div style={{ fontSize: 12, color: t.neutrals.subtle, padding: '20px 0', textAlign: 'center' as const }}>
          데이터가 없습니다. 수집 스크립트를 실행해 주세요.
        </div>
      )}

      {openChart && (
        <SectorRotationChartModal
          ticker={openChart.ticker}
          etfName={openChart.name}
          period={openChart.period}
          onClose={() => setOpenChart(null)}
        />
      )}
    </div>
  )
}
