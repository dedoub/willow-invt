'use client'

import { t, eventTones, tonePalettes } from '@/app/(dashboard)/_components/linear-tokens'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LBadge } from '@/app/(dashboard)/_components/linear-badge'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { WillowMgmtSchedule } from '@/types/willow-mgmt'

const CATEGORY_TONES: Record<string, { bg: string; fg: string }> = {
  'willow-mgmt': tonePalettes.done,
  'tensw-mgmt':  tonePalettes.warn,
  'etf-etc':     tonePalettes.info,
  'akros':       tonePalettes.brand,
  'other':       tonePalettes.neutral,
}

const CATEGORY_LABELS: Record<string, string> = {
  'willow-mgmt': '윌로우',
  'tensw-mgmt':  '텐소프트웍스',
  'etf-etc':     'ETC',
  'akros':       '아크로스',
  'other':       '기타',
}

interface ScheduleDetailDialogProps {
  schedule: WillowMgmtSchedule | null
  onClose: () => void
  onToggleComplete: (id: string, completed: boolean) => void
  onDelete: (id: string) => void
  onEdit: (schedule: WillowMgmtSchedule) => void
}

function InfoRow({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: t.density.kpiGap, fontSize: `calc(${t.type.body}px * var(--fz, 1))`, color: t.neutrals.muted, fontFamily: t.font.sans }}>
      <LIcon name={icon} size={14} stroke={1.8} color={t.neutrals.subtle} />
      <span>{children}</span>
    </div>
  )
}

export function ScheduleDetailDialog({ schedule, onClose, onToggleComplete, onDelete, onEdit }: ScheduleDetailDialogProps) {
  if (!schedule) return null

  const done = schedule.is_completed

  // Tone color for the status pill
  const toneKey = done ? 'done' : schedule.type === 'deadline' ? 'warn' : 'neutral'
  const tone = eventTones[toneKey] || eventTones.neutral

  // Category
  const catTone = CATEGORY_TONES[schedule.category] || tonePalettes.neutral
  const catLabel = CATEGORY_LABELS[schedule.category] || schedule.category

  // Date display
  const dateDisplay = schedule.end_date && schedule.end_date !== schedule.schedule_date
    ? `${schedule.schedule_date} → ${schedule.end_date}`
    : schedule.schedule_date

  // Time display
  const timeDisplay = schedule.start_time
    ? schedule.end_time
      ? `${schedule.start_time.slice(0, 5)} – ${schedule.end_time.slice(0, 5)}`
      : schedule.start_time.slice(0, 5)
    : null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,15,18,0.18)', backdropFilter: 'blur(3px)' }} />

      {/* Panel */}
      <div style={{
        position: 'relative', width: 420, maxHeight: '85vh',
        background: t.neutrals.card, borderRadius: t.radius.lg + 2,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: `${t.density.cardPad}px ${t.density.pagePadX}px ${t.density.blockGap}px`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, fontFamily: t.font.mono, fontWeight: t.weight.semibold, color: t.neutrals.subtle, letterSpacing: 0.6, marginBottom: t.density.gapXs }}>
              SCHEDULE
            </div>
            <div style={{
              fontSize: `calc(${t.type.sectionTitle}px * var(--fz, 1))`, fontWeight: t.weight.semibold, fontFamily: t.font.sans,
              color: t.neutrals.text, lineHeight: 1.35,
              textDecoration: done ? 'line-through' : 'none',
              opacity: done ? 0.6 : 1,
            }}>
              {schedule.title}
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

        {/* Status pill */}
        <div style={{ padding: `0 ${t.density.pagePadX}px ${t.density.blockGap}px`, display: 'flex', gap: t.density.gapSm, flexWrap: 'wrap' }}>
          {/* 상태는 pill, 카테고리는 분류 배지(기본 반경) */}
          <LBadge palette={tone} pill>{done ? '완료' : schedule.type === 'deadline' ? '마감' : '예정'}</LBadge>
          <LBadge palette={catTone}>{catLabel}</LBadge>
        </div>

        {/* Body */}
        <div style={{ padding: `0 ${t.density.pagePadX}px ${t.density.cardPad}px`, display: 'flex', flexDirection: 'column', gap: t.density.gapMd }}>
          <InfoRow icon="calendar">{dateDisplay}</InfoRow>
          {timeDisplay && <InfoRow icon="briefcase">{timeDisplay}</InfoRow>}

          {schedule.milestones && schedule.milestones.length > 0 && (
            <InfoRow icon="book">
              {schedule.milestones.map(ms => ms.name).join(', ')}
            </InfoRow>
          )}

          {schedule.description && (
            <div style={{
              marginTop: t.density.gapSm, padding: `${t.density.panelPadX}px ${t.density.blockGap}px`, borderRadius: t.radius.md,
              background: t.neutrals.inner, fontSize: `calc(${t.type.body}px * var(--fz, 1))`, lineHeight: 1.6,
              fontFamily: t.font.sans, color: t.neutrals.text,
              whiteSpace: 'pre-wrap',
            }}>
              {schedule.description}
            </div>
          )}

          {/* Tasks */}
          {schedule.tasks && schedule.tasks.length > 0 && (
            <div style={{ marginTop: t.density.gapXs }}>
              <div style={{ fontSize: `calc(${t.type.control}px * var(--fz, 1))`, fontWeight: t.weight.medium, color: t.neutrals.subtle, fontFamily: t.font.sans, marginBottom: t.density.gapSm }}>
                태스크
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.gapXs }}>
                {schedule.tasks.map(task => (
                  <div key={task.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: t.density.kpiGap,
                    padding: `${t.density.gapSm}px ${t.density.panelPadX}px`, borderRadius: t.radius.sm,
                    background: t.neutrals.inner, fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`,
                    fontFamily: t.font.sans, color: t.neutrals.text,
                  }}>
                    <div style={{
                      width: 14, height: 14, borderRadius: t.radius.pill, flexShrink: 0, marginTop: 1,
                      background: task.is_completed ? t.accent.pos : t.neutrals.line,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {task.is_completed && (
                        <svg width={8} height={8} viewBox="0 0 24 24" fill="none"
                          stroke="#fff" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12l5 5L20 7" />
                        </svg>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        textDecoration: task.is_completed ? 'line-through' : 'none',
                        opacity: task.is_completed ? 0.6 : 1,
                      }}>
                        {task.content}
                      </div>
                      {task.deadline && (
                        <div style={{ fontSize: `calc(${t.type.label}px * var(--fz, 1))`, fontFamily: t.font.mono, color: t.neutrals.subtle, marginTop: t.density.tableRowGap }}>
                          마감 {task.deadline}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: `${t.density.blockGap}px ${t.density.pagePadX}px`, background: t.neutrals.inner,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <LBtn variant="ghost" size="sm" style={{ color: t.accent.neg }}
            onClick={() => { onDelete(schedule.id); onClose() }}>
            삭제
          </LBtn>
          <div style={{ display: 'flex', gap: t.density.kpiGap }}>
            <LBtn variant="ghost" size="sm"
              onClick={() => { onToggleComplete(schedule.id, !done); onClose() }}>
              {done ? '미완료로 변경' : '완료 처리'}
            </LBtn>
            <LBtn variant="secondary" size="sm"
              onClick={() => { onEdit(schedule); onClose() }}>
              수정
            </LBtn>
          </div>
        </div>
      </div>
    </div>
  )
}
