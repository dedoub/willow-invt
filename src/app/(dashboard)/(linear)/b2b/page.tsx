'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAgentRefresh } from '@/hooks/use-agent-refresh'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'
import { LSegmented } from '@/app/(dashboard)/_components/linear-segmented'
import { LNotice } from '@/app/(dashboard)/_components/linear-notice'
import { B2bSkeleton } from '@/app/(dashboard)/_components/linear-skeleton'
import type { B2bCompany, B2bSettlementListItem } from '@/types/b2b'
import { SettlementsTable, type StatusFilter } from './_components/settlements-table'
import { SettlementDialog } from './_components/settlement-dialog'

type Direction = 'willow-tensw' | 'tensw-willow' | 'biblo-tensw'

const DIRECTION_KEY = 'b2b-direction'
const DIRECTION_OPTIONS = [
  { value: 'willow-tensw', label: '윌로우→텐소' },
  { value: 'tensw-willow', label: '텐소→윌로우' },
  { value: 'biblo-tensw', label: '비블로→텐소' },
] as const

const DIRECTION_PARTIES: Record<Direction, { provider: B2bCompany; client: B2bCompany }> = {
  'willow-tensw': { provider: 'willow', client: 'tensw' },
  'tensw-willow': { provider: 'tensw', client: 'willow' },
  'biblo-tensw': { provider: 'biblo', client: 'tensw' },
}

const STATUS_OPTIONS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'progress', label: '진행' },
  { value: 'closed', label: '닫힘' },
  { value: 'disputed', label: '불일치' },
]

function storedDirection(): Direction {
  if (typeof window === 'undefined') return 'willow-tensw'
  const v = localStorage.getItem(DIRECTION_KEY)
  return v === 'willow-tensw' || v === 'tensw-willow' || v === 'biblo-tensw' ? v : 'willow-tensw'
}

export default function B2bPage() {
  const mobile = useIsMobile()
  const [direction, setDirection] = useState<Direction>(storedDirection)
  const [status, setStatus] = useState<StatusFilter>('all')
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [settlements, setSettlements] = useState<B2bSettlementListItem[]>([])
  const [selectedRef, setSelectedRef] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoadError(null)
    try {
      const { provider, client } = DIRECTION_PARTIES[direction]
      const res = await fetch(`/api/b2b/settlements?provider=${provider}&client=${client}`)
      if (!res.ok) throw new Error('load failed')
      const json = await res.json()
      setSettlements(json.settlements ?? [])
    } catch {
      setLoadError('관계사간거래 원장을 불러오지 못했습니다. 새로고침으로 다시 시도해 주세요.')
    } finally {
      setLoaded(true)
    }
  }, [direction])

  useEffect(() => { loadData() }, [loadData])
  useAgentRefresh(['b2b_'], loadData)

  const changeDirection = (d: Direction) => {
    setDirection(d)
    setSelectedRef(null)
    localStorage.setItem(DIRECTION_KEY, d)
  }

  const stats = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const open = settlements.filter(s => s.status !== 'closed').length
    const mismatched = settlements.filter(s => (s.reconciliation && !s.reconciliation.ok) || s.status === 'disputed').length
    const yearSupply = settlements
      .filter(s => new Date(s.created_at).getFullYear() === currentYear)
      .reduce((sum, s) => sum + Number(s.supply_amount), 0)
    const bundled = settlements.filter(s => s.bundle_doc_no).length
    return { open, mismatched, yearSupply, bundled }
  }, [settlements])

  const closeDialog = useCallback(() => setSelectedRef(null), [])
  const selectedRow = useMemo(
    () => settlements.find(s => s.ref_no === selectedRef) ?? null,
    [settlements, selectedRef],
  )

  if (!loaded) return <B2bSkeleton />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.blockGap }}>
      <LCard>
        <LSectionHead
          eyebrow="INTER-COMPANY LEDGER"
          title="관계사간거래"
          note="세금계산서 한 장마다 업무기록·산정·문서·입금을 묶어 대사합니다."
          tools={<LSegmented options={DIRECTION_OPTIONS} value={direction} onChange={changeDirection} />}
        />
        {loadError && <div style={{ marginBottom: 10 }}><LNotice tone="danger" text={loadError} /></div>}
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: t.density.kpiGap }}>
          <LStat label="열린 정산" value={String(stats.open)} unit="건" tone={stats.open ? 'info' : 'default'} />
          <LStat label="대사 불일치" value={String(stats.mismatched)} unit="건" tone={stats.mismatched ? 'neg' : 'default'} />
          <LStat label="올해 공급가액 합계" value={`₩${Math.round(stats.yearSupply).toLocaleString()}`} />
          <LStat label="증빙 묶음" value={String(stats.bundled)} unit="건" />
        </div>
      </LCard>

      <LCard>
        <LSectionHead
          title="정산"
          meta={`${settlements.length}건`}
          tools={<LSegmented options={STATUS_OPTIONS} value={status} onChange={setStatus} />}
          mb={10}
        />
        <SettlementsTable settlements={settlements} status={status} onSelect={s => setSelectedRef(s.ref_no)} />
      </LCard>

      <SettlementDialog
        refNo={selectedRef}
        storedReconciliation={selectedRow?.reconciliation ?? null}
        storedUpdatedAt={selectedRow?.updated_at ?? null}
        onClose={closeDialog}
      />
    </div>
  )
}
