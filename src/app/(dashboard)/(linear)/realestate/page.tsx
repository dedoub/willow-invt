'use client'

import { RealEstateBlock } from '@/app/(dashboard)/(linear)/invest/_components/real-estate-block'
import { t } from '@/app/(dashboard)/_components/linear-tokens'

export default function RealEstatePage() {
  return (
    <>
      <div style={{ padding: '20px 0 0' }}>
        <h1 style={{
          margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: -0.3,
          fontFamily: t.font.sans, color: t.neutrals.text,
        }}>부동산리서치</h1>
        <p style={{
          margin: '4px 0 16px', fontSize: 12, color: t.neutrals.muted,
          fontFamily: t.font.sans,
        }}>
          호가 · 실거래 · 단지별 시세 추이
        </p>
      </div>
      <RealEstateBlock />
    </>
  )
}
