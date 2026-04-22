'use client'

import { useState, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { t, tonePalettes } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LBtn } from '@/app/willow-investment/_components/linear-btn'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import { WikiNote } from './wiki-note-row'
import { WikiNoteForm } from './wiki-note-form'

type SectionFilter = 'all' | 'akros' | 'etf-etc' | 'willow-mgmt' | 'tensw-mgmt'
type WikiSection = 'akros' | 'etf-etc' | 'willow-mgmt' | 'tensw-mgmt'

const SECTION_FILTERS: { value: SectionFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'willow-mgmt', label: '윌로우' },
  { value: 'tensw-mgmt', label: '텐소프트웍스' },
  { value: 'etf-etc', label: 'ETC' },
  { value: 'akros', label: '아크로스' },
]

const SECTION_BADGES: Record<string, { label: string; bg: string; fg: string }> = {
  'willow-mgmt': { label: '윌로우',       ...tonePalettes.done },
  'tensw-mgmt':  { label: '텐소프트웍스', ...tonePalettes.warn },
  'etf-etc':     { label: 'ETC',          ...tonePalettes.info },
  'akros':       { label: '아크로스',     ...tonePalettes.brand },
}

const PAGE_SIZE = 15

interface WikiListProps {
  notes: WikiNote[]
  loading: boolean
  onCreate: (data: { section: WikiSection; title: string; content: string; attachments?: unknown }) => Promise<void>
  onUpdate: (id: string, data: Partial<{ title: string; content: string; section: string; is_pinned: boolean; attachments: unknown }>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}

export function WikiList({ notes, loading, onCreate, onUpdate, onDelete }: WikiListProps) {
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>('all')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    let result = notes
    if (sectionFilter !== 'all') {
      result = result.filter(n => n.section === sectionFilter)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(n =>
        n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
      )
    }
    return result
  }, [notes, sectionFilter, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const selectedNote = selectedId ? notes.find(n => n.id === selectedId) : null

  const handleFilterChange = (f: SectionFilter) => {
    setSectionFilter(f)
    setPage(0)
  }

  const handleSearchChange = (v: string) => {
    setSearch(v)
    setPage(0)
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

  return (
    <LCard pad={0}>
      <div style={{ display: 'flex', height: 640 }}>
        {/* ===== LEFT PANEL: list ===== */}
        <div style={{
          width: '42%', minWidth: 280, display: 'flex', flexDirection: 'column',
          borderRight: `1px solid ${t.neutrals.line}`,
        }}>
          {/* Filter bar */}
          <div style={{ padding: '10px 12px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
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
            <div style={{ display: 'flex', gap: 5 }}>
              {SECTION_FILTERS.map(f => {
                const active = sectionFilter === f.value
                return (
                  <button key={f.value} onClick={() => handleFilterChange(f.value)} style={{
                    border: 'none', cursor: 'pointer',
                    padding: '4px 10px', fontSize: 11, borderRadius: t.radius.pill,
                    fontFamily: t.font.sans,
                    fontWeight: active ? t.weight.medium : t.weight.regular,
                    background: active ? t.brand[100] : t.neutrals.inner,
                    color: active ? t.brand[700] : t.neutrals.muted,
                    transition: 'all .12s',
                  }}>{f.label}</button>
                )
              })}
            </div>
          </div>

          {/* Note rows */}
          <div style={{ flex: 1, overflow: 'hidden', padding: '0 4px 4px' }}>
            {loading ? (
              <div style={{ padding: '30px 14px', textAlign: 'center', fontSize: 12, color: t.neutrals.subtle }}>
                로딩 중...
              </div>
            ) : paged.length === 0 ? (
              <div style={{ padding: '30px 14px', textAlign: 'center', fontSize: 12, color: t.neutrals.subtle }}>
                {search ? '검색 결과가 없습니다' : '위키 노트가 없습니다'}
              </div>
            ) : (
              paged.map(note => {
                const badge = SECTION_BADGES[note.section] || SECTION_BADGES['akros']
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
                        <span style={{
                          fontSize: 10, fontWeight: t.badge.weight,
                          padding: '1px 5px', borderRadius: 3,
                          background: badge.bg, color: badge.fg,
                        }}>
                          {badge.label}
                        </span>
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 8, padding: '8px 12px',
              borderTop: `1px solid ${t.neutrals.line}`,
            }}>
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                style={{
                  background: 'transparent', border: 'none',
                  cursor: page === 0 ? 'default' : 'pointer',
                  padding: 4, borderRadius: 4,
                  color: page === 0 ? t.neutrals.line : t.neutrals.muted,
                  opacity: page === 0 ? 0.4 : 1,
                }}>
                <LIcon name="chevronLeft" size={14} stroke={2} />
              </button>
              <span style={{
                fontSize: 11, fontFamily: t.font.mono, color: t.neutrals.muted,
                minWidth: 80, textAlign: 'center',
              }}>
                {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, filtered.length)} / {filtered.length}
              </span>
              <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
                style={{
                  background: 'transparent', border: 'none',
                  cursor: page >= totalPages - 1 ? 'default' : 'pointer',
                  padding: 4, borderRadius: 4,
                  color: page >= totalPages - 1 ? t.neutrals.line : t.neutrals.muted,
                  opacity: page >= totalPages - 1 ? 0.4 : 1,
                }}>
                <LIcon name="chevronRight" size={14} stroke={2} />
              </button>
            </div>
          )}
        </div>

        {/* ===== RIGHT PANEL: detail ===== */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          {adding ? (
            /* New note form */
            <div style={{ padding: 14, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <WikiNoteForm onSave={handleCreate} onCancel={() => setAdding(false)} />
            </div>
          ) : selectedNote && editing ? (
            /* Edit mode */
            <div style={{ padding: 14, flex: 1, display: 'flex', flexDirection: 'column' }}>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {(() => {
                    const badge = SECTION_BADGES[selectedNote.section] || SECTION_BADGES['akros']
                    return (
                      <span style={{
                        fontSize: t.badge.size, fontWeight: t.badge.weight,
                        padding: `${t.badge.padY}px ${t.badge.padX}px`,
                        borderRadius: t.badge.radius,
                        background: badge.bg, color: badge.fg,
                      }}>
                        {badge.label}
                      </span>
                    )
                  })()}
                  <span style={{ fontSize: 11, color: t.neutrals.subtle, fontFamily: t.font.mono }}>
                    {fmtDate(selectedNote.updated_at)}
                  </span>
                </div>
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
      </div>
    </LCard>
  )
}
