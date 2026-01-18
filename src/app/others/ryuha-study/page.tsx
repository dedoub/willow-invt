'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar,
  BookOpen,
  CheckCircle2,
  Circle,
  Clock,
  GraduationCap,
  Loader2,
  Pencil,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { RyuhaSubject, RyuhaStudyRange, RyuhaSchedule } from '@/types/ryuha'

type ViewMode = 'week' | 'month'

export default function RyuhaStudyPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [subjects, setSubjects] = useState<RyuhaSubject[]>([])
  const [studyRanges, setStudyRanges] = useState<RyuhaStudyRange[]>([])
  const [schedules, setSchedules] = useState<RyuhaSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null)

  // Dialog states
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false)
  const [rangeDialogOpen, setRangeDialogOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<RyuhaSchedule | null>(null)
  const [editingRange, setEditingRange] = useState<RyuhaStudyRange | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // Form states
  const [scheduleForm, setScheduleForm] = useState({
    title: '',
    description: '',
    schedule_date: '',
    start_time: '',
    end_time: '',
    type: 'self_study' as 'homework' | 'self_study',
    subject_id: '',
    study_range_id: '',
    email_reminder: false,
  })

  const [rangeForm, setRangeForm] = useState({
    subject_id: '',
    name: '',
    description: '',
    target_date: '',
  })

  // Fetch data
  const fetchSubjects = useCallback(async () => {
    const res = await fetch('/api/ryuha/subjects')
    const data = await res.json()
    setSubjects(data)
  }, [])

  const fetchStudyRanges = useCallback(async () => {
    const res = await fetch('/api/ryuha/study-ranges')
    const data = await res.json()
    setStudyRanges(data)
  }, [])

  const fetchSchedules = useCallback(async () => {
    const { startDate, endDate } = getDateRange()
    const res = await fetch(`/api/ryuha/schedules?startDate=${startDate}&endDate=${endDate}`)
    const data = await res.json()
    setSchedules(data)
  }, [currentDate, viewMode])

  const getDateRange = () => {
    if (viewMode === 'week') {
      const start = getWeekStart(currentDate)
      const end = new Date(start)
      end.setDate(end.getDate() + 6)
      return {
        startDate: formatDate(start),
        endDate: formatDate(end),
      }
    } else {
      const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
      const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)
      return {
        startDate: formatDate(start),
        endDate: formatDate(end),
      }
    }
  }

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      await Promise.all([fetchSubjects(), fetchStudyRanges(), fetchSchedules()])
      setLoading(false)
    }
    loadData()
  }, [fetchSubjects, fetchStudyRanges, fetchSchedules])

  // Date helpers
  const getWeekStart = (date: Date) => {
    const d = new Date(date)
    const day = d.getDay()
    const diff = d.getDate() - day
    return new Date(d.setDate(diff))
  }

  const formatDate = (date: Date) => {
    return date.toISOString().split('T')[0]
  }

  const getWeekDays = () => {
    const start = getWeekStart(currentDate)
    const days = []
    for (let i = 0; i < 7; i++) {
      const day = new Date(start)
      day.setDate(start.getDate() + i)
      days.push(day)
    }
    return days
  }

  const getMonthDays = () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const startPadding = firstDay.getDay()
    const days: (Date | null)[] = []

    for (let i = 0; i < startPadding; i++) {
      days.push(null)
    }
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i))
    }
    return days
  }

  const navigate = (direction: number) => {
    const newDate = new Date(currentDate)
    if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() + direction * 7)
    } else {
      newDate.setMonth(newDate.getMonth() + direction)
    }
    setCurrentDate(newDate)
  }

  const getSchedulesForDate = (date: Date) => {
    const dateStr = formatDate(date)
    return schedules.filter((s) => s.schedule_date === dateStr)
  }

  // Schedule CRUD
  const openScheduleDialog = (date?: Date, schedule?: RyuhaSchedule) => {
    if (schedule) {
      setEditingSchedule(schedule)
      setScheduleForm({
        title: schedule.title,
        description: schedule.description || '',
        schedule_date: schedule.schedule_date,
        start_time: schedule.start_time || '',
        end_time: schedule.end_time || '',
        type: schedule.type,
        subject_id: schedule.subject_id || '',
        study_range_id: schedule.study_range_id || '',
        email_reminder: schedule.email_reminder,
      })
    } else {
      setEditingSchedule(null)
      setScheduleForm({
        title: '',
        description: '',
        schedule_date: date ? formatDate(date) : formatDate(new Date()),
        start_time: '',
        end_time: '',
        type: 'self_study',
        subject_id: '',
        study_range_id: '',
        email_reminder: false,
      })
    }
    setScheduleDialogOpen(true)
  }

  const saveSchedule = async () => {
    const payload = {
      ...scheduleForm,
      subject_id: scheduleForm.subject_id || null,
      study_range_id: scheduleForm.study_range_id || null,
    }

    if (editingSchedule) {
      await fetch('/api/ryuha/schedules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingSchedule.id, ...payload }),
      })
    } else {
      await fetch('/api/ryuha/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    }
    setScheduleDialogOpen(false)
    fetchSchedules()
  }

  const toggleScheduleComplete = async (schedule: RyuhaSchedule) => {
    await fetch('/api/ryuha/schedules', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: schedule.id, is_completed: !schedule.is_completed }),
    })
    fetchSchedules()
  }

  const deleteSchedule = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return
    await fetch(`/api/ryuha/schedules?id=${id}`, { method: 'DELETE' })
    fetchSchedules()
  }

  // Study Range CRUD
  const openRangeDialog = (range?: RyuhaStudyRange) => {
    if (range) {
      setEditingRange(range)
      setRangeForm({
        subject_id: range.subject_id,
        name: range.name,
        description: range.description || '',
        target_date: range.target_date || '',
      })
    } else {
      setEditingRange(null)
      setRangeForm({
        subject_id: selectedSubject || (subjects[0]?.id || ''),
        name: '',
        description: '',
        target_date: '',
      })
    }
    setRangeDialogOpen(true)
  }

  const saveRange = async () => {
    if (editingRange) {
      await fetch('/api/ryuha/study-ranges', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingRange.id, ...rangeForm }),
      })
    } else {
      await fetch('/api/ryuha/study-ranges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rangeForm),
      })
    }
    setRangeDialogOpen(false)
    fetchStudyRanges()
  }

  const toggleRangeStatus = async (range: RyuhaStudyRange) => {
    const nextStatus =
      range.status === 'pending'
        ? 'in_progress'
        : range.status === 'in_progress'
          ? 'completed'
          : 'pending'
    const completed_at = nextStatus === 'completed' ? new Date().toISOString() : null

    await fetch('/api/ryuha/study-ranges', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: range.id, status: nextStatus, completed_at }),
    })
    fetchStudyRanges()
  }

  const deleteRange = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return
    await fetch(`/api/ryuha/study-ranges?id=${id}`, { method: 'DELETE' })
    fetchStudyRanges()
  }

  const filteredRanges = selectedSubject
    ? studyRanges.filter((r) => r.subject_id === selectedSubject)
    : studyRanges

  const weekDays = ['일', '월', '화', '수', '목', '금', '토']

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold">
            {viewMode === 'week'
              ? `${currentDate.getFullYear()}년 ${currentDate.getMonth() + 1}월 ${Math.ceil(currentDate.getDate() / 7)}주`
              : `${currentDate.getFullYear()}년 ${currentDate.getMonth() + 1}월`}
          </h2>
          <Button variant="outline" size="icon" onClick={() => navigate(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === 'week' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('week')}
          >
            주간
          </Button>
          <Button
            variant={viewMode === 'month' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('month')}
          >
            월간
          </Button>
          <Button size="sm" onClick={() => openScheduleDialog()}>
            <Plus className="h-4 w-4 mr-1" />
            일정 추가
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-3">
          <Card>
            <CardContent className="p-4">
              {viewMode === 'week' ? (
                <div className="grid grid-cols-7 gap-2">
                  {getWeekDays().map((day, idx) => (
                    <div key={idx} className="min-h-[200px]">
                      <div
                        className={cn(
                          'text-center py-2 rounded-t-lg font-medium text-sm',
                          day.toDateString() === new Date().toDateString()
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        )}
                      >
                        <div>{weekDays[idx]}</div>
                        <div className="text-lg">{day.getDate()}</div>
                      </div>
                      <div
                        className="border border-t-0 rounded-b-lg p-2 space-y-1 min-h-[160px] cursor-pointer hover:bg-muted/50"
                        onClick={() => openScheduleDialog(day)}
                      >
                        {getSchedulesForDate(day).map((schedule) => (
                          <div
                            key={schedule.id}
                            className={cn(
                              'text-xs p-1.5 rounded cursor-pointer',
                              schedule.is_completed
                                ? 'bg-muted line-through text-muted-foreground'
                                : schedule.type === 'homework'
                                  ? 'bg-amber-100 dark:bg-amber-900/30'
                                  : 'bg-blue-100 dark:bg-blue-900/30'
                            )}
                            style={{
                              borderLeft: schedule.subject
                                ? `3px solid ${schedule.subject.color}`
                                : undefined,
                            }}
                            onClick={(e) => {
                              e.stopPropagation()
                              openScheduleDialog(undefined, schedule)
                            }}
                          >
                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleScheduleComplete(schedule)
                                }}
                              >
                                {schedule.is_completed ? (
                                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                                ) : (
                                  <Circle className="h-3 w-3" />
                                )}
                              </button>
                              <span className="truncate">{schedule.title}</span>
                            </div>
                            {schedule.start_time && (
                              <div className="text-muted-foreground flex items-center gap-1 mt-0.5">
                                <Clock className="h-2.5 w-2.5" />
                                {schedule.start_time.slice(0, 5)}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {weekDays.map((day) => (
                      <div key={day} className="text-center text-sm font-medium py-2">
                        {day}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {getMonthDays().map((day, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          'min-h-[100px] border rounded p-1',
                          day ? 'cursor-pointer hover:bg-muted/50' : 'bg-muted/20',
                          day?.toDateString() === new Date().toDateString() && 'border-primary'
                        )}
                        onClick={() => day && openScheduleDialog(day)}
                      >
                        {day && (
                          <>
                            <div className="text-sm font-medium mb-1">{day.getDate()}</div>
                            <div className="space-y-0.5">
                              {getSchedulesForDate(day)
                                .slice(0, 3)
                                .map((schedule) => (
                                  <div
                                    key={schedule.id}
                                    className={cn(
                                      'text-[10px] px-1 py-0.5 rounded truncate',
                                      schedule.is_completed
                                        ? 'bg-muted text-muted-foreground'
                                        : 'bg-primary/10'
                                    )}
                                    style={{
                                      borderLeft: schedule.subject
                                        ? `2px solid ${schedule.subject.color}`
                                        : undefined,
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      openScheduleDialog(undefined, schedule)
                                    }}
                                  >
                                    {schedule.title}
                                  </div>
                                ))}
                              {getSchedulesForDate(day).length > 3 && (
                                <div className="text-[10px] text-muted-foreground">
                                  +{getSchedulesForDate(day).length - 3}
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Study Ranges Panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  학습 범위
                </CardTitle>
                <Button size="sm" variant="outline" onClick={() => openRangeDialog()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Subject filter */}
              <div className="flex flex-wrap gap-1">
                <Badge
                  variant={selectedSubject === null ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => setSelectedSubject(null)}
                >
                  전체
                </Badge>
                {subjects.map((subject) => (
                  <Badge
                    key={subject.id}
                    variant={selectedSubject === subject.id ? 'default' : 'outline'}
                    className="cursor-pointer"
                    style={{
                      backgroundColor:
                        selectedSubject === subject.id ? subject.color : undefined,
                      borderColor: subject.color,
                    }}
                    onClick={() => setSelectedSubject(subject.id)}
                  >
                    {subject.name}
                  </Badge>
                ))}
              </div>

              {/* Ranges list */}
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {filteredRanges.map((range) => (
                  <div
                    key={range.id}
                    className={cn(
                      'p-2 rounded-lg border text-sm',
                      range.status === 'completed' && 'bg-muted/50'
                    )}
                    style={{ borderLeftColor: range.subject?.color, borderLeftWidth: 3 }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <button onClick={() => toggleRangeStatus(range)}>
                            {range.status === 'completed' ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            ) : range.status === 'in_progress' ? (
                              <Clock className="h-4 w-4 text-amber-600" />
                            ) : (
                              <Circle className="h-4 w-4 text-muted-foreground" />
                            )}
                          </button>
                          <span
                            className={cn(
                              'font-medium truncate',
                              range.status === 'completed' && 'line-through text-muted-foreground'
                            )}
                          >
                            {range.name}
                          </span>
                        </div>
                        {range.subject && (
                          <div className="text-xs text-muted-foreground ml-6">
                            {range.subject.name}
                          </div>
                        )}
                        {range.target_date && (
                          <div className="text-xs text-muted-foreground ml-6 flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {range.target_date}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => openRangeDialog(range)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-destructive"
                          onClick={() => deleteRange(range.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                {filteredRanges.length === 0 && (
                  <div className="text-center text-muted-foreground py-4 text-sm">
                    학습 범위가 없습니다
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Progress Summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <GraduationCap className="h-4 w-4" />
                진행 현황
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {subjects.map((subject) => {
                  const ranges = studyRanges.filter((r) => r.subject_id === subject.id)
                  const completed = ranges.filter((r) => r.status === 'completed').length
                  const total = ranges.length
                  const percent = total > 0 ? Math.round((completed / total) * 100) : 0

                  return (
                    <div key={subject.id} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span>{subject.name}</span>
                        <span className="text-muted-foreground">
                          {completed}/{total}
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${percent}%`,
                            backgroundColor: subject.color,
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Schedule Dialog */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSchedule ? '일정 수정' : '일정 추가'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>제목</Label>
              <Input
                value={scheduleForm.title}
                onChange={(e) => setScheduleForm({ ...scheduleForm, title: e.target.value })}
                placeholder="일정 제목"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>날짜</Label>
                <Input
                  type="date"
                  value={scheduleForm.schedule_date}
                  onChange={(e) =>
                    setScheduleForm({ ...scheduleForm, schedule_date: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>유형</Label>
                <Select
                  value={scheduleForm.type}
                  onValueChange={(v) =>
                    setScheduleForm({ ...scheduleForm, type: v as 'homework' | 'self_study' })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self_study">자기학습</SelectItem>
                    <SelectItem value="homework">학원숙제</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>시작 시간</Label>
                <Input
                  type="time"
                  value={scheduleForm.start_time}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, start_time: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>종료 시간</Label>
                <Input
                  type="time"
                  value={scheduleForm.end_time}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, end_time: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>과목</Label>
                <Select
                  value={scheduleForm.subject_id}
                  onValueChange={(v) => setScheduleForm({ ...scheduleForm, subject_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>연결 범위</Label>
                <Select
                  value={scheduleForm.study_range_id}
                  onValueChange={(v) => setScheduleForm({ ...scheduleForm, study_range_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {studyRanges
                      .filter(
                        (r) => !scheduleForm.subject_id || r.subject_id === scheduleForm.subject_id
                      )
                      .map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>설명</Label>
              <Textarea
                value={scheduleForm.description}
                onChange={(e) => setScheduleForm({ ...scheduleForm, description: e.target.value })}
                placeholder="상세 내용"
                rows={2}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="email_reminder"
                checked={scheduleForm.email_reminder}
                onCheckedChange={(checked) =>
                  setScheduleForm({ ...scheduleForm, email_reminder: checked as boolean })
                }
              />
              <Label htmlFor="email_reminder" className="text-sm">
                이메일 알림 받기
              </Label>
            </div>
          </div>
          <DialogFooter>
            {editingSchedule && (
              <Button
                variant="destructive"
                onClick={() => {
                  deleteSchedule(editingSchedule.id)
                  setScheduleDialogOpen(false)
                }}
              >
                삭제
              </Button>
            )}
            <Button variant="outline" onClick={() => setScheduleDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={saveSchedule} disabled={!scheduleForm.title}>
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Study Range Dialog */}
      <Dialog open={rangeDialogOpen} onOpenChange={setRangeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRange ? '학습 범위 수정' : '학습 범위 추가'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>과목</Label>
              <Select
                value={rangeForm.subject_id}
                onValueChange={(v) => setRangeForm({ ...rangeForm, subject_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="과목 선택" />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>범위명</Label>
              <Input
                value={rangeForm.name}
                onChange={(e) => setRangeForm({ ...rangeForm, name: e.target.value })}
                placeholder="예: 1단원 - 다항식의 연산"
              />
            </div>
            <div className="space-y-2">
              <Label>목표 완료일</Label>
              <Input
                type="date"
                value={rangeForm.target_date}
                onChange={(e) => setRangeForm({ ...rangeForm, target_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>설명</Label>
              <Textarea
                value={rangeForm.description}
                onChange={(e) => setRangeForm({ ...rangeForm, description: e.target.value })}
                placeholder="상세 내용"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRangeDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={saveRange} disabled={!rangeForm.name || !rangeForm.subject_id}>
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
