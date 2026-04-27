'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAgentRefresh } from '@/hooks/use-agent-refresh'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { TenswSkeleton } from '@/app/(dashboard)/_components/linear-skeleton'

// Blocks
import { ProjectBlock } from './_components/project-block'
import { ScheduleBlock } from './_components/schedule-block'
import { CashBlock } from './_components/cash-block'
import { SalesBlock } from './_components/sales-block'
import { LoanBlock } from './_components/loan-block'
import { TenswWikiBlock } from './_components/wiki-block'

// Dialogs
import { ScheduleAddDialog, TenswScheduleFormData } from './_components/schedule-add-dialog'
import { ScheduleDetailDialog } from './_components/schedule-detail-dialog'
import { CashDialog, TenswCashFormData } from './_components/cash-dialog'
import { SalesDialog, TenswSalesFormData } from './_components/sales-dialog'
import { LoanDialog, TenswLoanFormData } from './_components/loan-dialog'

// Shared email components
import { EmailBlock } from '@/app/(dashboard)/(linear)/mgmt/_components/email-block'
import { EmailDetailDialog, FullEmail } from '@/app/(dashboard)/(linear)/mgmt/_components/email-detail-dialog'
import { ComposeEmailDialog } from '@/app/(dashboard)/(linear)/mgmt/_components/compose-email-dialog'

// Types
import { TenswMgmtSchedule, TenswMgmtClient, TenswCashItem, TenswTaxInvoice, TenswLoan } from '@/types/tensw-mgmt'
import { WikiNote } from '@/app/(dashboard)/(linear)/wiki/_components/wiki-note-row'

type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward'

export default function TenswPage() {
  const mobile = useIsMobile()
  const [loadPhase, setLoadPhase] = useState(0) // 0=nothing, 1=DB+wiki done, 2=all done

  // Data states
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [projects, setProjects] = useState<any[]>([])
  const [schedules, setSchedules] = useState<TenswMgmtSchedule[]>([])
  const [clients, setClients] = useState<TenswMgmtClient[]>([])
  const [cashItems, setCashItems] = useState<TenswCashItem[]>([])
  const [invoices, setInvoices] = useState<TenswTaxInvoice[]>([])
  const [loans, setLoans] = useState<TenswLoan[]>([])
  const [wikiNotes, setWikiNotes] = useState<WikiNote[]>([])
  const [wikiLoading, setWikiLoading] = useState(true)

  // Schedule dialog state
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false)
  const [scheduleDialogDate, setScheduleDialogDate] = useState('')
  const [editingSchedule, setEditingSchedule] = useState<TenswMgmtSchedule | null>(null)
  const [selectedSchedule, setSelectedSchedule] = useState<TenswMgmtSchedule | null>(null)

  // Cash dialog state
  const [cashDialogOpen, setCashDialogOpen] = useState(false)
  const [editingCash, setEditingCash] = useState<TenswCashItem | null>(null)

  // Sales dialog state
  const [salesDialogOpen, setSalesDialogOpen] = useState(false)
  const [editingSales, setEditingSales] = useState<TenswTaxInvoice | null>(null)

  // Loan dialog state
  const [loanDialogOpen, setLoanDialogOpen] = useState(false)
  const [editingLoan, setEditingLoan] = useState<TenswLoan | null>(null)

  // Email state
  const [emails, setEmails] = useState<FullEmail[]>([])
  const [emailConnected, setEmailConnected] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [selectedEmail, setSelectedEmail] = useState<FullEmail | null>(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeMode, setComposeMode] = useState<ComposeMode>('new')
  const [composeOriginal, setComposeOriginal] = useState<FullEmail | null>(null)

  // ── Data loading ──────────────────────────────────────────────────────────

  const fetchEmails = useCallback(async () => {
    try {
      const statusRes = await fetch('/api/gmail/status?context=tensoftworks')
      if (!statusRes.ok) return
      const statusData = await statusRes.json()
      setEmailConnected(statusData.isConnected)
      if (statusData.isConnected) {
        const emailRes = await fetch('/api/gmail/emails?context=tensoftworks&label=TENSW&maxResults=50&daysBack=30&autoAnalyze=false')
        if (emailRes.ok) {
          const emailData = await emailRes.json()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setEmails((emailData.emails || []).map((e: any) => ({
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
            sourceLabel: 'TENSW',
            gmailContext: 'tensoftworks',
          })))
        }
      }
    } catch { /* Gmail not critical */ }
  }, [])

  const loadWiki = useCallback(async () => {
    setWikiLoading(true)
    try {
      const res = await fetch('/api/wiki', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setWikiNotes(Array.isArray(data) ? data : [])
      }
    } finally {
      setWikiLoading(false)
    }
  }, [])

  const loadData = useCallback(async () => {
    setLoadPhase(0)
    try {
      const [projectsRes, schedulesRes, clientsRes, cashRes, salesRes, loansRes] =
        await Promise.all([
          fetch('/api/tensoftworks'),
          fetch('/api/tensw-mgmt/schedules'),
          fetch('/api/tensw-mgmt/clients'),
          fetch('/api/tensw-mgmt/invoices'),
          fetch('/api/tensw-mgmt/tax-invoices'),
          fetch('/api/tensw-mgmt/loans'),
        ])

      if (projectsRes.ok) {
        const data = await projectsRes.json()
        setProjects(data.projects || [])
      }
      if (schedulesRes.ok) setSchedules(await schedulesRes.json())
      if (clientsRes.ok) setClients(await clientsRes.json())
      if (cashRes.ok) {
        const data = await cashRes.json()
        setCashItems(Array.isArray(data) ? data : data.invoices || [])
      }
      if (salesRes.ok) {
        const data = await salesRes.json()
        setInvoices(data.invoices || [])
      }
      if (loansRes.ok) {
        const data = await loansRes.json()
        setLoans(Array.isArray(data) ? data : data.loans || [])
      }

      // Phase 1: DB + wiki done → show UI (emails still loading)
      await loadWiki()
      setLoadPhase(1)

      // Phase 2: Gmail (slow) → emails appear
      await fetchEmails()
      setLoadPhase(2)
    } catch {
      // Even on error, show whatever we have
      setLoadPhase(prev => prev === 0 ? 1 : prev)
    }
  }, [loadWiki, fetchEmails])

  useEffect(() => { loadData() }, [loadData])
  useAgentRefresh(['tensw_mgmt'], loadData)

  const reloadClients = useCallback(async () => {
    const res = await fetch('/api/tensw-mgmt/clients')
    if (res.ok) setClients(await res.json())
  }, [])

  // ── Schedule handlers ─────────────────────────────────────────────────────

  const handleToggleComplete = async (id: string, completed: boolean) => {
    setSchedules(prev => prev.map(s => s.id === id ? { ...s, is_completed: completed } : s))
    try {
      const res = await fetch('/api/tensw-mgmt/schedules', {
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
      await fetch(`/api/tensw-mgmt/schedules?id=${id}`, { method: 'DELETE' })
    } catch {
      loadData()
    }
  }

  const handleAddSchedule = (date: string) => {
    setEditingSchedule(null)
    setScheduleDialogDate(date)
    setScheduleDialogOpen(true)
  }

  const handleEditSchedule = (schedule: TenswMgmtSchedule) => {
    setEditingSchedule(schedule)
    setScheduleDialogDate(schedule.schedule_date)
    setScheduleDialogOpen(true)
  }

  const handleSaveSchedule = async (data: TenswScheduleFormData) => {
    const isEdit = !!data.id
    const body: Record<string, unknown> = {
      title: data.title,
      schedule_date: data.schedule_date,
      type: data.type,
      client_id: data.client_id || null,
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

    const res = await fetch('/api/tensw-mgmt/schedules', {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error('Failed to save schedule')
    setScheduleDialogOpen(false)
    setEditingSchedule(null)
    loadData()
  }

  // ── Cash handlers ─────────────────────────────────────────────────────────

  const handleSaveCash = async (data: TenswCashFormData) => {
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
    const res = await fetch('/api/tensw-mgmt/invoices', {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error('Failed to save cash item')
    setCashDialogOpen(false)
    setEditingCash(null)
    loadData()
  }

  const handleDeleteCash = async (id: string) => {
    setCashItems(prev => prev.filter(c => c.id !== id))
    try {
      await fetch(`/api/tensw-mgmt/invoices?id=${id}`, { method: 'DELETE' })
    } catch {
      loadData()
    }
  }

  // ── Sales handlers ────────────────────────────────────────────────────────

  const handleSaveSales = async (data: TenswSalesFormData) => {
    const isEdit = !!data.id
    const parseCurrency = (v: string) => Number(v.replace(/,/g, '')) || 0
    const supply = parseCurrency(data.supply_amount)
    const tax = parseCurrency(data.tax_amount)
    const body: Record<string, unknown> = {
      issue_date: data.issue_date || null,
      counterparty: data.counterparty,
      business_number: data.business_number || null,
      representative: data.representative || null,
      supply_amount: supply,
      tax_amount: tax,
      total_amount: supply + tax,
      expected_payment_date: data.expected_payment_date || null,
      payment_status: data.payment_status || 'pending',
      notes: data.notes || null,
    }
    if (isEdit) body.id = data.id
    const res = await fetch('/api/tensw-mgmt/tax-invoices', {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error('Failed to save tax invoice')
    setSalesDialogOpen(false)
    setEditingSales(null)
    loadData()
  }

  const handleDeleteSales = async (id: string) => {
    setInvoices(prev => prev.filter(i => i.id !== id))
    try {
      await fetch(`/api/tensw-mgmt/tax-invoices?id=${id}`, { method: 'DELETE' })
    } catch {
      loadData()
    }
  }

  // ── Loan handlers ─────────────────────────────────────────────────────────

  const handleSaveLoan = async (data: TenswLoanFormData) => {
    const isEdit = !!data.id
    const parseCurrency = (v: string) => Number(v.replace(/,/g, '')) || 0
    const body: Record<string, unknown> = {
      bank: data.bank,
      account_number: data.account_number || null,
      loan_type: data.loan_type,
      principal: parseCurrency(data.principal),
      interest_rate: data.interest_rate ? Number(data.interest_rate) : null,
      monthly_interest_avg: data.monthly_interest_avg ? parseCurrency(data.monthly_interest_avg) : null,
      loan_date: data.loan_date || null,
      maturity_date: data.maturity_date || null,
      last_extension_date: data.last_extension_date || null,
      next_interest_date: data.next_interest_date || null,
      interest_payment_day: data.interest_payment_day ? Number(data.interest_payment_day) : null,
      repayment_type: data.repayment_type || 'bullet',
      status: data.status || 'active',
      memo: data.memo || null,
    }
    if (isEdit) body.id = data.id
    const res = await fetch('/api/tensw-mgmt/loans', {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error('Failed to save loan')
    setLoanDialogOpen(false)
    setEditingLoan(null)
    loadData()
  }

  const handleDeleteLoan = async (id: string) => {
    setLoans(prev => prev.filter(l => l.id !== id))
    try {
      await fetch(`/api/tensw-mgmt/loans?id=${id}`, { method: 'DELETE' })
    } catch {
      loadData()
    }
  }

  // ── Wiki handlers ─────────────────────────────────────────────────────────

  const handleCreateWiki = async (data: { section: 'tensw-mgmt'; title: string; content: string; attachments?: unknown }) => {
    await fetch('/api/wiki', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    loadWiki()
  }

  const handleUpdateWiki = async (id: string, data: Partial<{ title: string; content: string; section: string; is_pinned: boolean; attachments: unknown }>) => {
    await fetch(`/api/wiki/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    loadWiki()
  }

  const handleDeleteWiki = async (id: string) => {
    await fetch(`/api/wiki/${id}`, { method: 'DELETE' })
    loadWiki()
  }

  // ── Email handlers ────────────────────────────────────────────────────────

  const handleSyncEmails = async () => {
    setIsSyncing(true)
    try { await fetchEmails() } finally { setIsSyncing(false) }
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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Page title */}
      <div style={{ padding: '20px 0 0' }}>
        <h1 style={{
          margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: -0.3,
          fontFamily: t.font.sans, color: t.neutrals.text,
        }}>텐소프트웍스</h1>
        <p style={{
          margin: '4px 0 16px', fontSize: 12, color: t.neutrals.muted,
          fontFamily: t.font.sans,
        }}>AI 서비스에 필요한 데이터 구축 및 관리 솔루션을 제공</p>
      </div>

      {loadPhase === 0 ? <TenswSkeleton /> : (
        <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Schedule (full width) */}
          <ScheduleBlock
            schedules={schedules}
            clients={clients}
            onAddSchedule={handleAddSchedule}
            onToggleComplete={handleToggleComplete}
            onSelectSchedule={setSelectedSchedule}
          />

          {/* Cash (1.5fr) + Sales+Loans (1fr) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: mobile ? '1fr' : '1.5fr 1fr',
            gap: 14,
          }}>
            <CashBlock
              items={cashItems}
              onAdd={() => { setEditingCash(null); setCashDialogOpen(true) }}
              onSelect={(item) => { setEditingCash(item); setCashDialogOpen(true) }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <SalesBlock
                invoices={invoices}
                onAdd={() => { setEditingSales(null); setSalesDialogOpen(true) }}
                onEdit={(inv) => { setEditingSales(inv); setSalesDialogOpen(true) }}
                onDelete={handleDeleteSales}
                onRefresh={loadData}
              />
              <LoanBlock
                loans={loans}
                onAdd={() => { setEditingLoan(null); setLoanDialogOpen(true) }}
                onEdit={(loan) => { setEditingLoan(loan); setLoanDialogOpen(true) }}
                onDelete={handleDeleteLoan}
                style={{ height: 'fit-content' }}
              />
            </div>
          </div>

          {/* Wiki (2fr) + Email (1fr) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: mobile ? '1fr' : '1.5fr 1fr',
            gap: 14,
          }}>
            <TenswWikiBlock
              notes={wikiNotes}
              loading={wikiLoading}
              onCreate={handleCreateWiki}
              onUpdate={handleUpdateWiki}
              onDelete={handleDeleteWiki}
            />
            <EmailBlock
              emails={emails}
              connected={emailConnected}
              onSelectEmail={setSelectedEmail}
              onSync={handleSyncEmails}
              onCompose={handleCompose}
              isSyncing={isSyncing}
            />
          </div>

          {/* Projects (full width) */}
          <ProjectBlock projects={projects} />
        </div>

        {/* Schedule dialogs */}
        <ScheduleDetailDialog
          schedule={selectedSchedule}
          onClose={() => setSelectedSchedule(null)}
          onToggleComplete={handleToggleComplete}
          onDelete={handleDeleteSchedule}
          onEdit={handleEditSchedule}
        />
        <ScheduleAddDialog
          open={scheduleDialogOpen}
          defaultDate={scheduleDialogDate}
          editingSchedule={editingSchedule}
          clients={clients}
          onClose={() => { setScheduleDialogOpen(false); setEditingSchedule(null) }}
          onSave={handleSaveSchedule}
          onClientCreated={reloadClients}
        />

        {/* Cash dialog */}
        <CashDialog
          open={cashDialogOpen}
          editItem={editingCash}
          onClose={() => { setCashDialogOpen(false); setEditingCash(null) }}
          onSave={handleSaveCash}
          onDelete={handleDeleteCash}
        />

        {/* Sales dialog */}
        <SalesDialog
          open={salesDialogOpen}
          editInvoice={editingSales}
          onClose={() => { setSalesDialogOpen(false); setEditingSales(null) }}
          onSave={handleSaveSales}
          onDelete={handleDeleteSales}
        />

        {/* Loan dialog */}
        <LoanDialog
          open={loanDialogOpen}
          editLoan={editingLoan}
          onClose={() => { setLoanDialogOpen(false); setEditingLoan(null) }}
          onSave={handleSaveLoan}
          onDelete={handleDeleteLoan}
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
          gmailContext={composeOriginal?.gmailContext || 'tensoftworks'}
          onClose={() => { setComposeOpen(false); setComposeOriginal(null) }}
          onSent={() => { fetchEmails() }}
        />
        </>
      )}
    </>
  )
}
