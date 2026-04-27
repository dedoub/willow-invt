'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAgentRefresh } from '@/hooks/use-agent-refresh'
import { t, useIsMobile } from '@/app/willow-investment/_components/linear-tokens'
import { EtcSkeleton } from '@/app/willow-investment/_components/linear-skeleton'
import { ETFDisplayData, fetchETFDisplayData, fetchETFProducts, fetchHistoricalData, deleteETFProduct, HistoricalDataPoint } from '@/lib/supabase-etf'
import { Invoice } from '@/lib/invoice/types'
import { StatsBlock } from './_components/stats-block'
import { ProductBlock } from './_components/product-block'
import { ProductDialog } from './_components/product-dialog'
import { DocumentPanel } from './_components/document-panel'
import { InvoiceBlock } from './_components/invoice-block'
import { InvoiceDialog } from './_components/invoice-dialog'
import { InvoiceSendDialog } from './_components/invoice-send-dialog'
import { EtcWikiBlock } from './_components/wiki-block'
import { EmailBlock } from '@/app/willow-investment/(linear)/mgmt/_components/email-block'
import { EmailDetailDialog, FullEmail } from '@/app/willow-investment/(linear)/mgmt/_components/email-detail-dialog'
import { ComposeEmailDialog } from '@/app/willow-investment/(linear)/mgmt/_components/compose-email-dialog'
import { WikiNote } from '@/app/willow-investment/(linear)/wiki/_components/wiki-note-row'

type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward'

export default function EtcPage() {
  const mobile = useIsMobile()
  const [loading, setLoading] = useState(true)

  // Products + Stats
  const [etfs, setEtfs] = useState<ETFDisplayData[]>([])
  const [historicalData, setHistoricalData] = useState<HistoricalDataPoint[]>([])

  // Invoices
  const [invoices, setInvoices] = useState<Invoice[]>([])

  // Wiki
  const [wikiNotes, setWikiNotes] = useState<WikiNote[]>([])
  const [wikiLoading, setWikiLoading] = useState(true)

  // Email (same pattern as akros)
  const [emails, setEmails] = useState<FullEmail[]>([])
  const [emailConnected, setEmailConnected] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [selectedEmail, setSelectedEmail] = useState<FullEmail | null>(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeMode, setComposeMode] = useState<ComposeMode>('new')
  const [composeOriginal, setComposeOriginal] = useState<FullEmail | null>(null)

  // Dialogs
  const [productDialogOpen, setProductDialogOpen] = useState(false)
  const [editEtf, setEditEtf] = useState<ETFDisplayData | null>(null)
  const [docEtf, setDocEtf] = useState<ETFDisplayData | null>(null)
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false)
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null)
  const [sendInvoice, setSendInvoice] = useState<Invoice | null>(null)
  const [sendTarget, setSendTarget] = useState<'etc' | 'bank'>('etc')

  const loadData = useCallback(async () => {
    const [displayData, products] = await Promise.all([
      fetchETFDisplayData('ETC'),
      fetchETFProducts('ETC'),
    ])
    setEtfs(displayData)
    // Fetch historical data using raw products
    const hist = await fetchHistoricalData(products, 180)
    setHistoricalData(hist)
  }, [])

  const loadInvoices = useCallback(async () => {
    const res = await fetch('/api/invoices')
    if (res.ok) {
      const data = await res.json()
      setInvoices(data.invoices || [])
    }
  }, [])

  const loadWiki = useCallback(async () => {
    setWikiLoading(true)
    const res = await fetch('/api/wiki', { cache: 'no-store' })
    if (res.ok) {
      const data = await res.json()
      setWikiNotes(Array.isArray(data) ? data : [])
    }
    setWikiLoading(false)
  }, [])

  const fetchEmails = useCallback(async () => {
    try {
      const statusRes = await fetch('/api/gmail/status?context=default')
      if (!statusRes.ok) return
      const statusData = await statusRes.json()
      setEmailConnected(statusData.isConnected)
      if (statusData.isConnected) {
        const emailRes = await fetch('/api/gmail/emails?context=default&label=ETC&maxResults=50&daysBack=30&autoAnalyze=false')
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
            sourceLabel: 'ETC',
            gmailContext: 'default',
          })))
        }
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    Promise.all([loadData(), loadInvoices(), loadWiki(), fetchEmails()])
      .finally(() => setLoading(false))
  }, [loadData, loadInvoices, loadWiki, fetchEmails])
  useAgentRefresh(['etf_', 'work_wiki'], () => {
    loadData(); loadInvoices(); loadWiki()
  })

  // Email handlers
  const handleSyncEmails = async () => {
    setIsSyncing(true)
    try { await fetchEmails() } finally { setIsSyncing(false) }
  }
  const handleReply = (email: FullEmail) => { setComposeMode('reply'); setComposeOriginal(email); setComposeOpen(true) }
  const handleForward = (email: FullEmail) => { setComposeMode('forward'); setComposeOriginal(email); setComposeOpen(true) }
  const handleCompose = () => { setComposeMode('new'); setComposeOriginal(null); setComposeOpen(true) }

  // Product handlers
  const handleAddProduct = () => { setEditEtf(null); setProductDialogOpen(true) }
  const handleEditProduct = (etf: ETFDisplayData) => { setEditEtf(etf); setProductDialogOpen(true) }
  const handleDeleteProduct = async (etf: ETFDisplayData) => {
    await deleteETFProduct(etf.id)
    loadData()
  }
  const handleProductSaved = () => { setProductDialogOpen(false); setEditEtf(null); loadData() }

  // Invoice handlers
  const handleAddInvoice = () => { setEditInvoice(null); setInvoiceDialogOpen(true) }
  const handleEditInvoice = (inv: Invoice) => { setEditInvoice(inv); setInvoiceDialogOpen(true) }
  const handleSendEtc = (inv: Invoice) => { setSendInvoice(inv); setSendTarget('etc') }
  const handleSendBank = (inv: Invoice) => { setSendInvoice(inv); setSendTarget('bank') }
  const handleInvoiceSaved = () => { setInvoiceDialogOpen(false); setEditInvoice(null); loadInvoices() }

  // Wiki CRUD handlers
  const handleCreateWiki = async (data: { section: 'etf-etc'; title: string; content: string; attachments?: unknown }) => {
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

  return (
    <>
      <div style={{ padding: '20px 0 0' }}>
        <h1 style={{
          margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: -0.3,
          fontFamily: t.font.sans, color: t.neutrals.text,
        }}>ETC</h1>
        <p style={{
          margin: '4px 0 16px', fontSize: 12, color: t.neutrals.muted,
          fontFamily: t.font.sans,
        }}>국내 금융투자업자들에게 미국 상장 ETF 플랫폼을 제공</p>
      </div>

      {loading ? <EtcSkeleton /> : (
        <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Stats + Products (left 2/3) + Invoices (right 1/3, full height) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: mobile ? '1fr' : '2fr 1fr',
            gridTemplateRows: mobile ? 'auto auto auto' : 'auto 1fr',
            gap: 14,
          }}>
            <div style={mobile ? {} : { gridColumn: 1, gridRow: 1 }}>
              <StatsBlock etfs={etfs} historicalData={historicalData} />
            </div>
            <div style={mobile ? {} : { gridColumn: 2, gridRow: '1 / -1' }}>
              <InvoiceBlock
                invoices={invoices}
                onRefresh={loadInvoices}
                onAdd={handleAddInvoice}
                onEdit={handleEditInvoice}
                onSendEtc={handleSendEtc}
                onSendBank={handleSendBank}
                style={{ height: '100%' }}
              />
            </div>
            <div style={mobile ? {} : { gridColumn: 1, gridRow: 2 }}>
              <ProductBlock
                etfs={etfs}
                onAdd={handleAddProduct}
                onEdit={handleEditProduct}
                onDocuments={(etf) => setDocEtf(etf)}
                onDelete={handleDeleteProduct}
                onRefresh={loadData}
              />
            </div>
          </div>

          {/* Wiki + Email */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: mobile ? '1fr' : '2fr 1fr',
            gap: 14,
          }}>
            <EtcWikiBlock
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
        </div>

        {/* Dialogs */}
        <ProductDialog
          open={productDialogOpen}
          editEtf={editEtf}
          onClose={() => { setProductDialogOpen(false); setEditEtf(null) }}
          onSaved={handleProductSaved}
        />
        <DocumentPanel
          etf={docEtf}
          onClose={() => setDocEtf(null)}
        />
        <InvoiceDialog
          open={invoiceDialogOpen}
          editInvoice={editInvoice}
          onClose={() => { setInvoiceDialogOpen(false); setEditInvoice(null) }}
          onSaved={handleInvoiceSaved}
        />
        <InvoiceSendDialog
          invoice={sendInvoice}
          target={sendTarget}
          onClose={() => setSendInvoice(null)}
          onSent={() => { setSendInvoice(null); loadInvoices() }}
        />
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
          gmailContext={composeOriginal?.gmailContext || 'default'}
          onClose={() => { setComposeOpen(false); setComposeOriginal(null) }}
          onSent={() => { fetchEmails() }}
        />
        </>
      )}
    </>
  )
}
