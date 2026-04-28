'use client'

import { useState, useMemo } from 'react'
import { t } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { RyuhaSubject, RyuhaTextbook, RyuhaChapter } from '@/types/ryuha'

interface TextbookBlockProps {
  subjects: RyuhaSubject[]
  textbooks: RyuhaTextbook[]
  chapters: RyuhaChapter[]
  onManageSubjects: () => void
  onAddTextbook: () => void
  onEditTextbook: (textbook: RyuhaTextbook) => void
  onAddChapter: (textbookId: string) => void
  onEditChapter: (chapter: RyuhaChapter) => void
  onToggleChapterStatus: (chapter: RyuhaChapter) => void
}

const STATUS_LABELS: Record<string, { label: string; bg: string; fg: string }> = {
  pending:                { label: '대기',     bg: '#EDEDEE', fg: '#2A2A2E' },
  in_progress:            { label: '진행중',   bg: '#DCE8F5', fg: '#1F4E79' },
  review_notes_pending:   { label: '리뷰대기', bg: '#FBEFD5', fg: '#8B5A12' },
  completed:              { label: '완료',     bg: '#DAEEDD', fg: '#1F5F3D' },
}

export function TextbookBlock({
  subjects, textbooks, chapters,
  onManageSubjects, onAddTextbook, onEditTextbook,
  onAddChapter, onEditChapter, onToggleChapterStatus,
}: TextbookBlockProps) {
  const [subjectFilter, setSubjectFilter] = useState<string>('all')
  const [expandedTextbooks, setExpandedTextbooks] = useState<Set<string>>(new Set())

  const filteredTextbooks = useMemo(() => {
    if (subjectFilter === 'all') return textbooks
    return textbooks.filter(tb => tb.subject_id === subjectFilter)
  }, [textbooks, subjectFilter])

  const getChaptersForTextbook = (textbookId: string) =>
    chapters.filter(ch => ch.textbook_id === textbookId).sort((a, b) => a.order_index - b.order_index)

  const toggleExpand = (id: string) => {
    setExpandedTextbooks(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 10 }}>
        <LSectionHead eyebrow="TEXTBOOKS" title="교재관리" action={
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={onManageSubjects} style={{
              padding: '4px 10px', borderRadius: t.radius.sm,
              background: t.neutrals.inner, border: 'none',
              fontSize: 11, fontFamily: t.font.sans, fontWeight: t.weight.medium,
              color: t.neutrals.muted, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 3,
            }}>
              <LIcon name="settings" size={11} stroke={2} /> 과목
            </button>
            <button onClick={onAddTextbook} style={{
              padding: '4px 10px', borderRadius: t.radius.sm,
              background: t.neutrals.inner, border: 'none',
              fontSize: 11, fontFamily: t.font.sans, fontWeight: t.weight.medium,
              color: t.neutrals.muted, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 3,
            }}>
              <LIcon name="plus" size={11} stroke={2} /> 교재
            </button>
          </div>
        } />
      </div>

      {/* Subject filter */}
      {subjects.length > 0 && (
        <div style={{ padding: '0 14px 10px', display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <button onClick={() => setSubjectFilter('all')} style={{
            padding: '4px 10px', borderRadius: t.radius.pill,
            border: 'none', cursor: 'pointer', fontSize: 11, fontFamily: t.font.sans,
            fontWeight: subjectFilter === 'all' ? t.weight.medium : t.weight.regular,
            background: subjectFilter === 'all' ? t.brand[100] : t.neutrals.inner,
            color: subjectFilter === 'all' ? t.brand[700] : t.neutrals.muted,
          }}>전체</button>
          {subjects.map(s => (
            <button key={s.id} onClick={() => setSubjectFilter(s.id)} style={{
              padding: '4px 10px', borderRadius: t.radius.pill,
              border: 'none', cursor: 'pointer', fontSize: 11, fontFamily: t.font.sans,
              fontWeight: subjectFilter === s.id ? t.weight.medium : t.weight.regular,
              background: subjectFilter === s.id ? `${s.color}25` : t.neutrals.inner,
              color: subjectFilter === s.id ? s.color : t.neutrals.muted,
            }}>{s.name}</button>
          ))}
        </div>
      )}

      {/* Textbook list */}
      <div>
        {filteredTextbooks.map(tb => {
          const subject = subjects.find(s => s.id === tb.subject_id)
          const tbChapters = getChaptersForTextbook(tb.id)
          const completedCount = tbChapters.filter(ch => ch.status === 'completed').length
          const isExpanded = expandedTextbooks.has(tb.id)

          return (
            <div key={tb.id} style={{ borderTop: `1px solid ${t.neutrals.line}` }}>
              {/* Textbook header */}
              <div
                onClick={() => toggleExpand(tb.id)}
                style={{
                  padding: '10px 14px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8,
                  borderLeft: subject?.color ? `3px solid ${subject.color}` : undefined,
                }}
              >
                <LIcon name={isExpanded ? 'chevronDown' : 'chevronRight'} size={12} stroke={2}
                  color={t.neutrals.subtle} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: t.weight.medium }}>{tb.name}</div>
                  {tb.publisher && (
                    <div style={{ fontSize: 10, color: t.neutrals.subtle }}>{tb.publisher}</div>
                  )}
                </div>
                <span style={{
                  fontSize: 10, fontFamily: t.font.mono, color: t.neutrals.subtle,
                }}>{completedCount}/{tbChapters.length}</span>
                <button onClick={(e) => { e.stopPropagation(); onEditTextbook(tb) }} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: t.neutrals.subtle, padding: 2,
                }}>
                  <LIcon name="pencil" size={11} stroke={2} />
                </button>
              </div>

              {/* Chapters */}
              {isExpanded && (
                <div style={{ paddingLeft: 28, paddingRight: 14, paddingBottom: 8 }}>
                  {tbChapters.map(ch => {
                    const status = STATUS_LABELS[ch.status] || STATUS_LABELS.pending
                    return (
                      <div key={ch.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '5px 6px', fontSize: 12,
                      }}>
                        <span style={{
                          fontSize: 10, fontWeight: t.weight.medium,
                          padding: '1px 6px', borderRadius: t.radius.sm,
                          background: status.bg, color: status.fg,
                          cursor: 'pointer', whiteSpace: 'nowrap',
                        }} onClick={() => onToggleChapterStatus(ch)}>
                          {status.label}
                        </span>
                        <span style={{
                          flex: 1, cursor: 'pointer',
                          textDecoration: ch.status === 'completed' ? 'line-through' : 'none',
                          color: ch.status === 'completed' ? t.neutrals.subtle : t.neutrals.text,
                        }} onClick={() => onEditChapter(ch)}>
                          {ch.name}
                        </span>
                        {ch.target_date && (
                          <span style={{
                            fontSize: 10, fontFamily: t.font.mono, color: t.neutrals.subtle,
                          }}>{ch.target_date.slice(5)}</span>
                        )}
                      </div>
                    )
                  })}
                  <button onClick={() => onAddChapter(tb.id)} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 11, color: t.neutrals.subtle, padding: '4px 6px',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    <LIcon name="plus" size={10} stroke={2} /> 단원 추가
                  </button>
                </div>
              )}
            </div>
          )
        })}
        {filteredTextbooks.length === 0 && (
          <div style={{
            padding: '20px 14px', textAlign: 'center',
            fontSize: 12, color: t.neutrals.subtle,
          }}>교재가 없습니다</div>
        )}
      </div>
    </LCard>
  )
}
