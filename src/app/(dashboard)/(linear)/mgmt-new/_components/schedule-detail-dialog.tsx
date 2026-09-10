'use client'

import { t } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { FigureGrid, type FigureItem } from './figure-grid'
import { WillowMgmtSchedule } from '@/types/willow-mgmt'

const CATEGORY_LABELS: Record<string, string> = {
  'willow-mgmt': '윌로우',
  'tensw-mgmt': '텐소프트웍스',
  'etf-etc': 'ETC',
  'akros': '아크로스',
  'other': '기타',
}

interface Props {
  schedule: WillowMgmtSchedule | null
  onClose: () => void
  onToggleComplete: (id: string, completed: boolean) => void
  onDelete: (id: string) => void
  onEdit: (schedule: WillowMgmtSchedule) => void
}

/**
 * 일정 상세 — 거래 상세와 같이 섹션 카드를 그대로 띄운다.
 * 라벨/값 격자와 카드 푸터만 쓰고 모달 전용 회색 판·상자선은 두지 않는다(CEO 2026-09-10).
 */
export function ScheduleDetailDialogNew({ schedule, onClose, onToggleComplete, onDelete, onEdit }: Props) {
  if (!schedule) return null

  const done = schedule.is_completed
  const cols = 2

  const dateDisplay = schedule.end_date && schedule.end_date !== schedule.schedule_date
    ? `${schedule.schedule_date} ~ ${schedule.end_date}`
    : schedule.schedule_date
  const timeDisplay = schedule.start_time
    ? schedule.end_time
      ? `${schedule.start_time.slice(0, 5)} - ${schedule.end_time.slice(0, 5)}`
      : schedule.start_time.slice(0, 5)
    : null

  const facts: FigureItem[] = [
    { label: '상태', value: done ? '완료' : schedule.type === 'deadline' ? '마감' : '예정' },
    { label: '구분', value: CATEGORY_LABELS[schedule.category] ?? schedule.category },
    { label: '일자', value: dateDisplay, mono: true },
  ]
  if (timeDisplay) facts.push({ label: '시간', value: timeDisplay, mono: true })
  if (schedule.milestones && schedule.milestones.length > 0) {
    facts.push({ label: '마일스톤', value: schedule.milestones.map(ms => ms.name).join(', '), prose: true, span: cols })
  }
  if (schedule.description) facts.push({ label: '설명', value: schedule.description, prose: true, span: cols })

  const tasks = schedule.tasks ?? []

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: t.density.pagePadX,
    }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,15,18,0.18)', backdropFilter: 'blur(3px)' }} />

      <LCard pad={0} style={{ position: 'relative', width: 420, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadY }}>
          <LSectionHead
            title={schedule.title}
            action={
              <button onClick={onClose} title="닫기" style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: t.density.gapXs, borderRadius: t.radius.sm, color: t.neutrals.muted,
                display: 'flex', alignItems: 'center',
              }}>
                <LIcon name="x" size={14} stroke={2} />
              </button>
            }
            mb={0}
          />
        </div>

        <div style={{ padding: `0 ${t.density.cardPad}px` }}>
          <FigureGrid items={facts} cols={cols} />
        </div>

        {/* 태스크 — 카드 안 목록과 같은 문법. 행 사이는 얇은 선으로만 나눈다 */}
        {tasks.length > 0 && (
          <div style={{ margin: `${t.density.panelPadY}px ${t.density.cardPad}px 0`, paddingTop: t.density.panelPadY, borderTop: `1px solid ${t.neutrals.line}` }}>
            <div style={{ fontSize: `calc(${t.type.label}px * var(--fz, 1))`, color: t.neutrals.subtle, marginBottom: t.density.gapSm }}>
              태스크 {tasks.filter(task => task.is_completed).length}/{tasks.length}
            </div>
            {tasks.map((task, i) => (
              <div key={task.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: t.density.kpiGap,
                padding: `${t.density.gapSm}px ${t.density.tableRowPadX}px`,
                borderTop: i > 0 ? `1px solid ${t.neutrals.line}` : undefined,
              }}>
                <span style={{
                  width: 12, height: 12, borderRadius: t.radius.pill, flexShrink: 0, marginTop: 2,
                  background: task.is_completed ? t.chart.mono : t.neutrals.line,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {task.is_completed && (
                    <svg width={7} height={7} viewBox="0 0 24 24" fill="none"
                      stroke="#fff" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                  )}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, fontWeight: t.weight.medium,
                    color: t.neutrals.text,
                    textDecoration: task.is_completed ? 'line-through' : 'none',
                    opacity: task.is_completed ? 0.6 : 1,
                  }}>
                    {task.content}
                  </div>
                  {task.deadline && (
                    <div style={{ fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, fontFamily: t.font.mono, color: t.neutrals.subtle, marginTop: t.density.tableRowGap }}>
                      마감 {task.deadline}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div data-card-foot="" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: t.density.gapSm,
          margin: `${t.density.gapMd}px ${t.density.cardPad}px 0`, paddingTop: t.density.panelPadY,
          paddingBottom: t.density.cardPad,
        }}>
          <LBtn variant="ghost" size="sm" onClick={() => { onDelete(schedule.id); onClose() }}>삭제</LBtn>
          <div style={{ display: 'flex', gap: t.density.gapSm }}>
            <LBtn variant="ghost" size="sm" onClick={() => { onToggleComplete(schedule.id, !done); onClose() }}>
              {done ? '미완료로 변경' : '완료 처리'}
            </LBtn>
            <LBtn variant="secondary" size="sm" onClick={() => { onEdit(schedule); onClose() }}>수정</LBtn>
          </div>
        </div>
      </LCard>
    </div>
  )
}
