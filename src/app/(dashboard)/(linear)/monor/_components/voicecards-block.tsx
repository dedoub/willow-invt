'use client'

import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'

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

export interface VoicecardsBlockProps {
  loading: boolean
  stats: CombinedStats | null
  userStats: UserStats | null
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
  loading, stats, userStats,
  onOpenSettings, onRefresh, refreshing,
}: VoicecardsBlockProps) {
  const mobile = useIsMobile()

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 8 }}>
        <LSectionHead
          eyebrow="VOICECARDS"
          title="VoiceCards"
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
              label="회원 수"
              value={userStats ? formatNumber(userStats.activeUsers) : '-'}
              sub={userStats ? `전체 ${formatNumber(userStats.totalUsers)}명` : undefined}
            />
            <LStat
              label="다운로드"
              value={stats ? formatNumber(stats.combined.totalNewDownloads) : '-'}
              sub="iOS"
              tone="info"
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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 10 }}>
              <LStat label="시트 수" value={formatNumber(userStats.totalSheets)} sub={`${formatNumber(userStats.totalCards)}장 카드`} />
              <LStat label="학습 시도" value={formatNumber(userStats.totalAttempts)} sub={`크레딧 ${formatNumber(userStats.totalCredits)}`} />
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
