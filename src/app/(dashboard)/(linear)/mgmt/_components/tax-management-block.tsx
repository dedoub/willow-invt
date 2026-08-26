'use client'

import { useMemo, useState } from 'react'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'
import { LSegmented } from '@/app/(dashboard)/_components/linear-segmented'
import { LTableBadge, LTableBody, LTableEmpty, LTableHead, LTableRow, type LColumn } from '@/app/(dashboard)/_components/linear-table'
import { t, tonePalettes, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import type { FinanceTaxObligation, TaxObligationSource } from '@/types/finance-tax'

type SourceFilter = 'all' | TaxObligationSource

const SOURCES: Record<TaxObligationSource, string> = {
  hometax: '홈택스',
  wetax: '위택스',
  nhis: '사회보험',
}

const COLUMNS: LColumn<FinanceTaxObligation>[] = [
  { key: 'status', label: '상태', width: '68px' },
  { key: 'source', label: '출처', width: '62px' },
  { key: 'due', label: '납부기한', width: '82px' },
  { key: 'title', label: '고지내역', width: 'minmax(130px,1fr)' },
  { key: 'amount', label: '금액', width: 'minmax(80px,110px)', align: 'right' },
]

const STATUS_LABELS = { unpaid: '미지급', paid: '지급완료', overdue: '기한초과', cancelled: '취소' }

export function TaxManagementBlock({ obligations }: { obligations: FinanceTaxObligation[] }) {
  const mobile = useIsMobile()
  const [source, setSource] = useState<SourceFilter>('all')
  const rows = useMemo(
    () => obligations
      .filter(item => source === 'all' || item.source === source)
      .sort((a, b) => (b.due_date || '').localeCompare(a.due_date || '')),
    [obligations, source],
  )
  const unpaid = obligations.filter(item => item.status === 'unpaid' || item.status === 'overdue')
  const overdue = obligations.filter(item => item.status === 'overdue')
  const paid = obligations.filter(item => item.status === 'paid')

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 10 }}>
        <LSectionHead
          eyebrow="TAX & INSURANCE"
          title="세금관리"
          meta="은행 출금 자동 매칭"
          tools={
            <LSegmented
              value={source}
              onChange={setSource}
              options={[
                { value: 'all', label: '전체' },
                { value: 'hometax', label: '홈택스' },
                { value: 'wetax', label: '위택스' },
                { value: 'nhis', label: '사회보험' },
              ]}
            />
          }
        />
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(3,1fr)', gap: t.density.kpiGap }}>
          <LStat label="미지급" value={`${unpaid.reduce((sum, item) => sum + item.amount, 0).toLocaleString()}원`} tone={unpaid.length ? 'warn' : 'default'} sub={`${unpaid.length.toLocaleString()}건`} />
          <LStat label="기한초과" value={`${overdue.reduce((sum, item) => sum + item.amount, 0).toLocaleString()}원`} tone={overdue.length ? 'neg' : 'default'} sub={`${overdue.length.toLocaleString()}건`} />
          <LStat label="지급완료" value={`${paid.reduce((sum, item) => sum + item.amount, 0).toLocaleString()}원`} tone="pos" sub={`${paid.length.toLocaleString()}건`} />
        </div>
      </div>

      <div style={{ padding: '0 16px 12px' }}>
        <LTableHead columns={COLUMNS} mobile={mobile} />
        {rows.length === 0 && <LTableEmpty>수집된 세금·사회보험 고지가 없습니다</LTableEmpty>}
        <LTableBody columns={COLUMNS} mobile={mobile}>
          {rows.map(item => {
            const tone = item.status === 'paid'
              ? tonePalettes.done
              : item.status === 'overdue'
                ? tonePalettes.danger
                : item.status === 'cancelled'
                  ? tonePalettes.neutral
                  : tonePalettes.pending
            return (
              <LTableRow key={item.id} columns={COLUMNS} mobile={mobile}>
                <LTableBadge tone={tone}>{STATUS_LABELS[item.status]}</LTableBadge>
                <span style={{ color: t.neutrals.muted }}>{SOURCES[item.source]}</span>
                <span style={{ color: t.neutrals.muted, fontFamily: t.font.mono }}>{item.due_date || '-'}</span>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }} title={`${item.agency} · ${item.title}`}>
                  {item.title}
                </span>
                <span style={{ textAlign: 'right', fontFamily: t.font.mono, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {item.amount.toLocaleString()}
                </span>
              </LTableRow>
            )
          })}
        </LTableBody>
      </div>
    </LCard>
  )
}
