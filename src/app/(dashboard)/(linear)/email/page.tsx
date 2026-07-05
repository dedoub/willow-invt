'use client'

import { useState, useEffect, useCallback } from 'react'
import { EmailBlock } from '@/app/(dashboard)/(linear)/mgmt/_components/email-block'
import { EmailDetailDialog, FullEmail } from '@/app/(dashboard)/(linear)/mgmt/_components/email-detail-dialog'
import { ComposeEmailDialog } from '@/app/(dashboard)/(linear)/mgmt/_components/compose-email-dialog'

type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward'

// 회사(업무) 이메일 소스 — 사업관리 페이지와 동일 정의
const WORK_SOURCES = [
  { context: 'willow',       label: 'WILLOW', sourceLabel: 'WILLOW' },
  { context: 'tensoftworks', label: 'TENSW',  sourceLabel: 'TENSW' },
  { context: 'default',      label: 'ETC',    sourceLabel: 'ETC' },
  { context: 'default',      label: 'Akros',  sourceLabel: 'Akros' },
] as const

export default function EmailPage() {
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

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
    </>
  )
}
