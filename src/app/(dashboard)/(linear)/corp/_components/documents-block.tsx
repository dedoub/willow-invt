'use client'

import { useMemo, useState } from 'react'
import { t, tonePalettes, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LFilterChip } from '@/app/(dashboard)/_components/linear-filter-chip'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import {
  LTableBadge, LTableBody, LTableDate, LTableEmpty, LTableHead, LTableRow, LTableScroll,
  useTableSort, type LColumn, LPageSize,
} from '@/app/(dashboard)/_components/linear-table'
import { getStoredPageSize, savePageSize } from '@/app/(dashboard)/_components/linear-page-size'
import { CORP_DOC_TYPE_LABEL, type CorpDocument } from '@/types/willow-corp'
import { DOC_GROUP_OPTIONS, docGroup, docStatusTone, expiryState, type DocGroup } from './corp-format'

const PAGE_KEY = 'corp-documents'

const COLUMNS: LColumn<CorpDocument>[] = [
  { key: 'doc_no', label: '문서번호', width: '118px', sortValue: row => row.doc_no },
  { key: 'type', label: '유형', width: '96px', sortValue: row => row.doc_type },
  { key: 'title', label: '제목', width: 'minmax(180px,1fr)', sortValue: row => row.title },
  { key: 'issued', label: '발급·체결', width: '82px', hideMobile: true, sortValue: row => row.issued_at ?? '', sortFirst: 'desc' },
  { key: 'valid', label: '유효·종료', width: '96px', hideMobile: true, sortValue: row => row.valid_to ?? row.contract_end ?? '' },
  { key: 'versions', label: '버전', width: '52px', align: 'right', sortValue: row => row.versions.length },
  { key: 'chevron', label: '', width: '14px' },
]

interface Props {
  documents: CorpDocument[]
  onSelect: (doc: CorpDocument) => void
}

export function DocumentsBlock({ documents, onSelect }: Props) {
  const mobile = useIsMobile()
  const [group, setGroup] = useState<DocGroup>('all')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(() => getStoredPageSize(PAGE_KEY, 10))
  const { sort, toggle: toggleSort, apply: sortApply } = useTableSort<CorpDocument>('corp-documents', COLUMNS)

  const filtered = useMemo(
    () => documents.filter(d => group === 'all' || docGroup(d.doc_type) === group),
    [documents, group],
  )
  const sorted = useMemo(() => sortApply(filtered), [filtered, sortApply])
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const paged = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize)

  const applyPageSize = (n: number) => { setPageSize(n); setPage(0); savePageSize(PAGE_KEY, n) }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapMd, marginBottom: 10, flexWrap: 'wrap' }}>
        <LFilterChip options={DOC_GROUP_OPTIONS} value={group} onChange={g => { setGroup(g); setPage(0) }} />
      </div>

      <LTableScroll columns={COLUMNS} mobile={mobile}>
        <LTableHead columns={COLUMNS} mobile={mobile} sort={sort} onSort={toggleSort} />
        {paged.length === 0 && <LTableEmpty>등록된 문서가 없습니다</LTableEmpty>}
        <LTableBody columns={COLUMNS} mobile={mobile}>
          {paged.map(doc => {
            const expiry = expiryState(doc)
            const end = doc.valid_to ?? doc.contract_end
            return (
              <LTableRow key={doc.id} columns={COLUMNS} mobile={mobile} onClick={() => onSelect(doc)}>
                <span style={{ fontFamily: t.font.mono, fontSize: 'calc(10.5px * var(--fz, 1))', color: t.neutrals.muted, whiteSpace: 'nowrap' }}>
                  {doc.doc_no}
                </span>
                <LTableBadge tone={docStatusTone(doc.status)}>
                  {CORP_DOC_TYPE_LABEL[doc.doc_type] ?? doc.doc_type}
                </LTableBadge>
                <span style={{ minWidth: 0, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {doc.title}
                  {doc.counterparty && (
                    <span style={{ color: t.neutrals.subtle, fontWeight: 400 }}> · {doc.counterparty}</span>
                  )}
                </span>
                {!mobile && (doc.issued_at ? <LTableDate value={doc.issued_at} format="ymd" /> : <span style={{ color: t.neutrals.subtle }}>-</span>)}
                {!mobile && (
                  end ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <LTableDate value={end} format="ymd" tone={expiry === 'expired' ? 'neg' : undefined} />
                      {expiry && (
                        <LTableBadge tone={expiry === 'expired' ? tonePalettes.danger : tonePalettes.warn}>
                          {expiry === 'expired' ? '만료' : '임박'}
                        </LTableBadge>
                      )}
                    </span>
                  ) : <span style={{ color: t.neutrals.subtle }}>-</span>
                )}
                <span style={{ textAlign: 'right', fontFamily: t.font.mono, fontSize: 'calc(11px * var(--fz, 1))', color: doc.versions.length ? t.neutrals.text : t.neutrals.subtle }}>
                  {doc.versions.length ? `v${doc.versions.length}` : '없음'}
                </span>
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

export function Pagination({ page, totalPages, pageSize, total, onPage, onPageSize }: {
  page: number; totalPages: number; pageSize: number; total: number
  onPage: (updater: (p: number) => number) => void; onPageSize: (n: number) => void
}) {
  const atStart = page === 0
  const atEnd = page >= totalPages - 1
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '6px 0 0', marginTop: 6, borderTop: `1px solid ${t.neutrals.line}`,
    }}>
      <LPageSize value={pageSize} onChange={onPageSize} />
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button disabled={atStart} onClick={() => onPage(p => Math.max(0, p - 1))} style={pagerBtn(atStart)}>
            <LIcon name="chevronLeft" size={13} stroke={2} />
          </button>
          <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted }}>
            {page * pageSize + 1}-{Math.min((page + 1) * pageSize, total)} / {total}
          </span>
          <button disabled={atEnd} onClick={() => onPage(p => p + 1)} style={pagerBtn(atEnd)}>
            <LIcon name="chevronRight" size={13} stroke={2} />
          </button>
        </div>
      )}
    </div>
  )
}

function pagerBtn(disabled: boolean): React.CSSProperties {
  return {
    background: 'transparent', border: 'none', padding: 4, borderRadius: 4,
    cursor: disabled ? 'default' : 'pointer',
    color: disabled ? t.neutrals.line : t.neutrals.muted, opacity: disabled ? 0.4 : 1,
  }
}
