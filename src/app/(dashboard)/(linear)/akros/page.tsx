'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAgentRefresh } from '@/hooks/use-agent-refresh'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { AkrosSkeleton } from '@/app/(dashboard)/_components/linear-skeleton'
import { fetchAllTimeSeriesData, fetchAkrosProducts, fetchYearLaunches, AkrosProduct, TimeSeriesData } from '@/lib/supabase-etf'
import { AumBlock } from './_components/aum-block'
import { ProductBlock } from './_components/product-block'
import { TaxInvoiceBlock, AkrosTaxInvoice } from './_components/tax-invoice-block'
import { AkrosWikiBlock } from './_components/wiki-block'
import { EmailBlock } from '@/app/(dashboard)/(linear)/mgmt/_components/email-block'
import { EmailDetailDialog, FullEmail } from '@/app/(dashboard)/(linear)/mgmt/_components/email-detail-dialog'
import { ComposeEmailDialog } from '@/app/(dashboard)/(linear)/mgmt/_components/compose-email-dialog'
import { WikiNote } from '@/app/(dashboard)/(linear)/wiki/_components/wiki-note-row'

type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward'

export default function AkrosPage() {
  const mobile = useIsMobile()
  const [loadPhase, setLoadPhase] = useState(0) // 0=nothing, 1=DB done, 2=all done

  // AUM + Products
  const [timeSeries, setTimeSeries] = useState<TimeSeriesData[]>([])
  const [products, setProducts] = useState<AkrosProduct[]>([])
  const [yearLaunches, setYearLaunches] = useState(0)

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
    const [ts, prods, launches] = await Promise.all([
      fetchAllTimeSeriesData(),
      fetchAkrosProducts(),
      fetchYearLaunches(new Date().getFullYear()),
    ])
    setTimeSeries(ts)
    setProducts(prods)
    setYearLaunches(launches)
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
    let cancelled = false
    async function load() {
      await Promise.all([loadProducts(), loadInvoices(), loadWiki()])
      if (!cancelled) setLoadPhase(1)
      await fetchEmails()
      if (!cancelled) setLoadPhase(2)
    }
    load()
    return () => { cancelled = true }
  }, [loadProducts, loadInvoices, loadWiki, fetchEmails])
  useAgentRefresh(['akros_', 'etf_', 'work_wiki'], () => {
    loadProducts(); loadInvoices(); loadWiki()
  })

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
        }}>인덱스 AUM 100조 원을 목표로 성장 중이며 그 과정 중에 매각</p>
      </div>

      {loadPhase === 0 ? <AkrosSkeleton /> : (
        <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* AUM + Products (left 2/3) + Tax Invoices (right 1/3, full height) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: mobile ? '1fr' : '2fr 1fr',
            gridTemplateRows: mobile ? 'auto auto auto' : 'auto 1fr',
            gap: 14,
          }}>
            <div style={mobile ? {} : { gridColumn: 1, gridRow: 1 }}>
              <AumBlock timeSeries={timeSeries} productCount={products.length} yearLaunches={yearLaunches} />
            </div>
            <div style={mobile ? {} : { gridColumn: 2, gridRow: '1 / -1', minWidth: 0 }}>
              <TaxInvoiceBlock invoices={invoices} onRefresh={loadInvoices} style={{ height: '100%' }} />
            </div>
            <div style={mobile ? {} : { gridColumn: 1, gridRow: 2 }}>
              <ProductBlock products={products} />
            </div>
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
