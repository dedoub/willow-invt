'use client'

import { useMemo } from 'react'
import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import { RyuhaSubject, RyuhaChapter } from '@/types/ryuha'

interface ProgressBlockProps {
  subjects: RyuhaSubject[]
  chapters: RyuhaChapter[]
}

export function ProgressBlock({ subjects, chapters }: ProgressBlockProps) {
  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const sevenDaysLater = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)

    return subjects.map(s => {
      const subjectChapters = chapters.filter(ch => {
        const tb = ch.textbook
        return tb && 'subject_id' in tb && tb.subject_id === s.id
      })
      const total = subjectChapters.length
      const completed = subjectChapters.filter(ch => ch.status === 'completed').length
      const overdue = subjectChapters.filter(ch =>
        ch.target_date && ch.target_date < today && ch.status !== 'completed'
      )
      const upcoming = subjectChapters.filter(ch =>
        ch.target_date && ch.target_date >= today && ch.target_date <= sevenDaysLater && ch.status !== 'completed'
      )
      return { subject: s, total, completed, pct: total > 0 ? completed / total * 100 : 0, overdue, upcoming }
    }).filter(s => s.total > 0)
  }, [subjects, chapters])

  const totalOverdue = stats.reduce((n, s) => n + s.overdue.length, 0)
  const totalUpcoming = stats.reduce((n, s) => n + s.upcoming.length, 0)

  return (
    <LCard>
      <LSectionHead eyebrow="PROGRESS" title="진도 현황" action={
        <span style={{ fontSize: 11, fontFamily: t.font.mono, color: t.neutrals.muted }}>
          {stats.reduce((n, s) => n + s.completed, 0)}/{stats.reduce((n, s) => n + s.total, 0)}
        </span>
      } />

      {/* Subject progress bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {stats.map(({ subject, total, completed, pct }) => (
          <div key={subject.id}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 4,
            }}>
              <span style={{ fontSize: 12, fontWeight: t.weight.medium }}>{subject.name}</span>
              <span style={{ fontSize: 10, fontFamily: t.font.mono, color: t.neutrals.subtle }}>
                {completed}/{total} ({Math.round(pct)}%)
              </span>
            </div>
            <div style={{
              height: 6, borderRadius: 3, background: t.neutrals.inner, overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', borderRadius: 3,
                width: `${pct}%`, background: subject.color,
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {(totalOverdue > 0 || totalUpcoming > 0) && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {totalOverdue > 0 && (
            <div style={{
              padding: '6px 10px', borderRadius: t.radius.sm,
              background: '#FEE2E2', fontSize: 11, color: t.accent.neg,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <LIcon name="clock" size={12} stroke={2} />
              지연 {totalOverdue}건
              <span style={{ color: t.accent.neg + '99', marginLeft: 4 }}>
                {stats.flatMap(s => s.overdue).slice(0, 3).map(ch => ch.name).join(', ')}
              </span>
            </div>
          )}
          {totalUpcoming > 0 && (
            <div style={{
              padding: '6px 10px', borderRadius: t.radius.sm,
              background: '#FBEFD5', fontSize: 11, color: '#8B5A12',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <LIcon name="calendar" size={12} stroke={2} />
              이번 주 마감 {totalUpcoming}건
              <span style={{ color: '#8B5A1280', marginLeft: 4 }}>
                {stats.flatMap(s => s.upcoming).slice(0, 3).map(ch => ch.name).join(', ')}
              </span>
            </div>
          )}
        </div>
      )}

      {stats.length === 0 && (
        <div style={{ textAlign: 'center', fontSize: 12, color: t.neutrals.subtle, padding: 16 }}>
          교재/단원을 추가하세요
        </div>
      )}
    </LCard>
  )
}
