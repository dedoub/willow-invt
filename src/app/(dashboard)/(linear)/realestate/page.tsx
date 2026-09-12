'use client'

import { RealEstateBlock } from './_components/real-estate-block'
import { ZoneIndexCard } from './_components/zone-index-card'

export default function RealEstatePage() {
  return (
    /* theme-outline 이 카드와 패널의 껍데기를 함께 덮는다 — 차트가 앉아 있던 회색 판도
       여기서 벗겨진다([data-panel]). 보이스카드·사업관리와 같은 카드 문법(2026-09-11). */
    <div className="theme-outline" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <RealEstateBlock />
      {/* 권역 비교는 상단 필터를 따르지 않는다 — 구 전체 실거래로 만든 지수라
          단지를 골라내면 비교가 성립하지 않는다. 그래서 블록 밖에 따로 선다. */}
      <ZoneIndexCard />
    </div>
  )
}
