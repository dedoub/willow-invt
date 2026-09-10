'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { t, tonePalettes, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LBadge } from '@/app/(dashboard)/_components/linear-badge'
import { LFilterChip } from '@/app/(dashboard)/_components/linear-filter-chip'
import { LSegmented } from '@/app/(dashboard)/_components/linear-segmented'
import { WikiNote, WikiMemo } from '@/app/(dashboard)/(linear)/wiki/_components/wiki-note-row'
import { WikiNoteForm } from '@/app/(dashboard)/(linear)/wiki/_components/wiki-note-form'
import { htmlToPlainText, plainTextToHtml, sanitizeEditorHtml } from '@/components/ui/tiptap-editor'
import { LPageSize, LTableBadge, LTableScroll, LTableHead, LTableBody, LTableRow, LTableEmpty, LTableDate, type LColumn } from '@/app/(dashboard)/_components/linear-table'

type SectionFilter = 'all' | 'memo' | 'akros' | 'etf-etc' | 'willow-mgmt' | 'tensw-mgmt' | 'invest-mgmt'
type WikiSection = 'memo' | 'akros' | 'etf-etc' | 'willow-mgmt' | 'tensw-mgmt' | 'invest-mgmt'

const SECTION_FILTERS: { value: SectionFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'willow-mgmt', label: '윌로우' },
  { value: 'invest-mgmt', label: '투자관리' },
  { value: 'tensw-mgmt', label: '텐소프트웍스' },
  { value: 'etf-etc', label: 'ETC' },
  { value: 'akros', label: '아크로스' },
]

// 구분 칩은 색조 대신 회색 명도로 나눈다 — 사업관리 표와 같은 문법(2026-09-11).
const SECTION_BADGES: Record<string, { label: string; bg: string; fg: string }> = {
  'willow-mgmt': { label: '윌로우',       bg: '#D3D7DD', fg: '#1F242B' },
  'invest-mgmt': { label: '투자관리',     bg: '#DCE0E5', fg: '#262C33' },
  'tensw-mgmt':  { label: '텐소프트웍스', bg: '#E4E7EB', fg: '#2C323A' },
  'etf-etc':     { label: 'ETC',          bg: '#EAECEF', fg: '#343A42' },
  'akros':       { label: '아크로스',     bg: '#F5F6F8', fg: '#4B525A' },
}

// 표 열은 사업관리 표와 같은 순서로 읽는다 — 구분·날짜·제목·메타
const COLUMNS: LColumn<WikiNote>[] = [
  { key: 'section', label: '구분', width: '72px' },
  { key: 'date', label: '수정일', width: '64px' },
  { key: 'title', label: '제목', width: 'minmax(160px,1fr)' },
  { key: 'attach', label: '첨부', width: '40px', align: 'right' },
]

const PAGE_SIZE_KEY = 'wiki-page-size'
const DEFAULT_PAGE_SIZE = 10
// 섹션이 뷰포트를 넘지 않도록 하한/하단 여백(메인 패딩 24 + 카드 하단 여유)
const MIN_SECTION_H = 360
const BOTTOM_GAP = 28

function getStoredPageSize(): number {
  if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE
  const v = localStorage.getItem(PAGE_SIZE_KEY)
  if (!v) return DEFAULT_PAGE_SIZE
  const n = Number(v)
  return n >= 1 && n <= 50 ? n : DEFAULT_PAGE_SIZE
}

interface WikiListProps {
  notes: WikiNote[]
  loading: boolean
  onCreate: (data: { section: WikiSection; title: string; content: string; attachments?: unknown }) => Promise<void>
  onUpdate: (id: string, data: Partial<{ title: string; content: string; section: string; is_pinned: boolean; attachments: unknown; memos: unknown }>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  hideFilter?: boolean
  // 좁은 임베드(예: 아크로스 1/3 칼럼) — 모바일식 마스터-디테일 + 부모 높이 채움
  embedded?: boolean
  /**
   * 부모 높이를 채운다. 레이아웃(2단 목록+상세)은 그대로 둔다.
   *
   * `embedded`와 나눠 둔 이유: 그리드에서 옆 블록을 따라 늘어나야 하는 것과, 칼럼이 좁아
   * 1단으로 접어야 하는 것은 다른 문제다. 텐소·ETC 위키는 2fr 쪽(약 60%)이라 2단이 들어가는데
   * `embedded`를 주면 폭과 무관하게 1단으로 접혔다. 기본 높이는 뷰포트 기준 자체 계산(availH)이라
   * 그리드 행 높이와 무관해서, 옆 이메일 블록이 길어져도 위키만 안 따라간다.
   */
  fillHeight?: boolean
  /**
   * 상세를 어디에 그리나. 기본 'pane'은 목록 옆 2단. 'modal'은 목록만 카드에 남기고
   * 상세·추가·편집을 모달로 띄운다(텐소 — 이메일과 1/2씩 나눠 쓰는 자리라 2단이 들어가지 않음, 2026-09-10).
   */
  detailMode?: 'pane' | 'modal'
}

/** 모달 셸 — corp/document-dialog 와 같은 문법(백드롭 + 카드). 상세 패널을 그대로 안에 넣는다. */
function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,15,18,0.18)', backdropFilter: 'blur(3px)' }} />
      {/* 껍데기는 카드 그대로 — 사업관리 상세 모달과 같은 테두리·모서리를 받는다(2026-09-11) */}
      {/* 높이는 내용이 정한다 — 짧은 노트에 빈 판이 남지 않게. 길면 상한까지만 자라고 안에서 스크롤한다(CEO 2026-09-11) */}
      <LCard pad={0} style={{
        position: 'relative', width: 'min(720px, calc(100vw - 24px))', maxHeight: 'min(85vh, 760px)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <button onClick={onClose} aria-label="닫기" style={{
          // 상세 헤더가 sticky(zIndex 1, 배경 있음)라 그 위에 있어야 가려지지 않는다.
          position: 'absolute', top: 10, right: 10, zIndex: 2,
          background: 'transparent', border: 'none', borderRadius: t.radius.sm, padding: t.density.gapXs,
          cursor: 'pointer', color: t.neutrals.muted, display: 'flex',
        }}>
          <LIcon name="x" size={14} stroke={2} />
        </button>
        {children}
      </LCard>
    </div>
  )
}
function PassThrough({ children }: { children: React.ReactNode; onClose: () => void }) {
  return <>{children}</>
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr)
  const yy = d.getFullYear() !== new Date().getFullYear() ? `${d.getFullYear()}. ` : ''
  return `${yy}${d.getMonth() + 1}월 ${d.getDate()}일`
}
function fmtUpdatedTitle(dateStr: string): string {
  return `마지막 업데이트: ${new Date(dateStr).toLocaleString('ko-KR')}`
}

function renderWikiHtml(content: string): string {
  return sanitizeEditorHtml(plainTextToHtml(content))
}

function getSearchableWikiText(content: string): string {
  return htmlToPlainText(renderWikiHtml(content))
}

export function WikiList({ notes, loading, onCreate, onUpdate, onDelete, hideFilter, embedded, fillHeight, detailMode = 'pane' }: WikiListProps) {
  const mobile = useIsMobile()
  // 임베드 모드에선 실제 모바일이 아니어도 모바일식(리스트 → 클릭 시 상세, 리스트 감춤) 레이아웃 사용
  const modal = detailMode === 'modal'
  // modal 도 compact 로 친다 — 목록이 전체 폭을 쓰고 2단 구분선이 없다는 점이 같다.
  const compact = mobile || !!embedded || modal
  const DetailShell = modal ? ModalShell : PassThrough
  const closeDetail = () => { setSelectedId(null); setAdding(false); setEditing(false) }
  // 부모 높이 채우기. embedded는 이걸 항상 포함하고, fillHeight는 이것만 켠다.
  const fill = !!embedded || !!fillHeight
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>('all')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'updated' | 'created'>('updated')
  const [searchOpen, setSearchOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(getStoredPageSize)

  // 섹션 높이를 브라우저(뷰포트)에 맞춰 동적 조정. 컨테이너 top을 측정해
  // 카드 하단이 뷰포트 하단에 닿도록 높이를 계산하고, 리사이즈 시 갱신한다.
  const wrapRef = useRef<HTMLDivElement>(null)
  const [availH, setAvailH] = useState(560)
  useEffect(() => {
    const compute = () => {
      const el = wrapRef.current
      if (!el) return
      const top = el.getBoundingClientRect().top
      setAvailH(Math.max(MIN_SECTION_H, Math.round(window.innerHeight - top - BOTTOM_GAP)))
    }
    compute()
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [mobile, editing, adding])

  const filtered = useMemo(() => {
    let result = notes
    if (sectionFilter !== 'all') {
      result = result.filter(n => n.section === sectionFilter)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(n =>
        n.title.toLowerCase().includes(q) || getSearchableWikiText(n.content).toLowerCase().includes(q)
      )
    }
    // 핀고정 우선 → 선택한 기준일자 desc
    result = [...result].sort((a, b) => {
      if (!!a.is_pinned !== !!b.is_pinned) return a.is_pinned ? -1 : 1
      const af = sortBy === 'created' ? a.created_at : a.updated_at
      const bf = sortBy === 'created' ? b.created_at : b.updated_at
      return new Date(bf).getTime() - new Date(af).getTime()
    })
    return result
  }, [notes, sectionFilter, search, sortBy])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize)
  const selectedNote = selectedId ? notes.find(n => n.id === selectedId) : null
  const renderedSelectedContent = selectedNote ? renderWikiHtml(selectedNote.content) : ''
  const hasSelectedContent = htmlToPlainText(renderedSelectedContent).trim().length > 0

  // 데스크탑 진입 시 우측 패널이 비지 않도록 가장 최근 업데이트된 노트를 자동 선택.
  // 모바일에선 list만 표시(사용자 클릭으로 진입)하므로 자동 선택 X.
  // useIsMobile 훅은 첫 렌더 시 항상 false를 반환하므로 window 너비를 직접 체크해야 한다.
  useEffect(() => {
    if (selectedId || notes.length === 0) return
    if (embedded || modal) return // 임베드·모달: 리스트 우선, 클릭해야 상세 진입
    if (typeof window !== 'undefined' && window.innerWidth < 768) return
    const latest = notes.reduce((acc, n) => {
      if (!acc) return n
      return new Date(n.updated_at).getTime() > new Date(acc.updated_at).getTime() ? n : acc
    }, notes[0])
    if (latest) setSelectedId(latest.id)
  }, [selectedId, notes, embedded, modal])

  const handleFilterChange = (f: SectionFilter) => {
    setSectionFilter(f)
    setPage(0)
  }

  const handleSearchChange = (v: string) => {
    setSearch(v)
    setPage(0)
  }

  const applyPageSize = (n: number) => {
    setPageSize(n)
    setPage(0)
    localStorage.setItem(PAGE_SIZE_KEY, String(n))
  }

  const handleCreate = async (data: { section: WikiSection; title: string; content: string; attachments?: unknown }) => {
    await onCreate(data)
    setAdding(false)
    setPage(0)
  }

  const handleEdit = async (data: { section: WikiSection; title: string; content: string; attachments?: unknown }) => {
    if (!selectedNote) return
    await onUpdate(selectedNote.id, data)
    setEditing(false)
  }

  const handleDelete = async () => {
    if (!selectedNote) return
    await onDelete(selectedNote.id)
    setSelectedId(null)
    setEditing(false)
  }

  const handlePin = async () => {
    if (!selectedNote) return
    await onUpdate(selectedNote.id, { is_pinned: !selectedNote.is_pinned })
  }

  const [newMemo, setNewMemo] = useState('')
  const [savingMemo, setSavingMemo] = useState(false)
  const handleAddMemo = async () => {
    if (!selectedNote) return
    const text = newMemo.trim()
    if (!text || savingMemo) return
    setSavingMemo(true)
    const memo: WikiMemo = { id: crypto.randomUUID(), text, created_at: new Date().toISOString(), reviewed_at: null }
    try {
      await onUpdate(selectedNote.id, { memos: [...(selectedNote.memos || []), memo] })
      setNewMemo('')
    } finally {
      setSavingMemo(false)
    }
  }
  const handleDeleteMemo = async (memoId: string) => {
    if (!selectedNote) return
    await onUpdate(selectedNote.id, { memos: (selectedNote.memos || []).filter(m => m.id !== memoId) })
  }

  // embedded: height 100%로 부모를 채운다(아크로스 — 부모가 높이를 정해주는 자리).
  // fillHeight: height를 주지 않는다. 그리드 아이템은 기본 align-self:stretch라 행 높이만큼
  //   이미 늘어나고, 여기에 height:100%를 얹으면 행 높이가 아직 auto인 시점이라 브라우저가
  //   auto로 풀어 availH 상한을 잃는다 → 목록 전체 길이만큼 섹션이 길어진다.
  return (
    <LCard pad={0} style={
      embedded ? { height: '100%', display: 'flex', flexDirection: 'column' }
      : fillHeight ? { display: 'flex', flexDirection: 'column' }
      : undefined
    }>
      {/* 제목과 칩 사이는 사업관리 카드와 같은 리듬(머리 여백 + 다음 블록 여백) */}
      <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadY + t.density.panelPadX, flexShrink: 0 }}>
        <LSectionHead
          title="업무위키"
          tools={
            <LSegmented
              options={[{ value: 'updated', label: '수정일' }, { value: 'created', label: '작성일' }]}
              value={sortBy}
              onChange={setSortBy}
            />
          }
          toolsInline
          mb={0}
        />
      </div>

      <div ref={wrapRef} style={{
        display: 'flex',
        flexDirection: compact ? 'column' : 'row',
        // fillHeight: 높이를 안 준다. 목록(기본 10행)이 자연스럽게 높이를 정하고,
        // flex:1이라 옆 블록이 더 길어 그리드 행이 늘어나면 거기까지 따라 늘어난다.
        // availH(화면 끝까지)를 안 쓰는 게 핵심 — 세로로 긴 모니터에서 섹션이 과하게 길어졌다.
        ...(embedded ? { flex: 1, minHeight: 0 }
          : fillHeight ? { flex: 1, minHeight: 0 }
          : { height: compact ? 'auto' : availH }),
      }}>
        {/* ===== LEFT PANEL: list ===== */}
        {(modal || !compact || (!selectedId && !adding)) && (
        <div style={{
          width: compact ? '100%' : '42%',
          minWidth: compact ? undefined : 280,
          display: 'flex', flexDirection: 'column',
          borderRight: compact ? 'none' : `1px solid ${t.neutrals.line}`,
          // flex:1은 세로 스택(compact)에서 높이를 채우라는 뜻이다. 2단 가로 배치에서 주면
          // 주축이 가로라 42% 폭을 밀어내고 상세 패널을 좁힌다.
          ...(fill && compact ? { flex: 1, minHeight: 0 } : {}),
          ...(fill && !compact ? { minHeight: 0 } : {}),
        }}>
          {/* 구분 칩 · 검색 한 줄 — 사업관리 표 카드와 같은 자리, 같은 모양 */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: t.density.gapSm,
            padding: `0 ${t.density.cardPad}px ${t.density.gapSm}px`,
            flexWrap: compact && mobile ? 'wrap' : 'nowrap',
          }}>
            {!hideFilter && (
              <div style={{
                maxWidth: searchOpen ? 0 : 520,
                opacity: searchOpen ? 0 : 1,
                overflow: 'hidden',
                transition: 'max-width .26s ease, opacity .16s ease',
              }}>
                <LFilterChip options={SECTION_FILTERS} value={sectionFilter} onChange={handleFilterChange} gap={t.density.gapXs} />
              </div>
            )}

            <div style={{ position: 'relative', flex: 1, minWidth: mobile ? '100%' : 140 }}>
              <div style={{ position: 'absolute', left: t.density.panelPadX, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}>
                <LIcon name="search" size={13} stroke={2} color={t.neutrals.subtle} />
              </div>
              <input
                value={search}
                onChange={e => handleSearchChange(e.target.value)}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => { if (!search) setSearchOpen(false) }}
                placeholder="제목 · 내용 검색"
                style={{
                  width: '100%', boxSizing: 'border-box', minHeight: t.density.controlHSm,
                  padding: `0 ${t.density.panelPadX}px 0 30px`, fontSize: `calc(${t.type.control}px * var(--fz, 1))`,
                  fontFamily: t.font.sans, color: t.neutrals.text,
                  background: t.neutrals.card, border: `1px solid ${t.neutrals.line}`,
                  borderRadius: t.radius.sm, outline: 'none',
                }}
              />
              {search && (
                <button onClick={() => { handleSearchChange(''); setSearchOpen(false) }} style={{
                  position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  padding: t.density.tableRowGap, color: t.neutrals.muted, display: 'flex', alignItems: 'center',
                }}>
                  <LIcon name="x" size={12} stroke={2} />
                </button>
              )}
            </div>
          </div>

          {/* 목록 — 사업관리 표와 같은 문법. 행을 누르면 상세 모달이 열린다 */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: `0 ${t.density.cardPad}px ${t.density.gapSm}px` }}>
            <LTableScroll columns={COLUMNS} mobile={mobile}>
              <LTableHead columns={COLUMNS} mobile={mobile} />
              {loading ? (
                <LTableEmpty>불러오는 중…</LTableEmpty>
              ) : paged.length === 0 ? (
                <LTableEmpty>{search ? '검색 결과가 없습니다' : '위키 노트가 없습니다'}</LTableEmpty>
              ) : (
                <LTableBody columns={COLUMNS} mobile={mobile}>
                  {paged.map(note => {
                    const badge = SECTION_BADGES[note.section] || SECTION_BADGES['akros']
                    return (
                      <LTableRow
                        key={note.id}
                        columns={COLUMNS}
                        mobile={mobile}
                        onClick={() => { setSelectedId(note.id); setAdding(false); setEditing(false) }}
                      >
                        <LTableBadge tone={{ bg: badge.bg, fg: badge.fg }}>{badge.label}</LTableBadge>
                        <LTableDate value={sortBy === 'created' ? note.created_at.slice(0, 10) : note.updated_at.slice(0, 10)} />
                        <span style={{
                          minWidth: 0, fontWeight: t.weight.medium, color: t.neutrals.text,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }} title={note.title || '(제목 없음)'}>
                          {note.is_pinned && (
                            <span style={{ marginRight: t.density.gapXs, color: t.chart.mono, display: 'inline-flex', verticalAlign: '-1px' }}>
                              <LIcon name="pin" size={10} stroke={2} />
                            </span>
                          )}
                          {note.title || '(제목 없음)'}
                        </span>
                        <span style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: t.density.tableRowGap,
                          fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, color: t.neutrals.subtle, fontFamily: t.font.mono,
                        }}>
                          {note.attachments && note.attachments.length > 0 ? (
                            <>
                              <LIcon name="paperclip" size={9} />
                              {note.attachments.length}
                            </>
                          ) : ''}
                        </span>
                      </LTableRow>
                    )
                  })}
                </LTableBody>
              )}
            </LTableScroll>
          </div>

          {/* Pagination bar */}
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
        </div>
        )}

        {/* ===== RIGHT PANEL: detail ===== */}
        {(!compact || selectedId || adding) && (
        <DetailShell onClose={closeDetail}>
        <div style={{
          ...(modal ? { display: 'flex', flexDirection: 'column', minHeight: 0 } : { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }),
          overflow: (mobile && !embedded && !modal) ? 'visible' : 'hidden',
          // fillHeight에선 섹션 높이를 왼쪽 목록(기본 10행)이 정해야 한다. 이 상세 패널은
          // flex 교차축에서 자기 내용 높이를 컨테이너로 올려보내서, 긴 노트를 열면 섹션이
          // 그만큼 길어졌다. overflow:hidden으로는 안 막힌다 — 내재 크기 계산엔 그대로 들어간다.
          // contain:size가 내재 기여를 0으로 만들고, stretch로 행 높이를 받아 안에서 스크롤한다.
          ...(fillHeight && !compact ? { contain: 'size' as const, alignSelf: 'stretch' as const } : {}),
        }}>
          {/* 목록으로 back button (compact) */}
          {compact && !modal && (
            <LBtn size="md" variant="ghost" icon={<LIcon name="chevronLeft" size={13} stroke={2} />}
              onClick={closeDetail}
              style={{ alignSelf: 'flex-start', color: t.brand[600] }}>
              목록으로
            </LBtn>
          )}
          {adding ? (
            /* New note form — 뷰포트 높이 안에서 폼 내부 스크롤 */
            <div style={{ padding: modal ? '14px 14px 14px' : 14, paddingTop: modal ? 40 : 14, flex: 1, display: 'flex', flexDirection: 'column', overflowY: (mobile && !embedded && !modal) ? 'visible' : 'auto', minHeight: 0 }}>
              <WikiNoteForm onSave={handleCreate} onCancel={() => setAdding(false)} />
            </div>
          ) : selectedNote && editing ? (
            /* Edit mode — 뷰포트 높이 안에서 폼 내부 스크롤 */
            <div style={{ padding: modal ? '14px 14px 14px' : 14, paddingTop: modal ? 40 : 14, flex: 1, display: 'flex', flexDirection: 'column', overflowY: (mobile && !embedded && !modal) ? 'visible' : 'auto', minHeight: 0 }}>
              <WikiNoteForm
                initial={{
                  section: selectedNote.section as WikiSection,
                  title: selectedNote.title,
                  content: selectedNote.content,
                  attachments: selectedNote.attachments,
                }}
                onSave={handleEdit}
                onCancel={() => setEditing(false)}
                onDelete={handleDelete}
              />
            </div>
          ) : selectedNote ? (
            /* Read mode */
            <div style={{ ...(modal ? { minHeight: 0 } : { flex: 1 }), overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              {/* Detail header */}
              {/* 바깥은 배경만 깔고, 선은 카드 패딩 안쪽에 긋는다 — 카드의 표 머리선과 같은 자리(2026-09-11) */}
              <div style={{
                padding: `0 ${t.density.cardPad}px`,
                // 본문이 길어 스크롤해도 제목·배지는 위에 남는다(CEO 2026-09-10).
                position: 'sticky', top: 0, zIndex: 1, background: t.neutrals.card,
              }}>
              <div style={{
                // 모달에선 우상단 닫기(X) 자리를 비워 둔다.
                padding: modal ? `${t.density.cardPad}px 32px ${t.density.panelPadX}px 0` : `${t.density.cardPad}px 0 ${t.density.panelPadX}px`,
                borderBottom: `1px solid ${t.neutrals.line}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: t.density.kpiGap }}>
                  <h2 style={{
                    margin: 0, fontSize: `calc(${t.type.sectionTitle}px * var(--fz, 1))`, fontWeight: t.weight.semibold,
                    color: t.neutrals.text, fontFamily: t.font.sans,
                    minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {selectedNote.title || '(제목 없음)'}
                  </h2>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: t.density.kpiGap }}>
                  {(() => {
                    const badge = SECTION_BADGES[selectedNote.section] || SECTION_BADGES['akros']
                    return (
                      <LBadge palette={{ bg: badge.bg, fg: badge.fg }}>{badge.label}</LBadge>
                    )
                  })()}
                  <span title={fmtUpdatedTitle(selectedNote.updated_at)} style={{ fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, color: t.neutrals.subtle, fontFamily: t.font.mono }}>
                    마지막 업데이트 {fmtDate(selectedNote.updated_at)}
                  </span>
                </div>
              </div>
              </div>

              {/* Detail body */}
              <div style={{ padding: `${t.density.panelPadX}px ${t.density.cardPad}px`, ...(modal ? {} : { flex: 1 }) }}>
                {hasSelectedContent ? (
                  <div
                    style={{
                      fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`,
                      lineHeight: 1.7,
                      color: t.neutrals.text,
                      fontFamily: t.font.sans,
                    }}
                    className="wiki-content"
                    dangerouslySetInnerHTML={{ __html: renderedSelectedContent }}
                  />
                ) : (
                  <div style={{ fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, color: t.neutrals.subtle }}>
                    내용 없음
                  </div>
                )}

                {selectedNote.attachments && selectedNote.attachments.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: t.density.gapXs, marginTop: 14 }}>
                    {selectedNote.attachments.map((f, i) => (
                      <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" style={{
                        display: 'inline-flex', alignItems: 'center', gap: t.density.gapXs,
                        background: 'transparent', border: `1px solid ${t.neutrals.line}`, borderRadius: t.radius.sm,
                        padding: `${t.density.gapXs}px ${t.density.panelPadX}px`, fontSize: `calc(${t.type.control}px * var(--fz, 1))`, color: t.neutrals.muted,
                        textDecoration: 'none',
                      }}>
                        <LIcon name="paperclip" size={11} />
                        {f.name}
                      </a>
                    ))}
                  </div>
                )}

                {/* 노트 메모 — 윌리가 점검해 후속조치 (📝 미확인 / ✅ 확인됨) */}
                <div style={{ marginTop: t.density.pagePadBottom, paddingTop: t.density.blockGap, borderTop: `1px solid ${t.neutrals.line}` }}>
                  <div style={{ fontSize: `calc(${t.type.label}px * var(--fz, 1))`, color: t.neutrals.subtle, marginBottom: t.density.gapSm }}>
                    메모{(selectedNote.memos?.length || 0) > 0 ? ` ${selectedNote.memos!.length}` : ''}
                  </div>

                  {(selectedNote.memos || []).map(m => (
                    <div key={m.id} style={{
                      display: 'flex', alignItems: 'flex-start', gap: t.density.gapSm,
                      padding: `${t.density.gapSm}px 0`,
                      borderTop: `1px solid ${t.neutrals.line}`,
                    }}>
                      <span style={{ fontSize: `calc(${t.type.control}px * var(--fz, 1))`, flexShrink: 0, marginTop: 1 }} title={m.reviewed_at ? '윌리 확인됨' : '미확인'}>
                        {m.reviewed_at ? '✅' : '📝'}
                      </span>
                      <span style={{ flex: 1, fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, lineHeight: 1.5, color: t.neutrals.text, whiteSpace: 'pre-wrap' }}>
                        {m.text}
                      </span>
                      <span style={{ fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, color: t.neutrals.subtle, fontFamily: t.font.mono, flexShrink: 0, marginTop: t.density.tableRowGap }}>
                        {fmtDate(m.created_at)}
                      </span>
                      <button onClick={() => handleDeleteMemo(m.id)} style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                        color: t.neutrals.subtle, flexShrink: 0, lineHeight: 1, marginTop: t.density.tableRowGap,
                      }} title="삭제">
                        <LIcon name="x" size={11} />
                      </button>
                    </div>
                  ))}

                  {/* 입력칸과 버튼은 같은 높이(controlHSm)로 맞춘다 — 카드의 검색창과 같은 규격 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm, marginTop: t.density.gapSm }}>
                    <input
                      value={newMemo}
                      onChange={e => setNewMemo(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAddMemo() }}
                      placeholder="이 노트에 메모 추가 (엔터)"
                      style={{
                        flex: 1, minWidth: 0, boxSizing: 'border-box',
                        height: t.density.controlHSm,
                        fontSize: `calc(${t.type.control}px * var(--fz, 1))`,
                        background: t.neutrals.card, border: `1px solid ${t.neutrals.line}`, borderRadius: t.radius.sm,
                        padding: `0 ${t.density.panelPadX}px`, color: t.neutrals.text, outline: 'none', fontFamily: t.font.sans,
                      }}
                    />
                    <LBtn size="sm" variant="secondary" onClick={handleAddMemo} disabled={savingMemo || !newMemo.trim()}
                      style={{ flexShrink: 0 }}>
                      추가
                    </LBtn>
                  </div>
                </div>
              </div>

              {/* 상세 끝단 — 사업관리 상세 모달과 같이 삭제·수정 두 버튼 */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: t.density.gapSm,
                margin: `${t.density.gapMd}px ${t.density.cardPad}px 0`, paddingBottom: t.density.cardPad,
              }}>
                <span data-danger-action=""><LBtn variant="ghost" size="sm" onClick={handleDelete}>삭제</LBtn></span>
                <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm }}>
                  {/* 고정도 동작이라 삭제·수정과 같은 줄에 둔다. 켜지면 활성 칩과 같은 강조색(CEO 2026-09-11) */}
                  <button
                    data-filter-chip=""
                    data-active={selectedNote.is_pinned ? '' : undefined}
                    onClick={handlePin}
                    title={selectedNote.is_pinned ? '고정 해제' : '목록 위에 고정'}
                    style={{
                      border: 'none', cursor: 'pointer', flexShrink: 0,
                      height: t.density.controlHSm, padding: `0 ${t.density.controlPadXSm}px`,
                      fontSize: `calc(${t.type.control}px * var(--fz, 1))`, borderRadius: t.radius.sm,
                      fontFamily: t.font.sans,
                      fontWeight: selectedNote.is_pinned ? t.weight.medium : t.weight.regular,
                      background: selectedNote.is_pinned ? t.brand[100] : t.neutrals.inner,
                      color: selectedNote.is_pinned ? t.brand[700] : t.neutrals.muted,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {selectedNote.is_pinned ? '고정됨' : '고정'}
                  </button>
                  <LBtn variant="secondary" size="sm" onClick={() => setEditing(true)}>수정</LBtn>
                </div>
              </div>
            </div>
          ) : (
            /* Empty state */
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: t.neutrals.subtle, fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, fontFamily: t.font.sans,
            }}>
              노트를 선택하세요
            </div>
          )}
        </div>
        </DetailShell>
        )}
      </div>
    </LCard>
  )
}
