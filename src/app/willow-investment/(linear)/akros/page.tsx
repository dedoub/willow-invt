'use client'

import { useState, useEffect, useCallback } from 'react'
import { t, useIsMobile } from '@/app/willow-investment/_components/linear-tokens'
import { AkrosSkeleton } from '@/app/willow-investment/_components/linear-skeleton'
import { fetchAllTimeSeriesData, fetchAkrosProducts, AkrosProduct, TimeSeriesData } from '@/lib/supabase-etf'
import { AumBlock } from './_components/aum-block'
import { ProductBlock } from './_components/product-block'
import { TaxInvoiceBlock, AkrosTaxInvoice } from './_components/tax-invoice-block'
import { AkrosWikiBlock } from './_components/wiki-block'
import { AkrosEmailBlock } from './_components/akros-email-block'
import { WikiNote } from '@/app/willow-investment/(linear)/wiki/_components/wiki-note-row'
import { FullEmail } from '@/app/willow-investment/(linear)/mgmt/_components/email-detail-dialog'

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
    const res = await fetch('/api/wiki?section=akros')
    if (res.ok) {
      const data = await res.json()
      setWikiNotes(data.notes || [])
    }
    setWikiLoading(false)
  }, [])

  const loadEmails = useCallback(async () => {
    try {
      const statusRes = await fetch('/api/gmail/status?context=default')
      if (statusRes.ok) {
        const statusData = await statusRes.json()
        setEmailConnected(statusData.connected)
        if (statusData.connected) {
          const emailRes = await fetch('/api/gmail/emails?context=default&label=Akros&maxResults=50&daysBack=30&autoAnalyze=false')
          if (emailRes.ok) {
            const emailData = await emailRes.json()
            setEmails((emailData.emails || []).map((e: FullEmail) => ({ ...e, sourceLabel: 'Akros', gmailContext: 'default' })))
          }
        }
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    Promise.all([loadProducts(), loadInvoices(), loadWiki(), loadEmails()])
      .finally(() => setLoading(false))
  }, [loadProducts, loadInvoices, loadWiki, loadEmails])

  const handleSyncEmail = async () => {
    setIsSyncing(true)
    await loadEmails()
    setIsSyncing(false)
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
            gridTemplateColumns: mobile ? '1fr' : '1fr 1fr',
            gap: 14,
          }}>
            <AkrosWikiBlock
              notes={wikiNotes}
              loading={wikiLoading}
              onCreate={handleCreateWiki}
              onUpdate={handleUpdateWiki}
              onDelete={handleDeleteWiki}
            />
            <AkrosEmailBlock
              emails={emails}
              connected={emailConnected}
              onSelectEmail={() => {}}
              onSync={handleSyncEmail}
              onCompose={() => {}}
              isSyncing={isSyncing}
            />
          </div>
        </div>
      )}
    </>
  )
}
