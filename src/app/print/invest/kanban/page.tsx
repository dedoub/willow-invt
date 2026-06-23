'use client'

import { PortfolioKanban } from '@/app/(dashboard)/(linear)/invest/_components/portfolio-kanban'
import { PrintToolbar } from '@/app/print/_components/print-toolbar'
import { useInvestData } from '@/app/print/invest/_hooks/use-invest-data'

export default function PrintKanbanPage() {
  const data = useInvestData()
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })

  return (
    <div style={{ minHeight: '100vh', background: '#F3F4F6', fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif' }}>
      <PrintToolbar title="종목관리 칸반" subtitle={`출력 기준일: ${today} · 가로 방향(Landscape)으로 인쇄 권장`} />

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 16px' }}>
        {data.loading ? (
          <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: '#6B7280' }}>
            데이터 불러오는 중...
          </div>
        ) : (
          <PortfolioKanban
            watchlistData={data.watchlistData}
            signalData={data.signalData}
            stockTrades={data.stockTrades}
            stockQuotes={data.stockQuotes}
            stockResearch={data.stockResearch}
            stockThemes={data.stockThemes}
            usdKrw={data.usdKrw}
            printMode
          />
        )}
      </div>

      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
        }
      `}</style>
    </div>
  )
}
