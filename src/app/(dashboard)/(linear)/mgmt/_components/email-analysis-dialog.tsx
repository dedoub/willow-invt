'use client'

import { useState } from 'react'
import { t } from '@/app/(dashboard)/_components/linear-tokens'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LBadge } from '@/app/(dashboard)/_components/linear-badge'
import { LFilterChip } from '@/app/(dashboard)/_components/linear-filter-chip'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'

interface Issue {
  title: string
  description: string
  priority: 'high' | 'medium' | 'low'
  relatedEmailIds: string[]
}

interface TodoItem {
  task: string
  dueDate?: string
  priority: 'high' | 'medium' | 'low'
  relatedEmailIds: string[]
}

interface CategoryAnalysis {
  category: string
  summary: string
  recentTopics: string[]
  issues: Issue[]
  todos: TodoItem[]
  emailCount: number
}

export interface AnalysisResult {
  generatedAt: string
  categories: CategoryAnalysis[]
  overallSummary: string
}

export interface SavedTodo {
  id: string
  category: string
  task: string
  priority: 'high' | 'medium' | 'low'
  due_date: string | null
  completed: boolean
  completed_at: string | null
}

interface EmailAnalysisDialogProps {
  open: boolean
  analysis: AnalysisResult | null
  todos: SavedTodo[]
  onClose: () => void
  onToggleTodo: (id: string, completed: boolean) => void
}

const PRIORITY_TONES: Record<string, { bg: string; fg: string }> = {
  high:   { bg: '#F3DADA', fg: '#8A2A2A' },
  medium: { bg: '#F9E8D0', fg: '#8A5A1A' },
  low:    { bg: '#F6F6F7', fg: '#5B5E66' },
}

export function EmailAnalysisDialog({ open, analysis, todos, onClose, onToggleTodo }: EmailAnalysisDialogProps) {
  const [activeCategory, setActiveCategory] = useState(0)

  if (!open || !analysis) return null

  const cat = analysis.categories[activeCategory]

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,15,18,0.18)', backdropFilter: 'blur(3px)' }} />

      <div style={{
        position: 'relative', width: 600, maxHeight: '85vh',
        background: t.neutrals.card, borderRadius: t.radius.lg + 2,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: `${t.density.cardPad}px ${t.density.pagePadX}px ${t.density.blockGap}px`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, fontFamily: t.font.mono, fontWeight: t.weight.semibold, color: t.neutrals.subtle, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: t.density.tableRowGap }}>
              AI ANALYSIS
            </div>
            <div style={{ fontSize: `calc(${t.type.sectionTitle}px * var(--fz, 1))`, fontWeight: t.weight.semibold, fontFamily: t.font.sans, color: t.neutrals.text }}>
              이메일 분석 결과
            </div>
            <div style={{ fontSize: `calc(${t.type.label}px * var(--fz, 1))`, fontFamily: t.font.mono, color: t.neutrals.subtle, marginTop: t.density.tableRowGap }}>
              {new Date(analysis.generatedAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: t.density.controlHSm, borderRadius: t.radius.sm, flexShrink: 0,
            background: t.neutrals.inner, border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.neutrals.muted,
          }}>
            <LIcon name="x" size={14} stroke={2} />
          </button>
        </div>

        {/* Overall summary */}
        <div style={{
          margin: '0 20px 10px', padding: `${t.density.panelPadX}px ${t.density.blockGap}px`, borderRadius: t.radius.md,
          background: t.brand[50], fontSize: `calc(${t.type.body}px * var(--fz, 1))`, lineHeight: 1.6,
          fontFamily: t.font.sans, color: t.neutrals.text,
        }}>
          {analysis.overallSummary}
        </div>

        {/* Category tabs */}
        <div style={{ padding: `0 ${t.density.pagePadX}px ${t.density.panelPadY}px` }}>
          <LFilterChip
            options={analysis.categories.map((c, i) => ({ value: String(i), label: `${c.category} ${c.emailCount}` }))}
            value={String(activeCategory)}
            onChange={v => setActiveCategory(Number(v))}
          />
        </div>

        {/* Category content */}
        {cat && (
          <div style={{ flex: 1, overflowY: 'auto', padding: `0 ${t.density.pagePadX}px ${t.density.cardPad}px` }}>
            {/* Summary */}
            <div style={{ fontSize: `calc(${t.type.body}px * var(--fz, 1))`, lineHeight: 1.6, color: t.neutrals.text, marginBottom: t.density.gapMd, fontFamily: t.font.sans }}>
              {cat.summary}
            </div>

            {/* Topics */}
            {cat.recentTopics.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: t.density.gapXs, marginBottom: t.density.blockGap }}>
                {cat.recentTopics.map((topic, i) => (
                  <LBadge key={i} palette={{ bg: t.neutrals.inner, fg: t.neutrals.muted }}>{topic}</LBadge>
                ))}
              </div>
            )}

            {/* Issues */}
            {cat.issues.length > 0 && (
              <Section title="주요 이슈">
                {cat.issues.map((issue, i) => {
                  const pt = PRIORITY_TONES[issue.priority]
                  return (
                    <div key={i} style={{
                      padding: `${t.density.panelPadY}px ${t.density.panelPadX}px`, borderRadius: t.radius.sm, background: t.neutrals.inner,
                      marginBottom: t.density.gapXs,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm, marginBottom: t.density.gapXs }}>
                        <LBadge palette={pt}>{issue.priority}</LBadge>
                        <span style={{ fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, fontWeight: t.weight.medium, color: t.neutrals.text }}>{issue.title}</span>
                      </div>
                      <div style={{ fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, color: t.neutrals.muted, lineHeight: 1.5 }}>{issue.description}</div>
                    </div>
                  )
                })}
              </Section>
            )}

            {/* Todos from analysis */}
            {cat.todos.length > 0 && (
              <Section title="할 일">
                {cat.todos.map((todo, i) => {
                  const saved = todos.find(t => t.task === todo.task && t.category === cat.category)
                  const done = saved?.completed ?? false
                  const pt = PRIORITY_TONES[todo.priority]
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'flex-start', gap: t.density.kpiGap,
                      padding: `${t.density.panelPadY}px ${t.density.panelPadX}px`, borderRadius: t.radius.sm, background: t.neutrals.inner,
                      marginBottom: t.density.gapXs, opacity: done ? 0.5 : 1,
                    }}>
                      <button
                        onClick={() => saved && onToggleTodo(saved.id, !done)}
                        style={{
                          width: 16, height: 16, borderRadius: t.radius.sm, flexShrink: 0, marginTop: 1,
                          background: done ? t.accent.pos : t.neutrals.line,
                          cursor: saved ? 'pointer' : 'default',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                        }}
                      >
                        {done && (
                          <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12l5 5L20 7" />
                          </svg>
                        )}
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, fontFamily: t.font.sans, color: t.neutrals.text,
                          textDecoration: done ? 'line-through' : 'none',
                        }}>
                          {todo.task}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm, marginTop: t.density.tableRowGap }}>
                          <LBadge palette={pt}>{todo.priority}</LBadge>
                          {todo.dueDate && (
                            <span style={{ fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, fontFamily: t.font.mono, color: t.neutrals.subtle }}>
                              마감 {todo.dueDate}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </Section>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: `${t.density.blockGap}px ${t.density.pagePadX}px`, background: t.neutrals.inner, display: 'flex', justifyContent: 'flex-end' }}>
          <LBtn variant="ghost" size="sm" onClick={onClose}>닫기</LBtn>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: t.density.blockGap }}>
      <div style={{ fontSize: `calc(${t.type.control}px * var(--fz, 1))`, fontWeight: t.weight.medium, color: t.neutrals.subtle, fontFamily: t.font.sans, marginBottom: t.density.gapSm }}>
        {title}
      </div>
      {children}
    </div>
  )
}
