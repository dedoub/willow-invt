# MonoR Apps 통합 페이지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** VoiceCards(IAP 통계)와 ReviewNotes(SaaS 매출+유저 통계)를 하나의 Linear 스타일 페이지로 통합한다.

**Architecture:** 기존 `/api/voicecards/stats`, `/api/reviewnotes/stats` API를 그대로 사용하고, Linear 디자인 토큰(`t.*`)과 프리미티브(`LCard`, `LSectionHead`, `LStat`, `LBtn`, `LIcon`)로 UI를 구성한다. 세로 스택 레이아웃으로 VoiceCards 블록 → ReviewNotes 블록 순서로 배치한다.

**Tech Stack:** Next.js App Router, React, recharts (차트), Linear design tokens (inline styles)

---

## File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| Modify | `src/app/willow-investment/_components/linear-sidebar.tsx:89-92` | monor href 추가 |
| Modify | `src/app/willow-investment/(linear)/layout.tsx:24-30` | PAGE_TITLES에 monor 추가 |
| Create | `src/app/willow-investment/(linear)/monor/page.tsx` | 데이터 로딩, 상태 관리, 블록 조립 |
| Create | `src/app/willow-investment/(linear)/monor/_components/voicecards-block.tsx` | VoiceCards KPI, 플랫폼 상세, 차트, 배너 |
| Create | `src/app/willow-investment/(linear)/monor/_components/voicecards-settings-dialog.tsx` | API 인증 설정 모달 |
| Create | `src/app/willow-investment/(linear)/monor/_components/reviewnotes-block.tsx` | ReviewNotes KPI, 주문, 구독, 유저 통계 |

---

### Task 1: Route scaffolding — sidebar link + layout title + empty page

**Files:**
- Modify: `src/app/willow-investment/_components/linear-sidebar.tsx:89-92`
- Modify: `src/app/willow-investment/(linear)/layout.tsx:24-30`
- Create: `src/app/willow-investment/(linear)/monor/page.tsx`

- [ ] **Step 1: Add monor href to sidebar**

In `src/app/willow-investment/_components/linear-sidebar.tsx`, find lines 88-108 where CLIENTS are rendered. Currently `monor` has no href. Update the href logic:

```tsx
          const href = c.id === 'akros' ? '/willow-investment/akros'
            : c.id === 'etc' ? '/willow-investment/etc'
            : c.id === 'tensw' ? '/willow-investment/tensw'
            : c.id === 'monor' ? '/willow-investment/monor'
            : undefined
```

- [ ] **Step 2: Add monor to PAGE_TITLES**

In `src/app/willow-investment/(linear)/layout.tsx`, add to the `PAGE_TITLES` object:

```tsx
const PAGE_TITLES: Record<string, string> = {
  '/willow-investment/mgmt': '사업관리',
  '/willow-investment/invest': '투자관리',
  '/willow-investment/wiki': '업무위키',
  '/willow-investment/ryuha': '류하일정',
  '/willow-investment/tensw': '텐소프트웍스',
  '/willow-investment/monor': 'MonoR Apps',
}
```

- [ ] **Step 3: Create empty page**

Create `src/app/willow-investment/(linear)/monor/page.tsx`:

```tsx
'use client'

import { t } from '@/app/willow-investment/_components/linear-tokens'

export default function MonorPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
      <div style={{ fontSize: 13, color: t.neutrals.muted, textAlign: 'center', padding: 40 }}>
        MonoR Apps 페이지 준비 중...
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify in browser**

Run: `open http://localhost:3000/willow-investment/monor`

Expected: Sidebar shows MonoR Apps as clickable link (green dot, active state), header shows "MonoR Apps", page shows placeholder text.

- [ ] **Step 5: Commit**

```bash
git add src/app/willow-investment/_components/linear-sidebar.tsx \
  src/app/willow-investment/\(linear\)/layout.tsx \
  src/app/willow-investment/\(linear\)/monor/page.tsx
git commit -m "feat: scaffold MonoR Apps route with sidebar link"
```

---

### Task 2: VoiceCards Settings Dialog

**Files:**
- Create: `src/app/willow-investment/(linear)/monor/_components/voicecards-settings-dialog.tsx`

- [ ] **Step 1: Create the settings dialog**

Create `src/app/willow-investment/(linear)/monor/_components/voicecards-settings-dialog.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LBtn } from '@/app/willow-investment/_components/linear-btn'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'

interface VoicecardsSettingsDialogProps {
  open: boolean
  onClose: () => void
  onSave: () => void
}

const inputBase: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 13,
  fontFamily: t.font.sans, fontWeight: t.weight.regular,
  background: t.neutrals.inner, color: t.neutrals.text,
  border: 'none', borderRadius: t.radius.sm, outline: 'none',
  boxSizing: 'border-box',
}

const textareaBase: React.CSSProperties = {
  ...inputBase, resize: 'vertical' as const, lineHeight: 1.5,
  fontFamily: t.font.mono, fontSize: 11,
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: t.weight.medium, color: t.neutrals.subtle,
      fontFamily: t.font.sans, marginBottom: 5,
    }}>
      {children}
    </div>
  )
}

export function VoicecardsSettingsDialog({ open, onClose, onSave }: VoicecardsSettingsDialogProps) {
  const [saving, setSaving] = useState(false)

  // iOS
  const [iosIssuerId, setIosIssuerId] = useState('')
  const [iosKeyId, setIosKeyId] = useState('')
  const [iosPrivateKey, setIosPrivateKey] = useState('')
  const [iosAppId, setIosAppId] = useState('')

  // Android
  const [androidServiceAccount, setAndroidServiceAccount] = useState('')
  const [androidPackageName, setAndroidPackageName] = useState('')

  if (!open) return null

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/voicecards/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ios_issuer_id: iosIssuerId || null,
          ios_key_id: iosKeyId || null,
          ios_private_key: iosPrivateKey || null,
          ios_app_id: iosAppId || null,
          android_service_account: androidServiceAccount || null,
          android_package_name: androidPackageName || null,
        }),
      })
      if (res.ok) {
        onSave()
        onClose()
      }
    } catch (err) {
      console.error('Error saving credentials:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,15,18,0.18)', backdropFilter: 'blur(3px)' }} />

      <div style={{
        position: 'relative', width: 520, maxHeight: '85vh',
        background: t.neutrals.card, borderRadius: t.radius.lg + 2,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{
              fontSize: 10, fontFamily: t.font.mono, fontWeight: 600,
              color: t.neutrals.subtle, letterSpacing: 0.6,
              textTransform: 'uppercase' as const, marginBottom: 2,
            }}>API SETTINGS</div>
            <div style={{ fontSize: 15, fontWeight: t.weight.semibold, fontFamily: t.font.sans, color: t.neutrals.text }}>
              VoiceCards API 설정
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: t.radius.sm,
            background: t.neutrals.inner, border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.neutrals.muted,
          }}>
            <LIcon name="x" size={14} stroke={2} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '0 20px 16px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* iOS Section */}
          <div>
            <div style={{ fontSize: 12, fontWeight: t.weight.medium, color: t.neutrals.text, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 14 }}>&#63743;</span> App Store Connect API
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 12 }}>
              <div>
                <Label>Issuer ID</Label>
                <input value={iosIssuerId} onChange={e => setIosIssuerId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" style={inputBase} />
              </div>
              <div>
                <Label>Key ID</Label>
                <input value={iosKeyId} onChange={e => setIosKeyId(e.target.value)} placeholder="XXXXXXXXXX" style={inputBase} />
              </div>
              <div>
                <Label>Private Key (.p8)</Label>
                <textarea value={iosPrivateKey} onChange={e => setIosPrivateKey(e.target.value)} placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----" rows={3} style={textareaBase} />
              </div>
              <div>
                <Label>App ID (Vendor Number)</Label>
                <input value={iosAppId} onChange={e => setIosAppId(e.target.value)} placeholder="123456789" style={inputBase} />
              </div>
            </div>
          </div>

          {/* Android Section */}
          <div>
            <div style={{ fontSize: 12, fontWeight: t.weight.medium, color: t.neutrals.text, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <LIcon name="message" size={14} /> Google Play Developer API
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 12 }}>
              <div>
                <Label>Service Account JSON</Label>
                <textarea value={androidServiceAccount} onChange={e => setAndroidServiceAccount(e.target.value)} placeholder='{"type": "service_account", ...}' rows={3} style={textareaBase} />
              </div>
              <div>
                <Label>Package Name</Label>
                <input value={androidPackageName} onChange={e => setAndroidPackageName(e.target.value)} placeholder="com.example.app" style={inputBase} />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', background: t.neutrals.inner,
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8,
        }}>
          <LBtn variant="ghost" size="sm" onClick={onClose}>취소</LBtn>
          <LBtn variant="brand" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </LBtn>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/willow-investment/\(linear\)/monor/_components/voicecards-settings-dialog.tsx
git commit -m "feat: add VoiceCards API settings dialog (Linear style)"
```

---

### Task 3: VoiceCards Block

**Files:**
- Create: `src/app/willow-investment/(linear)/monor/_components/voicecards-block.tsx`

This block receives data from the parent page and renders: connection banner, KPIs, platform detail cards, and revenue chart.

- [ ] **Step 1: Create voicecards-block.tsx**

Create `src/app/willow-investment/(linear)/monor/_components/voicecards-block.tsx`:

```tsx
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

interface VoicecardsBlockProps {
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
              {/* Date range chips */}
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
            icon="&#63743;"
            connected={connectionStatus.ios.connected}
            stats={stats?.ios ?? null}
          />
          <PlatformCard
            name="Google Play"
            icon={null}
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
                <YAxis tick={{ fontSize: 10, fill: t.neutrals.muted }} tickFormatter={v => v >= 10000 ? `${(v / 10000).toFixed(0)}만` : String(v)} />
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
  name, icon, connected, stats, borderLeft,
}: {
  name: string; icon: string | null; connected: boolean; stats: IAPStats | null; borderLeft?: boolean
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
          {icon ? <span style={{ fontSize: 14 }}>{icon}</span> : <LIcon name="message" size={13} />}
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
```

- [ ] **Step 2: Commit**

```bash
git add src/app/willow-investment/\(linear\)/monor/_components/voicecards-block.tsx
git commit -m "feat: add VoiceCards block with KPIs, platform detail, and chart"
```

---

### Task 4: ReviewNotes Block

**Files:**
- Create: `src/app/willow-investment/(linear)/monor/_components/reviewnotes-block.tsx`

- [ ] **Step 1: Create reviewnotes-block.tsx**

Create `src/app/willow-investment/(linear)/monor/_components/reviewnotes-block.tsx`:

```tsx
'use client'

import { t, tonePalettes, useIsMobile } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'
import { LStat } from '@/app/willow-investment/_components/linear-stat'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import type { ReviewNotesStats, LemonSqueezyOrder, LemonSqueezySubscription } from '@/lib/lemonsqueezy'
import type { ReviewNotesUserStats } from '@/lib/reviewnotes-supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReviewnotesBlockProps {
  loading: boolean
  stats: ReviewNotesStats | null
  recentOrders: LemonSqueezyOrder[]
  subscriptions: LemonSqueezySubscription[]
  userStats: ReviewNotesUserStats | null
  onRefresh: () => void
  refreshing: boolean
  error: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(value / 100)
}

function formatNumber(value: number): string {
  return value.toLocaleString()
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

const SUB_STATUS_TONES: Record<string, { bg: string; fg: string }> = {
  active:    tonePalettes.pos,
  on_trial:  tonePalettes.info,
  cancelled: tonePalettes.neg,
  expired:   tonePalettes.neg,
  paused:    tonePalettes.warn,
  past_due:  tonePalettes.warn,
  unpaid:    tonePalettes.warn,
}

const ORDER_STATUS_TONES: Record<string, { bg: string; fg: string }> = {
  paid:     tonePalettes.pos,
  pending:  tonePalettes.warn,
  refunded: tonePalettes.neg,
  failed:   tonePalettes.neg,
}

const PLAN_TONES: Record<string, { bg: string; fg: string }> = {
  FREE:     { bg: t.neutrals.inner, fg: t.neutrals.muted },
  BASIC:    tonePalettes.info,
  STANDARD: { bg: '#EDE9FE', fg: '#7C3AED' },
  PRO:      tonePalettes.pos,
}

function getTone(map: Record<string, { bg: string; fg: string }>, key: string) {
  return map[key] ?? tonePalettes.neutral
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReviewnotesBlock({
  loading, stats, recentOrders, subscriptions, userStats,
  onRefresh, refreshing, error,
}: ReviewnotesBlockProps) {
  const mobile = useIsMobile()
  const activeSubscribers = subscriptions.filter(s => s.attributes.status === 'active')

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 8 }}>
        <LSectionHead
          eyebrow="REVIEWNOTES"
          title="ReviewNotes 매출 현황"
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <a
                href="https://app.lemonsqueezy.com/products"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  width: 28, height: 28, borderRadius: t.radius.sm,
                  background: t.neutrals.inner, border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: t.neutrals.muted, textDecoration: 'none',
                }}
              >
                <LIcon name="trending" size={13} stroke={1.8} />
              </a>
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

        {/* Error */}
        {error && (
          <div style={{
            padding: '8px 12px', borderRadius: t.radius.md,
            background: tonePalettes.neg.bg, color: tonePalettes.neg.fg,
            fontSize: 11, marginBottom: 10,
          }}>
            {error}
          </div>
        )}

        {/* KPI row */}
        {loading ? (
          <SkeletonRow count={4} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
            <LStat label="총 매출" value={stats ? formatCurrency(stats.totalRevenueUSD) : '-'} sub={stats ? `이번 달 ${formatCurrency(stats.monthlyRevenueUSD)}` : undefined} />
            <LStat label="MRR" value={stats ? formatCurrency(stats.mrr) : '-'} sub="월간 반복 매출" tone="info" />
            <LStat label="활성 구독자" value={stats ? formatNumber(stats.activeSubscriptions) : '-'} sub={stats ? `체험 ${stats.trialSubscriptions} · 취소 ${stats.cancelledSubscriptions}` : undefined} tone="pos" />
            <LStat label="총 고객" value={stats ? formatNumber(stats.totalCustomers) : '-'} sub={stats ? `이번 달 +${stats.newCustomersThisMonth}` : undefined} />
          </div>
        )}
      </div>

      {/* Orders + Subscribers 2-col */}
      {!loading && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: mobile ? '1fr' : '1fr 1fr',
          gap: 0,
        }}>
          {/* Recent Orders */}
          <div style={{ padding: `12px ${t.density.cardPad}px`, borderTop: `1px solid ${t.neutrals.line}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: t.neutrals.subtle, fontFamily: t.font.mono, letterSpacing: 0.3, textTransform: 'uppercase' as const }}>
                최근 주문
              </div>
              <span style={{ fontSize: 10, color: t.neutrals.muted, fontFamily: t.font.mono }}>
                총 {stats?.totalOrders ?? 0}건
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
              {recentOrders.length === 0 && (
                <div style={{ fontSize: 11, color: t.neutrals.muted, textAlign: 'center', padding: '12px 0' }}>주문 없음</div>
              )}
              {recentOrders.slice(0, 10).map(order => {
                const tone = getTone(ORDER_STATUS_TONES, order.attributes.status)
                return (
                  <div key={order.id} style={{
                    padding: '6px 8px', borderRadius: t.radius.sm, background: t.neutrals.inner,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 500, color: t.neutrals.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {order.attributes.user_name || order.attributes.user_email}
                      </div>
                      <div style={{ fontSize: 9.5, color: t.neutrals.muted }}>
                        {order.attributes.first_order_item?.product_name || 'Product'} · {formatDate(order.attributes.created_at)}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 9, padding: '2px 6px', borderRadius: t.radius.sm,
                      background: tone.bg, color: tone.fg, fontWeight: 600, flexShrink: 0,
                    }}>
                      {order.attributes.status_formatted}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 500, color: t.neutrals.text, flexShrink: 0, fontFamily: t.font.mono }}>
                      {order.attributes.total_formatted}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Active Subscribers */}
          <div style={{
            padding: `12px ${t.density.cardPad}px`,
            borderTop: `1px solid ${t.neutrals.line}`,
            ...(mobile ? {} : { borderLeft: `1px solid ${t.neutrals.line}` }),
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: t.neutrals.subtle, fontFamily: t.font.mono, letterSpacing: 0.3, textTransform: 'uppercase' as const }}>
                활성 구독자
              </div>
              <span style={{ fontSize: 10, color: t.neutrals.muted, fontFamily: t.font.mono }}>
                {activeSubscribers.length}명
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
              {activeSubscribers.length === 0 && (
                <div style={{ fontSize: 11, color: t.neutrals.muted, textAlign: 'center', padding: '12px 0' }}>활성 구독자 없음</div>
              )}
              {activeSubscribers.map(sub => {
                const tone = getTone(SUB_STATUS_TONES, sub.attributes.status)
                return (
                  <div key={sub.id} style={{
                    padding: '6px 8px', borderRadius: t.radius.sm, background: t.neutrals.inner,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 500, color: t.neutrals.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {sub.attributes.user_name || sub.attributes.user_email}
                      </div>
                      <div style={{ fontSize: 9.5, color: t.neutrals.muted }}>
                        {sub.attributes.product_name} · {sub.attributes.variant_name}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 9, padding: '2px 6px', borderRadius: t.radius.sm,
                      background: tone.bg, color: tone.fg, fontWeight: 600, flexShrink: 0,
                    }}>
                      {sub.attributes.status_formatted}
                    </span>
                    <span style={{ fontSize: 9.5, color: t.neutrals.muted, flexShrink: 0 }}>
                      갱신 {formatDate(sub.attributes.renews_at)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Order stats row */}
      {!loading && stats && (
        <div style={{ padding: `12px ${t.density.cardPad}px`, borderTop: `1px solid ${t.neutrals.line}` }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <LStat label="이번 달 주문" value={String(stats.ordersThisMonth)} />
            <LStat label="총 주문" value={String(stats.totalOrders)} />
            <LStat label="환불" value={String(stats.refundedOrders)} tone="neg" />
          </div>
        </div>
      )}

      {/* User stats section */}
      {!loading && userStats && (
        <>
          <div style={{ padding: `12px ${t.density.cardPad}px 8px`, borderTop: `1px solid ${t.neutrals.line}` }}>
            <div style={{
              fontSize: 11, fontWeight: 600, color: t.neutrals.subtle,
              fontFamily: t.font.mono, letterSpacing: 0.3,
              textTransform: 'uppercase' as const, marginBottom: 10,
            }}>
              앱 유저 통계
            </div>

            {/* User KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
              <LStat label="총 가입자" value={String(userStats.totalUsers)} sub={`이번 달 +${userStats.newUsersThisMonth} · 이번 주 +${userStats.newUsersThisWeek}`} />
              <PlanStat userStats={userStats} />
              <LStat label="관리자" value={String(userStats.adminUsers)} sub="Admin 권한" />
              <LStat label="스토리지" value={`${(userStats.totalStorageUsed / (1024 * 1024)).toFixed(1)} MB`} sub="유저 업로드" />
            </div>
          </div>

          {/* Recent users list */}
          <div style={{ padding: `0 ${t.density.cardPad}px 12px` }}>
            <div style={{
              fontSize: 11, fontWeight: 600, color: t.neutrals.subtle,
              fontFamily: t.font.mono, letterSpacing: 0.3,
              textTransform: 'uppercase' as const, marginBottom: 8,
            }}>
              최근 가입자
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 280, overflowY: 'auto' }}>
              {userStats.users.slice(0, 10).map(user => {
                const planTone = getTone(PLAN_TONES, user.subscriptionPlan)
                return (
                  <div key={user.id} style={{
                    padding: '6px 8px', borderRadius: t.radius.sm, background: t.neutrals.inner,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    {/* Avatar */}
                    <div style={{
                      width: 26, height: 26, borderRadius: 26, flexShrink: 0,
                      background: t.brand[200], color: t.brand[800],
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 600, overflow: 'hidden',
                    }}>
                      {user.image
                        ? <img src={user.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : (user.name?.charAt(0) || user.email.charAt(0)).toUpperCase()
                      }
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 500, color: t.neutrals.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {user.name || 'Unknown'}
                      </div>
                      <div style={{ fontSize: 9.5, color: t.neutrals.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {user.email}
                      </div>
                    </div>

                    <span style={{
                      fontSize: 9, padding: '2px 6px', borderRadius: t.radius.sm,
                      background: planTone.bg, color: planTone.fg, fontWeight: 600, flexShrink: 0,
                    }}>
                      {user.subscriptionPlan}
                    </span>

                    {user.role === 'ADMIN' && (
                      <span style={{
                        fontSize: 9, padding: '2px 6px', borderRadius: t.radius.sm,
                        background: tonePalettes.warn.bg, color: tonePalettes.warn.fg, fontWeight: 600, flexShrink: 0,
                      }}>
                        Admin
                      </span>
                    )}

                    <span style={{ fontSize: 9.5, color: t.neutrals.muted, flexShrink: 0 }}>
                      {formatDate(user.createdAt)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </LCard>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PlanStat({ userStats }: { userStats: ReviewNotesUserStats }) {
  return (
    <div style={{
      background: t.neutrals.inner, borderRadius: t.radius.sm, padding: '8px 10px',
    }}>
      <div style={{
        fontSize: 9.5, fontFamily: t.font.mono, letterSpacing: 0.8,
        textTransform: 'uppercase' as const, color: t.neutrals.subtle, marginBottom: 4,
      }}>플랜별</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {[
          { plan: 'FREE', count: userStats.freeUsers },
          { plan: 'BASIC', count: userStats.basicUsers },
          { plan: 'STANDARD', count: userStats.standardUsers },
          { plan: 'PRO', count: userStats.proUsers },
        ].filter(p => p.count > 0).map(p => {
          const tone = getTone(PLAN_TONES, p.plan)
          return (
            <span key={p.plan} style={{
              fontSize: 9, padding: '2px 5px', borderRadius: t.radius.sm,
              background: tone.bg, color: tone.fg, fontWeight: 500,
            }}>
              {p.plan} {p.count}
            </span>
          )
        })}
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
```

- [ ] **Step 2: Commit**

```bash
git add src/app/willow-investment/\(linear\)/monor/_components/reviewnotes-block.tsx
git commit -m "feat: add ReviewNotes block with KPIs, orders, subscribers, user stats"
```

---

### Task 5: Page Assembly — wire blocks + data loading

**Files:**
- Modify: `src/app/willow-investment/(linear)/monor/page.tsx`

- [ ] **Step 1: Rewrite page.tsx with data loading and block assembly**

Replace contents of `src/app/willow-investment/(linear)/monor/page.tsx`:

```tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useIsMobile } from '@/app/willow-investment/_components/linear-tokens'
import { VoicecardsBlock } from './_components/voicecards-block'
import { VoicecardsSettingsDialog } from './_components/voicecards-settings-dialog'
import { ReviewnotesBlock } from './_components/reviewnotes-block'
import type { ReviewNotesStats, LemonSqueezyOrder, LemonSqueezySubscription } from '@/lib/lemonsqueezy'
import type { ReviewNotesUserStats } from '@/lib/reviewnotes-supabase'

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDateRange(type: DateRangeType): { start: string; end: string } {
  const end = new Date()
  const start = new Date()
  switch (type) {
    case 'daily': start.setDate(end.getDate() - 7); break
    case 'weekly': start.setDate(end.getDate() - 30); break
    case 'monthly': start.setMonth(end.getMonth() - 6); break
  }
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MonorPage() {
  const mobile = useIsMobile()

  // VoiceCards state
  const [vcLoading, setVcLoading] = useState(true)
  const [vcRefreshing, setVcRefreshing] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    ios: { connected: false }, android: { connected: false },
  })
  const [vcStats, setVcStats] = useState<CombinedStats | null>(null)
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [dateRange, setDateRange] = useState<DateRangeType>('weekly')
  const [settingsOpen, setSettingsOpen] = useState(false)

  // ReviewNotes state
  const [rnLoading, setRnLoading] = useState(true)
  const [rnRefreshing, setRnRefreshing] = useState(false)
  const [rnStats, setRnStats] = useState<ReviewNotesStats | null>(null)
  const [recentOrders, setRecentOrders] = useState<LemonSqueezyOrder[]>([])
  const [subscriptions, setSubscriptions] = useState<LemonSqueezySubscription[]>([])
  const [userStats, setUserStats] = useState<ReviewNotesUserStats | null>(null)
  const [rnError, setRnError] = useState<string | null>(null)

  // ─── Data loading ─────────────────────────────────────────────────────────

  const loadVoicecards = useCallback(async (refresh = false) => {
    if (refresh) setVcRefreshing(true)
    else setVcLoading(true)
    try {
      const range = getDateRange(dateRange)
      const res = await fetch(`/api/voicecards/stats?startDate=${range.start}&endDate=${range.end}`)
      if (res.ok) {
        const data = await res.json()
        setConnectionStatus(data.connection)
        setVcStats(data.stats)
        setChartData(data.chartData || [])
      }
    } catch (err) {
      console.error('VoiceCards load error:', err)
    } finally {
      setVcLoading(false)
      setVcRefreshing(false)
    }
  }, [dateRange])

  const loadReviewnotes = useCallback(async (refresh = false) => {
    if (refresh) setRnRefreshing(true)
    else setRnLoading(true)
    setRnError(null)
    try {
      const res = await fetch('/api/reviewnotes/stats')
      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.message || 'Failed to fetch')
      }
      const data = await res.json()
      setRnStats(data.stats)
      setRecentOrders(data.recentOrders || [])
      setSubscriptions(data.subscriptions || [])
      setUserStats(data.userStats || null)
    } catch (err) {
      console.error('ReviewNotes load error:', err)
      setRnError(String(err))
    } finally {
      setRnLoading(false)
      setRnRefreshing(false)
    }
  }, [])

  useEffect(() => { loadVoicecards() }, [loadVoicecards])
  useEffect(() => { loadReviewnotes() }, [loadReviewnotes])

  const handleDateRangeChange = (range: DateRangeType) => {
    setDateRange(range)
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
      <VoicecardsBlock
        loading={vcLoading}
        connectionStatus={connectionStatus}
        stats={vcStats}
        chartData={chartData}
        dateRange={dateRange}
        onDateRangeChange={handleDateRangeChange}
        onOpenSettings={() => setSettingsOpen(true)}
        onRefresh={() => loadVoicecards(true)}
        refreshing={vcRefreshing}
      />

      <ReviewnotesBlock
        loading={rnLoading}
        stats={rnStats}
        recentOrders={recentOrders}
        subscriptions={subscriptions}
        userStats={userStats}
        onRefresh={() => loadReviewnotes(true)}
        refreshing={rnRefreshing}
        error={rnError}
      />

      <VoicecardsSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSave={() => loadVoicecards(true)}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Run: `open http://localhost:3000/willow-investment/monor`

Expected:
- VoiceCards 블록: KPI 3칸, 날짜 필터, 플랫폼 상세 카드 2열, 매출 추이 차트
- ReviewNotes 블록: KPI 4칸, 최근 주문/활성 구독자 2열, 주문 통계, 유저 통계, 최근 가입자
- 설정 버튼 클릭 → 모달 열림
- 새로고침 버튼 동작

- [ ] **Step 3: Commit**

```bash
git add src/app/willow-investment/\(linear\)/monor/page.tsx
git commit -m "feat: assemble MonoR Apps page with VoiceCards + ReviewNotes blocks"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Route `/willow-investment/monor` — Task 1
- [x] Sidebar href — Task 1
- [x] Layout PAGE_TITLES — Task 1
- [x] VoiceCards: connection banner, KPIs, platform detail, chart, date filter — Task 3
- [x] VoiceCards: settings dialog — Task 2
- [x] ReviewNotes: KPIs, orders, subscribers, order stats, user stats, recent signups — Task 4
- [x] Page assembly with data loading — Task 5
- [x] Mobile responsive (useIsMobile) — Tasks 3, 4

**Placeholder scan:** No TBD, TODO, or vague steps found.

**Type consistency:**
- `IAPStats`, `CombinedStats`, `ConnectionStatus`, `ChartDataPoint`, `DateRangeType` — consistent across Task 3 (block) and Task 5 (page)
- `ReviewNotesStats`, `LemonSqueezyOrder`, `LemonSqueezySubscription`, `ReviewNotesUserStats` — imported from existing libs in Tasks 4 and 5
- `VoicecardsSettingsDialogProps` — `open`, `onClose`, `onSave` match usage in Task 5
