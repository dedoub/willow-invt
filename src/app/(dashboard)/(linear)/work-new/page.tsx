'use client'

/**
 * 문서함 NEW — 디자인을 한 카드씩 잡아 보는 사본이다.
 * 카드 구성과 데이터는 /work 와 같은 블록을 그대로 쓰고, 여기서는 시각만 바꾼다.
 */

import { useState, useEffect, useCallback } from 'react'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { useDashCols } from '@/app/(dashboard)/_components/cols-toggle'
import { EmailBlock } from '@/app/(dashboard)/(linear)/mgmt/_components/email-block'
import { WikiList } from './_components/wiki-list'
import { WikiNote } from '@/app/(dashboard)/(linear)/wiki/_components/wiki-note-row'
import { CorpDocsBlock } from '@/app/(dashboard)/_components/corp-docs-block'
import { useAgentRefresh } from '@/hooks/use-agent-refresh'
import { EmailDetailDialog, FullEmail } from '@/app/(dashboard)/(linear)/mgmt/_components/email-detail-dialog'
import { ComposeEmailDialog } from '@/app/(dashboard)/(linear)/mgmt/_components/compose-email-dialog'

type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward'
type WikiSection = 'memo' | 'akros' | 'etf-etc' | 'willow-mgmt' | 'tensw-mgmt' | 'invest-mgmt'

// 회사(업무) 이메일 소스 — 사업관리 페이지와 동일 정의
const WORK_SOURCES = [
  { context: 'willow',       label: 'WILLOW', sourceLabel: 'WILLOW' },
  { context: 'tensoftworks', label: 'TENSW',  sourceLabel: 'TENSW' },
  { context: 'default',      label: 'ETC',    sourceLabel: 'ETC' },
  { context: 'default',      label: 'Akros',  sourceLabel: 'Akros' },
] as const

export default function WorkNewPage() {
  const mobile = useIsMobile()
  const cols = useDashCols()

  // 회사 이메일 (여러 context 집계)
  const [workEmails, setWorkEmails] = useState<FullEmail[]>([])
  const [workConnected, setWorkConnected] = useState(false)
  const [workSyncing, setWorkSyncing] = useState(false)

  // 개인 이메일
  const [personalEmails, setPersonalEmails] = useState<FullEmail[]>([])
  const [personalConnected, setPersonalConnected] = useState(false)
  const [personalSyncing, setPersonalSyncing] = useState(false)

  // 공통 다이얼로그
  const [selectedEmail, setSelectedEmail] = useState<FullEmail | null>(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeMode, setComposeMode] = useState<ComposeMode>('new')
  const [composeOriginal, setComposeOriginal] = useState<FullEmail | null>(null)
  const [composeContext, setComposeContext] = useState<string>('willow')

  // 업무위키 — 전체 섹션. 목록만 두고 상세는 모달(텐소 위키와 같은 문법).
  const [notes, setNotes] = useState<WikiNote[]>([])
  const [wikiLoading, setWikiLoading] = useState(true)

  const loadNotes = useCallback(async () => {
    setWikiLoading(true)
    try {
      const res = await fetch('/api/wiki', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setNotes(Array.isArray(data) ? data : [])
      }
    } catch (e) {
      console.error('Failed to load wiki notes:', e)
    } finally {
      setWikiLoading(false)
    }
  }, [])

  useEffect(() => { loadNotes() }, [loadNotes])
  useAgentRefresh(['work_wiki', 'wiki_'], loadNotes)

  const handleWikiCreate = async (data: { section: WikiSection; title: string; content: string; attachments?: unknown }) => {
    const res = await fetch('/api/wiki', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    if (res.ok) await loadNotes()
  }

  const handleWikiUpdate = async (id: string, data: Partial<{ title: string; content: string; section: string; is_pinned: boolean; attachments: unknown; memos: unknown }>) => {
    const res = await fetch(`/api/wiki/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    if (res.ok) await loadNotes()
  }

  const handleWikiDelete = async (id: string) => {
    const res = await fetch(`/api/wiki/${id}`, { method: 'DELETE' })
    if (res.ok) await loadNotes()
  }

  const fetchWork = useCallback(async () => {
    try {
      const contexts = [...new Set(WORK_SOURCES.map(s => s.context))]
      const statusResults = await Promise.all(
        contexts.map(ctx => fetch(`/api/gmail/status?context=${ctx}`).then(r => r.ok ? r.json() : null).catch(() => null))
      )
      const connected = new Set<string>()
      contexts.forEach((ctx, i) => { if (statusResults[i]?.isConnected) connected.add(ctx) })
      setWorkConnected(connected.size > 0)

      const sourcesToFetch = WORK_SOURCES.filter(s => connected.has(s.context))
      const results = await Promise.all(
        sourcesToFetch.map(src =>
          fetch(`/api/gmail/emails?context=${src.context}&label=${src.label}&maxResults=0&daysBack=30&autoAnalyze=false`)
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)
        )
      )
      const all: FullEmail[] = []
      for (let i = 0; i < sourcesToFetch.length; i++) {
        const data = results[i]
        if (!data?.emails) continue
        const src = sourcesToFetch[i]
        for (const e of data.emails) {
          all.push({
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
      all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      setWorkEmails(all)
    } catch { /* ignore */ }
  }, [])

  const fetchPersonal = useCallback(async () => {
    try {
      const statusRes = await fetch('/api/gmail/status?context=personal')
      if (!statusRes.ok) return
      const statusData = await statusRes.json()
      setPersonalConnected(statusData.isConnected)
      if (statusData.isConnected) {
        const emailRes = await fetch('/api/gmail/emails?context=personal&label=INBOX&maxResults=50&daysBack=30&autoAnalyze=false')
        if (emailRes.ok) {
          const emailData = await emailRes.json()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setPersonalEmails((emailData.emails || []).map((e: any) => ({
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
            sourceLabel: 'INBOX',
            gmailContext: 'personal',
          })))
        }
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchWork(); fetchPersonal() }, [fetchWork, fetchPersonal])

  const handleConnectPersonal = async () => {
    const res = await fetch('/api/gmail/auth?context=personal')
    if (res.ok) {
      const { authUrl } = await res.json()
      if (authUrl) window.location.href = authUrl
    }
  }
  const handleWorkSync = async () => { setWorkSyncing(true); try { await fetchWork() } finally { setWorkSyncing(false) } }
  const handlePersonalSync = async () => { setPersonalSyncing(true); try { await fetchPersonal() } finally { setPersonalSyncing(false) } }

  const handleReply = (email: FullEmail) => { setComposeMode('reply'); setComposeOriginal(email); setComposeContext(email.gmailContext || 'willow'); setComposeOpen(true) }
  const handleForward = (email: FullEmail) => { setComposeMode('forward'); setComposeOriginal(email); setComposeContext(email.gmailContext || 'willow'); setComposeOpen(true) }
  const handleComposeWork = () => { setComposeMode('new'); setComposeOriginal(null); setComposeContext('willow'); setComposeOpen(true) }
  const handleComposePersonal = () => { setComposeMode('new'); setComposeOriginal(null); setComposeContext('personal'); setComposeOpen(true) }

  const twoCols = mobile ? '1fr' : (cols === 1 ? '1fr' : '1fr 1fr')

  return (
    /* 문서함 NEW — 카드를 하나씩 새 문법으로 옮겨 보는 사본이다. 확정되면 /work 로 옮긴다.
       theme-outline 이 카드와 거기서 열리는 모달의 껍데기를 함께 덮는다(2026-09-11). */
    <div className="theme-outline">
      {/* 상단: 업무위키 + 법인서류함 · 하단: 회사 이메일 + 개인 이메일 (CEO 2026-09-10) */}
      <div style={{
        display: 'grid', gridTemplateColumns: twoCols,
        gap: t.density.blockGap, alignItems: 'start', marginBottom: t.density.blockGap,
      }}>
        <div style={{ minWidth: 0 }}>
          <WikiList
            notes={notes}
            loading={wikiLoading}
            onCreate={handleWikiCreate}
            onUpdate={handleWikiUpdate}
            onDelete={handleWikiDelete}
            detailMode="modal"
          />
        </div>
        <CorpDocsBlock company="willow" style={{ minWidth: 0 }} />
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: twoCols,
        gap: t.density.blockGap,
        alignItems: 'start',
      }}>
        <div style={{ minWidth: 0 }}>
          <EmailBlock
            eyebrow="WORK"
            title="회사 이메일"
            emails={workEmails}
            connected={workConnected}
            onSelectEmail={setSelectedEmail}
            onSync={handleWorkSync}
            onCompose={handleComposeWork}
            isSyncing={workSyncing}
          />
        </div>
        <div style={{ minWidth: 0 }}>
          <EmailBlock
            eyebrow="PERSONAL"
            title="개인 이메일"
            emails={personalEmails}
            connected={personalConnected}
            onSelectEmail={setSelectedEmail}
            onSync={handlePersonalSync}
            onCompose={handleComposePersonal}
            isSyncing={personalSyncing}
            onConnect={handleConnectPersonal}
          />
        </div>
      </div>

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
        gmailContext={composeOriginal?.gmailContext || composeContext}
        onClose={() => { setComposeOpen(false); setComposeOriginal(null) }}
        onSent={() => { fetchWork(); fetchPersonal() }}
      />
    </div>
  )
}
