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
  'willow-mgmt':{ label: '윌로우',       ...tonePalettes.done },
  'tensw-mgmt': { label: '텐소프트웍스', ...tonePalettes.warn },
  'etf-etc':    { label: 'ETC',          ...tonePalettes.info },
  'akros':      { label: '아크로스',     ...tonePalettes.brand },
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
        <span style={{
          fontSize: 11, width: 16, textAlign: 'center', flexShrink: 0,
          color: note.is_pinned ? '#D97706' : 'transparent',
        }}>
          {note.is_pinned ? '📌' : ''}
        </span>

        <span style={{
          flex: 1, fontSize: 13, fontWeight: t.weight.medium,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          color: t.neutrals.text,
        }}>
          {note.title || '(제목 없음)'}
        </span>

        {note.attachments && note.attachments.length > 0 && (
          <span style={{
            display: 'flex', alignItems: 'center', gap: 2,
            fontSize: 10, color: t.neutrals.subtle, flexShrink: 0,
          }}>
            <LIcon name="paperclip" size={10} />
            {note.attachments.length}
          </span>
        )}

        <span style={{
          fontSize: t.badge.size, fontWeight: t.badge.weight,
          padding: `${t.badge.padY}px ${t.badge.padX}px`,
          borderRadius: t.badge.radius,
          background: badge.bg, color: badge.fg,
          flexShrink: 0,
        }}>
          {badge.label}
        </span>

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

      {note.content && (
        <div style={{
          fontSize: 13, lineHeight: 1.7, color: t.neutrals.text,
          whiteSpace: 'pre-wrap', marginBottom: note.attachments?.length ? 12 : 0,
        }}>
          {note.content}
        </div>
      )}

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
