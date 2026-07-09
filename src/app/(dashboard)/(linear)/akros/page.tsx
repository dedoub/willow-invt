'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAgentRefresh } from '@/hooks/use-agent-refresh'
import { useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { useDashCols } from '@/app/(dashboard)/(linear)/monor/_components/cols-toggle'
import { AkrosSkeleton } from '@/app/(dashboard)/_components/linear-skeleton'
import { fetchAllTimeSeriesData, fetchAkrosProducts, fetchYearLaunches } from '@/lib/etf-client'
import type { AkrosProduct, TimeSeriesData } from '@/lib/etf-types'
import { AumBlock } from './_components/aum-block'
import { ProductBlock } from './_components/product-block'
import { TaxInvoiceBlock, AkrosTaxInvoice } from './_components/tax-invoice-block'
import { AkrosWikiBlock } from './_components/wiki-block'
import { WikiNote } from '@/app/(dashboard)/(linear)/wiki/_components/wiki-note-row'
import { IssueTrackerBlock } from './_components/issue-tracker-block'
import type { AkrosEmailIssue, AkrosEmailDeadline } from '@/lib/supabase-etf'

export default function AkrosPage() {
  const mobile = useIsMobile()
  const cols = useDashCols()
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

  // Email 이슈 트래킹
  const [issues, setIssues] = useState<AkrosEmailIssue[]>([])
  const [deadlines, setDeadlines] = useState<AkrosEmailDeadline[]>([])
  const [issuesLoading, setIssuesLoading] = useState(true)

  const loadIssues = useCallback(async () => {
    setIssuesLoading(true)
    try {
      const res = await fetch('/api/akros/issues', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setIssues(data.issues || [])
        setDeadlines(data.deadlines || [])
      }
    } finally {
      setIssuesLoading(false)
    }
  }, [])

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
    const res = await fetch('/api/wiki?section=akros', { cache: 'no-store' })
    if (res.ok) {
      const data = await res.json()
      setWikiNotes(Array.isArray(data) ? data : [])
    }
    setWikiLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      await Promise.all([loadProducts(), loadInvoices(), loadWiki()])
      if (!cancelled) setLoadPhase(1)
      await loadIssues()
      if (!cancelled) setLoadPhase(2)
    }
    load()
    return () => { cancelled = true }
  }, [loadProducts, loadInvoices, loadWiki, loadIssues])
  useAgentRefresh(['akros_', 'etf_', 'work_wiki'], () => {
    loadProducts(); loadInvoices(); loadWiki(); loadIssues()
  })

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
      {loadPhase === 0 ? <AkrosSkeleton /> : (
        <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* AUM + Products (left 2/3) + Tax Invoices (right 1/3, full height) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: mobile ? '1fr' : (cols === 1 ? '1fr' : '2fr 1fr'),
            gridTemplateRows: mobile ? 'auto auto auto' : 'auto 1fr',
            gap: 14,
          }}>
            <div style={{ minWidth: 0, ...(mobile ? {} : { gridColumn: 1, gridRow: 1 }) }}>
              <AumBlock timeSeries={timeSeries} productCount={products.length} yearLaunches={yearLaunches} />
            </div>
            <div style={{ minWidth: 0, ...(mobile ? {} : { gridColumn: 2, gridRow: '1 / -1' }) }}>
              <TaxInvoiceBlock invoices={invoices} onRefresh={loadInvoices} style={mobile ? undefined : { height: '100%' }} />
            </div>
            <div style={{ minWidth: 0, ...(mobile ? {} : { gridColumn: 1, gridRow: 2 }) }}>
              <ProductBlock products={products} />
            </div>
          </div>

          {/* 이메일 이슈 트래킹(좌 2/3) + 업무위키(우 1/3, 높이 맞춤·모바일식) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: mobile ? '1fr' : (cols === 1 ? '1fr' : '2fr 1fr'),
            gap: 14,
            alignItems: mobile ? 'start' : 'stretch',
          }}>
            <div style={{ minWidth: 0 }}>
              <IssueTrackerBlock
                issues={issues}
                deadlines={deadlines}
                loading={issuesLoading}
                onRefresh={loadIssues}
              />
            </div>
            <div style={{ minWidth: 0 }}>
              <AkrosWikiBlock
                notes={wikiNotes}
                loading={wikiLoading}
                onCreate={handleCreateWiki}
                onUpdate={handleUpdateWiki}
                onDelete={handleDeleteWiki}
              />
            </div>
          </div>
        </div>
        </>
      )}
    </>
  )
}
