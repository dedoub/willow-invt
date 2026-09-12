'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea,
} from 'recharts'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LCardFoot } from '@/app/(dashboard)/_components/linear-card-foot'
import { LSectionHead, LHeadBtn } from '@/app/(dashboard)/_components/linear-section-head'
import { Bone } from '@/app/(dashboard)/_components/linear-skeleton'
import { LSegmented } from '@/app/(dashboard)/_components/linear-segmented'

/**
 * 권역 비교 — 강남3구와 서울 외곽(노도강·금관구)의 매매 추세.
 *
 * 위쪽 카드들과 보는 대상이 다르다. 저 카드들은 추적 22개 단지의 호가·실거래를 보고,
 * 여기는 아홉 개 구의 실거래 전량으로 만든 지수를 본다. 그래서 상단 필터(자치구·단지·평형)를
 * 따르지 않는다 — 권역 비교에서 단지를 골라내면 비교가 성립하지 않는다.
 *
 * 지수는 re_zone_index 매트뷰가 계산한다. 같은 단지·같은 평형끼리만 기준기간과 견줘,
 * 그달에 무엇이 팔렸는지(대형·신축 비중)가 값을 흔들지 못하게 한 값이다.
 * 계산 근거: supabase/migrations/20260913010000_re_zone_index.sql
 */

// 보이스카드 램프. 강남3구가 네이비, 외곽 둘은 회색 명도차.
const ZONE_COLORS: Record<string, string> = {
  '강남3구': '#0E415A',
  '노도강': '#5B6B74',
  '금관구': '#8D959D',
}

interface ZonePoint { idx: number; cells: number; trades: number }
interface ZoneRow { month: string; provisional: boolean; zones: Record<string, ZonePoint> }

interface ZoneIndexResponse {
  series: ZoneRow[]
  zones: string[]
  baseLabel: string
  basis: string
}

function fmtMonth(m: string) {
  return `${m.slice(2, 4)}/${m.slice(5, 7)}`
}

export function ZoneIndexCard() {
  const mobile = useIsMobile()
  const [data, setData] = useState<ZoneIndexResponse | null>(null)
  const [loading, setLoading] = useState(true)
  // 월별 지수는 강남3구에서 달마다 5포인트씩 튄다(2026-04 114.3 → 06 119.3 → 08 122.4).
  // 방향을 보려는 화면이라 3개월 평균을 기본으로 두고, 원값은 눌러서 본다.
  const [smooth, setSmooth] = useState<'ma3' | 'raw'>('ma3')

  // 첫 로드는 loading 초기값이 이미 true 라 다시 세우지 않는다 — 효과 안에서 동기로
  // setState 하면 렌더가 한 번 더 돈다(react-hooks). 버튼으로 부를 때만 다시 켠다.
  const fetchIndex = useCallback(() => {
    fetch('/api/willow-mgmt/real-estate?type=zone-index')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.series) setData(d) })
      .catch(err => console.error('zone index load error:', err))
      .finally(() => setLoading(false))
  }, [])

  const load = () => { setLoading(true); fetchIndex() }

  useEffect(() => { fetchIndex() }, [fetchIndex])

  const zones = data?.zones ?? []
  const series = data?.series ?? []
  const chartData = series.map((r, i) => {
    const row: Record<string, string | number | null> = { month: r.month }
    for (const z of zones) {
      const raw = r.zones[z]?.idx ?? null
      if (smooth === 'raw' || raw === null) { row[z] = raw; continue }
      // 앞이 모자라는 첫 두 달은 있는 만큼만 평균낸다 — 잘라 버리면 선이 늦게 시작한다.
      const window = series.slice(Math.max(0, i - 2), i + 1)
        .map(w => w.zones[z]?.idx)
        .filter((v): v is number => typeof v === 'number')
      row[z] = window.length ? Math.round((window.reduce((a, b) => a + b, 0) / window.length) * 10) / 10 : null
    }
    return row
  })

  // 최근 두 달은 신고지연으로 계속 채워진다 — 확정 구간과 눈으로 갈라 둔다.
  const firstProvisional = data?.series.find(r => r.provisional)?.month
  const lastMonth = data?.series[data.series.length - 1]?.month

  // 마지막 확정 달에서 강남3구와 외곽의 거리. 이 카드가 답하려는 질문이다.
  const lastFinal = [...(data?.series ?? [])].reverse().find(r => !r.provisional)
  const core = lastFinal?.zones['강남3구']?.idx
  const outer = ['노도강', '금관구']
    .map(z => lastFinal?.zones[z]?.idx)
    .filter((v): v is number => typeof v === 'number')
  const outerAvg = outer.length ? outer.reduce((a, b) => a + b, 0) / outer.length : undefined
  const spread = core !== undefined && outerAvg !== undefined
    ? Math.round((core - outerAvg) * 10) / 10
    : undefined

  const totalTrades = (data?.series ?? []).reduce(
    (sum, r) => sum + zones.reduce((s, z) => s + (r.zones[z]?.trades ?? 0), 0), 0,
  )

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: t.density.blockGap }}>
        <LSectionHead
          title="권역 비교"
          mb={t.density.panelPadY + t.density.panelPadX}
          meta={data?.baseLabel}
          tools={
            <LSegmented
              value={smooth}
              onChange={setSmooth}
              options={[
                { value: 'ma3' as const, label: '3개월 평균' },
                { value: 'raw' as const, label: '월별' },
              ]}
            />
          }
          action={<LHeadBtn icon="refresh" title="데이터 새로고침" onClick={load} busy={loading} />}
        />

        {loading && !data ? (
          <div>
            <Bone w={120} h={9} style={{ marginBottom: t.density.kpiGap }} />
            <Bone h={220} />
          </div>
        ) : chartData.length === 0 ? (
          <div style={{ padding: '40px 14px', textAlign: 'center', fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, color: t.neutrals.subtle }}>
            지수를 만들 거래가 아직 없습니다
          </div>
        ) : (
          <div data-panel="">
            <div style={{
              display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
              gap: t.density.gapSm, marginBottom: t.density.gapXs,
            }}>
              <span
                data-panel-title=""
                title="같은 단지·같은 평형의 거래만 기준기간과 견준다. 그달에 대형·신축이 많이 팔려도 지수는 흔들리지 않는다."
                style={{
                  fontSize: `calc(${t.type.control}px * var(--fz, 1))`, fontWeight: t.weight.medium,
                  color: t.neutrals.muted, cursor: 'help',
                }}
              >
                매매가 지수{smooth === 'ma3' ? ' · 3개월 평균' : ''}
              </span>
              {spread !== undefined && (
                <span style={{ fontSize: `calc(${t.type.tableHead}px * var(--fz, 1))`, color: t.neutrals.subtle, fontFamily: t.font.mono }}>
                  강남3구 −외곽 {spread > 0 ? '+' : ''}{spread.toFixed(1)}p
                </span>
              )}
            </div>

            <ResponsiveContainer width="100%" height={mobile ? 200 : 240}>
              <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={t.chart.grid} />
                <XAxis
                  dataKey="month" tickFormatter={fmtMonth}
                  tick={{ fontSize: `calc(${t.type.tableHead}px * var(--fz, 1))`, fill: t.neutrals.subtle }}
                  axisLine={false} tickLine={false} interval="preserveStartEnd"
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tickFormatter={(v: number) => String(Math.round(v))}
                  tick={{ fontSize: `calc(${t.type.tableHead}px * var(--fz, 1))`, fill: t.neutrals.subtle }}
                  axisLine={false} tickLine={false} width={34}
                />
                <Tooltip
                  contentStyle={{
                    background: t.neutrals.card, border: `1px solid ${t.neutrals.line}`,
                    borderRadius: t.radius.sm, fontSize: `calc(${t.type.control}px * var(--fz, 1))`,
                    fontFamily: t.font.sans,
                  }}
                  labelFormatter={(v) => String(v)}
                  formatter={(value, name) => [`${Number(value).toFixed(1)}`, String(name)]}
                />
                {/* 기준선 — 기준기간이 100 */}
                <ReferenceLine y={100} stroke={t.neutrals.line} strokeDasharray="3 3" />
                {/* 신고가 아직 들어오는 구간은 배경으로 덜어 둔다 */}
                {firstProvisional && lastMonth && (
                  <ReferenceArea
                    x1={firstProvisional} x2={lastMonth}
                    fill={t.neutrals.inner} fillOpacity={0.9} stroke="none"
                    label={{ value: '신고 진행중', position: 'insideTop', fontSize: `calc(${t.type.tableHead}px * var(--fz, 1))`, fill: t.neutrals.subtle }}
                  />
                )}
                {zones.map(z => (
                  <Line
                    key={z} type="monotone" dataKey={z} name={z}
                    stroke={ZONE_COLORS[z] ?? t.chart.mono}
                    strokeWidth={1.5} dot={false} connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>

            <div style={{
              display: 'flex', flexWrap: 'wrap', alignItems: 'center',
              gap: `${t.density.tableRowGap}px ${t.density.kpiGap}px`, marginTop: t.density.gapXs,
            }}>
              {zones.map(z => (
                <span key={z} style={{
                  fontSize: `calc(${t.type.tableHead}px * var(--fz, 1))`, color: t.neutrals.muted,
                  display: 'flex', alignItems: 'center', gap: t.density.gapXs,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: ZONE_COLORS[z] ?? t.chart.mono, display: 'inline-block' }} />
                  {z}
                </span>
              ))}
              <span style={{ fontSize: `calc(${t.type.tableHead}px * var(--fz, 1))`, color: t.neutrals.subtle, marginLeft: 'auto' }}>
                노도강 = 노원·도봉·강북 · 금관구 = 금천·관악·구로
              </span>
            </div>
          </div>
        )}
      </div>

      <LCardFoot
        left={data?.basis ?? '구 전체 실거래 · 추적 단지와 무관'}
        right={totalTrades ? `${totalTrades.toLocaleString()}건` : undefined}
        style={{ marginTop: 0, padding: `${t.density.panelPadY}px ${t.density.cardPad}px` }}
      />
    </LCard>
  )
}
