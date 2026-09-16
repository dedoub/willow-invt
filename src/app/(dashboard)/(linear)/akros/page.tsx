'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAgentRefresh } from '@/hooks/use-agent-refresh'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { useDashCols } from '@/app/(dashboard)/_components/cols-toggle'
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
  const singleCol = mobile || cols === 1 // 모바일 또는 1열 토글 → 단일 컬럼 순서
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
        {/* theme-outline 이 카드와 거기서 열리는 모달의 껍데기를 함께 덮는다. 사업관리·보이스카드와
            같은 카드 문법(CEO 2026-09-15). 이게 없으면 카드는 테두리를 못 받고 안쪽 판은 회색으로 남는다. */}
        <div className="theme-outline" style={{ display: 'flex', flexDirection: 'column', gap: t.density.blockGap }}>
          {singleCol ? (
            /* 단일열(모바일·1열 토글): 전체현황 > 상품관리 > 이슈트래킹 > 세금계산서 > 업무위키 */
            <>
              <AumBlock timeSeries={timeSeries} productCount={products.length} yearLaunches={yearLaunches} />
              <ProductBlock products={products} />
              <IssueTrackerBlock issues={issues} deadlines={deadlines} loading={issuesLoading} onRefresh={loadIssues} />
              <TaxInvoiceBlock invoices={invoices} onRefresh={loadInvoices} />
              <AkrosWikiBlock
                notes={wikiNotes}
                loading={wikiLoading}
                onCreate={handleCreateWiki}
                onUpdate={handleUpdateWiki}
                onDelete={handleDeleteWiki}
              />
            </>
          ) : (
            <>
              {/* 전체현황·상품관리(왼쪽 2/3) + 세금계산서(오른쪽 1/3).
                  alignItems:start — 오른쪽은 왼쪽 열 높이를 따라가지 않고 제 내용만큼만 자란다.
                  늘려 맞추면 목록이 짧은 날 카드 아래가 빈 판으로 남았다(CEO 2026-09-16). */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr',
                gridTemplateRows: 'auto auto',
                gap: t.density.blockGap,
                alignItems: 'start',
              }}>
                <div style={{ minWidth: 0, gridColumn: 1, gridRow: 1 }}>
                  <AumBlock timeSeries={timeSeries} productCount={products.length} yearLaunches={yearLaunches} />
                </div>
                <div style={{ minWidth: 0, gridColumn: 2, gridRow: '1 / -1' }}>
                  <TaxInvoiceBlock invoices={invoices} onRefresh={loadInvoices} />
                </div>
                <div style={{ minWidth: 0, gridColumn: 1, gridRow: 2 }}>
                  <ProductBlock products={products} />
                </div>
              </div>

              {/* 이메일 이슈 트래킹 + 업무위키 — 반씩 나눠 쓴다(CEO 2026-09-15).
                  alignItems:start — 두 카드가 각자 내용만큼만 자란다. 늘려 맞추면 짧은 쪽에 빈 판이 남는다. */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: t.density.blockGap,
                alignItems: 'start',
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
            </>
          )}
        </div>
        </>
      )}
    </>
  )
}
