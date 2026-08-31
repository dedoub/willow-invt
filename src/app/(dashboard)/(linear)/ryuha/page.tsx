'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAgentRefresh } from '@/hooks/use-agent-refresh'
import { t } from '@/app/(dashboard)/_components/linear-tokens'
import { RyuhaSkeleton } from '@/app/(dashboard)/_components/linear-skeleton'
import { RyuhaSchedule, RyuhaDailyMemo, RyuhaBodyRecord } from '@/types/ryuha'
import { CalendarBlock } from './_components/calendar-block'
import { ScheduleDialog, ScheduleFormData } from './_components/schedule-dialog'
import { NotebookBlock } from './_components/notebook-block'
import { GrowthBlock } from './_components/growth-block'

interface RyuhaNote {
  id: string
  title: string
  content: string
  category: string
  is_pinned: boolean
  attachments: { name: string; url: string }[] | null
  created_at: string
  updated_at: string
}

export default function RyuhaPage() {
  const [loading, setLoading] = useState(true)
  const [schedules, setSchedules] = useState<RyuhaSchedule[]>([])
  const [memos, setMemos] = useState<RyuhaDailyMemo[]>([])
  const [notes, setNotes] = useState<RyuhaNote[]>([])
  const [bodyRecords, setBodyRecords] = useState<RyuhaBodyRecord[]>([])
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })

  // ── Dialog state ──────────────────────────────────────────────
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<RyuhaSchedule | null>(null)
  const [addScheduleDate, setAddScheduleDate] = useState('')

  // ── Data loading ──────────────────────────────────────────────
  const loadData = useCallback(async () => {
    // 재로드 시 loading 유지 — 달력 등 자식 상태 보존 (초기 스켈레톤은 useState(true) 기본값으로 표시됨)
    try {
      // Single consolidated fetch (replaces the previous 7 parallel GETs).
      // The bootstrap endpoint runs the same queries server-side and returns
      // identical shapes. Mutations/refresh still use the individual routes.
      const res = await fetch('/api/ryuha/bootstrap')
      if (res.ok) {
        const data = await res.json()
        setSchedules(data.schedules)
        setMemos(data.memos)
        setNotes(data.notes)
        setBodyRecords(data.bodyRecords)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])
  useAgentRefresh(['ryuha_'], loadData)

  // ── Schedule handlers ─────────────────────────────────────────
  const handleSaveSchedule = async (data: ScheduleFormData) => {
    if (data.id) {
      await fetch('/api/ryuha/schedules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    } else {
      const res = await fetch('/api/ryuha/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (res.ok && data.homework_items.length > 0) {
        const created = await res.json()
        const newId = created.id
        await Promise.all(
          data.homework_items
            .filter(item => item.content.trim())
            .map(item =>
              fetch('/api/ryuha/homework-items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ schedule_id: newId, content: item.content, deadline: item.deadline }),
              })
            )
        )
      }
    }
    await loadData()
  }

  const handleDeleteSchedule = async (id: string) => {
    await fetch(`/api/ryuha/schedules?id=${id}`, { method: 'DELETE' })
    await loadData()
  }

  const handleToggleComplete = async (schedule: RyuhaSchedule, date?: string) => {
    const isMultiday = !!schedule.end_date
    if (isMultiday && date) {
      const prev = Array.isArray(schedule.completed_dates) ? [...schedule.completed_dates] : []
      const next = prev.includes(date) ? prev.filter(d => d !== date) : [...prev, date]
      setSchedules(s => s.map(sc => sc.id === schedule.id ? { ...sc, completed_dates: next } : sc))
      try {
        const res = await fetch('/api/ryuha/schedules', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: schedule.id, completed_dates: next }),
        })
        if (!res.ok) throw new Error()
      } catch {
        setSchedules(s => s.map(sc => sc.id === schedule.id ? { ...sc, completed_dates: prev } : sc))
      }
    } else {
      const newVal = !schedule.is_completed
      setSchedules(s => s.map(sc => sc.id === schedule.id ? { ...sc, is_completed: newVal } : sc))
      try {
        const res = await fetch('/api/ryuha/schedules', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: schedule.id, is_completed: newVal }),
        })
        if (!res.ok) throw new Error()
      } catch {
        setSchedules(s => s.map(sc => sc.id === schedule.id ? { ...sc, is_completed: !newVal } : sc))
      }
    }
  }

  // ── Memo handlers ─────────────────────────────────────────────
  const handleSaveMemo = async (date: string, content: string) => {
    await fetch('/api/ryuha/memos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memo_date: date, content }),
    })
    await loadData()
  }

  // ── Note handlers ─────────────────────────────────────────────
  const handleCreateNote = async (data: { title: string; content: string; attachments?: { name: string; url: string }[] }) => {
    await fetch('/api/ryuha/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    await loadData()
  }

  const handleUpdateNote = async (id: string, data: Partial<{ title: string; content: string; is_pinned: boolean; attachments: { name: string; url: string }[] | null; memos: unknown }>) => {
    await fetch('/api/ryuha/notes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...data }),
    })
    await loadData()
  }

  const handleDeleteNote = async (id: string) => {
    await fetch(`/api/ryuha/notes?id=${id}`, { method: 'DELETE' })
    await loadData()
  }

  // ── Body record handlers ──────────────────────────────────────
  const handleSaveBodyRecord = async (data: { id?: string; record_date: string; height_cm: string; weight_kg: string; notes: string }) => {
    const body: Record<string, unknown> = {
      record_date: data.record_date,
      height_cm: data.height_cm ? parseFloat(data.height_cm) : null,
      weight_kg: data.weight_kg ? parseFloat(data.weight_kg) : null,
      notes: data.notes,
    }
    if (data.id) body.id = data.id
    await fetch('/api/ryuha/body-records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    await loadData()
  }

  const handleDeleteBodyRecord = async (id: string) => {
    await fetch(`/api/ryuha/body-records?id=${id}`, { method: 'DELETE' })
    await loadData()
  }

  // ── CalendarBlock event handlers ──────────────────────────────
  const handleAddSchedule = (date: string) => {
    setEditingSchedule(null)
    setAddScheduleDate(date)
    setScheduleDialogOpen(true)
  }

  const handleEditSchedule = (schedule: RyuhaSchedule) => {
    setEditingSchedule(schedule)
    setAddScheduleDate('')
    setScheduleDialogOpen(true)
  }

  return (
    <>
      {loading ? <RyuhaSkeleton /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.blockGap }}>
          {/* Calendar */}
          <CalendarBlock
            schedules={schedules}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onAddSchedule={handleAddSchedule}
            onEditSchedule={handleEditSchedule}
            onToggleComplete={handleToggleComplete}
            memos={memos}
            onSaveMemo={handleSaveMemo}
          />

          {/* Notebook */}
          <NotebookBlock
            notes={notes}
            onCreate={handleCreateNote}
            onUpdate={handleUpdateNote}
            onDelete={handleDeleteNote}
          />

          {/* Growth records */}
          <GrowthBlock
            records={bodyRecords}
            onSave={handleSaveBodyRecord}
            onDelete={handleDeleteBodyRecord}
          />

        </div>
      )}

      {/* ── Dialogs ── */}
      <ScheduleDialog
        open={scheduleDialogOpen}
        schedule={editingSchedule}
        initialDate={addScheduleDate}
        onSave={handleSaveSchedule}
        onDelete={handleDeleteSchedule}
        onClose={() => setScheduleDialogOpen(false)}
      />

    </>
  )
}
