'use client'

import { useState, useMemo } from 'react'
import { t, useIsMobile } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'

interface RyuhaNote {
  id: string
  title: string
  content: string
  category: string
  is_pinned: boolean
  attachments: { name: string; url: string }[] | null
  created_at: string
  updated_at: string
}

interface NotebookBlockProps {
  notes: RyuhaNote[]
  onCreate: (data: { title: string; content: string; attachments?: { name: string; url: string }[] }) => Promise<void>
  onUpdate: (id: string, data: Partial<{ title: string; content: string; is_pinned: boolean; attachments: { name: string; url: string }[] | null }>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

const PAGE_SIZE_KEY = 'ryuha-notebook-page-size'
const DEFAULT_PAGE_SIZE = 10
const ROW_H = 44
const FILTER_H = 52
const PAGI_H = 33

function getStoredPageSize(): number {
  if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE
  const v = localStorage.getItem(PAGE_SIZE_KEY)
  if (!v) return DEFAULT_PAGE_SIZE
  const n = Number(v)
  return n >= 5 && n <= 50 ? n : DEFAULT_PAGE_SIZE
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export function NotebookBlock({ notes, onCreate, onUpdate, onDelete }: NotebookBlockProps) {
  const mobile = useIsMobile()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(getStoredPageSize)
  const [pageSizeInput, setPageSizeInput] = useState(String(getStoredPageSize()))

  // Edit state
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editFiles, setEditFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)

  const filtered = useMemo(() => {
    if (!search.trim()) return notes
    const q = search.trim().toLowerCase()
    return notes.filter(n => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q))
  }, [notes, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize)
  const selected = selectedId ? notes.find(n => n.id === selectedId) : null

  const commitPageSize = () => {
    const n = Math.max(5, Math.min(50, Number(pageSizeInput) || DEFAULT_PAGE_SIZE))
    setPageSizeInput(String(n))
    setPageSize(n)
    setPage(0)
    localStorage.setItem(PAGE_SIZE_KEY, String(n))
  }

  const startAdd = () => {
    setAdding(true); setEditing(true)
    setEditTitle(''); setEditContent(''); setEditFiles([])
    setSelectedId(null)
  }

  const startEdit = (note: RyuhaNote) => {
    setEditing(true)
    setEditTitle(note.title); setEditContent(note.content); setEditFiles([])
  }

  const cancelEdit = () => {
    setEditing(false); setAdding(false)
    setEditTitle(''); setEditContent(''); setEditFiles([])
  }

  const handleSave = async () => {
    if (!editTitle.trim() && !editContent.trim()) return
    setSaving(true)
    try {
      let attachments: { name: string; url: string }[] | undefined
      if (editFiles.length > 0) {
        attachments = []
        for (const file of editFiles) {
          const formData = new FormData()
          formData.append('file', file)
          const res = await fetch('/api/wiki/upload', { method: 'POST', body: formData })
          if (res.ok) {
            const { url } = await res.json()
            attachments.push({ name: file.name, url })
          }
        }
      }
      if (adding) {
        await onCreate({ title: editTitle, content: editContent, attachments })
      } else if (selected) {
        const existing = selected.attachments || []
        await onUpdate(selected.id, {
          title: editTitle, content: editContent,
          attachments: attachments ? [...existing, ...attachments] : undefined,
        })
      }
      cancelEdit()
    } finally { setSaving(false) }
  }

  const containerH = FILTER_H + pageSize * ROW_H + 4 + PAGI_H

  // Mobile: show list or detail
  const showDetail = mobile && (selectedId || adding)

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 10 }}>
        <LSectionHead eyebrow="NOTEBOOK" title="류하 수첩" action={
          <span style={{ fontSize: 11, color: t.neutrals.muted, fontFamily: t.font.mono }}>
            {notes.length}건
          </span>
        } />
      </div>

      <div style={{
        display: 'flex',
        flexDirection: mobile ? 'column' : 'row',
        height: mobile ? 'auto' : containerH,
        minHeight: 300,
      }}>
        {/* Left panel: list */}
        {!showDetail && (
          <div style={{
            width: mobile ? '100%' : '42%', minWidth: mobile ? undefined : 220,
            borderRight: mobile ? 'none' : `1px solid ${t.neutrals.line}`,
            display: 'flex', flexDirection: 'column',
          }}>
            {/* Search + Add */}
            <div style={{ padding: '8px 12px', display: 'flex', gap: 6 }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <LIcon name="search" size={12} color={t.neutrals.subtle}
                  stroke={2} />
                <input value={search} onChange={e => { setSearch(e.target.value); setPage(0) }}
                  placeholder="검색..."
                  style={{
                    width: '100%', padding: '6px 8px 6px 26px', borderRadius: t.radius.sm,
                    border: 'none', background: t.neutrals.inner,
                    fontSize: 12, fontFamily: t.font.sans, color: t.neutrals.text, outline: 'none',
                  }} />
              </div>
              <button onClick={startAdd} style={{
                padding: '6px 10px', borderRadius: t.radius.sm,
                background: t.neutrals.inner, border: 'none',
                fontSize: 11, cursor: 'pointer', color: t.neutrals.muted,
                display: 'flex', alignItems: 'center', gap: 3,
              }}>
                <LIcon name="plus" size={11} stroke={2} /> 추가
              </button>
            </div>

            {/* Note list */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              {paged.map(note => (
                <div key={note.id}
                  onClick={() => { setSelectedId(note.id); setEditing(false) }}
                  style={{
                    padding: '8px 12px', cursor: 'pointer',
                    borderTop: `1px solid ${t.neutrals.line}`,
                    background: selectedId === note.id ? t.neutrals.inner : 'transparent',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {note.is_pinned && <LIcon name="pin" size={10} color={t.accent.warn} stroke={2} />}
                    <span style={{
                      fontSize: 12, fontWeight: t.weight.medium,
                      flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{note.title || '(제목 없음)'}</span>
                    <span style={{ fontSize: 10, fontFamily: t.font.mono, color: t.neutrals.subtle }}>
                      {fmtDate(note.updated_at)}
                    </span>
                  </div>
                  {note.content && (
                    <div style={{
                      fontSize: 11, color: t.neutrals.subtle, marginTop: 2,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{note.content.slice(0, 60)}</div>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '6px 12px', borderTop: `1px solid ${t.neutrals.line}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input value={pageSizeInput}
                  onChange={e => setPageSizeInput(e.target.value.replace(/\D/g, ''))}
                  onBlur={commitPageSize}
                  onKeyDown={e => { if (e.key === 'Enter') commitPageSize() }}
                  style={{
                    width: 32, textAlign: 'center', border: 'none',
                    background: t.neutrals.inner, borderRadius: t.radius.sm,
                    fontSize: 11, fontFamily: t.font.mono, color: t.neutrals.muted,
                    padding: '2px 0', outline: 'none',
                  }} />
                <span style={{ fontSize: 10, color: t.neutrals.subtle }}>개씩</span>
              </div>
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                    style={{
                      background: 'transparent', border: 'none',
                      cursor: page === 0 ? 'default' : 'pointer', padding: 4,
                      color: page === 0 ? t.neutrals.line : t.neutrals.muted,
                    }}>
                    <LIcon name="chevronLeft" size={13} stroke={2} />
                  </button>
                  <span style={{ fontSize: 10, fontFamily: t.font.mono, color: t.neutrals.muted }}>
                    {page * pageSize + 1}-{Math.min((page + 1) * pageSize, filtered.length)} / {filtered.length}
                  </span>
                  <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
                    style={{
                      background: 'transparent', border: 'none',
                      cursor: page >= totalPages - 1 ? 'default' : 'pointer', padding: 4,
                      color: page >= totalPages - 1 ? t.neutrals.line : t.neutrals.muted,
                    }}>
                    <LIcon name="chevronRight" size={13} stroke={2} />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Right panel: detail */}
        <div style={{ flex: 1, padding: 16, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          {showDetail && mobile && (
            <button onClick={() => { setSelectedId(null); setAdding(false); cancelEdit() }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, color: t.brand[600], padding: 0, marginBottom: 10,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
              <LIcon name="chevronLeft" size={12} stroke={2} /> 목록으로
            </button>
          )}

          {(editing || adding) ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
              <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                placeholder="제목"
                style={{
                  padding: '8px 10px', borderRadius: t.radius.sm,
                  border: 'none', background: t.neutrals.inner,
                  fontSize: 14, fontWeight: t.weight.medium,
                  fontFamily: t.font.sans, color: t.neutrals.text, outline: 'none',
                }} />
              <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
                placeholder="내용..."
                style={{
                  flex: 1, minHeight: 150, padding: '8px 10px', borderRadius: t.radius.sm,
                  border: 'none', background: t.neutrals.inner,
                  fontSize: 12, fontFamily: t.font.sans, color: t.neutrals.text,
                  outline: 'none', resize: 'vertical', lineHeight: 1.6,
                }} />
              {/* File attach */}
              <div>
                <label style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: t.radius.sm,
                  background: t.neutrals.inner, cursor: 'pointer',
                  fontSize: 11, color: t.neutrals.muted,
                }}>
                  <LIcon name="paperclip" size={11} stroke={2} />
                  파일 첨부
                  <input type="file" multiple hidden
                    onChange={e => setEditFiles(prev => [...prev, ...Array.from(e.target.files || [])])} />
                </label>
                {editFiles.length > 0 && (
                  <div style={{ marginTop: 4, fontSize: 11, color: t.neutrals.subtle }}>
                    {editFiles.map((f, i) => <span key={i} style={{ marginRight: 8 }}>{f.name}</span>)}
                  </div>
                )}
                {selected?.attachments && selected.attachments.length > 0 && (
                  <div style={{ marginTop: 4, fontSize: 11, color: t.neutrals.subtle }}>
                    기존: {selected.attachments.map((a, i) => (
                      <a key={i} href={a.url} target="_blank" rel="noreferrer"
                        style={{ color: t.brand[600], marginRight: 8 }}>{a.name}</a>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                <button onClick={cancelEdit} style={{
                  padding: '6px 14px', borderRadius: t.radius.sm,
                  background: t.neutrals.inner, border: 'none', fontSize: 12,
                  color: t.neutrals.muted, cursor: 'pointer',
                }}>취소</button>
                <button onClick={handleSave} disabled={saving}
                  style={{
                    padding: '6px 14px', borderRadius: t.radius.sm,
                    background: t.brand[600], border: 'none', fontSize: 12,
                    color: '#fff', cursor: 'pointer', fontWeight: t.weight.medium,
                    opacity: saving ? 0.5 : 1,
                  }}>{saving ? '저장중...' : '저장'}</button>
              </div>
            </div>
          ) : selected ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 8 }}>
                <div style={{ fontSize: 16, fontWeight: t.weight.semibold }}>{selected.title || '(제목 없음)'}</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => onUpdate(selected.id, { is_pinned: !selected.is_pinned })}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                      color: selected.is_pinned ? t.accent.warn : t.neutrals.subtle,
                    }}>
                    <LIcon name="pin" size={13} stroke={2} />
                  </button>
                  <button onClick={() => startEdit(selected)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                      color: t.neutrals.subtle,
                    }}>
                    <LIcon name="pencil" size={13} stroke={2} />
                  </button>
                  <button onClick={() => { onDelete(selected.id); setSelectedId(null) }}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                      color: t.accent.neg,
                    }}>
                    <LIcon name="trash" size={13} stroke={2} />
                  </button>
                </div>
              </div>
              <div style={{ fontSize: 10, color: t.neutrals.subtle, marginBottom: 12 }}>
                {new Date(selected.updated_at).toLocaleDateString('ko-KR')}
              </div>
              <div style={{
                fontSize: 13, lineHeight: 1.7, color: t.neutrals.text,
                whiteSpace: 'pre-wrap',
              }}>
                {selected.content}
              </div>
              {selected.attachments && selected.attachments.length > 0 && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {selected.attachments.map((a, i) => (
                    <a key={i} href={a.url} target="_blank" rel="noreferrer"
                      style={{
                        fontSize: 11, color: t.brand[600],
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}>
                      <LIcon name="paperclip" size={11} stroke={2} /> {a.name}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: t.neutrals.subtle, fontSize: 12,
            }}>
              노트를 선택하세요
            </div>
          )}
        </div>
      </div>
    </LCard>
  )
}
