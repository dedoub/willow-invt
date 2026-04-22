'use client'

import { useState, useEffect, useCallback } from 'react'
import { t, useIsMobile } from '@/app/willow-investment/_components/linear-tokens'
import { RyuhaSkeleton } from '@/app/willow-investment/_components/linear-skeleton'
import { RyuhaSubject, RyuhaTextbook, RyuhaChapter, RyuhaSchedule, RyuhaDailyMemo, RyuhaHomeworkItem, RyuhaBodyRecord } from '@/types/ryuha'

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
          <div style={{ padding: 20, textAlign: 'center', color: t.neutrals.subtle, fontSize: 13 }}>
            블록 컴포넌트가 여기에 들어갑니다
          </div>
        </div>
      )}
    </>
  )
}
