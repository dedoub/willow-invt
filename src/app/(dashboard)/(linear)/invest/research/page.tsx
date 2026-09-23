'use client'

import { LHeadBtn } from '@/app/(dashboard)/_components/linear-section-head'
import { PortfolioKanban } from '../_components/portfolio-kanban'
import { InvestResearchSkeleton } from '@/app/(dashboard)/_components/linear-skeleton'
import { useInvestData } from '../_hooks/use-invest-data'

/**
 * 주식리서치 — 종목관리 칸반. 주식포트폴리오(/invest)에서 갈라져 나왔다(CEO 2026-09-23).
 * 보유한 것을 보는 화면과 살지 말지 고르는 화면은 보는 목적이 달라 한 장에 같이 두면
 * 스크롤만 길어졌다. 데이터는 useInvestData 하나로 묶어 두 화면이 같은 시세를 본다.
 */
export default function InvestResearchPage() {
  const {
    loadPhase, watchlistData, signalData, stockTrades, stockQuotes,
    stockResearch, stockThemes, usdKrw, qldTransition, breakoutMap, reloadQuiet,
  } = useInvestData()

  if (loadPhase === 0) return <div className="theme-outline"><InvestResearchSkeleton /></div>

  return (
    /* 주식포트폴리오와 같은 카드 문법을 쓴다 — 두 화면이 한 쌍이라 한쪽만 옛 껍데기면 갈라져 보인다. */
    <div className="theme-outline">
    <PortfolioKanban
      watchlistData={watchlistData}
      signalData={signalData}
      stockTrades={stockTrades}
      stockQuotes={stockQuotes}
      stockResearch={stockResearch}
      stockThemes={stockThemes}
      usdKrw={usdKrw}
      qldTransition={qldTransition}
      breakoutMap={breakoutMap}
      onDataChanged={reloadQuiet}
      headTools={
        <LHeadBtn
          icon="download"
          label="종목관리"
          title="종목관리 칸반 인쇄/PDF용 페이지 열기"
          onClick={() => window.open('/print/invest/kanban', '_blank')}
        />
      }
    />
    </div>
  )
}
