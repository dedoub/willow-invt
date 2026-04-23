'use client'

import { t } from './linear-tokens'

/* ── Pulse keyframes (injected once) ── */

const PULSE_ID = '__linear-pulse-style'

function ensurePulseStyle() {
  if (typeof document === 'undefined') return
  if (document.getElementById(PULSE_ID)) return
  const style = document.createElement('style')
  style.id = PULSE_ID
  style.textContent = `@keyframes lPulse { 0%,100% { opacity:1 } 50% { opacity:.4 } }`
  document.head.appendChild(style)
}

/* ── Primitives ── */

/** A single pulsing bar */
export function Bone({ w, h = 10, r, style }: {
  w?: number | string; h?: number; r?: number; style?: React.CSSProperties
}) {
  ensurePulseStyle()
  return (
    <div style={{
      width: w ?? '100%', height: h,
      borderRadius: r ?? t.radius.sm,
      background: t.neutrals.inner,
      animation: 'lPulse 1.6s ease-in-out infinite',
      ...style,
    }} />
  )
}

/** A card-shaped skeleton */
function CardSkel({ children, pad, style }: {
  children: React.ReactNode; pad?: number | string; style?: React.CSSProperties
}) {
  return (
    <div style={{
      background: t.neutrals.card, borderRadius: t.radius.lg,
      padding: pad ?? t.density.cardPad,
      ...style,
    }}>
      {children}
    </div>
  )
}

/* ── Page-level skeletons ── */

/** 사업관리 skeleton: signal row + calendar card + 2-col (cash + email) */
export function MgmtSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Schedule card */}
      <CardSkel pad={0}>
        <div style={{ padding: t.density.cardPad, paddingBottom: 10 }}>
          <Bone w={60} h={8} />
          <Bone w={100} h={14} style={{ marginTop: 6 }} />
        </div>
        {/* Calendar grid placeholder */}
        <div style={{ padding: '0 16px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {Array.from({ length: 7 }).map((_, i) => (
              <Bone key={`dh-${i}`} h={12} />
            ))}
            {Array.from({ length: 35 }).map((_, i) => (
              <Bone key={`d-${i}`} h={48} r={t.radius.sm} />
            ))}
          </div>
        </div>
      </CardSkel>

      {/* Cash + Email */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 14 }}>
        {/* Cash */}
        <CardSkel pad={0}>
          <div style={{ padding: t.density.cardPad, paddingBottom: 10 }}>
            <Bone w={80} h={8} />
            <Bone w={80} h={14} style={{ marginTop: 6 }} />
          </div>
          <div style={{ padding: '0 16px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Bone key={i} h={46} r={t.radius.sm} />
            ))}
          </div>
          <div style={{ padding: '12px 16px 16px' }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Bone key={i} h={16} style={{ marginTop: 8 }} />
            ))}
          </div>
        </CardSkel>
        {/* Email */}
        <CardSkel pad={0}>
          <div style={{ padding: t.density.cardPad, paddingBottom: 10 }}>
            <Bone w={50} h={8} />
            <Bone w={60} h={14} style={{ marginTop: 6 }} />
          </div>
          <div style={{ padding: '0 16px 16px' }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: `1px solid ${t.neutrals.line}` }}>
                <div style={{ flex: 1 }}>
                  <Bone w="60%" h={10} />
                  <Bone w="90%" h={12} style={{ marginTop: 4 }} />
                </div>
                <Bone w={30} h={10} />
              </div>
            ))}
          </div>
        </CardSkel>
      </div>
    </div>
  )
}

/** 투자관리 skeleton: signal bar + kanban + 2-col (holdings + analysis/tradelog) */
export function InvestSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Signal bar: 5 stat boxes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Bone key={i} h={52} r={t.radius.sm} />
        ))}
      </div>

      {/* Kanban: 3 columns */}
      <CardSkel pad={0}>
        <div style={{ padding: t.density.cardPad, paddingBottom: 10 }}>
          <Bone w={80} h={8} />
          <Bone w={100} h={14} style={{ marginTop: 6 }} />
        </div>
        <div style={{ padding: '0 16px 16px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {Array.from({ length: 3 }).map((_, col) => (
            <div key={col} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Bone h={14} w={80} style={{ marginBottom: 4 }} />
              {Array.from({ length: col === 0 ? 5 : col === 1 ? 4 : 3 }).map((_, j) => (
                <Bone key={j} h={64} r={t.radius.md} />
              ))}
            </div>
          ))}
        </div>
      </CardSkel>

      {/* Holdings + Analysis/TradeLog */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <CardSkel pad={0}>
          <div style={{ padding: t.density.cardPad, paddingBottom: 10 }}>
            <Bone w={80} h={8} />
            <Bone w={80} h={14} style={{ marginTop: 6 }} />
          </div>
          <div style={{ padding: '0 16px 16px' }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Bone key={i} h={18} style={{ marginTop: 8 }} />
            ))}
          </div>
        </CardSkel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <CardSkel pad={0}>
            <div style={{ padding: t.density.cardPad, paddingBottom: 10 }}>
              <Bone w={80} h={8} />
              <Bone w={80} h={14} style={{ marginTop: 6 }} />
            </div>
            <div style={{ padding: '0 16px 16px' }}>
              <Bone h={120} r={t.radius.md} />
            </div>
          </CardSkel>
          <CardSkel pad={0}>
            <div style={{ padding: t.density.cardPad, paddingBottom: 10 }}>
              <Bone w={60} h={8} />
              <Bone w={80} h={14} style={{ marginTop: 6 }} />
            </div>
            <div style={{ padding: '0 16px 16px' }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <Bone key={i} h={16} style={{ marginTop: 8 }} />
              ))}
            </div>
          </CardSkel>
        </div>
      </div>
    </div>
  )
}

/** 류하일정 skeleton */
export function RyuhaSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Calendar */}
      <CardSkel pad={0}>
        <div style={{ padding: t.density.cardPad, paddingBottom: 10 }}>
          <Bone w={70} h={8} />
          <Bone w={60} h={14} style={{ marginTop: 6 }} />
        </div>
        <div style={{ padding: '0 16px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {Array.from({ length: 7 }).map((_, i) => (
              <Bone key={`h-${i}`} h={12} />
            ))}
            {Array.from({ length: 21 }).map((_, i) => (
              <Bone key={`c-${i}`} h={60} r={t.radius.sm} />
            ))}
          </div>
        </div>
      </CardSkel>

      {/* Memo */}
      <CardSkel>
        <Bone w={80} h={8} />
        <Bone w={60} h={14} style={{ marginTop: 6 }} />
        <Bone h={48} style={{ marginTop: 10 }} r={t.radius.sm} />
      </CardSkel>

      {/* Textbook + Progress */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 14 }}>
        <CardSkel pad={0}>
          <div style={{ padding: t.density.cardPad, paddingBottom: 10 }}>
            <Bone w={80} h={8} />
            <Bone w={100} h={14} style={{ marginTop: 6 }} />
          </div>
          <div style={{ padding: '0 16px 16px' }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Bone key={i} h={40} style={{ marginTop: 8 }} r={t.radius.sm} />
            ))}
          </div>
        </CardSkel>
        <CardSkel>
          <Bone w={80} h={8} />
          <Bone w={80} h={14} style={{ marginTop: 6 }} />
          {Array.from({ length: 4 }).map((_, i) => (
            <Bone key={i} h={16} style={{ marginTop: 10 }} />
          ))}
        </CardSkel>
      </div>

      {/* Notebook */}
      <CardSkel pad={0}>
        <div style={{ display: 'flex', minHeight: 300 }}>
          <div style={{ width: '42%', minWidth: 220, borderRight: `1px solid ${t.neutrals.line}`, padding: 12 }}>
            <Bone h={30} r={t.radius.sm} />
            {Array.from({ length: 5 }).map((_, i) => (
              <Bone key={i} h={36} style={{ marginTop: 8 }} />
            ))}
          </div>
          <div style={{ flex: 1, padding: 16 }}>
            <Bone w="50%" h={16} />
            <Bone h={12} style={{ marginTop: 12 }} />
            <Bone h={12} w="80%" style={{ marginTop: 6 }} />
          </div>
        </div>
      </CardSkel>

      {/* Growth */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <CardSkel>
          <Bone w={80} h={8} />
          <Bone h={120} style={{ marginTop: 10 }} r={t.radius.sm} />
        </CardSkel>
        <CardSkel pad={0}>
          <div style={{ padding: t.density.cardPad }}>
            <Bone w={80} h={8} />
            <Bone w={60} h={14} style={{ marginTop: 6 }} />
          </div>
          <div style={{ padding: '0 16px 16px' }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Bone key={i} h={18} style={{ marginTop: 6 }} />
            ))}
          </div>
        </CardSkel>
      </div>
    </div>
  )
}

/** 아크로스 skeleton: AUM bar + 2-col (products + invoices) + 2-col (wiki + email) */
export function AkrosSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* AUM Dashboard */}
      <CardSkel>
        <Bone w={100} h={8} />
        <Bone w={80} h={14} style={{ marginTop: 6 }} />
        <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
          <Bone w={120} h={46} r={6} />
          <Bone w={120} h={46} r={6} />
          <Bone w={120} h={46} r={6} />
        </div>
      </CardSkel>

      {/* Products + Tax Invoices */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <CardSkel pad={0}>
          <div style={{ padding: '16px 16px 10px' }}>
            <Bone w={60} h={8} />
            <Bone w={80} h={14} style={{ marginTop: 6 }} />
          </div>
          <div style={{ padding: '0 16px 16px' }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Bone key={i} h={20} style={{ marginTop: 8 }} />
            ))}
          </div>
        </CardSkel>
        <CardSkel pad={0}>
          <div style={{ padding: '16px 16px 10px' }}>
            <Bone w={80} h={8} />
            <Bone w={80} h={14} style={{ marginTop: 6 }} />
          </div>
          <div style={{ padding: '0 16px 16px' }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Bone key={i} h={20} style={{ marginTop: 8 }} />
            ))}
          </div>
        </CardSkel>
      </div>

      {/* Wiki + Email */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <CardSkel pad={0}>
          <div style={{ display: 'flex', minHeight: 300 }}>
            <div style={{ width: '42%', minWidth: 180, borderRight: '1px solid #e2e8f0', padding: 12 }}>
              <Bone h={30} r={6} />
              {Array.from({ length: 4 }).map((_, i) => (
                <Bone key={i} h={36} style={{ marginTop: 8 }} />
              ))}
            </div>
            <div style={{ flex: 1, padding: 16 }}>
              <Bone w="50%" h={16} />
              <Bone h={12} style={{ marginTop: 12 }} />
              <Bone h={12} w="80%" style={{ marginTop: 6 }} />
            </div>
          </div>
        </CardSkel>
        <CardSkel pad={0}>
          <div style={{ padding: '16px 16px 10px' }}>
            <Bone w={50} h={8} />
            <Bone w={60} h={14} style={{ marginTop: 6 }} />
          </div>
          <div style={{ padding: '0 16px 16px' }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0' }}>
                <div style={{ flex: 1 }}>
                  <Bone w="60%" h={10} />
                  <Bone w="90%" h={12} style={{ marginTop: 4 }} />
                </div>
                <Bone w={30} h={10} />
              </div>
            ))}
          </div>
        </CardSkel>
      </div>
    </div>
  )
}

/** 업무위키 skeleton: two-panel layout inside card */
export function WikiSkeleton() {
  return (
    <CardSkel pad={0}>
      <div style={{ display: 'flex', minHeight: 480 }}>
        {/* Left panel */}
        <div style={{ width: '42%', minWidth: 280, borderRight: `1px solid ${t.neutrals.line}` }}>
          <div style={{ padding: '10px 12px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <Bone h={30} style={{ flex: 1 }} r={t.radius.sm} />
              <Bone w={70} h={30} r={t.radius.sm} />
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Bone key={i} w={i === 0 ? 40 : 60} h={22} r={t.radius.pill} />
              ))}
            </div>
          </div>
          <div style={{ padding: '4px 12px' }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px' }}>
                <Bone w={14} h={14} r={3} />
                <div style={{ flex: 1 }}>
                  <Bone w="70%" h={12} />
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    <Bone w={46} h={14} r={3} />
                    <Bone w={40} h={10} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Right panel */}
        <div style={{ flex: 1, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Bone w="50%" h={18} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Bone w={56} h={16} r={3} />
            <Bone w={50} h={12} />
          </div>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Bone h={12} />
            <Bone h={12} w="90%" />
            <Bone h={12} w="75%" />
            <Bone h={12} />
            <Bone h={12} w="85%" />
            <Bone h={12} w="60%" />
          </div>
        </div>
      </div>
    </CardSkel>
  )
}
