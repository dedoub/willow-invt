'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { t, tonePalettes, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { useDashCols } from '@/app/(dashboard)/_components/cols-toggle'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LCardFoot } from '@/app/(dashboard)/_components/linear-card-foot'
import { LNotice } from '@/app/(dashboard)/_components/linear-notice'
import { Bone } from '@/app/(dashboard)/_components/linear-skeleton'
import {
  LTableBadge, LTableBody, LTableDate, LTableEmpty, LTableHead, LTableMono, LTableRow, LTableScroll,
  type LColumn,
} from '@/app/(dashboard)/_components/linear-table'
import { useAgentRefresh } from '@/hooks/use-agent-refresh'
import type { FinanceTaxObligation } from '@/types/finance-tax'
import { MetricCard } from './_components/metric-card'
import { AreaTrend, type TrendPoint } from './_components/area-trend'

// 현금 거래 — /api/willow-mgmt/invoices 응답 형태
interface CashRow {
  id: string
  type: string
  counterparty: string | null
  description: string | null
  amount: number
  payment_date: string | null
  status: string | null
  account_number: string | null
}
interface BankBalance { bank_name: string; account_number: string | null; balance: number; balance_date: string | null }
interface BalancePoint { date: string; account: string; balance: number }

const won = (v: number) => `₩${Math.round(v).toLocaleString()}`
const wonShort = (v: number) => {
  const a = Math.abs(v)
  if (a >= 100_000_000) return `₩${(v / 100_000_000).toFixed(1).replace(/\.0$/, '')}억`
  if (a >= 10_000) return `₩${Math.round(v / 10_000).toLocaleString()}만`
  return won(v)
}
const monthKey = (d: string | null) => (d ?? '').slice(0, 7)
const thisMonth = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }).slice(0, 7)

const CASH_TONE: Record<string, { bg: string; fg: string }> = {
  revenue: tonePalettes.done,
  expense: tonePalettes.pending,
}
const CASH_LABEL: Record<string, string> = { revenue: '매출', expense: '비용', asset: '자산', liability: '부채', transfer: '대체' }

const CASH_COLUMNS: LColumn<CashRow>[] = [
  { key: 'type', label: '구분', width: '52px' },
  { key: 'date', label: '날짜', width: '58px' },
  { key: 'party', label: '거래처', width: 'minmax(96px,1fr)' },
  { key: 'desc', label: '적요', width: 'minmax(120px,1.4fr)', hideMobile: true },
  { key: 'amount', label: '금액', width: '104px', align: 'right' },
]

const TAX_COLUMNS: LColumn<FinanceTaxObligation>[] = [
  { key: 'status', label: '상태', width: '58px' },
  { key: 'due', label: '납부기한', width: '68px' },
  { key: 'title', label: '고지내역', width: 'minmax(120px,1fr)' },
  { key: 'amount', label: '금액', width: '96px', align: 'right' },
]

export default function MgmtNewPage() {
  const mobile = useIsMobile()
  const cols = useDashCols()

  const [cash, setCash] = useState<CashRow[]>([])
  const [balances, setBalances] = useState<BankBalance[]>([])
  const [history, setHistory] = useState<BalancePoint[]>([])
  const [taxes, setTaxes] = useState<FinanceTaxObligation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [cashRes, balRes, histRes, taxRes] = await Promise.all([
        fetch('/api/willow-mgmt/invoices', { cache: 'no-store' }),
        fetch('/api/willow-mgmt/bank-balances', { cache: 'no-store' }),
        fetch('/api/willow-mgmt/balance-history?start_date=2026-01-01', { cache: 'no-store' }),
        fetch('/api/finance/tax-obligations?company=willow', { cache: 'no-store' }),
      ])
      if (cashRes.ok) {
        const data = await cashRes.json()
        setCash(Array.isArray(data) ? data : data.invoices ?? [])
      }
      if (balRes.ok) setBalances(await balRes.json())
      if (histRes.ok) {
        const h = await histRes.json()
        if (Array.isArray(h)) setHistory(h)
      }
      if (taxRes.ok) {
        const data = await taxRes.json()
        setTaxes(data.obligations ?? [])
      }
    } catch {
      setError('사업관리 데이터를 불러오지 못했습니다. 새로고침으로 다시 시도해 주세요.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useAgentRefresh(['willow_mgmt'], load)

  const m = thisMonth()

  const totalBalance = useMemo(() => balances.reduce((s, b) => s + (b.balance || 0), 0), [balances])
  const balanceDate = useMemo(
    () => balances.map(b => b.balance_date).filter(Boolean).sort().slice(-1)[0] ?? null,
    [balances],
  )

  const monthCash = useMemo(() => cash.filter(r => monthKey(r.payment_date) === m), [cash, m])
  const revenue = useMemo(() => monthCash.filter(r => r.type === 'revenue').reduce((s, r) => s + Math.abs(r.amount), 0), [monthCash])
  const expense = useMemo(() => monthCash.filter(r => r.type === 'expense').reduce((s, r) => s + Math.abs(r.amount), 0), [monthCash])

  // 잔고 추이 — 계좌마다 움직인 날에만 스냅샷이 남는다. 날짜별로 그냥 더하면 그날 기록이 없는
  // 계좌가 0으로 빠져 톱니가 된다. 계좌별 마지막 값을 이어받아(forward-fill) 합산한다.
  const trend = useMemo<TrendPoint[]>(() => {
    const dates = [...new Set(history.map(p => p.date))].sort()
    const latest = new Map<string, number>()
    const byDate = new Map<string, Map<string, number>>()
    for (const p of history) {
      if (!byDate.has(p.date)) byDate.set(p.date, new Map())
      byDate.get(p.date)!.set(p.account, p.balance || 0)
    }
    return dates.map(date => {
      for (const [account, balance] of byDate.get(date) ?? []) latest.set(account, balance)
      let sum = 0
      for (const v of latest.values()) sum += v
      return { date, value: sum }
    })
  }, [history])
  const trendDelta = trend.length > 1 ? trend[trend.length - 1].value - trend[0].value : 0

  const recentCash = useMemo(
    () => [...cash].sort((a, b) => (b.payment_date ?? '').localeCompare(a.payment_date ?? '')).slice(0, 8),
    [cash],
  )
  const unpaidTaxes = useMemo(
    () => taxes.filter(o => o.status !== 'paid').sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? '')).slice(0, 8),
    [taxes],
  )
  const unpaidTotal = useMemo(() => taxes.filter(o => o.status !== 'paid').reduce((s, o) => s + (o.amount || 0), 0), [taxes])

  const kpiCols = mobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(4, minmax(0,1fr))'
  const twoCols = mobile ? '1fr' : (cols === 1 ? '1fr' : '1fr 1fr')

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.blockGap }}>
        <div style={{ display: 'grid', gridTemplateColumns: kpiCols, gap: t.density.blockGap }}>
          {[0, 1, 2, 3].map(i => <LCard key={i}><Bone h={72} /></LCard>)}
        </div>
        <LCard><Bone h={220} /></LCard>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.blockGap }}>
      {error && <LNotice tone="danger" text={error} />}

      {/* 지표 4장 — 카드 하나에 지표 하나, 자리(값·보조·하단 메타)가 같다 */}
      <div style={{ display: 'grid', gridTemplateColumns: kpiCols, gap: t.density.blockGap }}>
        <MetricCard
          eyebrow="BALANCE" title="총 잔고" icon="coin"
          value={wonShort(totalBalance)}
          pairs={balances.slice(0, 2).map(b => ({ label: b.bank_name, value: wonShort(b.balance) }))}
          foot={balanceDate ? `${balanceDate} 기준` : '잔고 기록 없음'}
          footRight={`${balances.length}개 계좌`}
        />
        <MetricCard
          eyebrow="REVENUE" title="이번달 매출" icon="trending"
          value={wonShort(revenue)}
          pairs={[
            { label: '건수', value: `${monthCash.filter(r => r.type === 'revenue').length}건` },
            { label: '평균', value: wonShort(revenue / Math.max(1, monthCash.filter(r => r.type === 'revenue').length)) },
          ]}
          foot={`${m.replace('-', '년 ')}월 입금 기준`}
        />
        <MetricCard
          eyebrow="EXPENSE" title="이번달 비용" icon="tag"
          value={wonShort(expense)}
          pairs={[
            { label: '건수', value: `${monthCash.filter(r => r.type === 'expense').length}건` },
            { label: '평균', value: wonShort(expense / Math.max(1, monthCash.filter(r => r.type === 'expense').length)) },
          ]}
          foot={`${m.replace('-', '년 ')}월 출금 기준`}
        />
        <MetricCard
          eyebrow="CASHFLOW" title="이번달 현금흐름" icon="arrow"
          value={wonShort(revenue - expense)}
          tone={revenue - expense >= 0 ? 'pos' : 'neg'}
          pairs={[
            { label: '매출', value: wonShort(revenue) },
            { label: '비용', value: wonShort(expense) },
          ]}
          foot="매출에서 비용을 뺀 값"
        />
      </div>

      {/* 잔고 추이 — 단일 시리즈라 회색 단색 */}
      <LCard>
        <LSectionHead
          eyebrow="BALANCE TREND"
          title="잔고 추이"
          meta={trend.length ? `${trend.length}일` : undefined}
          mb={t.density.gapMd}
        />
        <AreaTrend points={trend} height={mobile ? 160 : 220} format={wonShort} />
        <LCardFoot
          left={trend.length > 1 ? `${trend[0].date}부터 전 계좌 합계` : '기록 없음'}
          right={trend.length > 1 ? `${trendDelta >= 0 ? '+' : ''}${wonShort(trendDelta)}` : undefined}
        />
      </LCard>

      {/* 최근 거래 · 납부 예정 */}
      <div style={{ display: 'grid', gridTemplateColumns: twoCols, gap: t.density.blockGap, alignItems: 'start' }}>
        <LCard style={{ minWidth: 0 }}>
          <LSectionHead eyebrow="CASHFLOW" title="최근 거래" meta={`${cash.length}건`} mb={t.density.gapMd} />
          <LTableScroll columns={CASH_COLUMNS} mobile={mobile}>
            <LTableHead columns={CASH_COLUMNS} mobile={mobile} />
            {recentCash.length === 0 && <LTableEmpty>거래 기록이 없습니다</LTableEmpty>}
            <LTableBody columns={CASH_COLUMNS} mobile={mobile}>
              {recentCash.map(row => (
                <LTableRow key={row.id} columns={CASH_COLUMNS} mobile={mobile}>
                  <LTableBadge tone={CASH_TONE[row.type] ?? tonePalettes.neutral}>{CASH_LABEL[row.type] ?? row.type}</LTableBadge>
                  {row.payment_date ? <LTableDate value={row.payment_date} format="md" /> : <span style={{ color: t.neutrals.subtle }}>-</span>}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.counterparty ?? '-'}</span>
                  {!mobile && (
                    <span style={{ color: t.neutrals.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.description ?? '-'}
                    </span>
                  )}
                  <LTableMono align="right" strong>{won(Math.abs(row.amount))}</LTableMono>
                </LTableRow>
              ))}
            </LTableBody>
          </LTableScroll>
          <LCardFoot left="최근 8건 · 전체는 사업관리에서" right={`${recentCash.length} / ${cash.length}`} />
        </LCard>

        <LCard style={{ minWidth: 0 }}>
          <LSectionHead eyebrow="TAX" title="납부 예정" meta={`${taxes.filter(o => o.status !== 'paid').length}건`} mb={t.density.gapMd} />
          <LTableScroll columns={TAX_COLUMNS} mobile={mobile}>
            <LTableHead columns={TAX_COLUMNS} mobile={mobile} />
            {unpaidTaxes.length === 0 && <LTableEmpty>납부할 세금이 없습니다</LTableEmpty>}
            <LTableBody columns={TAX_COLUMNS} mobile={mobile}>
              {unpaidTaxes.map(row => (
                <LTableRow key={row.id} columns={TAX_COLUMNS} mobile={mobile}>
                  <LTableBadge tone={row.status === 'overdue' ? tonePalettes.danger : tonePalettes.pending}>
                    {row.status === 'overdue' ? '연체' : '예정'}
                  </LTableBadge>
                  {row.due_date ? <LTableDate value={row.due_date} format="md" /> : <span style={{ color: t.neutrals.subtle }}>-</span>}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.title}</span>
                  <LTableMono align="right" strong>{won(row.amount)}</LTableMono>
                </LTableRow>
              ))}
            </LTableBody>
          </LTableScroll>
          <LCardFoot left="기한이 가까운 순" right={won(unpaidTotal)} />
        </LCard>
      </div>
    </div>
  )
}
