'use client'

import { useState } from 'react'
import { t } from '@/app/willow-investment/_components/linear-tokens'
import { EtcSkeleton } from '@/app/willow-investment/_components/linear-skeleton'

export default function EtcPage() {
  const [loading] = useState(true)

  return (
    <>
      <div style={{ padding: '20px 0 0' }}>
        <h1 style={{
          margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: -0.3,
          fontFamily: t.font.sans, color: t.neutrals.text,
        }}>ETC</h1>
        <p style={{
          margin: '4px 0 16px', fontSize: 12, color: t.neutrals.muted,
          fontFamily: t.font.sans,
        }}>ETF Platform · 인보이스 · 위키 · 이메일</p>
      </div>
      {loading && <EtcSkeleton />}
    </>
  )
}
