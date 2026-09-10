'use client'

import { useState, useMemo } from 'react'
import { t } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead, LHeadBtn } from '@/app/(dashboard)/_components/linear-section-head'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LBadge } from '@/app/(dashboard)/_components/linear-badge'
import { LFilterChip } from '@/app/(dashboard)/_components/linear-filter-chip'
import { FullEmail } from '@/app/(dashboard)/(linear)/mgmt/_components/email-detail-dialog'
import { LPageSize, LTableScroll, LTableHead, LTableBody, LTableRow, LTableEmpty, LTableBadge, type LColumn } from '@/app/(dashboard)/_components/linear-table'

interface EmailBlockProps {
  emails: FullEmail[]
  connected: boolean
  onSelectEmail: (email: FullEmail) => void
  onSync: () => void
  onCompose: () => void
  isSyncing?: boolean
  onConnect?: () => void
  title?: string
  eyebrow?: string
}

const SOURCE_FILTERS = [
  { key: 'all',    label: '전체' },
  { key: 'WILLOW', label: '윌로우' },
  { key: 'TENSW',  label: '텐소프트웍스' },
  { key: 'ETC',    label: 'ETC' },
  { key: 'Akros',  label: '아크로스' },
  { key: 'PERSONAL', label: '개인' },
] as const

// 출처 칩은 색조 대신 회색 명도로 나눈다 — 사업관리 표와 같은 문법(2026-09-11)
const SOURCE_TONE: Record<string, { bg: string; fg: string }> = {
  WILLOW:   { bg: '#D3D7DD', fg: '#1F242B' },
  TENSW:    { bg: '#DCE0E5', fg: '#262C33' },
  ETC:      { bg: '#E4E7EB', fg: '#2C323A' },
  Akros:    { bg: '#EAECEF', fg: '#343A42' },
  PERSONAL: { bg: '#EDEFF2', fg: '#3A4048' },
}
const OUTBOUND_TONE = { bg: '#C7CCD3', fg: '#171B21' }

// 표 열은 사업관리와 같은 순서 — 구분·시간·보낸사람·제목
const COLUMNS: LColumn<FullEmail>[] = [
  { key: 'source', label: '출처', width: '68px' },
  { key: 'category', label: '분류', width: '84px' },
  { key: 'time', label: '시간', width: '104px' },
  { key: 'from', label: '보낸사람', width: 'minmax(80px,0.6fr)' },
  { key: 'subject', label: '제목', width: 'minmax(140px,1.4fr)' },
]

// 언제 온 건지(일자)와 얼마나 됐는지(경과)를 한 칸에서 같이 읽는다(CEO 2026-09-11)
function receivedAt(dateStr: string): string {
  const d = new Date(dateStr)
  const day = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const mins = Math.floor((Date.now() - d.getTime()) / 60000)
  if (mins < 60) return `${day} (${mins}분 전)`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${day} (${hours}시간 전)`
  return `${day} (${Math.floor(hours / 24)}일 전)`
}


const EMAIL_PAGE_KEY = 'email-page-size'
const DEFAULT_PAGE_SIZE = 25

function getStoredPageSize(): number {
  if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE
  const v = localStorage.getItem(EMAIL_PAGE_KEY)
  if (!v) return DEFAULT_PAGE_SIZE
  const n = Number(v)
  return n >= 1 && n <= 100 ? n : DEFAULT_PAGE_SIZE
}

export function EmailBlock({
  emails, connected, onSelectEmail, onSync, onCompose, isSyncing, onConnect,
  title = '이메일', eyebrow = 'EMAIL',
}: EmailBlockProps) {
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(getStoredPageSize)

  // Count emails per source
  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const e of emails) {
      const src = e.sourceLabel || 'WILLOW'
      counts[src] = (counts[src] || 0) + 1
    }
    return counts
  }, [emails])

  // Only show filters for sources that have emails
  const activeFilters = useMemo(() => {
    const available = SOURCE_FILTERS.filter(f => f.key === 'all' || sourceCounts[f.key])
    // Don't show filters if only one source exists
    return available.length <= 2 ? [] : available
  }, [sourceCounts])

  // 출처가 한 갈래뿐이면(개인 이메일) 출처·분류 열은 빈 칸만 반복하므로 뺀다(CEO 2026-09-11)
  const multiSource = activeFilters.length > 0
  const columns = useMemo(
    () => (multiSource ? COLUMNS : COLUMNS.filter(c => c.key !== 'source' && c.key !== 'category')),
    [multiSource],
  )

  const filtered = useMemo(() => {
    let rows = sourceFilter === 'all' ? emails : emails.filter(e => (e.sourceLabel || 'WILLOW') === sourceFilter)
    const q = search.trim().toLowerCase()
    if (q) {
      rows = rows.filter(e => `${e.subject ?? ''} ${e.fromName ?? ''} ${e.from ?? ''}`.toLowerCase().includes(q))
    }
    return rows
  }, [emails, sourceFilter, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize)

  const handleFilterChange = (key: string) => {
    setSourceFilter(key)
    setPage(0)
  }

  const applyPageSize = (n: number) => {
    setPageSize(n)
    setPage(0)
    localStorage.setItem(EMAIL_PAGE_KEY, String(n))
  }

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadY + t.density.panelPadX }}>
        <LSectionHead
          title={title}
          action={connected ? <LHeadBtn icon="refresh" title="이메일 동기화" onClick={onSync} busy={isSyncing} /> : undefined}
          mb={0}
        />
      </div>

      {/* 출처 칩 · 검색 한 줄 — 사업관리 표 카드와 같은 자리, 같은 모양 */}
      {connected && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: t.density.gapSm,
          padding: `0 ${t.density.cardPad}px ${t.density.gapSm}px`,
        }}>
          {activeFilters.length > 0 && (
            <div style={{
              maxWidth: searchOpen ? 0 : 520,
              opacity: searchOpen ? 0 : 1,
              overflow: 'hidden',
              transition: 'max-width .26s ease, opacity .16s ease',
            }}>
              <LFilterChip
                options={activeFilters.map(f => ({ value: f.key as string, label: f.label }))}
                value={sourceFilter}
                onChange={handleFilterChange}
                gap={t.density.gapXs}
              />
            </div>
          )}

          <div style={{ position: 'relative', flex: 1, minWidth: 140 }}>
            <div style={{ position: 'absolute', left: t.density.panelPadX, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}>
              <LIcon name="search" size={13} stroke={2} color={t.neutrals.subtle} />
            </div>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0) }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => { if (!search) setSearchOpen(false) }}
              placeholder="제목 · 보낸사람 검색"
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
      )}

      {/* 목록 — 사업관리 표와 같은 문법. 행을 누르면 상세 모달이 열린다 */}
      <div style={{ padding: `0 ${t.density.cardPad}px ${t.density.gapSm}px` }}>
        {connected ? (
          <LTableScroll columns={columns}>
            <LTableHead columns={columns} />
            {filtered.length === 0 ? (
              <LTableEmpty>{search ? '검색 결과가 없습니다' : '이메일이 없습니다'}</LTableEmpty>
            ) : (
              <LTableBody columns={columns}>
                {paged.map(m => {
                  const outbound = m.direction === 'outbound'
                  const srcKey = m.sourceLabel || 'WILLOW'
                  const srcLabel = SOURCE_FILTERS.find(f => f.key === srcKey)?.label || srcKey
                  return (
                    <LTableRow
                      key={`${m.sourceLabel || ''}-${m.id}`}
                      columns={columns}
                      onClick={() => onSelectEmail(m)}
                    >
                      {multiSource && (
                        <LTableBadge tone={outbound ? OUTBOUND_TONE : (SOURCE_TONE[srcKey] ?? SOURCE_TONE.WILLOW)}>
                          {outbound ? '발신' : srcLabel}
                        </LTableBadge>
                      )}
                      {multiSource && (m.category
                        ? <LTableBadge tone={{ bg: '#F5F6F8', fg: '#4B525A' }}>{m.category}</LTableBadge>
                        : <span />)}
                      <span style={{
                        fontFamily: t.font.mono, fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`,
                        color: t.neutrals.subtle, whiteSpace: 'nowrap',
                      }}>
                        {receivedAt(m.date)}
                      </span>
                      <span style={{
                        minWidth: 0, color: t.neutrals.muted,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }} title={m.from}>
                        {m.fromName || m.from.replace(/<.*>/, '').trim() || m.from}
                      </span>
                      <span style={{
                        minWidth: 0, display: 'flex', alignItems: 'center', gap: t.density.gapSm,
                        whiteSpace: 'nowrap', overflow: 'hidden',
                      }}>
                        {m.unread && (
                          <span style={{ width: 5, height: 5, borderRadius: 3, background: t.chart.mono, flexShrink: 0 }} />
                        )}
                        {/* 열이 줄어든 카드에서는 발신 여부를 제목 앞에 붙인다 */}
                        {!multiSource && outbound && (
                          <LTableBadge tone={OUTBOUND_TONE}>발신</LTableBadge>
                        )}
                        <span style={{
                          minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
                          fontWeight: m.unread ? t.weight.medium : t.weight.regular,
                          color: m.unread ? t.neutrals.text : t.neutrals.muted,
                        }} title={m.subject ?? undefined}>
                          {m.subject || '(제목 없음)'}
                        </span>
                      </span>
                    </LTableRow>
                  )
                })}
              </LTableBody>
            )}
          </LTableScroll>
        ) : (
          <div style={{
            padding: `${t.density.pagePadBottom}px 0 ${t.density.cardPad}px`, textAlign: 'center',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: t.density.gapMd,
            fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, color: t.neutrals.subtle,
          }}>
            <div>Gmail 연결이 필요합니다</div>
            {onConnect && <LBtn variant="secondary" size="sm" onClick={onConnect}>Gmail 연결</LBtn>}
          </div>
        )}
      </div>

      {/* 페이지 줄 — 연결된 카드에만 둔다 */}
      {connected && (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `0 ${t.density.cardPad}px ${t.density.cardPad}px`,
      }}>
        {/* Page size input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapXs }}>
          <LPageSize value={pageSize} onChange={applyPageSize} />
        </div>

        {/* Page navigation */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm }}>
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
              style={{
                background: 'transparent', border: 'none',
                cursor: page === 0 ? 'default' : 'pointer',
                padding: t.density.gapXs, borderRadius: t.radius.sm,
                color: page === 0 ? t.neutrals.line : t.neutrals.muted,
                opacity: page === 0 ? 0.4 : 1,
              }}>
              <LIcon name="chevronLeft" size={13} stroke={2} />
            </button>
            <span style={{
              fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, fontFamily: t.font.mono, color: t.neutrals.muted,
            }}>
              {page * pageSize + 1}-{Math.min((page + 1) * pageSize, filtered.length)} / {filtered.length}
            </span>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
              style={{
                background: 'transparent', border: 'none',
                cursor: page >= totalPages - 1 ? 'default' : 'pointer',
                padding: t.density.gapXs, borderRadius: t.radius.sm,
                color: page >= totalPages - 1 ? t.neutrals.line : t.neutrals.muted,
                opacity: page >= totalPages - 1 ? 0.4 : 1,
              }}>
              <LIcon name="chevronRight" size={13} stroke={2} />
            </button>
          </div>
        )}
      </div>
      )}
    </LCard>
  )
}
