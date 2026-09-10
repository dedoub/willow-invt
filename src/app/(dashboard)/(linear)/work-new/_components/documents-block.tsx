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
import { DOC_GROUP_OPTIONS, docGroup, expiryState, type DocGroup } from '@/app/(dashboard)/(linear)/corp/_components/corp-format'

const PAGE_KEY = 'corp-documents'

// 유형 칩은 색조 대신 회색 명도로 나눈다 — 계약이 가장 진하고 기타가 가장 옅다
// (2026-09-11 사업관리 표와 같은 문법).
const GROUP_TONES: Record<string, { bg: string; fg: string }> = {
  contract:     { bg: '#C7CCD3', fg: '#171B21' },
  registry:     { bg: '#D3D7DD', fg: '#1F242B' },
  resolution:   { bg: '#DCE0E5', fg: '#262C33' },
  rules:        { bg: '#E4E7EB', fg: '#2C323A' },
  tax:          { bg: '#EAECEF', fg: '#343A42' },
  shareholders: { bg: '#EDEFF2', fg: '#3A4048' },
  other:        { bg: '#F5F6F8', fg: '#4B525A' },
}

// 사업관리 표와 같은 순서로 읽는다 — 구분(유형)이 1열, 그다음 날짜·이름(2026-09-11)
const COLUMNS: LColumn<CorpDocument>[] = [
  { key: 'type', label: '유형', width: '84px', sortValue: row => row.doc_type },
  { key: 'issued', label: '발급·체결', width: '68px', hideMobile: true, sortValue: row => row.issued_at ?? '', sortFirst: 'desc' },
  { key: 'valid', label: '유효·종료', width: '92px', hideMobile: true, sortValue: row => row.valid_to ?? row.contract_end ?? '' },
  { key: 'title', label: '제목', width: 'minmax(180px,1fr)', sortValue: row => row.title },
  { key: 'versions', label: '버전', width: '46px', align: 'right', sortValue: row => row.versions.length },
]

interface Props {
  documents: CorpDocument[]
  onSelect: (doc: CorpDocument) => void
  footerNote?: string
}

export function DocumentsBlock({ documents, onSelect, footerNote }: Props) {
  const mobile = useIsMobile()
  const [group, setGroup] = useState<DocGroup>('all')
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(() => getStoredPageSize(PAGE_KEY, 10))
  const { sort, toggle: toggleSort, apply: sortApply } = useTableSort<CorpDocument>('corp-documents', COLUMNS)

  const filtered = useMemo(() => {
    let rows = documents.filter(d => group === 'all' || docGroup(d.doc_type) === group)
    const q = search.trim().toLowerCase()
    if (q) {
      rows = rows.filter(d =>
        `${d.doc_no} ${d.title} ${d.counterparty ?? ''} ${CORP_DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type}`
          .toLowerCase().includes(q))
    }
    return rows
  }, [documents, group, search])
  const sorted = useMemo(() => sortApply(filtered), [filtered, sortApply])
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const paged = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize)

  const applyPageSize = (n: number) => { setPageSize(n); setPage(0); savePageSize(PAGE_KEY, n) }

  return (
    <>
      {/* 유형 칩 · 검색 한 줄 — 사업관리 표 카드와 같은 자리, 같은 모양 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: t.density.gapSm,
        marginBottom: t.density.gapSm, flexWrap: mobile ? 'wrap' : 'nowrap',
      }}>
        <div style={{
          maxWidth: searchOpen ? 0 : 520,
          opacity: searchOpen ? 0 : 1,
          overflow: 'hidden',
          transition: 'max-width .26s ease, opacity .16s ease',
        }}>
          <LFilterChip options={DOC_GROUP_OPTIONS} value={group} onChange={g => { setGroup(g); setPage(0) }} gap={t.density.gapXs} />
        </div>

        <div style={{ position: 'relative', flex: 1, minWidth: mobile ? '100%' : 140 }}>
          <div style={{ position: 'absolute', left: t.density.panelPadX, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}>
            <LIcon name="search" size={13} stroke={2} color={t.neutrals.subtle} />
          </div>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => { if (!search) setSearchOpen(false) }}
            placeholder="제목 · 거래처 · 문서번호 검색"
            style={{
              width: '100%', boxSizing: 'border-box', minHeight: t.density.controlHSm,
              padding: `0 ${t.density.panelPadX}px 0 30px`, fontSize: `calc(${t.type.control}px * var(--fz, 1))`,
              fontFamily: t.font.sans, color: t.neutrals.text,
              background: t.neutrals.card, border: `1px solid ${t.neutrals.line}`,
              borderRadius: t.radius.sm, outline: 'none',
            }}
          />
          {search && (
            <button onClick={() => { setSearch(''); setPage(0); setSearchOpen(false) }} style={{
              position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: t.density.tableRowGap, color: t.neutrals.muted, display: 'flex', alignItems: 'center',
            }}>
              <LIcon name="x" size={12} stroke={2} />
            </button>
          )}
        </div>
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
                <LTableBadge tone={GROUP_TONES[docGroup(doc.doc_type)] ?? GROUP_TONES.other}>
                  {CORP_DOC_TYPE_LABEL[doc.doc_type] ?? doc.doc_type}
                </LTableBadge>
                {!mobile && (doc.issued_at ? <LTableDate value={doc.issued_at} format="ymd" /> : <span style={{ color: t.neutrals.subtle }}>-</span>)}
                {!mobile && (
                  end ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm }}>
                      <LTableDate value={end} format="ymd" tone={expiry === 'expired' ? 'neg' : undefined} />
                      {expiry && (
                        <LTableBadge tone={expiry === 'expired' ? tonePalettes.danger : tonePalettes.warn}>
                          {expiry === 'expired' ? '만료' : '임박'}
                        </LTableBadge>
                      )}
                    </span>
                  ) : <span style={{ color: t.neutrals.subtle }}>-</span>
                )}
                <span style={{ minWidth: 0, fontWeight: t.weight.medium, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {doc.title}
                  {doc.counterparty && (
                    <span style={{ color: t.neutrals.subtle, fontWeight: t.weight.regular }}> · {doc.counterparty}</span>
                  )}
                </span>
                <span style={{ textAlign: 'right', fontFamily: t.font.mono, fontSize: `calc(${t.type.control}px * var(--fz, 1))`, color: doc.versions.length ? t.neutrals.text : t.neutrals.subtle }}>
                  {doc.versions.length ? `v${doc.versions.length}` : '없음'}
                </span>
              </LTableRow>
            )
          })}
        </LTableBody>
      </LTableScroll>

      <Pagination
        page={safePage} totalPages={totalPages} pageSize={pageSize} total={sorted.length}
        onPage={setPage} onPageSize={applyPageSize} footerNote={footerNote}
      />
    </>
  )
}

export function Pagination({ page, totalPages, pageSize, total, onPage, onPageSize, footerNote }: {
  page: number; totalPages: number; pageSize: number; total: number
  onPage: (updater: (p: number) => number) => void; onPageSize: (n: number) => void
  footerNote?: string
}) {
  const atStart = page === 0
  const atEnd = page >= totalPages - 1
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      paddingTop: t.density.gapSm,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapXs, minWidth: 0, flex: 1 }}>
        <LPageSize value={pageSize} onChange={onPageSize} />
        {footerNote && (
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: t.neutrals.muted, fontSize: `calc(${t.type.helper}px * var(--fz, 1))` }}>
            {footerNote}
          </span>
        )}
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm }}>
          <button disabled={atStart} onClick={() => onPage(p => Math.max(0, p - 1))} style={pagerBtn(atStart)}>
            <LIcon name="chevronLeft" size={13} stroke={2} />
          </button>
          <span style={{ fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, fontFamily: t.font.mono, color: t.neutrals.muted }}>
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
    background: 'transparent', border: 'none', padding: t.density.gapXs, borderRadius: t.radius.sm,
    cursor: disabled ? 'default' : 'pointer',
    color: disabled ? t.neutrals.line : t.neutrals.muted, opacity: disabled ? 0.4 : 1,
  }
}
