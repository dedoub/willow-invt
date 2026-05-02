'use client'

import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserStats {
  totalUsers: number
  activeUsers: number
  totalSheets: number
  totalCards: number
  totalAttempts: number
  totalCredits: number
  users: Array<{
    nickname: string | null
    credits: number
    sheetCount: number
    attempts: number
    createdAt: string
    lastActiveAt: string | null
  }>
}

interface CombinedStats {
  combined: {
    totalRevenue: number
    totalNewDownloads: number
  }
}

interface AnonymousEventStats {
  summary: {
    totalEvents: number
    totalDevices: number
    learnedDevices: number
    signinDevices: number
    learnConversionPct: number
    signinConversionPct: number
  }
  daily: Array<{
    date: string
    devices: number
    appOpened: number
    cardsLearned: number
    promptShown: number
    signinCompleted: number
  }>
  demoSheets: Array<{ sheetId: string; cards: number; devices: number }>
  platforms: Array<{ platform: string; devices: number; events: number }>
  locales: Array<{ locale: string; devices: number }>
}

export interface VoicecardsBlockProps {
  loading: boolean
  stats: CombinedStats | null
  userStats: UserStats | null
  anonymousStats: AnonymousEventStats | null
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

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export function VoicecardsBlock({
  loading, stats, userStats, anonymousStats,
  onOpenSettings, onRefresh, refreshing,
}: VoicecardsBlockProps) {
  const mobile = useIsMobile()

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 8 }}>
        <LSectionHead
          eyebrow="VOICECARDS"
          title="보이스카드"
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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

        {/* KPI row: 회원 수, 다운로드, 결제금액 */}
        {loading ? (
          <SkeletonRow count={3} />
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
            gap: 8,
          }}>
            <LStat
              label="다운로드"
              value={stats ? formatNumber(stats.combined.totalNewDownloads) : '-'}
              sub="iOS"
              tone="info"
            />
            <LStat
              label="회원 수"
              value={userStats ? formatNumber(userStats.activeUsers) : '-'}
              sub={userStats ? `전체 ${formatNumber(userStats.totalUsers)}명` : undefined}
            />
            <LStat
              label="결제금액"
              value={stats ? formatCurrency(stats.combined.totalRevenue) : '-'}
              sub="iOS"
            />
          </div>
        )}
      </div>

      {/* 앱 유저 통계 */}
      {!loading && userStats && (
        <>
          <div style={{ padding: `12px ${t.density.cardPad}px 8px`, borderTop: `1px solid ${t.neutrals.line}` }}>
            <div style={{
              fontSize: 11, fontWeight: 600, color: t.neutrals.subtle,
              fontFamily: t.font.mono, letterSpacing: 0.3,
              textTransform: 'uppercase' as const, marginBottom: 10,
            }}>
              학습 활동
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
              <LStat label="시트 수" value={formatNumber(userStats.totalSheets)} />
              <LStat label="카드 수" value={formatNumber(userStats.totalCards)} />
              <LStat label="학습 시도" value={formatNumber(userStats.totalAttempts)} />
              <LStat label="잔여 크레딧" value={formatNumber(userStats.totalCredits)} />
            </div>
          </div>

          {/* 유저 목록 */}
          <div style={{ padding: `0 ${t.density.cardPad}px 12px` }}>
            <div style={{
              fontSize: 11, fontWeight: 600, color: t.neutrals.subtle,
              fontFamily: t.font.mono, letterSpacing: 0.3,
              textTransform: 'uppercase' as const, marginBottom: 8,
            }}>
              유저
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {userStats.users.map((user, i) => (
                <div key={i} style={{
                  padding: '6px 8px', borderRadius: t.radius.sm, background: t.neutrals.inner,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: 26, flexShrink: 0,
                    background: t.brand[200], color: t.brand[800],
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 600,
                  }}>
                    {(user.nickname?.charAt(0) || '?').toUpperCase()}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: t.neutrals.text }}>
                      {user.nickname || 'Unknown'}
                    </div>
                    <div style={{ fontSize: 9.5, color: t.neutrals.muted }}>
                      시트 {user.sheetCount}개 · 학습 {formatNumber(user.attempts)}회 · {user.lastActiveAt ? `최근 ${formatDate(user.lastActiveAt)}` : formatDate(user.createdAt)}
                    </div>
                  </div>

                  <span style={{
                    fontSize: 10, fontFamily: t.font.mono, color: t.neutrals.muted, flexShrink: 0,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {formatNumber(user.credits)} cr
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Anonymous Events */}
      {!loading && anonymousStats && (
        <div style={{ padding: `12px ${t.density.cardPad}px 14px`, borderTop: `1px solid ${t.neutrals.line}` }}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: t.neutrals.subtle,
            fontFamily: t.font.mono, letterSpacing: 0.3,
            textTransform: 'uppercase' as const, marginBottom: 10,
          }}>
            익명 사용자 (비로그인)
          </div>

          {/* Funnel KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
            <LStat label="기기 수" value={formatNumber(anonymousStats.summary.totalDevices)} />
            <LStat label="학습 전환" value={`${anonymousStats.summary.learnConversionPct}%`}
              sub={`${anonymousStats.summary.learnedDevices}대`}
              tone={anonymousStats.summary.learnConversionPct >= 40 ? 'pos' : 'warn'} />
            <LStat label="가입 전환" value={`${anonymousStats.summary.signinConversionPct}%`}
              sub={`${anonymousStats.summary.signinDevices}대`}
              tone={anonymousStats.summary.signinConversionPct >= 10 ? 'pos' : 'warn'} />
            <LStat label="총 이벤트" value={formatNumber(anonymousStats.summary.totalEvents)} />
          </div>

          {/* Daily trend chart */}
          {anonymousStats.daily.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: t.neutrals.muted, marginBottom: 6 }}>일별 추이</div>
              <div style={{ height: 120, background: t.neutrals.inner, borderRadius: t.radius.sm, padding: '8px 4px 0' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={anonymousStats.daily}>
                    <XAxis dataKey="date" tickFormatter={(v: string) => v.slice(5)} tick={{ fontSize: 9, fill: t.neutrals.muted }} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{ fontSize: 11, background: '#1E293B', color: '#F8FAFC', border: 'none', borderRadius: 6, padding: '6px 10px' }}
                      labelFormatter={(v: any) => String(v)}
                      formatter={(value: any, name: any) => {
                        const labels: Record<string, string> = { devices: '기기', appOpened: '앱실행', cardsLearned: '학습', signinCompleted: '가입' }
                        return [value, labels[String(name)] || name] as any
                      }}
                    />
                    <Line type="monotone" dataKey="devices" stroke={t.brand[500]} strokeWidth={1.5} dot={{ r: 2 }} />
                    <Line type="monotone" dataKey="cardsLearned" stroke="#6366F1" strokeWidth={1.5} dot={{ r: 2 }} />
                    <Line type="monotone" dataKey="signinCompleted" stroke="#10B981" strokeWidth={1.5} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 4, justifyContent: 'center' }}>
                {[
                  { color: t.brand[500], label: '기기' },
                  { color: '#6366F1', label: '학습' },
                  { color: '#10B981', label: '가입' },
                ].map(l => (
                  <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color }} />
                    <span style={{ fontSize: 9, color: t.neutrals.muted }}>{l.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Demo sheets + Platform/Locale row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {/* Demo sheets */}
            <div>
              <div style={{ fontSize: 10, color: t.neutrals.muted, marginBottom: 4 }}>데모 시트 인기</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {anonymousStats.demoSheets.slice(0, 5).map(s => (
                  <div key={s.sheetId} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '3px 6px', borderRadius: t.radius.sm, background: t.neutrals.inner,
                  }}>
                    <span style={{ fontSize: 10, color: t.neutrals.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.sheetId.replace('demo-', '')}
                    </span>
                    <span style={{ fontSize: 10, fontFamily: t.font.mono, color: t.neutrals.muted, flexShrink: 0, marginLeft: 4 }}>
                      {s.devices}대 · {s.cards}회
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Platform + Locale */}
            <div>
              <div style={{ fontSize: 10, color: t.neutrals.muted, marginBottom: 4 }}>플랫폼 · 언어</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {anonymousStats.platforms.map(p => (
                  <div key={p.platform} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '3px 6px', borderRadius: t.radius.sm, background: t.neutrals.inner,
                  }}>
                    <span style={{ fontSize: 10, color: t.neutrals.text }}>
                      {p.platform === 'ios' ? 'iOS' : p.platform === 'android' ? 'Android' : p.platform}
                    </span>
                    <span style={{ fontSize: 10, fontFamily: t.font.mono, color: t.neutrals.muted }}>
                      {p.devices}대 · {p.events}건
                    </span>
                  </div>
                ))}
                <div style={{ height: 4 }} />
                {anonymousStats.locales.map(l => (
                  <div key={l.locale} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '3px 6px', borderRadius: t.radius.sm, background: t.neutrals.inner,
                  }}>
                    <span style={{ fontSize: 10, color: t.neutrals.text }}>
                      {l.locale === 'ko' ? '🇰🇷 한국어' : l.locale === 'en' ? '🇺🇸 영어' : l.locale === 'zh' ? '🇨🇳 중국어' : l.locale}
                    </span>
                    <span style={{ fontSize: 10, fontFamily: t.font.mono, color: t.neutrals.muted }}>
                      {l.devices}대
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </LCard>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SkeletonRow({ count }: { count: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${count}, 1fr)`, gap: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          height: 52, borderRadius: t.radius.sm, background: t.neutrals.inner,
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      ))}
    </div>
  )
}
