'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LSegmented } from '@/app/(dashboard)/_components/linear-segmented'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import {
  LPageSize, LTableScroll, LTableHead, LTableBody, LTableRow, LTableEmpty, LTableDate, type LColumn,
} from '@/app/(dashboard)/_components/linear-table'

export interface RyuhaMemo {
  id: string
  text: string
  created_at: string
  reviewed_at?: string | null
}

interface RyuhaNote {
  id: string
  title: string
  content: string
  category: string
  is_pinned: boolean
  attachments: { name: string; url: string }[] | null
  memos?: RyuhaMemo[]
  created_at: string
  updated_at: string
}

interface NotebookBlockProps {
  notes: RyuhaNote[]
  onCreate: (data: { title: string; content: string; attachments?: { name: string; url: string }[] }) => Promise<void>
  onUpdate: (id: string, data: Partial<{ title: string; content: string; is_pinned: boolean; attachments: { name: string; url: string }[] | null; memos: unknown }>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

const PAGE_SIZE_KEY = 'ryuha-notebook-page-size'
const DEFAULT_PAGE_SIZE = 10

// 표 열은 업무위키와 같은 순서로 읽는다 — 날짜·제목·첨부.
// 위키의 '구분'은 없다. 류하 노트에는 나눌 섹션이 없다.
const COLUMNS: LColumn<RyuhaNote>[] = [
  { key: 'date', label: '날짜', width: '64px' },
  { key: 'title', label: '제목', width: 'minmax(140px,1fr)' },
  { key: 'attach', label: '첨부', width: '40px', align: 'right' },
]

function getStoredPageSize(): number {
  if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE
  const v = localStorage.getItem(PAGE_SIZE_KEY)
  if (!v) return DEFAULT_PAGE_SIZE
  const n = Number(v)
  return n >= 1 && n <= 50 ? n : DEFAULT_PAGE_SIZE
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}

/** 모달 셸 — 업무위키(work/wiki-list)의 것과 같은 문법. 껍데기는 카드 그대로. */
function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,15,18,0.18)', backdropFilter: 'blur(3px)' }} />
      {/* 높이는 내용이 정한다 — 짧은 노트에 빈 판이 남지 않게. 길면 상한까지만 자라고 안에서 스크롤한다. */}
      <LCard pad={0} style={{
        position: 'relative', width: 'min(720px, calc(100vw - 24px))', maxHeight: 'min(85vh, 760px)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <button onClick={onClose} aria-label="닫기" style={{
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

/* ── Note Form (matches wiki-note-form pattern) ────────────── */
function NoteForm({ onSave, onCancel, initial, onDelete }: {
  onSave: (data: { title: string; content: string; attachments?: { name: string; url: string }[] }) => Promise<void>
  onCancel: () => void
  initial?: { title: string; content: string; attachments?: { name: string; url: string }[] | null }
  onDelete?: () => void
}) {
  const [title, setTitle] = useState(initial?.title || '')
  const [content, setContent] = useState(initial?.content || '')
  const [existingFiles, setExistingFiles] = useState<{ name: string; url: string }[]>(initial?.attachments || [])
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const canSave = (title.trim() || content.trim()) && !saving

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      let uploadedFiles: { name: string; url: string }[] = []
      if (newFiles.length > 0) {
        const formData = new FormData()
        newFiles.forEach(f => formData.append('files', f))
        const res = await fetch('/api/wiki/upload', { method: 'POST', body: formData })
        if (res.ok) {
          const data = await res.json()
          uploadedFiles = (data.files || []).map((f: { name: string; url: string }) => ({ name: f.name, url: f.url }))
        }
      }
      const allAttachments = [...existingFiles, ...uploadedFiles]
      await onSave({
        title: title.trim(),
        content: content.trim(),
        attachments: allAttachments.length > 0 ? allAttachments : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  // 테마의 input 규칙은 text·search 만 잡는다. 여기서 직접 맞추지 않으면
  // 제목칸(흰 면)과 내용칸(회색 판)이 한 폼 안에서 서로 다른 꼴이 된다.
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: `${t.density.gapSm}px ${t.density.panelPadY}px`, fontSize: `calc(${t.type.control}px * var(--fz, 1))`, fontFamily: t.font.sans,
    background: t.neutrals.card, borderRadius: t.radius.md, border: `1px solid ${t.neutrals.line}`,
    color: t.neutrals.text, outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{
      background: t.neutrals.card, borderRadius: t.radius.md,
      padding: t.density.controlPadXMd, display: 'flex', flexDirection: 'column',
      height: '100%', boxSizing: 'border-box',
    }}>
      {/* Title */}
      <div style={{ marginBottom: t.density.kpiGap, flexShrink: 0 }}>
        <input value={title} onChange={e => setTitle(e.target.value)}
          placeholder="제목" style={inputStyle} />
      </div>

      {/* Content */}
      <div style={{ marginBottom: t.density.kpiGap, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <textarea value={content} onChange={e => setContent(e.target.value)}
          placeholder="내용을 입력하세요..."
          style={{ ...inputStyle, resize: 'none', lineHeight: 1.6, flex: 1 }} />
      </div>

      {/* File attachments */}
      <div style={{ marginBottom: t.density.blockGap, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm, marginBottom: t.density.gapSm }}>
          <LBtn size="xs" variant="secondary" icon={<LIcon name="paperclip" size={12} />} onClick={() => fileRef.current?.click()}>
            파일 첨부
          </LBtn>
          <input ref={fileRef} type="file" multiple style={{ display: 'none' }}
            onChange={e => { if (e.target.files) setNewFiles(prev => [...prev, ...Array.from(e.target.files!)]) }} />
        </div>
        {existingFiles.map((f, i) => (
          <div key={`ex-${i}`} style={{
            display: 'inline-flex', alignItems: 'center', gap: t.density.gapXs,
            background: t.neutrals.inner, borderRadius: t.radius.sm,
            padding: `${t.density.gapXs}px ${t.density.panelPadY}px`, fontSize: `calc(${t.type.control}px * var(--fz, 1))`, color: t.neutrals.muted,
            marginRight: t.density.gapXs, marginBottom: t.density.gapXs,
          }}>
            <LIcon name="file" size={11} />
            <span>{f.name}</span>
            <button onClick={() => setExistingFiles(prev => prev.filter((_, j) => j !== i))} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              color: t.neutrals.subtle, fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`,
            }}>
              <LIcon name="x" size={10} />
            </button>
          </div>
        ))}
        {newFiles.map((f, i) => (
          <div key={`new-${i}`} style={{
            display: 'inline-flex', alignItems: 'center', gap: t.density.gapXs,
            background: t.neutrals.inner, borderRadius: t.radius.sm,
            padding: `${t.density.gapXs}px ${t.density.panelPadY}px`, fontSize: `calc(${t.type.control}px * var(--fz, 1))`, color: t.neutrals.text,
            marginRight: t.density.gapXs, marginBottom: t.density.gapXs,
          }}>
            <LIcon name="file" size={11} />
            <span>{f.name}</span>
            <button onClick={() => setNewFiles(prev => prev.filter((_, j) => j !== i))} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              color: t.neutrals.muted, fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`,
            }}>
              <LIcon name="x" size={10} />
            </button>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{
        display: 'flex', justifyContent: onDelete ? 'space-between' : 'flex-end',
        alignItems: 'center', gap: t.density.kpiGap,
      }}>
        {onDelete && (
          <span data-danger-action=""><LBtn variant="ghost" size="sm" onClick={onDelete}>삭제</LBtn></span>
        )}
        <div style={{ display: 'flex', gap: t.density.gapSm }}>
          <LBtn variant="ghost" size="sm" onClick={onCancel}>취소</LBtn>
          <span data-primary-action=""><LBtn variant="secondary" size="sm" onClick={handleSave} disabled={!canSave}>
            {saving ? '저장 중...' : '저장'}
          </LBtn></span>
        </div>
      </div>
    </div>
  )
}

/* ── Main Component ────────────────────────────────────────── */
export function NotebookBlock({ notes, onCreate, onUpdate, onDelete }: NotebookBlockProps) {
  const mobile = useIsMobile()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(getStoredPageSize)
  const [sortBy, setSortBy] = useState<'updated' | 'created'>('updated')

  const filtered = useMemo(() => {
    let result = notes
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(n => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q))
    }
    // 고정한 노트 먼저, 그 다음 고른 기준 날짜의 최신순 — 업무위키와 같은 차례.
    return [...result].sort((a, b) => {
      if (!!a.is_pinned !== !!b.is_pinned) return a.is_pinned ? -1 : 1
      const af = sortBy === 'created' ? a.created_at : a.updated_at
      const bf = sortBy === 'created' ? b.created_at : b.updated_at
      return new Date(bf).getTime() - new Date(af).getTime()
    })
  }, [notes, search, sortBy])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize)
  const selectedNote = selectedId ? notes.find(n => n.id === selectedId) : null

  // 상세가 모달이라 자동 선택은 하지 않는다 — 페이지를 열자마자 창이 뜬다.
  const closeDetail = () => { setSelectedId(null); setAdding(false); setEditing(false) }

  const handleSearchChange = (v: string) => {
    setSearch(v)
    setPage(0)
  }

  const applyPageSize = (n: number) => {
    setPageSize(n)
    setPage(0)
    localStorage.setItem(PAGE_SIZE_KEY, String(n))
  }

  const handleCreate = async (data: { title: string; content: string; attachments?: { name: string; url: string }[] }) => {
    await onCreate(data)
    setAdding(false)
    setPage(0)
  }

  const handleEdit = async (data: { title: string; content: string; attachments?: { name: string; url: string }[] }) => {
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
    const memo: RyuhaMemo = { id: crypto.randomUUID(), text, created_at: new Date().toISOString(), reviewed_at: null }
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

  return (
    <>
    <LCard pad={0}>
      {/* 제목과 목록 사이는 업무위키 카드와 같은 리듬 */}
      <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadY + t.density.panelPadX }}>
        <LSectionHead
          title="류하 수첩"
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

      {/* 검색 · 새 노트 한 줄 — 업무위키와 같은 자리, 같은 모양 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: t.density.gapSm,
        padding: `0 ${t.density.cardPad}px ${t.density.gapSm}px`,
        flexWrap: mobile ? 'wrap' : 'nowrap',
      }}>
        <div style={{ position: 'relative', flex: 1, minWidth: mobile ? '100%' : 140 }}>
          <div style={{ position: 'absolute', left: t.density.panelPadX, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}>
            <LIcon name="search" size={13} stroke={2} color={t.neutrals.subtle} />
          </div>
          <input
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
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
            <button onClick={() => handleSearchChange('')} style={{
              position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: t.density.tableRowGap, color: t.neutrals.muted, display: 'flex', alignItems: 'center',
            }}>
              <LIcon name="x" size={12} stroke={2} />
            </button>
          )}
        </div>
        <LBtn size="sm" icon={<LIcon name="plus" size={12} stroke={2.5} />}
          onClick={() => { setAdding(true); setSelectedId(null); setEditing(false) }}>
          새 노트
        </LBtn>
      </div>

      {/* 목록 — 사업관리 표와 같은 문법. 행을 누르면 상세 모달이 열린다 */}
      <div style={{ padding: `0 ${t.density.cardPad}px ${t.density.gapSm}px` }}>
        <LTableScroll columns={COLUMNS} mobile={mobile}>
          <LTableHead columns={COLUMNS} mobile={mobile} />
          {paged.length === 0 ? (
            <LTableEmpty>{search ? '검색 결과가 없습니다' : '노트가 없습니다'}</LTableEmpty>
          ) : (
            <LTableBody columns={COLUMNS} mobile={mobile}>
              {paged.map(note => (
                <LTableRow
                  key={note.id}
                  columns={COLUMNS}
                  mobile={mobile}
                  onClick={() => { setSelectedId(note.id); setAdding(false); setEditing(false) }}
                >
                  <LTableDate value={(sortBy === 'created' ? note.created_at : note.updated_at).slice(0, 10)} />
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
              ))}
            </LTableBody>
          )}
        </LTableScroll>
      </div>

      {/* 쪽 넘김 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `0 ${t.density.cardPad}px ${t.density.cardPad}px`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapXs }}>
          <LPageSize value={pageSize} onChange={applyPageSize} />
        </div>
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
            <span style={{ fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, fontFamily: t.font.mono, color: t.neutrals.muted }}>
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
    </LCard>

    {/* ── 상세·추가·편집은 모달로 ──
        카드가 반쪽 폭이라 목록 옆에 본문을 둘 자리가 없다. 업무위키가 텐소에서 같은 이유로
        쓰는 detailMode='modal' 과 같은 선택이다(CEO 2026-09-10).
        카드 밖 형제로 둔다 — 카드 안에 두면 테마가 '카드 안 카드'로 보고 테두리를 지운다. */}
    {(selectedId || adding) && (
      <ModalShell onClose={closeDetail}>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {adding ? (
            /* New note form */
            <div style={{ padding: t.density.controlPadXMd, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <NoteForm onSave={handleCreate} onCancel={() => setAdding(false)} />
            </div>
          ) : selectedNote && editing ? (
            /* Edit mode */
            <div style={{ padding: t.density.controlPadXMd, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <NoteForm
                initial={{
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
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              {/* Detail header — 오른쪽은 모달의 닫기 단추 자리를 비워 둔다.
                  비우지 않으면 '편집' 위에 X 가 겹쳐 둘 다 못 누른다. */}
              <div style={{
                padding: `${t.density.controlPadXMd}px ${t.density.controlPadXLg}px ${t.density.blockGap}px`,
                paddingRight: 40,
                borderBottom: `1px solid ${t.neutrals.line}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: t.density.kpiGap }}>
                  <h2 style={{
                    margin: 0, fontSize: `calc(${t.type.sectionTitle}px * var(--fz, 1))`, fontWeight: t.weight.semibold,
                    color: t.neutrals.text, fontFamily: t.font.sans,
                  }}>
                    {selectedNote.title || '(제목 없음)'}
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapXs, flexShrink: 0 }}>
                    <button onClick={handlePin} title={selectedNote.is_pinned ? '고정 해제' : '고정'} style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: t.density.gapXs,
                      borderRadius: t.radius.sm, flexShrink: 0,
                      display: 'flex', alignItems: 'center',
                      color: selectedNote.is_pinned ? t.chart.mono : t.neutrals.subtle,
                    }}>
                      <LIcon name="pin" size={14} stroke={2} color="currentColor" />
                    </button>
                    <LBtn size="xs" variant="ghost" onClick={() => setEditing(true)}
                      style={{ color: t.neutrals.muted, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      편집
                    </LBtn>
                  </div>
                </div>
                <span style={{ fontSize: `calc(${t.type.control}px * var(--fz, 1))`, color: t.neutrals.subtle, fontFamily: t.font.mono }}>
                  {fmtDate(selectedNote.updated_at)}
                </span>
              </div>

              {/* Detail body */}
              <div style={{ padding: `${t.density.controlPadXMd}px ${t.density.controlPadXLg}px`, flex: 1 }}>
                {selectedNote.content ? (
                  <div style={{
                    fontSize: `calc(${t.type.body}px * var(--fz, 1))`, lineHeight: 1.7, color: t.neutrals.text,
                    fontFamily: t.font.sans,
                  }}>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({ children }) => <h1 style={{ fontSize: `calc(${t.type.sectionTitle}px * var(--fz, 1))`, fontWeight: t.weight.semibold, margin: '14px 0 6px', color: t.neutrals.text, fontFamily: t.font.sans }}>{children}</h1>,
                        h2: ({ children }) => <h2 style={{ fontSize: `calc(${t.type.sectionTitle}px * var(--fz, 1))`, fontWeight: t.weight.semibold, margin: `${t.density.blockGap}px 0 ${t.density.gapXs}px`, color: t.neutrals.text, fontFamily: t.font.sans }}>{children}</h2>,
                        h3: ({ children }) => <h3 style={{ fontSize: `calc(${t.type.body}px * var(--fz, 1))`, fontWeight: t.weight.semibold, margin: `${t.density.gapMd}px 0 ${t.density.gapXs}px`, color: t.neutrals.text, fontFamily: t.font.sans }}>{children}</h3>,
                        p: ({ children }) => <p style={{ margin: `0 0 ${t.density.kpiGap}px` }}>{children}</p>,
                        ul: ({ children }) => <ul style={{ margin: `0 0 ${t.density.kpiGap}px`, paddingLeft: t.density.controlPadXLg }}>{children}</ul>,
                        ol: ({ children }) => <ol style={{ margin: `0 0 ${t.density.kpiGap}px`, paddingLeft: t.density.controlPadXLg }}>{children}</ol>,
                        li: ({ children }) => <li style={{ margin: `${t.density.tableRowGap}px 0` }}>{children}</li>,
                        strong: ({ children }) => <strong style={{ fontWeight: t.weight.semibold }}>{children}</strong>,
                        code: ({ children, className }) => {
                          const isBlock = className?.startsWith('language-')
                          if (isBlock) {
                            return <code style={{
                              display: 'block', background: t.neutrals.inner, borderRadius: t.radius.sm,
                              padding: `${t.density.panelPadX}px ${t.density.blockGap}px`, fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, fontFamily: t.font.mono,
                              overflowX: 'auto', margin: `${t.density.kpiGap}px 0`, lineHeight: 1.5,
                            }}>{children}</code>
                          }
                          return <code style={{
                            background: t.neutrals.inner, borderRadius: 3,
                            padding: `1px ${t.density.gapXs}px`, fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, fontFamily: t.font.mono,
                          }}>{children}</code>
                        },
                        pre: ({ children }) => <pre style={{ margin: 0 }}>{children}</pre>,
                        blockquote: ({ children }) => <blockquote style={{
                          margin: `${t.density.kpiGap}px 0`, padding: `${t.density.gapSm}px ${t.density.panelPadX}px`,
                          background: t.neutrals.inner, borderRadius: t.radius.sm,
                          color: t.neutrals.muted,
                        }}>{children}</blockquote>,
                        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: t.brand[600], textDecoration: 'none' }}>{children}</a>,
                        table: ({ children }) => <table style={{ borderCollapse: 'collapse', width: '100%', margin: `${t.density.kpiGap}px 0`, fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))` }}>{children}</table>,
                        th: ({ children }) => <th style={{ textAlign: 'left', padding: `${t.density.gapSm}px ${t.density.panelPadX}px`, background: t.neutrals.inner, fontWeight: t.weight.semibold, fontSize: `calc(${t.type.control}px * var(--fz, 1))` }}>{children}</th>,
                        td: ({ children }) => <td style={{ padding: `${t.density.gapXs}px ${t.density.panelPadX}px`, borderTop: `1px solid ${t.neutrals.line}` }}>{children}</td>,
                        hr: () => <hr style={{ border: 'none', borderTop: `1px solid ${t.neutrals.line}`, margin: `${t.density.blockGap}px 0` }} />,
                      }}
                    >
                      {selectedNote.content}
                    </ReactMarkdown>
                  </div>
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
                        background: t.neutrals.inner, borderRadius: t.radius.sm,
                        padding: `${t.density.gapXs}px ${t.density.panelPadY}px`, fontSize: `calc(${t.type.control}px * var(--fz, 1))`, color: t.brand[600],
                        textDecoration: 'none',
                      }}>
                        <LIcon name="paperclip" size={11} />
                        {f.name}
                      </a>
                    ))}
                  </div>
                )}

                {/* 노트 메모 */}
                <div style={{ marginTop: 18, paddingTop: t.density.blockGap, borderTop: `1px solid ${t.neutrals.line}` }}>
                  <div style={{ fontSize: `calc(${t.type.control}px * var(--fz, 1))`, fontWeight: t.weight.medium, color: t.neutrals.subtle, marginBottom: t.density.kpiGap }}>
                    메모{(selectedNote.memos?.length || 0) > 0 ? ` (${selectedNote.memos!.length})` : ''}
                  </div>

                  {(selectedNote.memos || []).map(m => (
                    <div key={m.id} style={{
                      display: 'flex', alignItems: 'flex-start', gap: t.density.gapSm,
                      background: t.neutrals.inner, borderRadius: t.radius.sm,
                      padding: `${t.density.gapSm}px ${t.density.panelPadY}px`, marginBottom: t.density.gapXs,
                    }}>
                      <span style={{ fontSize: `calc(${t.type.control}px * var(--fz, 1))`, flexShrink: 0, marginTop: 1 }} title={m.reviewed_at ? '확인됨' : '미확인'}>
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

                  <div style={{ display: 'flex', gap: t.density.gapSm, marginTop: t.density.gapSm }}>
                    <input
                      value={newMemo}
                      onChange={e => setNewMemo(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAddMemo() }}
                      placeholder="이 노트에 메모 추가… (엔터)"
                      style={{
                        flex: 1, fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`,
                        background: t.neutrals.card, border: `1px solid ${t.neutrals.line}`, borderRadius: t.radius.md,
                        padding: `${t.density.panelPadY}px ${t.density.panelPadX}px`, color: t.neutrals.text, outline: 'none', fontFamily: t.font.sans,
                        boxSizing: 'border-box',
                      }}
                    />
                    <LBtn size="sm" variant="secondary" onClick={handleAddMemo} disabled={savingMemo || !newMemo.trim()}
                      style={{ flexShrink: 0, color: newMemo.trim() ? t.brand[600] : t.neutrals.subtle }}>
                      추가
                    </LBtn>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </ModalShell>
    )}
    </>
  )
}
