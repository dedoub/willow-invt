'use client'

import { t, tonePalettes, useIsMobile } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'
import { LStat } from '@/app/willow-investment/_components/linear-stat'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import type { ReviewNotesStats } from '@/lib/lemonsqueezy'
import type { ReviewNotesUserStats } from '@/lib/reviewnotes-supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReviewnotesBlockProps {
  loading: boolean
  stats: ReviewNotesStats | null
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

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
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
  loading, stats, userStats,
  onRefresh, refreshing, error,
}: ReviewnotesBlockProps) {
  const mobile = useIsMobile()

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 8 }}>
        <LSectionHead
          eyebrow="REVIEWNOTES"
          title="ReviewNotes"
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

        {/* KPI row: 총 매출, MRR, 활성 구독자 */}
        {loading ? (
          <SkeletonRow count={3} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 8 }}>
            <LStat
              label="총 매출"
              value={stats ? formatCurrency(stats.totalRevenueUSD) : '-'}
              sub={stats ? `이번 달 ${formatCurrency(stats.monthlyRevenueUSD)}` : undefined}
            />
            <LStat
              label="MRR"
              value={stats ? formatCurrency(stats.mrr) : '-'}
              sub="월간 반복 매출"
              tone="info"
            />
            <LStat
              label="활성 구독자"
              value={stats ? String(stats.activeSubscriptions) : '-'}
              sub={stats ? `체험 ${stats.trialSubscriptions} · 취소 ${stats.cancelledSubscriptions}` : undefined}
              tone="pos"
            />
          </div>
        )}
      </div>

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
