'use client'

import { useState, useEffect, useCallback } from 'react'
import { t, useIsMobile } from '@/app/willow-investment/_components/linear-tokens'
import { RyuhaSkeleton } from '@/app/willow-investment/_components/linear-skeleton'
import { RyuhaSubject, RyuhaTextbook, RyuhaChapter, RyuhaSchedule, RyuhaDailyMemo, RyuhaBodyRecord } from '@/types/ryuha'
import { CalendarBlock } from './_components/calendar-block'
import { ScheduleDialog, ScheduleFormData } from './_components/schedule-dialog'
import { TextbookBlock } from './_components/textbook-block'
import { SubjectDialog, TextbookDialog, ChapterDialog } from './_components/textbook-dialog'
import { ProgressBlock } from './_components/progress-block'
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
  const mobile = useIsMobile()
  const [loading, setLoading] = useState(true)
  const [subjects, setSubjects] = useState<RyuhaSubject[]>([])
  const [textbooks, setTextbooks] = useState<RyuhaTextbook[]>([])
  const [chapters, setChapters] = useState<RyuhaChapter[]>([])
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

  const [subjectDialogOpen, setSubjectDialogOpen] = useState(false)

  const [textbookDialogOpen, setTextbookDialogOpen] = useState(false)
  const [editingTextbook, setEditingTextbook] = useState<RyuhaTextbook | null>(null)

  const [chapterDialogOpen, setChapterDialogOpen] = useState(false)
  const [editingChapter, setEditingChapter] = useState<RyuhaChapter | null>(null)
  const [chapterTextbookId, setChapterTextbookId] = useState('')

  // ── Data loading ──────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [subjectsRes, textbooksRes, chaptersRes, schedulesRes, memosRes, notesRes, bodyRes] = await Promise.all([
        fetch('/api/ryuha/subjects'),
        fetch('/api/ryuha/textbooks'),
        fetch('/api/ryuha/chapters'),
        fetch('/api/ryuha/schedules'),
        fetch('/api/ryuha/memos'),
        fetch('/api/ryuha/notes'),
        fetch('/api/ryuha/body-records?limit=50'),
      ])
      if (subjectsRes.ok) setSubjects(await subjectsRes.json())
      if (textbooksRes.ok) setTextbooks(await textbooksRes.json())
      if (chaptersRes.ok) setChapters(await chaptersRes.json())
      if (schedulesRes.ok) setSchedules(await schedulesRes.json())
      if (memosRes.ok) setMemos(await memosRes.json())
      if (notesRes.ok) setNotes(await notesRes.json())
      if (bodyRes.ok) setBodyRecords(await bodyRes.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

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
      const completedDates: string[] = Array.isArray(schedule.completed_dates) ? [...schedule.completed_dates] : []
      const idx = completedDates.indexOf(date)
      if (idx >= 0) completedDates.splice(idx, 1)
      else completedDates.push(date)
      await fetch('/api/ryuha/schedules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: schedule.id, completed_dates: completedDates }),
      })
    } else {
      await fetch('/api/ryuha/schedules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: schedule.id, is_completed: !schedule.is_completed }),
      })
    }
    await loadData()
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

  // ── Subject handlers ──────────────────────────────────────────
  const handleSaveSubject = async (data: { id?: string; name: string; color: string }) => {
    if (data.id) {
      await fetch('/api/ryuha/subjects', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    } else {
      await fetch('/api/ryuha/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, icon: 'default', order_index: 0 }),
      })
    }
    await loadData()
  }

  const handleDeleteSubject = async (id: string) => {
    await fetch(`/api/ryuha/subjects?id=${id}`, { method: 'DELETE' })
    await loadData()
  }

  // ── Textbook handlers ─────────────────────────────────────────
  const handleSaveTextbook = async (data: { id?: string; subject_id: string; name: string; publisher: string; description: string }) => {
    if (data.id) {
      await fetch('/api/ryuha/textbooks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    } else {
      await fetch('/api/ryuha/textbooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    }
    await loadData()
  }

  const handleDeleteTextbook = async (id: string) => {
    await fetch(`/api/ryuha/textbooks?id=${id}`, { method: 'DELETE' })
    await loadData()
  }

  // ── Chapter handlers ──────────────────────────────────────────
  const handleSaveChapter = async (data: { id?: string; textbook_id: string; name: string; description: string; target_date: string }) => {
    if (data.id) {
      await fetch('/api/ryuha/chapters', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    } else {
      await fetch('/api/ryuha/chapters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    }
    await loadData()
  }

  const handleDeleteChapter = async (id: string) => {
    await fetch(`/api/ryuha/chapters?id=${id}`, { method: 'DELETE' })
    await loadData()
  }

  const handleToggleChapterStatus = async (chapter: RyuhaChapter) => {
    const cycle: Record<string, string> = {
      pending: 'in_progress',
      in_progress: 'review_notes_pending',
      review_notes_pending: 'completed',
      completed: 'pending',
    }
    const nextStatus = cycle[chapter.status] ?? 'pending'
    await fetch('/api/ryuha/chapters', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: chapter.id, status: nextStatus }),
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

  const handleUpdateNote = async (id: string, data: Partial<{ title: string; content: string; is_pinned: boolean; attachments: { name: string; url: string }[] | null }>) => {
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

  // ── TextbookBlock event handlers ──────────────────────────────
  const handleAddTextbook = () => {
    setEditingTextbook(null)
    setTextbookDialogOpen(true)
  }

  const handleEditTextbook = (textbook: RyuhaTextbook) => {
    setEditingTextbook(textbook)
    setTextbookDialogOpen(true)
  }

  const handleAddChapter = (textbookId: string) => {
    setEditingChapter(null)
    setChapterTextbookId(textbookId)
    setChapterDialogOpen(true)
  }

  const handleEditChapter = (chapter: RyuhaChapter) => {
    setEditingChapter(chapter)
    setChapterTextbookId(chapter.textbook_id)
    setChapterDialogOpen(true)
  }

  return (
    <>
      <div style={{ padding: '20px 0 0' }}>
        <h1 style={{
          margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: -0.3,
          fontFamily: t.font.sans, color: t.neutrals.text,
        }}>류하일정</h1>
        <p style={{
          margin: '4px 0 16px', fontSize: 12, color: t.neutrals.muted,
          fontFamily: t.font.sans,
        }}>일정 · 교재 · 수첩 · 성장기록</p>
      </div>

      {loading ? <RyuhaSkeleton /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Calendar */}
          <CalendarBlock
            schedules={schedules}
            subjects={subjects}
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

          {/* Textbook + Progress 2-col grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: mobile ? '1fr' : '1fr 1fr',
            gap: 14,
          }}>
            <TextbookBlock
              subjects={subjects}
              textbooks={textbooks}
              chapters={chapters}
              onManageSubjects={() => setSubjectDialogOpen(true)}
              onAddTextbook={handleAddTextbook}
              onEditTextbook={handleEditTextbook}
              onAddChapter={handleAddChapter}
              onEditChapter={handleEditChapter}
              onToggleChapterStatus={handleToggleChapterStatus}
            />
            <ProgressBlock
              subjects={subjects}
              chapters={chapters}
            />
          </div>
        </div>
      )}

      {/* ── Dialogs ── */}
      <ScheduleDialog
        open={scheduleDialogOpen}
        schedule={editingSchedule}
        initialDate={addScheduleDate}
        subjects={subjects}
        textbooks={textbooks}
        chapters={chapters}
        onSave={handleSaveSchedule}
        onDelete={handleDeleteSchedule}
        onClose={() => setScheduleDialogOpen(false)}
      />

      <SubjectDialog
        open={subjectDialogOpen}
        subjects={subjects}
        onSave={handleSaveSubject}
        onDelete={handleDeleteSubject}
        onClose={() => setSubjectDialogOpen(false)}
      />

      <TextbookDialog
        open={textbookDialogOpen}
        textbook={editingTextbook}
        subjects={subjects}
        onSave={handleSaveTextbook}
        onDelete={handleDeleteTextbook}
        onClose={() => setTextbookDialogOpen(false)}
      />

      <ChapterDialog
        open={chapterDialogOpen}
        chapter={editingChapter}
        textbookId={chapterTextbookId}
        onSave={handleSaveChapter}
        onDelete={handleDeleteChapter}
        onClose={() => setChapterDialogOpen(false)}
      />
    </>
  )
}
