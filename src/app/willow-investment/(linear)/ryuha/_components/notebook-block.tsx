'use client'

import { useState, useMemo, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { t, tonePalettes, useIsMobile } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'
import { LBtn } from '@/app/willow-investment/_components/linear-btn'
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
const ROW_H = 47
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
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
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

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 8px', fontSize: 13, fontFamily: t.font.sans,
    background: t.neutrals.inner, borderRadius: t.radius.sm, border: 'none',
    color: t.neutrals.text, outline: 'none',
  }

  return (
    <div style={{
      background: t.neutrals.card, borderRadius: t.radius.md,
      padding: 14, display: 'flex', flexDirection: 'column',
      height: '100%', boxSizing: 'border-box',
    }}>
      {/* Title */}
      <div style={{ marginBottom: 8, flexShrink: 0 }}>
        <input value={title} onChange={e => setTitle(e.target.value)}
          placeholder="제목" style={inputStyle} />
      </div>

      {/* Content */}
      <div style={{ marginBottom: 8, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <textarea value={content} onChange={e => setContent(e.target.value)}
          placeholder="내용을 입력하세요..."
          style={{ ...inputStyle, resize: 'none', lineHeight: 1.6, flex: 1 }} />
      </div>

      {/* File attachments */}
      <div style={{ marginBottom: 12, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <button onClick={() => fileRef.current?.click()} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: t.neutrals.inner, border: 'none', borderRadius: t.radius.sm,
            padding: '4px 8px', fontSize: 11, color: t.neutrals.muted,
            cursor: 'pointer', fontFamily: t.font.sans,
          }}>
            <LIcon name="paperclip" size={12} />
            파일 첨부
          </button>
          <input ref={fileRef} type="file" multiple style={{ display: 'none' }}
            onChange={e => { if (e.target.files) setNewFiles(prev => [...prev, ...Array.from(e.target.files!)]) }} />
        </div>
        {existingFiles.map((f, i) => (
          <div key={`ex-${i}`} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: t.neutrals.inner, borderRadius: t.radius.sm,
            padding: '3px 8px', fontSize: 11, color: t.neutrals.muted,
            marginRight: 4, marginBottom: 4,
          }}>
            <LIcon name="file" size={11} />
            <span>{f.name}</span>
            <button onClick={() => setExistingFiles(prev => prev.filter((_, j) => j !== i))} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              color: t.neutrals.subtle, fontSize: 10,
            }}>
              <LIcon name="x" size={10} />
            </button>
          </div>
        ))}
        {newFiles.map((f, i) => (
          <div key={`new-${i}`} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: tonePalettes.brand.bg, borderRadius: t.radius.sm,
            padding: '3px 8px', fontSize: 11, color: tonePalettes.brand.fg,
            marginRight: 4, marginBottom: 4,
          }}>
            <LIcon name="file" size={11} />
            <span>{f.name}</span>
            <button onClick={() => setNewFiles(prev => prev.filter((_, j) => j !== i))} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              color: tonePalettes.brand.fg, fontSize: 10,
            }}>
              <LIcon name="x" size={10} />
            </button>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{
        display: 'flex', justifyContent: onDelete ? 'space-between' : 'flex-end',
        alignItems: 'center', gap: 8,
      }}>
        {onDelete && (
          <LBtn variant="danger" size="sm" onClick={onDelete}>삭제</LBtn>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          <LBtn variant="secondary" size="sm" onClick={onCancel}>취소</LBtn>
          <LBtn size="sm" onClick={handleSave} disabled={!canSave}>
            {saving ? '저장 중...' : '저장'}
          </LBtn>
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
  const [pageSizeInput, setPageSizeInput] = useState(String(getStoredPageSize()))

  const filtered = useMemo(() => {
    if (!search.trim()) return notes
    const q = search.trim().toLowerCase()
    return notes.filter(n => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q))
  }, [notes, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize)
  const containerH = FILTER_H + pageSize * ROW_H + 4 + PAGI_H
  const selectedNote = selectedId ? notes.find(n => n.id === selectedId) : null

  const handleSearchChange = (v: string) => {
    setSearch(v)
    setPage(0)
  }

  const commitPageSize = () => {
    const n = Math.max(5, Math.min(50, Number(pageSizeInput) || DEFAULT_PAGE_SIZE))
    setPageSizeInput(String(n))
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
      }}>
        {/* ===== LEFT PANEL: list ===== */}
        {(!mobile || (!selectedId && !adding)) && (
        <div style={{
          width: mobile ? '100%' : '42%',
          minWidth: mobile ? undefined : 280,
          display: 'flex', flexDirection: 'column',
          borderRight: mobile ? 'none' : `1px solid ${t.neutrals.line}`,
        }}>
          {/* Filter bar */}
          <div style={{ padding: '10px 12px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4, flex: 1,
              background: t.neutrals.inner, borderRadius: t.radius.sm,
              padding: '4px 8px',
            }}>
              <LIcon name="search" size={13} color={t.neutrals.subtle} />
              <input
                value={search} onChange={e => handleSearchChange(e.target.value)}
                placeholder="검색..."
                style={{
                  border: 'none', background: 'transparent', outline: 'none',
                  fontSize: 12, color: t.neutrals.text, fontFamily: t.font.sans,
                  width: '100%',
                }}
              />
              {search && (
                <button onClick={() => handleSearchChange('')} style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  color: t.neutrals.subtle,
                }}>
                  <LIcon name="x" size={11} />
                </button>
              )}
            </div>
            <LBtn size="sm" icon={<LIcon name="plus" size={14} color="#fff" />} onClick={() => { setAdding(true); setSelectedId(null); setEditing(false) }}>
              새 노트
            </LBtn>
          </div>

          {/* Note rows */}
          <div style={{ flex: 1, overflow: 'hidden', padding: '0 4px 4px' }}>
            {paged.length === 0 ? (
              <div style={{ padding: '30px 14px', textAlign: 'center', fontSize: 12, color: t.neutrals.subtle }}>
                {search ? '검색 결과가 없습니다' : '노트가 없습니다'}
              </div>
            ) : (
              paged.map(note => {
                const isSelected = selectedId === note.id
                return (
                  <div
                    key={note.id}
                    onClick={() => { setSelectedId(note.id); setAdding(false); setEditing(false) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 10px', cursor: 'pointer',
                      background: isSelected ? t.neutrals.inner : 'transparent',
                      borderRadius: t.radius.sm, transition: 'background 0.1s',
                    }}
                  >
                    <span style={{
                      fontSize: 10, width: 14, textAlign: 'center', flexShrink: 0,
                      color: note.is_pinned ? '#D97706' : 'transparent',
                    }}>
                      {note.is_pinned ? '📌' : ''}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12.5, fontWeight: t.weight.regular,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        color: t.neutrals.text,
                      }}>
                        {note.title || '(제목 없음)'}
                      </div>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6, marginTop: 2,
                      }}>
                        <span style={{ fontSize: 10, color: t.neutrals.subtle, fontFamily: t.font.mono }}>
                          {fmtDate(note.updated_at)}
                        </span>
                        {note.attachments && note.attachments.length > 0 && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, color: t.neutrals.subtle }}>
                            <LIcon name="paperclip" size={9} />
                            {note.attachments.length}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Pagination bar */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '6px 12px',
            borderTop: `1px solid ${t.neutrals.line}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                value={pageSizeInput}
                onChange={e => setPageSizeInput(e.target.value.replace(/\D/g, ''))}
                onBlur={commitPageSize}
                onKeyDown={e => { if (e.key === 'Enter') commitPageSize() }}
                style={{
                  width: 32, textAlign: 'center', border: 'none',
                  background: t.neutrals.inner, borderRadius: t.radius.sm,
                  fontSize: 11, fontFamily: t.font.mono, color: t.neutrals.muted,
                  padding: '2px 0', outline: 'none',
                }}
              />
              <span style={{ fontSize: 10, color: t.neutrals.subtle, fontFamily: t.font.sans }}>개씩</span>
            </div>
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                  style={{
                    background: 'transparent', border: 'none',
                    cursor: page === 0 ? 'default' : 'pointer',
                    padding: 4, borderRadius: 4,
                    color: page === 0 ? t.neutrals.line : t.neutrals.muted,
                    opacity: page === 0 ? 0.4 : 1,
                  }}>
                  <LIcon name="chevronLeft" size={13} stroke={2} />
                </button>
                <span style={{ fontSize: 10, fontFamily: t.font.mono, color: t.neutrals.muted }}>
                  {page * pageSize + 1}-{Math.min((page + 1) * pageSize, filtered.length)} / {filtered.length}
                </span>
                <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
                  style={{
                    background: 'transparent', border: 'none',
                    cursor: page >= totalPages - 1 ? 'default' : 'pointer',
                    padding: 4, borderRadius: 4,
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
        {(!mobile || selectedId || adding) && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: mobile ? 'visible' : 'hidden', minHeight: 0 }}>
          {/* Mobile back button */}
          {mobile && (
            <button
              onClick={() => { setSelectedId(null); setAdding(false); setEditing(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '10px 14px', fontSize: 12, color: t.brand[600],
                fontFamily: t.font.sans,
              }}
            >
              <LIcon name="chevronLeft" size={13} stroke={2} />
              목록으로
            </button>
          )}

          {adding ? (
            /* New note form */
            <div style={{ padding: 14, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <NoteForm onSave={handleCreate} onCancel={() => setAdding(false)} />
            </div>
          ) : selectedNote && editing ? (
            /* Edit mode */
            <div style={{ padding: 14, flex: 1, display: 'flex', flexDirection: 'column' }}>
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
              {/* Detail header */}
              <div style={{
                padding: '14px 18px 12px',
                borderBottom: `1px solid ${t.neutrals.line}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <h2 style={{
                    margin: 0, fontSize: 16, fontWeight: t.weight.semibold,
                    color: t.neutrals.text, fontFamily: t.font.sans,
                  }}>
                    {selectedNote.title || '(제목 없음)'}
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button onClick={handlePin} style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                      borderRadius: t.radius.sm, fontSize: 13,
                      color: selectedNote.is_pinned ? '#D97706' : t.neutrals.subtle,
                    }}>📌</button>
                    <button onClick={() => setEditing(true)} style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 12, fontWeight: t.weight.regular, color: t.neutrals.muted,
                      fontFamily: t.font.sans, padding: '4px 8px', borderRadius: t.radius.sm,
                    }}>
                      편집
                    </button>
                  </div>
                </div>
                <span style={{ fontSize: 11, color: t.neutrals.subtle, fontFamily: t.font.mono }}>
                  {fmtDate(selectedNote.updated_at)}
                </span>
              </div>

              {/* Detail body */}
              <div style={{ padding: '14px 18px', flex: 1 }}>
                {selectedNote.content ? (
                  <div style={{
                    fontSize: 12.5, lineHeight: 1.7, color: t.neutrals.text,
                    fontFamily: t.font.sans,
                  }}>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({ children }) => <h1 style={{ fontSize: 16, fontWeight: t.weight.semibold, margin: '14px 0 6px', color: t.neutrals.text, fontFamily: t.font.sans }}>{children}</h1>,
                        h2: ({ children }) => <h2 style={{ fontSize: 14, fontWeight: t.weight.semibold, margin: '12px 0 4px', color: t.neutrals.text, fontFamily: t.font.sans }}>{children}</h2>,
                        h3: ({ children }) => <h3 style={{ fontSize: 13, fontWeight: t.weight.semibold, margin: '10px 0 4px', color: t.neutrals.text, fontFamily: t.font.sans }}>{children}</h3>,
                        p: ({ children }) => <p style={{ margin: '0 0 8px' }}>{children}</p>,
                        ul: ({ children }) => <ul style={{ margin: '0 0 8px', paddingLeft: 18 }}>{children}</ul>,
                        ol: ({ children }) => <ol style={{ margin: '0 0 8px', paddingLeft: 18 }}>{children}</ol>,
                        li: ({ children }) => <li style={{ margin: '2px 0' }}>{children}</li>,
                        strong: ({ children }) => <strong style={{ fontWeight: t.weight.semibold }}>{children}</strong>,
                        code: ({ children, className }) => {
                          const isBlock = className?.startsWith('language-')
                          if (isBlock) {
                            return <code style={{
                              display: 'block', background: t.neutrals.inner, borderRadius: t.radius.sm,
                              padding: '10px 12px', fontSize: 11.5, fontFamily: t.font.mono,
                              overflowX: 'auto', margin: '8px 0', lineHeight: 1.5,
                            }}>{children}</code>
                          }
                          return <code style={{
                            background: t.neutrals.inner, borderRadius: 3,
                            padding: '1px 4px', fontSize: 11.5, fontFamily: t.font.mono,
                          }}>{children}</code>
                        },
                        pre: ({ children }) => <pre style={{ margin: 0 }}>{children}</pre>,
                        blockquote: ({ children }) => <blockquote style={{
                          margin: '8px 0', paddingLeft: 12,
                          borderLeft: `3px solid ${t.neutrals.line}`,
                          color: t.neutrals.muted,
                        }}>{children}</blockquote>,
                        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: t.brand[600], textDecoration: 'none' }}>{children}</a>,
                        table: ({ children }) => <table style={{ borderCollapse: 'collapse', width: '100%', margin: '8px 0', fontSize: 11.5 }}>{children}</table>,
                        th: ({ children }) => <th style={{ textAlign: 'left', padding: '5px 10px', background: t.neutrals.inner, fontWeight: t.weight.semibold, fontSize: 11 }}>{children}</th>,
                        td: ({ children }) => <td style={{ padding: '4px 10px', borderTop: `1px solid ${t.neutrals.line}` }}>{children}</td>,
                        hr: () => <hr style={{ border: 'none', borderTop: `1px solid ${t.neutrals.line}`, margin: '12px 0' }} />,
                      }}
                    >
                      {selectedNote.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: t.neutrals.subtle }}>
                    내용 없음
                  </div>
                )}

                {selectedNote.attachments && selectedNote.attachments.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 14 }}>
                    {selectedNote.attachments.map((f, i) => (
                      <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: t.neutrals.inner, borderRadius: t.radius.sm,
                        padding: '4px 8px', fontSize: 11, color: t.brand[600],
                        textDecoration: 'none',
                      }}>
                        <LIcon name="paperclip" size={11} />
                        {f.name}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Empty state */
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: t.neutrals.subtle, fontSize: 12, fontFamily: t.font.sans,
            }}>
              노트를 선택하세요
            </div>
          )}
        </div>
        )}
      </div>
    </LCard>
  )
}
