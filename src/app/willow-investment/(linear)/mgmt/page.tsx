'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAgentRefresh } from '@/hooks/use-agent-refresh'
import { t, useIsMobile } from '@/app/willow-investment/_components/linear-tokens'
import { ScheduleBlock } from './_components/schedule-block'
import { CashBlock } from './_components/cash-block'
import { EmailBlock } from './_components/email-block'
import { AddScheduleDialog, ScheduleFormData } from './_components/add-schedule-dialog'
import { AddInvoiceDialog, InvoiceFormData } from './_components/add-invoice-dialog'
import { InvoiceDetailDialog } from './_components/invoice-detail-dialog'
import { ParsePreviewDialog, ParsedTransaction } from './_components/parse-preview-dialog'
import { ScheduleDetailDialog } from './_components/schedule-detail-dialog'
import { EmailDetailDialog, FullEmail } from './_components/email-detail-dialog'
import { ComposeEmailDialog } from './_components/compose-email-dialog'
import { MgmtSkeleton } from '@/app/willow-investment/_components/linear-skeleton'
import { WillowMgmtSchedule, WillowMgmtClient } from '@/types/willow-mgmt'

interface Invoice {
  id: string
  type: 'revenue' | 'expense' | 'asset' | 'liability' | 'transfer'
  counterparty: string
  description: string | null
  amount: number
  issue_date: string | null
  payment_date: string | null
  status: string
}

type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward'

export default function MgmtPage() {
  const mobile = useIsMobile()
  const [loading, setLoading] = useState(true)
  const [schedules, setSchedules] = useState<WillowMgmtSchedule[]>([])
  const [clients, setClients] = useState<WillowMgmtClient[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false)
  const [scheduleDialogDate, setScheduleDialogDate] = useState('')
  const [editingSchedule, setEditingSchedule] = useState<WillowMgmtSchedule | null>(null)
  const [selectedSchedule, setSelectedSchedule] = useState<WillowMgmtSchedule | null>(null)
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null)
  const [parsing, setParsing] = useState(false)
  const [parsedTransactions, setParsedTransactions] = useState<ParsedTransaction[]>([])
  const [parsedBankName, setParsedBankName] = useState<string | null>(null)
  const [parsePreviewOpen, setParsePreviewOpen] = useState(false)

  // Email states
  const [emails, setEmails] = useState<FullEmail[]>([])
  const [gmailConnected, setGmailConnected] = useState(false)
  const [selectedEmail, setSelectedEmail] = useState<FullEmail | null>(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeMode, setComposeMode] = useState<ComposeMode>('new')
  const [composeOriginal, setComposeOriginal] = useState<FullEmail | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)

  // Email source definitions: { context, label, sourceLabel }
  const EMAIL_SOURCES = [
    { context: 'willow',       label: 'WILLOW', sourceLabel: 'WILLOW' },
    { context: 'tensoftworks', label: 'TENSW',  sourceLabel: 'TENSW' },
    { context: 'default',      label: 'ETC',    sourceLabel: 'ETC' },
    { context: 'default',      label: 'Akros',  sourceLabel: 'Akros' },
  ] as const

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

      // Gmail — check all unique contexts
      try {
        const contexts = [...new Set(EMAIL_SOURCES.map(s => s.context))]
        const statusResults = await Promise.all(
          contexts.map(ctx => fetch(`/api/gmail/status?context=${ctx}`).then(r => r.ok ? r.json() : null).catch(() => null))
        )
        const connectedContexts = new Set<string>()
        for (let i = 0; i < contexts.length; i++) {
          if (statusResults[i]?.isConnected) connectedContexts.add(contexts[i])
        }
        setGmailConnected(connectedContexts.size > 0)
        if (connectedContexts.size > 0) {
          await fetchEmails(connectedContexts)
        }
      } catch { /* Gmail not critical */ }
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchEmails = async (connectedContexts?: Set<string>) => {
    // Determine which contexts are connected
    let connected = connectedContexts
    if (!connected) {
      const contexts = [...new Set(EMAIL_SOURCES.map(s => s.context))]
      const statusResults = await Promise.all(
        contexts.map(ctx => fetch(`/api/gmail/status?context=${ctx}`).then(r => r.ok ? r.json() : null).catch(() => null))
      )
      connected = new Set<string>()
      for (let i = 0; i < contexts.length; i++) {
        if (statusResults[i]?.isConnected) connected.add(contexts[i])
      }
    }

    // Fetch emails from all connected sources in parallel
    const sourcesToFetch = EMAIL_SOURCES.filter(s => connected!.has(s.context))
    const results = await Promise.all(
      sourcesToFetch.map(src =>
        fetch(`/api/gmail/emails?context=${src.context}&label=${src.label}&maxResults=0&daysBack=30&autoAnalyze=false`)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      )
    )

    const allEmails: FullEmail[] = []
    for (let i = 0; i < sourcesToFetch.length; i++) {
      const data = results[i]
      if (!data?.emails) continue
      const src = sourcesToFetch[i]
      for (const e of data.emails) {
        allEmails.push({
          id: e.id,
          from: e.from || '',
          fromName: e.fromName || undefined,
          to: e.to || '',
          subject: e.subject || '(제목 없음)',
          date: e.date || new Date().toISOString(),
          body: e.body || undefined,
          snippet: e.snippet || undefined,
          direction: e.direction || 'inbound',
          category: e.category || null,
          attachments: e.attachments || undefined,
          unread: !e.isRead,
          sourceLabel: src.sourceLabel,
          gmailContext: src.context,
        })
      }
    }

    // Sort by date descending
    allEmails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    setEmails(allEmails)
  }

  useEffect(() => { loadData() }, [loadData])
  useAgentRefresh(['willow_mgmt'], loadData)

  // ── Schedule handlers ──
  const handleToggleComplete = async (id: string, completed: boolean) => {
    setSchedules(prev => prev.map(s => s.id === id ? { ...s, is_completed: completed } : s))
    try {
      const res = await fetch('/api/willow-mgmt/schedules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_completed: completed }),
      })
      if (!res.ok) throw new Error()
    } catch {
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
    setEditingSchedule(null)
    setScheduleDialogDate(date)
    setScheduleDialogOpen(true)
  }

  const handleEditSchedule = (schedule: WillowMgmtSchedule) => {
    setEditingSchedule(schedule)
    setScheduleDialogDate(schedule.schedule_date)
    setScheduleDialogOpen(true)
  }

  const handleSaveSchedule = async (data: ScheduleFormData) => {
    const isEdit = !!data.id
    const body: Record<string, unknown> = {
      title: data.title,
      schedule_date: data.schedule_date,
      type: data.type,
      category: data.category,
    }
    if (isEdit) body.id = data.id
    if (data.end_date) body.end_date = data.end_date
    else if (isEdit) body.end_date = null
    if (data.start_time) body.start_time = data.start_time
    else if (isEdit) body.start_time = null
    if (data.end_time) body.end_time = data.end_time
    else if (isEdit) body.end_time = null
    if (data.description) body.description = data.description
    else if (isEdit) body.description = null

    const res = await fetch('/api/willow-mgmt/schedules', {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error('Failed to save schedule')
    setScheduleDialogOpen(false)
    setEditingSchedule(null)
    loadData()
  }

  // ── Invoice handlers ──
  const handleEditInvoice = (invoice: Invoice) => {
    setEditingInvoice(invoice)
    setInvoiceDialogOpen(true)
  }

  const handleDeleteInvoice = async (id: string) => {
    setInvoices(prev => prev.filter(i => i.id !== id))
    try {
      await fetch(`/api/willow-mgmt/invoices?id=${id}`, { method: 'DELETE' })
    } catch {
      loadData()
    }
  }

  const handleSaveInvoice = async (data: InvoiceFormData) => {
    const isEdit = !!data.id
    const body: Record<string, unknown> = {
      type: data.type,
      counterparty: data.counterparty,
      amount: Number(data.amount),
      description: data.description || null,
      issue_date: data.issue_date || null,
      payment_date: data.payment_date || null,
    }
    if (isEdit) body.id = data.id
    const res = await fetch('/api/willow-mgmt/invoices', {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error('Failed to save invoice')
    setInvoiceDialogOpen(false)
    setEditingInvoice(null)
    loadData()
  }

  const handleFileUpload = async (file: File) => {
    setParsing(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/willow-mgmt/invoices/parse', { method: 'POST', body: form })
      if (!res.ok) throw new Error('Parse failed')
      const data = await res.json()
      const txs: ParsedTransaction[] = (data.transactions || []).map((tx: Omit<ParsedTransaction, '_selected'>) => ({ ...tx, _selected: true }))
      setParsedTransactions(txs)
      setParsedBankName(data.bankName || null)
      setParsePreviewOpen(true)
    } catch (err) {
      console.error('File parse error:', err)
    } finally {
      setParsing(false)
    }
  }

  const handleConfirmParsed = async (txs: ParsedTransaction[]) => {
    for (const tx of txs) {
      await fetch('/api/willow-mgmt/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: tx.type,
          counterparty: tx.counterparty,
          description: tx.description || null,
          amount: tx.amount,
          payment_date: tx.date || null,
        }),
      })
    }
    setParsePreviewOpen(false)
    setParsedTransactions([])
    loadData()
  }

  // ── Email handlers ──
  const handleSyncEmails = async () => {
    setIsSyncing(true)
    try {
      await fetchEmails()
    } finally {
      setIsSyncing(false)
    }
  }

  const handleReply = (email: FullEmail) => {
    setComposeMode('reply')
    setComposeOriginal(email)
    setComposeOpen(true)
  }

  const handleForward = (email: FullEmail) => {
    setComposeMode('forward')
    setComposeOriginal(email)
    setComposeOpen(true)
  }

  const handleCompose = () => {
    setComposeMode('new')
    setComposeOriginal(null)
    setComposeOpen(true)
  }

  return (
    <>
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

      {loading ? <MgmtSkeleton /> : (
      <>

      {/* 3 blocks */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <ScheduleBlock
          schedules={schedules}
          onAddSchedule={handleAddSchedule}
          onToggleComplete={handleToggleComplete}
          onSelectSchedule={setSelectedSchedule}
        />
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1.5fr 1fr', gap: 14 }}>
          <CashBlock
            invoices={invoices}
            onAddInvoice={() => { setEditingInvoice(null); setInvoiceDialogOpen(true) }}
            onSelectInvoice={setSelectedInvoice}
            onFileUpload={handleFileUpload}
            parsing={parsing}
          />
          <EmailBlock
            emails={emails}
            connected={gmailConnected}
            onSelectEmail={setSelectedEmail}
            onSync={handleSyncEmails}
            onCompose={handleCompose}
            isSyncing={isSyncing}
          />
        </div>
      </div>

      {/* Schedule dialogs */}
      <ScheduleDetailDialog
        schedule={selectedSchedule}
        onClose={() => setSelectedSchedule(null)}
        onToggleComplete={handleToggleComplete}
        onDelete={handleDeleteSchedule}
        onEdit={handleEditSchedule}
      />
      <AddScheduleDialog
        open={scheduleDialogOpen}
        defaultDate={scheduleDialogDate}
        editingSchedule={editingSchedule}
        onClose={() => { setScheduleDialogOpen(false); setEditingSchedule(null) }}
        onSave={handleSaveSchedule}
      />

      {/* Invoice dialogs */}
      <InvoiceDetailDialog
        invoice={selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
        onDelete={handleDeleteInvoice}
        onEdit={handleEditInvoice}
      />
      <AddInvoiceDialog
        open={invoiceDialogOpen}
        editingInvoice={editingInvoice}
        onClose={() => { setInvoiceDialogOpen(false); setEditingInvoice(null) }}
        onSave={handleSaveInvoice}
      />
      <ParsePreviewDialog
        open={parsePreviewOpen}
        transactions={parsedTransactions}
        bankName={parsedBankName}
        onClose={() => { setParsePreviewOpen(false); setParsedTransactions([]) }}
        onConfirm={handleConfirmParsed}
      />

      {/* Email dialogs */}
      <EmailDetailDialog
        email={selectedEmail}
        onClose={() => setSelectedEmail(null)}
        onReply={handleReply}
        onForward={handleForward}
      />
      <ComposeEmailDialog
        open={composeOpen}
        mode={composeMode}
        originalEmail={composeOriginal}
        gmailContext={composeOriginal?.gmailContext || 'willow'}
        onClose={() => { setComposeOpen(false); setComposeOriginal(null) }}
        onSent={() => { fetchEmails() }}
      />
      </>
      )}
    </>
  )
}
