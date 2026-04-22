'use client'

import { t, eventTones } from '@/app/willow-investment/_components/linear-tokens'
import { LBtn } from '@/app/willow-investment/_components/linear-btn'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import { WillowMgmtSchedule, WillowMgmtClient } from '@/types/willow-mgmt'

interface ScheduleDetailDialogProps {
  schedule: WillowMgmtSchedule | null
  clients: WillowMgmtClient[]
  onClose: () => void
  onToggleComplete: (id: string, completed: boolean) => void
  onDelete: (id: string) => void
}

function InfoRow({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: t.neutrals.muted, fontFamily: t.font.sans }}>
      <LIcon name={icon} size={14} stroke={1.8} color={t.neutrals.subtle} />
      <span>{children}</span>
    </div>
  )
}

export function ScheduleDetailDialog({ schedule, clients, onClose, onToggleComplete, onDelete }: ScheduleDetailDialogProps) {
  if (!schedule) return null

  const client = schedule.client_id ? clients.find(c => c.id === schedule.client_id) : null
  const done = schedule.is_completed

  // Tone color for the status pill
  const toneKey = done ? 'done' : schedule.type === 'deadline' ? 'warn' : 'neutral'
  const tone = eventTones[toneKey] || eventTones.neutral

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
        <div style={{ padding: '16px 20px 12px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontFamily: t.font.mono, fontWeight: 600, color: t.neutrals.subtle, letterSpacing: 0.6, marginBottom: 4 }}>
              SCHEDULE
            </div>
            <div style={{
              fontSize: 16, fontWeight: t.weight.semibold, fontFamily: t.font.sans,
              color: t.neutrals.text, lineHeight: 1.35,
              textDecoration: done ? 'line-through' : 'none',
              opacity: done ? 0.6 : 1,
            }}>
              {schedule.title}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: t.radius.sm, flexShrink: 0,
            background: t.neutrals.inner, border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.neutrals.muted,
          }}>
            <LIcon name="x" size={14} stroke={2} />
          </button>
        </div>

        {/* Status pill */}
        <div style={{ padding: '0 20px 12px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-block', padding: '3px 10px', borderRadius: t.radius.pill,
            fontSize: 11, fontWeight: t.weight.medium, fontFamily: t.font.sans,
            background: tone.bg, color: tone.fg,
          }}>
            {done ? '완료' : schedule.type === 'deadline' ? '마감' : '예정'}
          </span>
          {client && (
            <span style={{
              display: 'inline-block', padding: '3px 10px', borderRadius: t.radius.pill,
              fontSize: 11, fontWeight: t.weight.medium, fontFamily: t.font.sans,
              background: t.neutrals.inner, color: t.neutrals.muted,
            }}>
              {client.name}
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <InfoRow icon="calendar">{dateDisplay}</InfoRow>
          {timeDisplay && <InfoRow icon="briefcase">{timeDisplay}</InfoRow>}

          {schedule.milestones && schedule.milestones.length > 0 && (
            <InfoRow icon="book">
              {schedule.milestones.map(ms => ms.name).join(', ')}
            </InfoRow>
          )}

          {schedule.description && (
            <div style={{
              marginTop: 6, padding: '10px 12px', borderRadius: t.radius.md,
              background: t.neutrals.inner, fontSize: 13, lineHeight: 1.6,
              fontFamily: t.font.sans, color: t.neutrals.text,
              whiteSpace: 'pre-wrap',
            }}>
              {schedule.description}
            </div>
          )}

          {/* Tasks */}
          {schedule.tasks && schedule.tasks.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 11, fontWeight: t.weight.medium, color: t.neutrals.subtle, fontFamily: t.font.sans, marginBottom: 6 }}>
                태스크
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {schedule.tasks.map(task => (
                  <div key={task.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    padding: '6px 10px', borderRadius: t.radius.sm,
                    background: t.neutrals.inner, fontSize: 12,
                    fontFamily: t.font.sans, color: t.neutrals.text,
                  }}>
                    <div style={{
                      width: 14, height: 14, borderRadius: 999, flexShrink: 0, marginTop: 1,
                      border: `1.5px solid ${task.is_completed ? t.accent.pos : t.neutrals.subtle}`,
                      background: task.is_completed ? t.accent.pos : 'transparent',
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
                        <div style={{ fontSize: 10.5, fontFamily: t.font.mono, color: t.neutrals.subtle, marginTop: 2 }}>
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
          padding: '12px 20px', background: t.neutrals.inner,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <LBtn variant="ghost" size="sm" style={{ color: t.accent.neg }}
            onClick={() => { onDelete(schedule.id); onClose() }}>
            삭제
          </LBtn>
          <div style={{ display: 'flex', gap: 8 }}>
            <LBtn variant="ghost" size="sm" onClick={onClose}>닫기</LBtn>
            <LBtn variant="brand" size="sm"
              onClick={() => { onToggleComplete(schedule.id, !done); onClose() }}>
              {done ? '미완료로 변경' : '완료 처리'}
            </LBtn>
          </div>
        </div>
      </div>
    </div>
  )
}
