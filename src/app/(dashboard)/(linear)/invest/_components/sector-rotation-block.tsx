'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { t, tonePalettes, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { SectorRotationChartModal } from './sector-rotation-chart'
import { LBadge } from '@/app/(dashboard)/_components/linear-badge'
import { Bone } from '@/app/(dashboard)/_components/linear-skeleton'
import { LTableHead, LTableRow, LTableBody, LTableScroll, LPageSize, type LColumn } from '@/app/(dashboard)/_components/linear-table'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LCardFoot } from '@/app/(dashboard)/_components/linear-card-foot'

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
  EWY:  ['AI 인프라', '지정학/안보', '넥스트'], // 한국 ETF — 한국 보유 종목 다수
}

// 수익률을 [-30%, +30%] 범위로 클램프해서 0~1 normalize 후 그라데이션 (미국식: +는 녹색, -는 빨강)
function returnColor(r: number | null): { bg: string; fg: string } {
  if (r == null) return { bg: t.neutrals.inner, fg: t.neutrals.subtle }
  const clamped = Math.max(-0.3, Math.min(0.3, r))
  if (clamped >= 0) {
    // 0 → 회색, +30% → 진한 녹색 (미국 주식 +는 녹색)
    const intensity = clamped / 0.3
    const r255 = Math.round(245 - intensity * 200) // 245 → 45
    const g255 = Math.round(245 - intensity * 100) // 245 → 145
    const b255 = Math.round(245 - intensity * 160) // 245 → 85
    return {
      bg: `rgb(${r255}, ${g255}, ${b255})`,
      fg: intensity > 0.5 ? '#fff' : '#14532D',
    }
  } else {
    // 0 → 회색, -30% → 진한 빨강 (미국 주식 -는 빨강)
    const intensity = -clamped / 0.3
    const r255 = Math.round(255 - intensity * 100) // 255 → 155
    const g255 = Math.round(245 - intensity * 200) // 245 → 45
    const b255 = Math.round(245 - intensity * 200) // 245 → 45
    return {
      bg: `rgb(${r255}, ${g255}, ${b255})`,
      fg: intensity > 0.5 ? '#fff' : '#9F1239',
    }
  }
}

function fmtPct(r: number | null): string {
  if (r == null) return '—'
  const v = r * 100
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
}

type SortKey = '1m' | '3m' | '6m' | '1y' | 'group' | 'name'
type SortDir = 'asc' | 'desc'

// 구분은 글자로 쓴다. 한 글자 배지(S·H·B…)로는 벤치마크와 섹터 ETF 를 한눈에 못 갈랐다(CEO 2026-09-28).
const GROUP_LABEL: Record<string, string> = {
  Benchmark: '벤치마크', GICS: '섹터', Theme: '테마', Macro: '매크로', Holding: '보유', SectorGroup: '보유묶음',
}

const PAGE_SIZE_KEY = 'invest-sector-page-size'
const DEFAULT_PAGE_SIZE = 10
function getStoredPageSize(): number {
  if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE
  const n = Number(localStorage.getItem(PAGE_SIZE_KEY))
  return n >= 1 && n <= 100 ? n : DEFAULT_PAGE_SIZE
}

// LTableHead 와 데이터 행이 같은 열 정의를 쓴다. sortValue 는 정렬 가능 표시용이고 실제 정렬은 블록 상태(sortBy/sortDir)가 한다.
const COLUMNS: LColumn<SectorEtf>[] = [
  { key: 'group', label: '구분', width: '60px', sortValue: e => e.group },
  { key: 'ticker', label: '티커', width: '52px' },
  { key: 'name', label: '이름', width: 'minmax(0,1fr)', hideMobile: true, sortValue: e => e.name },
  ...PERIODS.map((p): LColumn<SectorEtf> => ({ key: p, label: p.toUpperCase(), width: 'minmax(64px,84px)', align: 'center', sortValue: e => e.returns[p] })),
]

interface SectorRotationBlockProps {
  /** 사용자 보유/감시 중인 axis 집합 (예: {'AI 인프라','지정학/안보','넥스트'}). 매칭되는 ETF 행은 하이라이트. */
  myAxes?: Set<string>
}

export function SectorRotationBlock({ myAxes }: SectorRotationBlockProps = {}) {
  const mobile = useIsMobile()
  const [etfs, setEtfs] = useState<SectorEtf[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<SortKey>('1y')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [pageSize, setPageSize] = useState<number>(getStoredPageSize)
  const [page, setPage] = useState(0)
  const applyPageSize = useCallback((n: number) => {
    setPageSize(n); setPage(0)
    localStorage.setItem(PAGE_SIZE_KEY, String(n))
  }, [])

  const handleSort = (key: SortKey) => {
    setPage(0)
    if (sortBy === key) {
      // 같은 키는 기본방향 → 반전 → 기본 정렬(1y desc)로 순환. 1y 자신은 toggle만 한다.
      const defaultDir: SortDir = key === 'group' || key === 'name' ? 'asc' : 'desc'
      if (key !== '1y' && sortDir !== defaultDir) {
        setSortBy('1y')
        setSortDir('desc')
      } else {
        setSortDir(d => d === 'desc' ? 'asc' : 'desc')
      }
    } else {
      setSortBy(key)
      // 새 키로 바꿀 때 기본: 그룹/이름은 asc, 수익률은 desc
      setSortDir(key === 'group' || key === 'name' ? 'asc' : 'desc')
    }
  }
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
    const dirSign = sortDir === 'asc' ? 1 : -1
    if (sortBy === 'group') {
      // Holding → SectorGroup → Benchmark → GICS → Theme → Macro, 그룹 내 1y 수익률 desc
      const order: Record<string, number> = { Holding: 0, SectorGroup: 1, Benchmark: 2, GICS: 3, Theme: 4, Macro: 5 }
      return [...etfs].sort((a, b) => {
        const ao = order[a.group] ?? 99
        const bo = order[b.group] ?? 99
        if (ao !== bo) return (ao - bo) * dirSign
        const av = a.returns['1y'] ?? -Infinity
        const bv = b.returns['1y'] ?? -Infinity
        return bv - av // 그룹 내부는 항상 1y desc
      })
    }
    if (sortBy === 'name') {
      return [...etfs].sort((a, b) => a.name.localeCompare(b.name, 'ko') * dirSign)
    }
    return [...etfs].sort((a, b) => {
      const av = a.returns[sortBy] ?? -Infinity
      const bv = b.returns[sortBy] ?? -Infinity
      return (av - bv) * dirSign
    })
  }, [etfs, sortBy, sortDir])

  const latestDate = etfs?.[0]?.latestDate
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const paged = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize)

  return (
    /* 생 div 에 배경을 칠하면 카드 문법(theme-outline)이 닿지 않아 이 블록만 다른 카드로 읽혔다. */
    <LCard>
      <LSectionHead title="섹터수익률" mb={t.density.panelPadY + t.density.gapMd} />

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.gapXs }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Bone key={i} h={24} />
          ))}
        </div>
      )}

      {!loading && sorted.length > 0 && (
        /* 머리와 본문을 한 가로 스크롤 안에 함께 둔다 — 6열이라 좁은 폭에서 그냥 두면
           열이 눌려 수익률 칸의 숫자가 잘린다. 최소 폭은 컬럼 정의에서 나온다. */
        <LTableScroll columns={COLUMNS} mobile={mobile}>
          {/* Header row — 각 헤더 클릭 시 정렬 (같은 헤더 재클릭 시 방향 토글) */}
          <LTableHead
            columns={COLUMNS}
            mobile={mobile}
            sort={{ key: sortBy, dir: sortDir }}
            onSort={(k) => handleSort(k as SortKey)}
          />
          <LTableBody columns={COLUMNS} mobile={mobile}>
          {/* Data rows */}
          {paged.map(etf => {
            const axesForEtf = ETF_AXES[etf.ticker] || []
            const isMine = !!myAxes && axesForEtf.some(a => myAxes.has(a))
            const isBenchmark = etf.group === 'Benchmark'
            const isHolding = etf.group === 'Holding'
            const isSectorGroup = etf.group === 'SectorGroup'
            // 그룹은 1열 구분 배지가 이미 말한다. 행 배경과 티커 색까지 겹쳐 칠하면
            // 이 카드의 뜻인 수익률 히트맵과 색이 다툰다 — 색은 히트맵에만 남긴다.
            const strong = isSectorGroup || isHolding || isMine || isBenchmark
            return (
            <LTableRow key={etf.ticker} columns={COLUMNS} mobile={mobile}>
              <div style={{ display: 'flex', minWidth: 0 }}>
                <LBadge palette={tonePalettes.neutral} style={{ flexShrink: 0 }}>{GROUP_LABEL[etf.group] ?? etf.group}</LBadge>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                <span style={{
                  fontFamily: t.font.mono, fontWeight: strong ? t.weight.semibold : t.weight.medium,
                  fontSize: `calc(${t.type.control}px * var(--fz, 1))`, color: t.neutrals.text,
                }}>{etf.ticker.replace('.KS', '')}</span>
              </div>
              {!mobile && (
                <div style={{
                  fontSize: `calc(${t.type.control}px * var(--fz, 1))`, color: t.neutrals.muted,
                  whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
                }} title={etf.name}>
                  {etf.name}
                </div>
              )}
              {PERIODS.map(p => {
                const r = etf.returns[p]
                const c = returnColor(r)
                const clickable = r != null
                const open = () => setOpenChart({ ticker: etf.ticker, name: etf.name, period: p })
                // button 이 아니라 div 다. 카드 문법은 모든 button 의 배경을 벗겨 한 모양으로 만드는데,
                // 이 칸은 색이 곧 값이라 그러면 히트맵이 통째로 사라진다(2026-09-23 실제로 그랬다).
                return (
                  <div
                    key={p}
                    role={clickable ? 'button' : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    onClick={clickable ? open : undefined}
                    onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() } } : undefined}
                    style={{
                      padding: `${t.density.gapXs}px ${t.density.gapSm}px`, borderRadius: t.radius.sm,
                      background: c.bg, color: c.fg,
                      fontSize: `calc(${mobile ? 10 : 10.5}px * var(--fz, 1))`, fontWeight: t.weight.medium,
                      fontFamily: t.font.mono, textAlign: 'right' as const,
                      lineHeight: 1.4,
                      cursor: clickable ? 'pointer' : 'default',
                      transition: 'transform .08s',
                    }}
                    onMouseEnter={(e) => { if (clickable) e.currentTarget.style.transform = 'scale(1.05)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
                    title={clickable ? `${etf.ticker} ${p.toUpperCase()} 추이 차트 보기` : undefined}
                  >
                    {fmtPct(r)}
                  </div>
                )
              })}
            </LTableRow>
            )
          })}
          </LTableBody>
        </LTableScroll>
      )}

      {/* 발 줄 — 페이지 크기·이동 (보유종목과 같은 모양) */}
      {!loading && sorted.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: t.density.gapSm }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapXs }}>
            <LPageSize value={pageSize} onChange={applyPageSize} />
            <span style={{ color: t.neutrals.muted, fontSize: `calc(${t.type.helper}px * var(--fz, 1))` }}>{sorted.length}개</span>
          </div>
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm }}>
              {([
                { icon: 'chevronLeft' as const, disabled: safePage === 0, go: () => setPage(p => Math.max(0, p - 1)) },
                null,
                { icon: 'chevronRight' as const, disabled: safePage >= totalPages - 1, go: () => setPage(p => p + 1) },
              ]).map((b, i) => b ? (
                <button
                  key={b.icon}
                  disabled={b.disabled}
                  onClick={b.go}
                  style={{
                    background: 'transparent', border: 'none', padding: t.density.gapXs, borderRadius: t.radius.sm,
                    cursor: b.disabled ? 'default' : 'pointer',
                    color: b.disabled ? t.neutrals.line : t.neutrals.muted, opacity: b.disabled ? 0.4 : 1,
                  }}
                >
                  <LIcon name={b.icon} size={13} stroke={2} />
                </button>
              ) : (
                <span key={i} style={{ fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, fontFamily: t.font.mono, color: t.neutrals.muted }}>
                  {safePage * pageSize + 1}-{Math.min((safePage + 1) * pageSize, sorted.length)} / {sorted.length}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {!loading && sorted.length === 0 && (
        <div style={{ fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, color: t.neutrals.subtle, padding: `${t.density.pagePadX}px 0`, textAlign: 'center' as const }}>
          데이터가 없습니다. 수집 스크립트를 실행해 주세요.
        </div>
      )}

      {/* 쪽넘김 줄과 따로 둔다(CEO 2026-09-15). 이 카드는 기본 여백이라 발 줄을 여백만큼 밖으로 당겨
          구분선을 카드 끝까지 긋는다. 기준일은 머리 meta 에서 여기로 내렸다. */}
      {!loading && sorted.length > 0 && (
        <LCardFoot
          left="Yahoo 일별 종가 수집 · 보유 묶음은 종목 등가중 평균"
          right={latestDate ? `${latestDate} 종가` : `${sorted.length.toLocaleString()}개`}
          style={{
            marginTop: t.density.cardPad, marginLeft: -t.density.cardPad,
            marginRight: -t.density.cardPad, marginBottom: -t.density.cardPad,
            padding: `${t.density.panelPadY}px ${t.density.cardPad}px`,
          }}
        />
      )}

      {openChart && (
        <SectorRotationChartModal
          ticker={openChart.ticker}
          etfName={openChart.name}
          period={openChart.period}
          onClose={() => setOpenChart(null)}
        />
      )}
    </LCard>
  )
}
