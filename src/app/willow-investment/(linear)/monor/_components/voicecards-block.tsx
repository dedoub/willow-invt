'use client'

import { t, tonePalettes, useIsMobile } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'
import { LStat } from '@/app/willow-investment/_components/linear-stat'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import { LBtn } from '@/app/willow-investment/_components/linear-btn'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────

interface IAPStats {
  platform: 'ios' | 'android'
  date: string
  revenue: number
  currency: string
  activeSubscriptions: number
  newSubscriptions: number
  churnedSubscriptions: number
  renewedSubscriptions: number
  refundCount: number
  refundAmount: number
}

interface CombinedStats {
  ios: IAPStats | null
  android: IAPStats | null
  combined: {
    totalRevenue: number
    totalActiveSubscriptions: number
    totalNewSubscriptions: number
    totalChurnedSubscriptions: number
    totalRefunds: number
  }
  dateRange: { start: string; end: string }
}

interface ConnectionStatus {
  ios: { connected: boolean; appId?: string }
  android: { connected: boolean; packageName?: string }
}

interface ChartDataPoint {
  date: string
  ios: number
  android: number
  total: number
}

type DateRangeType = 'daily' | 'weekly' | 'monthly'

export interface VoicecardsBlockProps {
  loading: boolean
  connectionStatus: ConnectionStatus
  stats: CombinedStats | null
  chartData: ChartDataPoint[]
  dateRange: DateRangeType
  onDateRangeChange: (range: DateRangeType) => void
  onOpenSettings: () => void
  onRefresh: () => void
  refreshing: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)}억원`
  if (value >= 10000) return `${(value / 10000).toFixed(0)}만원`
  return `${value.toLocaleString()}원`
}

function formatNumber(value: number): string {
  return value.toLocaleString()
}

function formatChartDate(value: string): string {
  const d = new Date(value)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function formatTooltipDate(label: string): string {
  const d = new Date(label)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`
}

const DATE_RANGE_LABELS: Record<DateRangeType, string> = {
  daily: '일간', weekly: '주간', monthly: '월간',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function VoicecardsBlock({
  loading, connectionStatus, stats, chartData,
  dateRange, onDateRangeChange, onOpenSettings, onRefresh, refreshing,
}: VoicecardsBlockProps) {
  const mobile = useIsMobile()

  const netChange = stats
    ? stats.combined.totalNewSubscriptions - stats.combined.totalChurnedSubscriptions
    : 0

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 8 }}>
        <LSectionHead
          eyebrow="VOICECARDS"
          title="VoiceCards 인앱결제"
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {(['daily', 'weekly', 'monthly'] as DateRangeType[]).map(r => (
                <button
                  key={r}
                  onClick={() => onDateRangeChange(r)}
                  style={{
                    padding: '4px 10px', borderRadius: t.radius.pill,
                    fontSize: 11, fontFamily: t.font.sans,
                    fontWeight: dateRange === r ? t.weight.medium : t.weight.regular,
                    background: dateRange === r ? t.brand[100] : t.neutrals.inner,
                    color: dateRange === r ? t.brand[700] : t.neutrals.muted,
                    border: 'none', cursor: 'pointer', transition: 'all .12s',
                  }}
                >
                  {DATE_RANGE_LABELS[r]}
                </button>
              ))}
              <button
                onClick={onOpenSettings}
                style={{
                  width: 28, height: 28, borderRadius: t.radius.sm,
                  background: t.neutrals.inner, border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: t.neutrals.muted,
                }}
              >
                <LIcon name="settings" size={13} stroke={1.8} />
              </button>
              <button
                onClick={onRefresh}
                disabled={refreshing}
                style={{
                  width: 28, height: 28, borderRadius: t.radius.sm,
                  background: t.neutrals.inner, border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: t.neutrals.muted, opacity: refreshing ? 0.5 : 1,
                }}
              >
                <LIcon name="refresh" size={13} stroke={1.8} />
              </button>
            </div>
          }
        />

        {/* Connection Banner */}
        {!loading && (!connectionStatus.ios.connected || !connectionStatus.android.connected) && (
          <div style={{
            padding: '10px 12px', borderRadius: t.radius.md,
            background: tonePalettes.warn.bg, marginBottom: 10,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ color: tonePalettes.warn.fg, fontSize: 12 }}>
              {!connectionStatus.ios.connected && !connectionStatus.android.connected
                ? 'App Store Connect와 Google Play 모두 미연결'
                : !connectionStatus.ios.connected
                ? 'App Store Connect 미연결'
                : 'Google Play 미연결'}
            </span>
            <LBtn variant="ghost" size="sm" onClick={onOpenSettings}
              style={{ marginLeft: 'auto', fontSize: 11, color: tonePalettes.warn.fg }}
            >
              설정
            </LBtn>
          </div>
        )}

        {/* KPI row */}
        {loading ? (
          <SkeletonRow count={3} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
            <LStat
              label="총 매출"
              value={stats ? formatCurrency(stats.combined.totalRevenue) : '-'}
              sub={stats ? `iOS ${stats.ios ? formatCurrency(stats.ios.revenue) : '-'} · Android ${stats.android ? formatCurrency(stats.android.revenue) : '-'}` : undefined}
            />
            <LStat
              label="활성 구독자"
              value={stats ? formatNumber(stats.combined.totalActiveSubscriptions) : '-'}
              sub={stats ? `iOS ${stats.ios ? formatNumber(stats.ios.activeSubscriptions) : '-'} · Android ${stats.android ? formatNumber(stats.android.activeSubscriptions) : '-'}` : undefined}
              tone="info"
            />
            <LStat
              label="구독 순증감"
              value={stats ? `${netChange >= 0 ? '+' : ''}${formatNumber(netChange)}` : '-'}
              sub={stats ? `신규 ${formatNumber(stats.combined.totalNewSubscriptions)} · 해지 ${formatNumber(stats.combined.totalChurnedSubscriptions)}` : undefined}
              tone={netChange >= 0 ? 'pos' : 'neg'}
            />
          </div>
        )}
      </div>

      {/* Platform detail cards */}
      {!loading && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: mobile ? '1fr' : '1fr 1fr',
          gap: 0,
        }}>
          <PlatformCard
            name="App Store"
            connected={connectionStatus.ios.connected}
            stats={stats?.ios ?? null}
          />
          <PlatformCard
            name="Google Play"
            connected={connectionStatus.android.connected}
            stats={stats?.android ?? null}
            borderLeft={!mobile}
          />
        </div>
      )}

      {/* Revenue chart */}
      {!loading && chartData.length > 0 && (
        <div style={{ padding: `12px ${t.density.cardPad}px`, borderTop: `1px solid ${t.neutrals.line}` }}>
          <div style={{
            fontSize: 11, fontWeight: t.weight.medium, color: t.neutrals.subtle,
            fontFamily: t.font.mono, letterSpacing: 0.3,
            textTransform: 'uppercase' as const, marginBottom: 10,
          }}>
            매출 추이
          </div>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={t.neutrals.line} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: t.neutrals.muted }} tickFormatter={formatChartDate} />
                <YAxis tick={{ fontSize: 10, fill: t.neutrals.muted }} tickFormatter={(v: number) => v >= 10000 ? `${(v / 10000).toFixed(0)}만` : String(v)} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} labelFormatter={formatTooltipDate} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="ios" name="App Store" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="android" name="Google Play" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="total" name="합계" stroke="#6366f1" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </LCard>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PlatformCard({
  name, connected, stats, borderLeft,
}: {
  name: string; connected: boolean; stats: IAPStats | null; borderLeft?: boolean
}) {
  const style: React.CSSProperties = {
    padding: `12px ${t.density.cardPad}px`,
    borderTop: `1px solid ${t.neutrals.line}`,
    ...(borderLeft ? { borderLeft: `1px solid ${t.neutrals.line}` } : {}),
  }

  return (
    <div style={style}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: t.weight.medium, color: t.neutrals.text }}>
          {name}
        </div>
        <span style={{
          fontSize: 10, padding: '2px 7px', borderRadius: t.radius.pill,
          fontFamily: t.font.mono, fontWeight: 600,
          background: connected ? tonePalettes.pos.bg : t.neutrals.inner,
          color: connected ? tonePalettes.pos.fg : t.neutrals.muted,
        }}>
          {connected ? '연결됨' : '미연결'}
        </span>
      </div>

      {stats ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          <MetricCell label="매출" value={formatCurrency(stats.revenue)} />
          <MetricCell label="구독자" value={formatNumber(stats.activeSubscriptions)} />
          <MetricCell label="신규" value={`+${formatNumber(stats.newSubscriptions)}`} color={tonePalettes.pos.fg} />
          <MetricCell label="해지" value={`-${formatNumber(stats.churnedSubscriptions)}`} color={tonePalettes.neg.fg} />
          <MetricCell label="갱신" value={formatNumber(stats.renewedSubscriptions)} />
          <MetricCell label="환불" value={formatNumber(stats.refundCount)} color={tonePalettes.warn.fg} />
        </div>
      ) : (
        <div style={{ fontSize: 11, color: t.neutrals.muted, textAlign: 'center', padding: '12px 0' }}>
          데이터 없음
        </div>
      )}
    </div>
  )
}

function MetricCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      padding: '6px 8px', borderRadius: t.radius.sm, background: t.neutrals.inner,
    }}>
      <div style={{ fontSize: 9.5, color: t.neutrals.subtle, marginBottom: 2 }}>{label}</div>
      <div style={{
        fontSize: 13, fontWeight: 600, color: color ?? t.neutrals.text,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </div>
    </div>
  )
}

function SkeletonRow({ count }: { count: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${count}, 1fr)`, gap: 8, marginBottom: 10 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          height: 52, borderRadius: t.radius.sm, background: t.neutrals.inner,
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      ))}
    </div>
  )
}
