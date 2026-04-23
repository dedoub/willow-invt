'use client'

import { useState, useEffect, useCallback } from 'react'
import { t, useIsMobile } from '@/app/willow-investment/_components/linear-tokens'
import { AkrosSkeleton } from '@/app/willow-investment/_components/linear-skeleton'
import { fetchAllTimeSeriesData, fetchAkrosProducts, AkrosProduct, TimeSeriesData } from '@/lib/supabase-etf'
import { AumBlock } from './_components/aum-block'
import { ProductBlock } from './_components/product-block'
import { TaxInvoiceBlock, AkrosTaxInvoice } from './_components/tax-invoice-block'
import { AkrosWikiBlock } from './_components/wiki-block'
import { EmailBlock } from '@/app/willow-investment/(linear)/mgmt/_components/email-block'
import { EmailDetailDialog, FullEmail } from '@/app/willow-investment/(linear)/mgmt/_components/email-detail-dialog'
import { ComposeEmailDialog } from '@/app/willow-investment/(linear)/mgmt/_components/compose-email-dialog'
import { WikiNote } from '@/app/willow-investment/(linear)/wiki/_components/wiki-note-row'

type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward'

export default function AkrosPage() {
  const mobile = useIsMobile()
  const [loading, setLoading] = useState(true)

  // AUM + Products
  const [timeSeries, setTimeSeries] = useState<TimeSeriesData[]>([])
  const [products, setProducts] = useState<AkrosProduct[]>([])

  // Tax invoices
  const [invoices, setInvoices] = useState<AkrosTaxInvoice[]>([])

  // Wiki
  const [wikiNotes, setWikiNotes] = useState<WikiNote[]>([])
  const [wikiLoading, setWikiLoading] = useState(true)

  // Email
  const [emails, setEmails] = useState<FullEmail[]>([])
  const [emailConnected, setEmailConnected] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [selectedEmail, setSelectedEmail] = useState<FullEmail | null>(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeMode, setComposeMode] = useState<ComposeMode>('new')
  const [composeOriginal, setComposeOriginal] = useState<FullEmail | null>(null)

  const loadProducts = useCallback(async () => {
    const [ts, prods] = await Promise.all([
      fetchAllTimeSeriesData(),
      fetchAkrosProducts(),
    ])
    setTimeSeries(ts)
    setProducts(prods)
  }, [])

  const loadInvoices = useCallback(async () => {
    const res = await fetch('/api/akros/tax-invoices')
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
        const emailRes = await fetch('/api/gmail/emails?context=default&label=Akros&maxResults=50&daysBack=30&autoAnalyze=false')
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
            sourceLabel: 'Akros',
            gmailContext: 'default',
          })))
        }
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    Promise.all([loadProducts(), loadInvoices(), loadWiki(), fetchEmails()])
      .finally(() => setLoading(false))
  }, [loadProducts, loadInvoices, loadWiki, fetchEmails])

  // Email handlers
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

  // Wiki CRUD handlers
  const handleCreateWiki = async (data: { section: 'akros'; title: string; content: string; attachments?: unknown }) => {
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
        }}>아크로스</h1>
        <p style={{
          margin: '4px 0 16px', fontSize: 12, color: t.neutrals.muted,
          fontFamily: t.font.sans,
        }}>ETF 운용 · 세금계산서 · 위키 · 이메일</p>
      </div>

      {loading ? <AkrosSkeleton /> : (
        <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* AUM Dashboard */}
          <AumBlock timeSeries={timeSeries} productCount={products.length} />

          {/* Products + Tax Invoices */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: mobile ? '1fr' : '1fr 1fr',
            gap: 14,
          }}>
            <ProductBlock products={products} />
            <TaxInvoiceBlock invoices={invoices} onRefresh={loadInvoices} />
          </div>

          {/* Wiki + Email */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: mobile ? '1fr' : '2fr 1fr',
            gap: 14,
          }}>
            <AkrosWikiBlock
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
          gmailContext={composeOriginal?.gmailContext || 'default'}
          onClose={() => { setComposeOpen(false); setComposeOriginal(null) }}
          onSent={() => { fetchEmails() }}
        />
        </>
      )}
    </>
  )
}
