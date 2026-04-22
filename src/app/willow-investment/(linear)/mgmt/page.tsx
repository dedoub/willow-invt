'use client'

import { useState, useEffect, useCallback } from 'react'
import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LinearLayout } from '@/app/willow-investment/_components/linear-layout'
import { ScheduleBlock } from './_components/schedule-block'
import { CashBlock } from './_components/cash-block'
import { EmailBlock } from './_components/email-block'
import { AddScheduleDialog, ScheduleFormData } from './_components/add-schedule-dialog'
import { ScheduleDetailDialog } from './_components/schedule-detail-dialog'
import { WillowMgmtSchedule, WillowMgmtClient } from '@/types/willow-mgmt'

interface Invoice {
  id: string
  type: 'revenue' | 'expense' | 'asset' | 'liability'
  counterparty: string
  description: string | null
  amount: number
  issue_date: string | null
  payment_date: string | null
  status: string
}

interface EmailItem {
  id: string
  from: string
  subject: string
  date: string
  unread: boolean
}

export default function MgmtPage() {
  const [loading, setLoading] = useState(true)
  const [schedules, setSchedules] = useState<WillowMgmtSchedule[]>([])
  const [clients, setClients] = useState<WillowMgmtClient[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [emails, setEmails] = useState<EmailItem[]>([])
  const [gmailConnected, setGmailConnected] = useState(false)
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false)
  const [scheduleDialogDate, setScheduleDialogDate] = useState('')
  const [selectedSchedule, setSelectedSchedule] = useState<WillowMgmtSchedule | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [clientsRes, schedulesRes, invoicesRes] = await Promise.all([
        fetch('/api/willow-mgmt/clients'),
        fetch('/api/willow-mgmt/schedules'),
        fetch('/api/willow-mgmt/invoices'),
      ])
      if (clientsRes.ok) setClients(await clientsRes.json())
      if (schedulesRes.ok) setSchedules(await schedulesRes.json())
      if (invoicesRes.ok) {
        const data = await invoicesRes.json()
        setInvoices(Array.isArray(data) ? data : data.invoices || [])
      }

      // Gmail — uses context=willow, label=WILLOW (matching existing management page)
      try {
        const statusRes = await fetch('/api/gmail/status?context=willow')
        if (statusRes.ok) {
          const status = await statusRes.json()
          setGmailConnected(status.isConnected === true)
          if (status.isConnected) {
            const emailsRes = await fetch('/api/gmail/emails?context=willow&label=WILLOW')
            if (emailsRes.ok) {
              const emailData = await emailsRes.json()
              const parsed: EmailItem[] = (emailData.emails || []).map((e: Record<string, unknown>) => ({
                id: e.id as string,
                from: ((e.from as string) || '').replace(/<.*>/, '').trim() || 'Unknown',
                subject: (e.subject as string) || '(제목 없음)',
                date: (e.date as string) || new Date().toISOString(),
                unread: !(e.isRead as boolean),
              }))
              setEmails(parsed)
            }
          }
        }
      } catch { /* Gmail not critical */ }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleToggleComplete = async (id: string, completed: boolean) => {
    // Optimistic update
    setSchedules(prev => prev.map(s => s.id === id ? { ...s, is_completed: completed } : s))
    try {
      const res = await fetch('/api/willow-mgmt/schedules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_completed: completed }),
      })
      if (!res.ok) throw new Error()
    } catch {
      // Revert on failure
      setSchedules(prev => prev.map(s => s.id === id ? { ...s, is_completed: !completed } : s))
    }
  }

  const handleDeleteSchedule = async (id: string) => {
    setSchedules(prev => prev.filter(s => s.id !== id))
    try {
      await fetch(`/api/willow-mgmt/schedules?id=${id}`, { method: 'DELETE' })
    } catch {
      loadData()
    }
  }

  const handleAddSchedule = (date: string) => {
    setScheduleDialogDate(date)
    setScheduleDialogOpen(true)
  }

  const handleSaveSchedule = async (data: ScheduleFormData) => {
    const body: Record<string, unknown> = {
      title: data.title,
      schedule_date: data.schedule_date,
      type: data.type,
    }
    if (data.end_date) body.end_date = data.end_date
    if (data.start_time) body.start_time = data.start_time
    if (data.end_time) body.end_time = data.end_time
    if (data.client_id) body.client_id = data.client_id
    if (data.description) body.description = data.description

    const res = await fetch('/api/willow-mgmt/schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error('Failed to save schedule')
    setScheduleDialogOpen(false)
    loadData()
  }

  if (loading) {
    return (
      <LinearLayout title="사업관리">
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: '60vh', color: t.neutrals.subtle, fontSize: 13,
        }}>
          로딩 중...
        </div>
      </LinearLayout>
    )
  }

  return (
    <LinearLayout title="사업관리">
      {/* Page title */}
      <div style={{ padding: '20px 0 0' }}>
        <h1 style={{
          margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: -0.3,
          fontFamily: t.font.sans, color: t.neutrals.text,
        }}>사업관리</h1>
        <p style={{
          margin: '4px 0 16px', fontSize: 12, color: t.neutrals.muted,
          fontFamily: t.font.sans,
        }}>
          일정 · 현금관리 · 이메일 — 오늘의 허브
        </p>
      </div>

      {/* 3 blocks */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <ScheduleBlock
          schedules={schedules}
          clients={clients}
          onAddSchedule={handleAddSchedule}
          onToggleComplete={handleToggleComplete}
          onSelectSchedule={setSelectedSchedule}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 14 }}>
          <CashBlock invoices={invoices} onAddInvoice={() => {}} />
          <EmailBlock emails={emails} connected={gmailConnected} />
        </div>
      </div>
      <ScheduleDetailDialog
        schedule={selectedSchedule}
        clients={clients}
        onClose={() => setSelectedSchedule(null)}
        onToggleComplete={handleToggleComplete}
        onDelete={handleDeleteSchedule}
      />
      <AddScheduleDialog
        open={scheduleDialogOpen}
        defaultDate={scheduleDialogDate}
        clients={clients}
        onClose={() => setScheduleDialogOpen(false)}
        onSave={handleSaveSchedule}
      />
    </LinearLayout>
  )
}
