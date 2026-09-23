'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { useDashCols } from '@/app/(dashboard)/_components/cols-toggle'
import { LHeadBtn } from '@/app/(dashboard)/_components/linear-section-head'
import { SignalBar } from '../_components/signal-bar'
import { HoldingsBlock } from '../_components/holdings-block'
import { AnalysisBlock } from '../_components/analysis-block'
import { TradeLog } from '../_components/trade-log'
import { SectorRotationBlock } from '../_components/sector-rotation-block'
import { InvestSkeleton, InvestHoldingsSkeleton } from '@/app/(dashboard)/_components/linear-skeleton'
import { useInvestData } from '../_hooks/use-invest-data'

const TRANCHE_TRIGGERS = [null, 0.10, 0.20, 0.30, 0.40, 0.55, 0.75, 1.00, 1.35, 1.75] as const

export default function InvestPage() {
  const mobile = useIsMobile()
  const cols = useDashCols()
  const {
    loadPhase, watchlistData, stockTrades, stockTradesFull,
    stockQuotes, stockQuotesFull, stockThemes, stockHistory,
    fxHistory, usdKrw, isLoadingHistory,
    myAxes, tickerSectors, qldTransition, breakoutMap, reload,
  } = useInvestData()

  const [syncing, setSyncing] = useState(false)
  // 토스 동기화 버튼은 로컬에서만 노출 — 배포본(Vercel)은 IP 차단으로 토스 직접호출 불가,
  // 동기화는 허용 IP의 launchd 스크립트가 담당한다. 마운트 후 설정해 하이드레이션 불일치 방지.
  const [isLocal, setIsLocal] = useState(false)
  useEffect(() => {
    const h = window.location.hostname
    setIsLocal(h === 'localhost' || h === '127.0.0.1')
  }, [])

  const portfolioStats = useMemo(() => {
    // Build holdings map from trades (using historical FX for cost, matching holdings-block)
    const getFxRate = (date: string): number => {
      const d = new Date(date)
      for (let i = 0; i < 5; i++) {
        const key = d.toISOString().slice(0, 10)
        if (fxHistory[key]) return fxHistory[key]
        d.setDate(d.getDate() - 1)
      }
      return usdKrw
    }

    const holdMap = new Map<string, { qty: number; totalCost: number; krwCost: number; currency: string; totalBought: number }>()
    // 실현손익 누적 (KRW, 매도 시점 과거환율 기준). soldCostKrw = 청산된 원가기준.
    // realizedUsKrw = 해외 실현손익 순액(손실 상계). 세금은 순이익이 양수일 때만 과세.
    let realizedKrw = 0, realizedUsKrw = 0, soldCostKrw = 0
    const sorted = [...stockTrades].sort((a, b) => {
      const ta = a.trade_date ? new Date(a.trade_date).getTime() : 0
      const tb = b.trade_date ? new Date(b.trade_date).getTime() : 0
      return ta - tb
    })
    for (const tr of sorted) {
      const key = tr.ticker.replace('.KS', '')
      const prev = holdMap.get(key) || { qty: 0, totalCost: 0, krwCost: 0, currency: tr.currency, totalBought: 0 }
      const amt = tr.total_amount ?? tr.quantity * tr.price
      const isUS = tr.currency === 'USD' || tr.currency === 'US'
      const histRate = isUS && tr.trade_date ? getFxRate(tr.trade_date) : 1
      if (tr.trade_type === 'buy') {
        prev.qty += tr.quantity; prev.totalCost += amt; prev.totalBought += amt
        prev.krwCost += amt * histRate
      } else {
        const avg = prev.qty > 0 ? prev.totalCost / prev.qty : 0
        const krwAvg = prev.qty > 0 ? prev.krwCost / prev.qty : 0
        // 실현손익 = 매도대금(KRW) − 차감원가(KRW). 해외는 매도시점 환율로 환산.
        const soldBasisKrw = krwAvg * tr.quantity
        const proceedsKrw = amt * histRate
        const realized = proceedsKrw - soldBasisKrw
        realizedKrw += realized; soldCostKrw += soldBasisKrw
        if (isUS) realizedUsKrw += realized
        prev.totalCost -= avg * tr.quantity; prev.qty -= tr.quantity
        prev.krwCost -= soldBasisKrw
        if (prev.qty <= 0) { prev.qty = 0; prev.totalCost = 0; prev.krwCost = 0 }
      }
      holdMap.set(key, prev)
    }

    // Build ticker→name map from watchlist
    const nameMap = new Map<string, string>()
    if (watchlistData) {
      for (const item of [...watchlistData.portfolio, ...watchlistData.watchlist]) {
        nameMap.set(item.ticker.replace('.KS', ''), item.name)
      }
    }

    let totalValKrw = 0, totalCostKrw = 0, usGainKrw = 0
    // 3분류: 추매+돌파(buyBreakout) / 추매(buyOnly, 박스권) / 돌파(breakoutOnly, 트리거 미달이나 돌파)
    const buyBreakoutTickers: string[] = [], buyOnlyTickers: string[] = [], breakoutOnlyTickers: string[] = []
    const holdTickers: string[] = []
    for (const [ticker, h] of holdMap) {
      if (h.qty <= 0) continue
      const quote = stockQuotes[ticker]
      if (!quote?.price) continue
      const isUS = h.currency === 'USD' || h.currency === 'US'
      const fx = isUS ? usdKrw : 1
      const val = quote.price * h.qty * fx
      const cost = isUS ? h.krwCost : h.totalCost
      totalValKrw += val; totalCostKrw += cost
      if (isUS && val > cost) usGainKrw += val - cost

      // Pyramiding status
      const avgPrice = h.totalCost / h.qty
      const avgReturnPct = ((quote.price - avgPrice) / avgPrice) * 100
      const trancheSize = isUS ? 5_000_000 / usdKrw : 5_000_000
      const tranche = Math.min(10, Math.max(1, Math.round(h.totalCost / trancheSize)))
      const nextTrigger = tranche < 10 ? TRANCHE_TRIGGERS[tranche] : null
      const currentTrigger = TRANCHE_TRIGGERS[tranche - 1]

      let status: string
      if (tranche >= 10) status = 'FULL'
      else if (nextTrigger !== null && avgReturnPct / 100 >= nextTrigger) status = 'BUY'
      else if (currentTrigger !== null && avgReturnPct / 100 < currentTrigger) status = 'FREEZE'
      else status = 'HOLD'

      const name = nameMap.get(ticker) || ticker
      const isBreakout = (breakoutMap[ticker] ?? breakoutMap[ticker.replace('.KS', '')])?.breakout ?? false
      if (status === 'BUY' && isBreakout) buyBreakoutTickers.push(name)
      else if (status === 'BUY') buyOnlyTickers.push(name)
      else if (isBreakout) breakoutOnlyTickers.push(name)
      if (status === 'HOLD') holdTickers.push(name)
    }

    // 분모 = 누적 투입원가 (현재 보유원가 + 청산원가). 평가/실현 수익률이 합산되도록 동일 분모 사용.
    const investedBaseKrw = totalCostKrw + soldCostKrw
    const unrealizedGainKrw = totalValKrw - totalCostKrw
    const unrealizedReturnPct = investedBaseKrw > 0 ? unrealizedGainKrw / investedBaseKrw * 100 : 0
    const realizedReturnPct = investedBaseKrw > 0 ? realizedKrw / investedBaseKrw * 100 : 0
    const cumulativeReturnPct = unrealizedReturnPct + realizedReturnPct
    return { totalValKrw, totalCostKrw, cumulativeReturnPct, unrealizedReturnPct, realizedReturnPct, realizedKrw, realizedUsKrw, buyBreakoutTickers, buyOnlyTickers, breakoutOnlyTickers, holdTickers, usGainKrw }
  }, [stockTrades, stockQuotes, usdKrw, fxHistory, watchlistData, breakoutMap])

  const totalValKrw = portfolioStats.totalValKrw
  const usTax = portfolioStats.usGainKrw * 0.222
  const afterTaxVal = totalValKrw - usTax

  const fmtKrwShort = (v: number) => v >= 1e8 ? `₩${(v / 1e8).toFixed(1)}억` : `₩${Math.round(v / 10000).toLocaleString()}만`
  const fmtTotalValue = totalValKrw > 0
    ? usTax > 0
      ? `${fmtKrwShort(totalValKrw)} (${fmtKrwShort(afterTaxVal)})`
      : fmtKrwShort(totalValKrw)
    : undefined

  // 누적수익률 하위: 평가/실현 분해 (동일 분모라 합산됨)
  const fmtPctSigned = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
  const gainSub = totalValKrw > 0
    ? `평가 ${fmtPctSigned(portfolioStats.unrealizedReturnPct)} · 실현 ${fmtPctSigned(portfolioStats.realizedReturnPct)}`
    : undefined

  const syncToss = useCallback(async () => {
    if (syncing) return
    if (!window.confirm('토스 계좌 체결내역으로 거래기록을 교체합니다.\n(기존 기록은 자동 백업됩니다) 진행할까요?')) return
    setSyncing(true)
    try {
      const res = await fetch('/api/willow-mgmt/toss-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      })
      const j = await res.json()
      if (!res.ok) {
        window.alert(`동기화 실패: ${j.error || res.status}`)
        return
      }
      const mm = (j.mismatches || []).length
      window.alert(
        `토스 동기화 완료\n거래 ${j.tradeRows}건 · 종목 ${j.symbols}개\n` +
        `백업 ${j.backedUp}건 · watchlist 추가 ${j.watchlistAdded}개` +
        (mm ? `\n⚠ 보유수량 불일치 ${mm}종목` : ''),
      )
      await reload()
    } catch (e) {
      window.alert(`동기화 오류: ${(e as Error).message}`)
    } finally {
      setSyncing(false)
    }
  }, [syncing, reload])

  const printActions = (
    <>
      {isLocal && (
        <LHeadBtn
          icon="refresh"
          label={syncing ? '동기화 중…' : '토스 동기화'}
          title="토스증권 계좌 체결내역·보유종목을 페이지에 동기화 (로컬 전용)"
          onClick={syncToss}
          busy={syncing}
        />
      )}
      <LHeadBtn icon="download" label="보유현황" title="보유현황 + 분석 인쇄/PDF용 페이지 열기" onClick={() => window.open('/print/invest/holdings', '_blank')} />
    </>
  )

  return (
    <>
      {loadPhase === 0 ? <InvestSkeleton /> : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.blockGap }}>
        <SignalBar
          totalValue={fmtTotalValue}
          cumulativeReturnPct={portfolioStats.cumulativeReturnPct}
          gainSub={gainSub}
          buyBreakoutTickers={portfolioStats.buyBreakoutTickers}
          buyOnlyTickers={portfolioStats.buyOnlyTickers}
          breakoutOnlyTickers={portfolioStats.breakoutOnlyTickers}
          usdKrw={usdKrw}
          actions={printActions}
        />

        {loadPhase < 2 ? <InvestHoldingsSkeleton /> : (
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : (cols === 1 ? '1fr' : '1fr 1fr'), gap: t.density.blockGap, overflow: 'hidden' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.blockGap, minWidth: 0 }}>
            <HoldingsBlock
              stockTrades={stockTradesFull}
              stockQuotes={stockQuotesFull}
              stockThemes={stockThemes}
              usdKrwRate={usdKrw}
              fxHistory={fxHistory}
              tickerSectors={tickerSectors}
              qldTransition={qldTransition}
              breakoutMap={breakoutMap}
              cardColumns={mobile ? 1 : 2}
            />
            <TradeLog trades={stockTrades} fxHistory={fxHistory} usdKrwRate={usdKrw} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.blockGap, minWidth: 0, minHeight: 0 }}>
            <AnalysisBlock
              stockTrades={stockTradesFull}
              stockQuotes={stockQuotesFull}
              stockThemes={stockThemes}
              stockHistory={stockHistory}
              fxHistory={fxHistory}
              usdKrwRate={usdKrw}
              loading={isLoadingHistory}
            />
            <SectorRotationBlock myAxes={myAxes} />
          </div>
        </div>
        )}
      </div>
      )}
    </>
  )
}
