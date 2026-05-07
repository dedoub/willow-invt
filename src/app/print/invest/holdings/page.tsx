'use client'

import { HoldingsBlock } from '@/app/(dashboard)/(linear)/invest/_components/holdings-block'
import { AnalysisBlock } from '@/app/(dashboard)/(linear)/invest/_components/analysis-block'
import { PrintToolbar } from '@/app/print/_components/print-toolbar'
import { useInvestData } from '@/app/print/invest/_hooks/use-invest-data'

export default function PrintHoldingsPage() {
  const data = useInvestData()
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })

  return (
    <div style={{ minHeight: '100vh', background: '#F3F4F6', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <PrintToolbar title="보유현황 + 포트폴리오 분석" subtitle={`출력 기준일: ${today}`} />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px' }}>
        {data.loading ? (
          <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: '#6B7280' }}>
            데이터 불러오는 중...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <HoldingsBlock
              stockTrades={data.stockTradesFull}
              stockQuotes={data.stockQuotesFull}
              stockThemes={data.stockThemes}
              usdKrwRate={data.usdKrw}
              fxHistory={data.fxHistory}
              cardColumns={2}
            />
            <AnalysisBlock
              stockTrades={data.stockTradesFull}
              stockQuotes={data.stockQuotesFull}
              stockThemes={data.stockThemes}
              stockHistory={data.stockHistory}
              fxHistory={data.fxHistory}
              usdKrwRate={data.usdKrw}
              chartColumns={2}
            />
          </div>
        )}
      </div>
    </div>
  )
}
