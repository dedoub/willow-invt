'use client'

import { useState, useMemo } from 'react'
import { t, tonePalettes } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LBtn } from '@/app/willow-investment/_components/linear-btn'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import { WikiNoteRow, WikiNote } from './wiki-note-row'
import { WikiNoteForm } from './wiki-note-form'

type SectionFilter = 'all' | 'akros' | 'etf-etc' | 'willow-mgmt' | 'tensw-mgmt'
type WikiSection = 'akros' | 'etf-etc' | 'willow-mgmt' | 'tensw-mgmt'

const SECTION_FILTERS: { value: SectionFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'akros', label: 'Akros' },
  { value: 'etf-etc', label: 'ETC' },
  { value: 'willow-mgmt', label: '윌로우' },
  { value: 'tensw-mgmt', label: '텐소프트' },
]

const PAGE_SIZE = 10

interface WikiListProps {
  notes: WikiNote[]
  loading: boolean
  onCreate: (data: { section: WikiSection; title: string; content: string; attachments?: unknown }) => Promise<void>
  onUpdate: (id: string, data: Partial<{ title: string; content: string; section: string; is_pinned: boolean; attachments: unknown }>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function WikiList({ notes, loading, onCreate, onUpdate, onDelete }: WikiListProps) {
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>('all')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
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

  // Reset page when filter changes
  const handleFilterChange = (f: SectionFilter) => {
    setSectionFilter(f)
    setPage(0)
    setExpandedId(null)
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

  return (
    <LCard pad={0}>
      {/* Filter bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px 10px', gap: 10,
      }}>
        {/* Section filter */}
        <div style={{ display: 'inline-flex', background: t.neutrals.inner, borderRadius: t.radius.sm, padding: 2 }}>
          {SECTION_FILTERS.map(f => (
            <button key={f.value} onClick={() => handleFilterChange(f.value)} style={{
              border: 'none', cursor: 'pointer', padding: '4px 10px', fontSize: 11,
              borderRadius: 4, fontFamily: t.font.sans,
              fontWeight: sectionFilter === f.value ? t.weight.medium : t.weight.regular,
              background: sectionFilter === f.value ? t.neutrals.card : 'transparent',
              color: t.neutrals.text,
            }}>{f.label}</button>
          ))}
        </div>

        {/* Search + Add */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
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
                width: 100,
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
          <LBtn size="sm" icon={<LIcon name="plus" size={14} color="#fff" />} onClick={() => setAdding(true)}>
            새 노트
          </LBtn>
        </div>
      </div>

      {/* Add form */}
      {adding && (
        <div style={{ padding: '0 14px' }}>
          <WikiNoteForm onSave={handleCreate} onCancel={() => setAdding(false)} />
        </div>
      )}

      {/* Notes list */}
      <div style={{ padding: '0 6px 6px' }}>
        {loading ? (
          <div style={{ padding: '30px 14px', textAlign: 'center', fontSize: 12, color: t.neutrals.subtle }}>
            로딩 중...
          </div>
        ) : paged.length === 0 ? (
          <div style={{ padding: '30px 14px', textAlign: 'center', fontSize: 12, color: t.neutrals.subtle }}>
            {search ? '검색 결과가 없습니다' : '위키 노트가 없습니다'}
          </div>
        ) : (
          paged.map(note => (
            <WikiNoteRow
              key={note.id}
              note={note}
              expanded={expandedId === note.id}
              onToggle={() => setExpandedId(expandedId === note.id ? null : note.id)}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 8, padding: '10px 14px',
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
    </LCard>
  )
}
