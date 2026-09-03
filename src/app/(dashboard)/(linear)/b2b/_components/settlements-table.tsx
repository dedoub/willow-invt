'use client'

import { useMemo, useState } from 'react'
import { t, tonePalettes, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import {
  LTableBadge, LTableBody, LTableEmpty, LTableHead, LTableNumber, LTableRow, LTableScroll,
  useTableSort, type LColumn,
} from '@/app/(dashboard)/_components/linear-table'
import { getStoredPageSize, savePageSize } from '@/app/(dashboard)/_components/linear-page-size'
import { Pagination } from '../../corp/_components/documents-block'
import type { B2bSettlementListItem, B2bSettlementStatus } from '@/types/b2b'

const PAGE_KEY = 'b2b-settlements'

export type StatusFilter = 'all' | 'progress' | 'closed' | 'disputed'

function matchesStatus(status: B2bSettlementStatus, filter: StatusFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'closed') return status === 'closed'
  if (filter === 'disputed') return status === 'disputed'
  return status !== 'closed' && status !== 'disputed'
}

const COLUMNS: LColumn<B2bSettlementListItem>[] = [
  { key: 'ref_no', label: '정산번호', width: '112px', sortValue: row => row.ref_no },
  { key: 'period', label: '기간', width: '90px', sortValue: row => row.period_label ?? '' },
  { key: 'engagement', label: '약정', width: '110px', sortValue: row => row.engagement_ref ?? '' },
  { key: 'supply', label: '공급가액', width: '96px', align: 'right', sortValue: row => Number(row.supply_amount), sortFirst: 'desc' },
  { key: 'invoices', label: '세금계산서', width: '100px', hideMobile: true },
  { key: 'cash', label: '입금', width: '52px', hideMobile: true },
  { key: 'recon', label: '대사', width: '84px' },
  { key: 'bundle', label: '묶음', width: '48px', align: 'center', hideMobile: true },
  { key: 'chevron', label: '', width: '14px' },
]

interface Props {
  settlements: B2bSettlementListItem[]
  status: StatusFilter
  onSelect: (row: B2bSettlementListItem) => void
}

export function SettlementsTable({ settlements, status, onSelect }: Props) {
  const mobile = useIsMobile()
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(() => getStoredPageSize(PAGE_KEY, 10))
  const { sort, toggle: toggleSort, apply: sortApply } = useTableSort<B2bSettlementListItem>('b2b-settlements', COLUMNS)

  const filtered = useMemo(
    () => settlements.filter(s => matchesStatus(s.status, status)),
    [settlements, status],
  )
  const sorted = useMemo(() => sortApply(filtered), [filtered, sortApply])
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const paged = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize)

  const applyPageSize = (n: number) => { setPageSize(n); setPage(0); savePageSize(PAGE_KEY, n) }

  return (
    <>
      <LTableScroll columns={COLUMNS} mobile={mobile}>
        <LTableHead columns={COLUMNS} mobile={mobile} sort={sort} onSort={toggleSort} />
        {paged.length === 0 && <LTableEmpty>정산 건이 없습니다. 세금계산서가 발행되면 여기서 증빙을 묶습니다.</LTableEmpty>}
        <LTableBody columns={COLUMNS} mobile={mobile}>
          {paged.map(row => {
            const recon = row.reconciliation
            const reconTone = recon == null ? tonePalettes.neutral : recon.ok ? tonePalettes.done : tonePalettes.danger
            const reconLabel = recon == null ? '-' : recon.ok ? '통과' : '불일치'
            return (
              <LTableRow key={row.id} columns={COLUMNS} mobile={mobile} onClick={() => onSelect(row)}>
                <span style={{ fontFamily: t.font.mono, fontSize: 'calc(10.5px * var(--fz, 1))', color: t.neutrals.muted, whiteSpace: 'nowrap' }}>
                  {row.ref_no}
                </span>
                <span style={{ fontSize: 'calc(11.5px * var(--fz, 1))', color: t.neutrals.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row.period_label ?? '-'}
                </span>
                <span style={{ fontFamily: t.font.mono, fontSize: 'calc(11px * var(--fz, 1))', color: row.engagement_ref ? t.neutrals.muted : t.neutrals.subtle, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row.engagement_ref ?? '-'}
                </span>
                <LTableNumber value={Number(row.supply_amount)} />
                {!mobile && (
                  <span style={{ display: 'flex', gap: 4 }}>
                    <LTableBadge tone={row.tax_invoice_willow_id ? tonePalettes.done : tonePalettes.neutral}>윌{row.tax_invoice_willow_id ? '✓' : '✗'}</LTableBadge>
                    <LTableBadge tone={row.tax_invoice_tensw_id ? tonePalettes.done : tonePalettes.neutral}>텐{row.tax_invoice_tensw_id ? '✓' : '✗'}</LTableBadge>
                  </span>
                )}
                {!mobile && (
                  <span style={{ color: (row.cash_willow_ids.length && row.cash_tensw_ids.length) ? t.accent.pos : t.neutrals.subtle }}>
                    {(row.cash_willow_ids.length && row.cash_tensw_ids.length) ? '✓' : '✗'}
                  </span>
                )}
                <LTableBadge tone={reconTone}>{reconLabel}</LTableBadge>
                {!mobile && (
                  <span style={{ textAlign: 'center', color: row.bundle_doc_no ? t.accent.pos : t.neutrals.subtle }}>
                    {row.bundle_doc_no ? '✓' : '-'}
                  </span>
                )}
                <span style={{ color: t.neutrals.subtle, display: 'flex' }}>
                  <LIcon name="chevronRight" size={12} stroke={2} />
                </span>
              </LTableRow>
            )
          })}
        </LTableBody>
      </LTableScroll>

      <Pagination
        page={safePage} totalPages={totalPages} pageSize={pageSize} total={sorted.length}
        onPage={setPage} onPageSize={applyPageSize}
      />
    </>
  )
}
