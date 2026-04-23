'use client'

import { t, useIsMobile } from '@/app/willow-investment/_components/linear-tokens'
import { AkrosSkeleton } from '@/app/willow-investment/_components/linear-skeleton'

export default function AkrosPage() {
  const mobile = useIsMobile()

  return (
    <>
      <div style={{ padding: '20px 0 0' }}>
        <h1 style={{
          margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: -0.3,
          fontFamily: t.font.sans, color: t.neutrals.text,
        }}>아크로스</h1>
        <p style={{
          margin: '4px 0 16px', fontSize: 12, color: t.neutrals.muted,
          fontFamily: t.font.sans,
        }}>ETF 운용 · 세금계산서 · 위키 · 이메일</p>
      </div>
      <AkrosSkeleton />
    </>
  )
}
