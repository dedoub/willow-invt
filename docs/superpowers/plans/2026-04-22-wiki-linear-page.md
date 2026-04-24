# 업무위키 Linear 페이지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 4개 섹션(Akros, ETC, 윌로우, 텐소프트)의 위키 노트를 Linear 디자인 시스템으로 통합 관리하는 페이지 구축

**Architecture:** 기존 `/api/wiki` API + `work_wiki` 테이블을 그대로 활용. "전체" 필터를 위해 API에 section 미지정 시 전체 반환하도록 수정. 프론트엔드는 4개 컴포넌트 (page, wiki-list, wiki-note-row, wiki-note-form)로 분리.

**Tech Stack:** Next.js App Router, React (inline styles with Linear tokens), Supabase

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/app/api/wiki/route.ts` (modify) | section 파라미터 없으면 전체 반환 |
| `src/app/willow-investment/(linear)/wiki/_components/wiki-note-form.tsx` (create) | 새 노트 인라인 폼 + 파일 업로드 |
| `src/app/willow-investment/(linear)/wiki/_components/wiki-note-row.tsx` (create) | 노트 행 (축소/확장/읽기/편집 모드) |
| `src/app/willow-investment/(linear)/wiki/_components/wiki-list.tsx` (create) | 필터 바 + 노트 리스트 + 페이지네이션 |
| `src/app/willow-investment/(linear)/wiki/page.tsx` (create) | 메인 페이지 (데이터 로딩, 상태 관리) |

---

### Task 1: Wiki API — 전체 섹션 조회 지원

**Files:**
- Modify: `src/app/api/wiki/route.ts:33`

- [ ] **Step 1: Modify the GET handler to support "all sections"**

In `src/app/api/wiki/route.ts`, change line 33 from:

```typescript
const section = searchParams.get('section') || 'etf-etc'
```

And update the query logic (lines 35-41) to:

```typescript
const section = searchParams.get('section')

let query = supabase
  .from('work_wiki')
  .select('*')
  .eq('user_id', userId)

if (section) {
  query = query.eq('section', section)
}

const { data, error } = await query
  .order('is_pinned', { ascending: false })
  .order('updated_at', { ascending: false })
```

This replaces the original code block from `const section =` through `const { data, error } = await supabase...order(...)`.

- [ ] **Step 2: Verify the API works**

Run: `curl 'http://localhost:3000/api/wiki' -H 'Cookie: auth_token=...'`
Expected: Returns notes from ALL sections (not just etf-etc)

Run: `curl 'http://localhost:3000/api/wiki?section=akros' -H 'Cookie: auth_token=...'`
Expected: Returns only akros section notes

- [ ] **Step 3: Commit**

```bash
git add src/app/api/wiki/route.ts
git commit -m "feat: support fetching all wiki sections when no section param"
```

---

### Task 2: wiki-note-form.tsx — 새 노트 인라인 폼

**Files:**
- Create: `src/app/willow-investment/(linear)/wiki/_components/wiki-note-form.tsx`

- [ ] **Step 1: Create the wiki-note-form component**

```tsx
'use client'

import { useState, useRef } from 'react'
import { t, tonePalettes } from '@/app/willow-investment/_components/linear-tokens'
import { LBtn } from '@/app/willow-investment/_components/linear-btn'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'

type WikiSection = 'akros' | 'etf-etc' | 'willow-mgmt' | 'tensw-mgmt'

interface WikiNoteFormProps {
  onSave: (data: { section: WikiSection; title: string; content: string; attachments?: { name: string; url: string; size: number; type: string }[] }) => Promise<void>
  onCancel: () => void
  /** Pre-fill for edit mode */
  initial?: {
    section: WikiSection
    title: string
    content: string
    attachments?: { name: string; url: string; size: number; type: string }[]
  }
  /** Show delete button in edit mode */
  onDelete?: () => void
}

const SECTIONS: { value: WikiSection; label: string }[] = [
  { value: 'akros', label: 'Akros' },
  { value: 'etf-etc', label: 'ETC' },
  { value: 'willow-mgmt', label: '윌로우' },
  { value: 'tensw-mgmt', label: '텐소프트' },
]

export function WikiNoteForm({ onSave, onCancel, initial, onDelete }: WikiNoteFormProps) {
  const [section, setSection] = useState<WikiSection>(initial?.section || 'akros')
  const [title, setTitle] = useState(initial?.title || '')
  const [content, setContent] = useState(initial?.content || '')
  const [existingFiles, setExistingFiles] = useState(initial?.attachments || [])
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const canSave = (title.trim() || content.trim() || newFiles.length > 0 || existingFiles.length > 0) && !saving

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      let uploadedFiles: { name: string; url: string; size: number; type: string }[] = []
      if (newFiles.length > 0) {
        const formData = new FormData()
        newFiles.forEach(f => formData.append('files', f))
        const res = await fetch('/api/wiki/upload', { method: 'POST', body: formData })
        if (res.ok) {
          const data = await res.json()
          uploadedFiles = data.files || []
        }
      }
      const allAttachments = [...existingFiles, ...uploadedFiles]
      await onSave({
        section,
        title: title.trim(),
        content: content.trim(),
        attachments: allAttachments.length > 0 ? allAttachments : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  const removeExistingFile = (idx: number) => {
    setExistingFiles(prev => prev.filter((_, i) => i !== idx))
  }

  const removeNewFile = (idx: number) => {
    setNewFiles(prev => prev.filter((_, i) => i !== idx))
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 8px', fontSize: 13, fontFamily: t.font.sans,
    background: t.neutrals.inner, borderRadius: t.radius.sm, border: 'none',
    color: t.neutrals.text, outline: 'none',
  }

  return (
    <div style={{
      background: t.neutrals.card, borderRadius: t.radius.md,
      padding: 14, marginBottom: 8,
    }}>
      {/* Section selector */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10.5, color: t.neutrals.subtle, marginBottom: 4, fontFamily: t.font.mono, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          섹션
        </div>
        <div style={{ display: 'inline-flex', background: t.neutrals.inner, borderRadius: t.radius.sm, padding: 2 }}>
          {SECTIONS.map(s => (
            <button key={s.value} onClick={() => setSection(s.value)} style={{
              border: 'none', cursor: 'pointer', padding: '4px 10px', fontSize: 11,
              borderRadius: 4, fontFamily: t.font.sans,
              fontWeight: section === s.value ? t.weight.medium : t.weight.regular,
              background: section === s.value ? t.neutrals.card : 'transparent',
              color: t.neutrals.text,
            }}>{s.label}</button>
          ))}
        </div>
      </div>

      {/* Title */}
      <div style={{ marginBottom: 8 }}>
        <input
          value={title} onChange={e => setTitle(e.target.value)}
          placeholder="제목"
          style={inputStyle}
        />
      </div>

      {/* Content */}
      <div style={{ marginBottom: 8 }}>
        <textarea
          value={content} onChange={e => setContent(e.target.value)}
          placeholder="내용을 입력하세요..."
          rows={4}
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
        />
      </div>

      {/* File attachments */}
      <div style={{ marginBottom: 12 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
        }}>
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
            onChange={e => { if (e.target.files) setNewFiles(prev => [...prev, ...Array.from(e.target.files!)]) }}
          />
        </div>
        {/* Existing files */}
        {existingFiles.map((f, i) => (
          <div key={`ex-${i}`} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: t.neutrals.inner, borderRadius: t.radius.sm,
            padding: '3px 8px', fontSize: 11, color: t.neutrals.muted,
            marginRight: 4, marginBottom: 4,
          }}>
            <LIcon name="file" size={11} />
            <span>{f.name}</span>
            <button onClick={() => removeExistingFile(i)} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              color: t.neutrals.subtle, fontSize: 10,
            }}>
              <LIcon name="x" size={10} />
            </button>
          </div>
        ))}
        {/* New files */}
        {newFiles.map((f, i) => (
          <div key={`new-${i}`} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: tonePalettes.brand.bg, borderRadius: t.radius.sm,
            padding: '3px 8px', fontSize: 11, color: tonePalettes.brand.fg,
            marginRight: 4, marginBottom: 4,
          }}>
            <LIcon name="file" size={11} />
            <span>{f.name}</span>
            <button onClick={() => removeNewFile(i)} style={{
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep wiki-note-form`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/willow-investment/\(linear\)/wiki/_components/wiki-note-form.tsx
git commit -m "feat: add wiki note inline form component"
```

---

### Task 3: wiki-note-row.tsx — 노트 행 (축소/확장/편집)

**Files:**
- Create: `src/app/willow-investment/(linear)/wiki/_components/wiki-note-row.tsx`

- [ ] **Step 1: Create the wiki-note-row component**

```tsx
'use client'

import { useState } from 'react'
import { t, tonePalettes } from '@/app/willow-investment/_components/linear-tokens'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import { LBtn } from '@/app/willow-investment/_components/linear-btn'
import { WikiNoteForm } from './wiki-note-form'

export interface WikiNote {
  id: string
  section: string
  title: string
  content: string
  is_pinned: boolean
  attachments?: { name: string; url: string; size: number; type: string }[]
  created_at: string
  updated_at: string
}

type WikiSection = 'akros' | 'etf-etc' | 'willow-mgmt' | 'tensw-mgmt'

const SECTION_BADGES: Record<string, { label: string; bg: string; fg: string }> = {
  'akros':      { label: 'Akros',    ...tonePalettes.brand },
  'etf-etc':    { label: 'ETC',      ...tonePalettes.info },
  'willow-mgmt':{ label: '윌로우',   ...tonePalettes.done },
  'tensw-mgmt': { label: '텐소프트', ...tonePalettes.warn },
}

interface WikiNoteRowProps {
  note: WikiNote
  expanded: boolean
  onToggle: () => void
  onUpdate: (id: string, data: Partial<{ title: string; content: string; section: string; is_pinned: boolean; attachments: unknown }>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}

export function WikiNoteRow({ note, expanded, onToggle, onUpdate, onDelete }: WikiNoteRowProps) {
  const [editing, setEditing] = useState(false)
  const [hovered, setHovered] = useState(false)
  const badge = SECTION_BADGES[note.section] || SECTION_BADGES['akros']

  const handleSave = async (data: { section: WikiSection; title: string; content: string; attachments?: unknown }) => {
    await onUpdate(note.id, data)
    setEditing(false)
  }

  const handleDelete = async () => {
    await onDelete(note.id)
  }

  const handlePin = async () => {
    await onUpdate(note.id, { is_pinned: !note.is_pinned })
  }

  // Collapsed row
  if (!expanded) {
    return (
      <div
        onClick={onToggle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '7px 12px', cursor: 'pointer',
          background: hovered ? t.neutrals.inner : 'transparent',
          borderRadius: t.radius.sm, transition: 'background 0.1s',
        }}
      >
        {/* Pin icon */}
        <span style={{
          fontSize: 11, width: 16, textAlign: 'center', flexShrink: 0,
          color: note.is_pinned ? '#D97706' : 'transparent',
        }}>
          {note.is_pinned ? '📌' : ''}
        </span>

        {/* Title */}
        <span style={{
          flex: 1, fontSize: 13, fontWeight: t.weight.medium,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          color: t.neutrals.text,
        }}>
          {note.title || '(제목 없음)'}
        </span>

        {/* Attachment count */}
        {note.attachments && note.attachments.length > 0 && (
          <span style={{
            display: 'flex', alignItems: 'center', gap: 2,
            fontSize: 10, color: t.neutrals.subtle, flexShrink: 0,
          }}>
            <LIcon name="paperclip" size={10} />
            {note.attachments.length}
          </span>
        )}

        {/* Section badge */}
        <span style={{
          fontSize: t.badge.size, fontWeight: t.badge.weight,
          padding: `${t.badge.padY}px ${t.badge.padX}px`,
          borderRadius: t.badge.radius,
          background: badge.bg, color: badge.fg,
          flexShrink: 0,
        }}>
          {badge.label}
        </span>

        {/* Date */}
        <span style={{
          fontSize: 11, color: t.neutrals.subtle, fontFamily: t.font.mono,
          flexShrink: 0, minWidth: 52,
        }}>
          {fmtDate(note.updated_at)}
        </span>
      </div>
    )
  }

  // Expanded — edit mode
  if (editing) {
    return (
      <div style={{ padding: '4px 0' }}>
        <WikiNoteForm
          initial={{
            section: note.section as WikiSection,
            title: note.title,
            content: note.content,
            attachments: note.attachments,
          }}
          onSave={handleSave}
          onCancel={() => setEditing(false)}
          onDelete={handleDelete}
        />
      </div>
    )
  }

  // Expanded — read mode
  return (
    <div style={{
      background: t.neutrals.inner, borderRadius: t.radius.md,
      padding: 14, marginBottom: 2,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: t.weight.semibold, color: t.neutrals.text }}>
            {note.title || '(제목 없음)'}
          </span>
          <span style={{
            fontSize: t.badge.size, fontWeight: t.badge.weight,
            padding: `${t.badge.padY}px ${t.badge.padX}px`,
            borderRadius: t.badge.radius,
            background: badge.bg, color: badge.fg,
          }}>
            {badge.label}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 11, color: t.neutrals.subtle, fontFamily: t.font.mono, marginRight: 8 }}>
            {fmtDate(note.updated_at)}
          </span>
          <button onClick={handlePin} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 4,
            borderRadius: t.radius.sm, fontSize: 12,
            color: note.is_pinned ? '#D97706' : t.neutrals.subtle,
          }}>📌</button>
          <LBtn variant="ghost" size="sm" icon={<LIcon name="file" size={13} />} onClick={() => setEditing(true)}>
            편집
          </LBtn>
          <button onClick={onToggle} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 4,
            borderRadius: t.radius.sm, color: t.neutrals.subtle,
          }}>
            <LIcon name="x" size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      {note.content && (
        <div style={{
          fontSize: 13, lineHeight: 1.7, color: t.neutrals.text,
          whiteSpace: 'pre-wrap', marginBottom: note.attachments?.length ? 12 : 0,
        }}>
          {note.content}
        </div>
      )}

      {/* Attachments */}
      {note.attachments && note.attachments.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {note.attachments.map((f, i) => (
            <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: t.neutrals.card, borderRadius: t.radius.sm,
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
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep wiki-note-row`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/willow-investment/\(linear\)/wiki/_components/wiki-note-row.tsx
git commit -m "feat: add wiki note row component with expand/edit modes"
```

---

### Task 4: wiki-list.tsx — 필터 바 + 노트 리스트 + 페이지네이션

**Files:**
- Create: `src/app/willow-investment/(linear)/wiki/_components/wiki-list.tsx`

- [ ] **Step 1: Create the wiki-list component**

```tsx
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep wiki-list`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/willow-investment/\(linear\)/wiki/_components/wiki-list.tsx
git commit -m "feat: add wiki list component with filter, search, pagination"
```

---

### Task 5: page.tsx — 메인 위키 페이지

**Files:**
- Create: `src/app/willow-investment/(linear)/wiki/page.tsx`

- [ ] **Step 1: Create the wiki page**

```tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { t } from '@/app/willow-investment/_components/linear-tokens'
import { WikiList } from './_components/wiki-list'
import { WikiNote } from './_components/wiki-note-row'

type WikiSection = 'akros' | 'etf-etc' | 'willow-mgmt' | 'tensw-mgmt'

export default function WikiPage() {
  const [notes, setNotes] = useState<WikiNote[]>([])
  const [loading, setLoading] = useState(true)

  const loadNotes = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/wiki', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setNotes(Array.isArray(data) ? data : [])
      }
    } catch (e) {
      console.error('Failed to load wiki notes:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadNotes() }, [loadNotes])

  const handleCreate = async (data: { section: WikiSection; title: string; content: string; attachments?: unknown }) => {
    const res = await fetch('/api/wiki', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      await loadNotes()
    }
  }

  const handleUpdate = async (id: string, data: Partial<{ title: string; content: string; section: string; is_pinned: boolean; attachments: unknown }>) => {
    const res = await fetch(`/api/wiki/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      await loadNotes()
    }
  }

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/wiki/${id}`, { method: 'DELETE' })
    if (res.ok) {
      await loadNotes()
    }
  }

  return (
    <>
      <div style={{ padding: '20px 0 0' }}>
        <h1 style={{
          margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: -0.3,
          fontFamily: t.font.sans, color: t.neutrals.text,
        }}>업무위키</h1>
        <p style={{
          margin: '4px 0 16px', fontSize: 12, color: t.neutrals.muted,
          fontFamily: t.font.sans,
        }}>
          전사 업무 지식 베이스
        </p>
      </div>

      <WikiList
        notes={notes}
        loading={loading}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
      />
    </>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep wiki`
Expected: No errors

- [ ] **Step 3: Open browser and verify**

Run: Navigate to `http://localhost:3000/willow-investment/wiki`

Expected:
- Page loads with "업무위키" title and "전사 업무 지식 베이스" subtitle
- Header shows breadcrumb "윌로우인베스트먼트 > 업무위키"
- Section filter tabs (전체/Akros/ETC/윌로우/텐소프트) are visible
- Search input and "새 노트" button are visible
- Existing wiki notes from all sections are listed
- Clicking a note expands it to show full content
- Clicking "새 노트" opens the inline form
- Creating, editing, pinning, deleting notes all work
- Pagination works when there are more than 10 notes

- [ ] **Step 4: Commit**

```bash
git add src/app/willow-investment/\(linear\)/wiki/page.tsx
git commit -m "feat: add wiki page with full CRUD and section filtering"
```
