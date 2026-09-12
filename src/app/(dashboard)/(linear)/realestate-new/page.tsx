'use client'

import { RealEstateBlock } from './_components/real-estate-block'

export default function RealEstateNewPage() {
  return (
    /* theme-outline 이 카드와 패널의 껍데기를 함께 덮는다 — 차트가 앉아 있던 회색 판도
       여기서 벗겨진다([data-panel]). 보이스카드·사업관리와 같은 카드 문법(2026-09-11). */
    <div className="theme-outline">
      <RealEstateBlock />
    </div>
  )
}
