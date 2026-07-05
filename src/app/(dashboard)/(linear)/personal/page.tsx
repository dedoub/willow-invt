'use client'

import { useState, useEffect, useCallback } from 'react'
import { EmailBlock } from '@/app/(dashboard)/(linear)/mgmt/_components/email-block'
import { EmailDetailDialog, FullEmail } from '@/app/(dashboard)/(linear)/mgmt/_components/email-detail-dialog'
import { ComposeEmailDialog } from '@/app/(dashboard)/(linear)/mgmt/_components/compose-email-dialog'

type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward'

export default function PersonalPage() {
  const [emails, setEmails] = useState<FullEmail[]>([])
  const [emailConnected, setEmailConnected] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [selectedEmail, setSelectedEmail] = useState<FullEmail | null>(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeMode, setComposeMode] = useState<ComposeMode>('new')
  const [composeOriginal, setComposeOriginal] = useState<FullEmail | null>(null)

  const fetchEmails = useCallback(async () => {
    try {
      const statusRes = await fetch('/api/gmail/status?context=personal')
      if (!statusRes.ok) return
      const statusData = await statusRes.json()
      setEmailConnected(statusData.isConnected)
      if (statusData.isConnected) {
        const emailRes = await fetch('/api/gmail/emails?context=personal&label=INBOX&maxResults=50&daysBack=30&autoAnalyze=false')
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
            sourceLabel: 'INBOX',
            gmailContext: 'personal',
          })))
        }
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchEmails() }, [fetchEmails])

  const handleConnect = () => { window.location.href = '/api/gmail/auth?context=personal' }
  const handleSyncEmails = async () => {
    setIsSyncing(true)
    try { await fetchEmails() } finally { setIsSyncing(false) }
  }
  const handleReply = (email: FullEmail) => { setComposeMode('reply'); setComposeOriginal(email); setComposeOpen(true) }
  const handleForward = (email: FullEmail) => { setComposeMode('forward'); setComposeOriginal(email); setComposeOpen(true) }
  const handleCompose = () => { setComposeMode('new'); setComposeOriginal(null); setComposeOpen(true) }

  return (
    <>
      <div style={{ maxWidth: 720 }}>
        <EmailBlock
          emails={emails}
          connected={emailConnected}
          onSelectEmail={setSelectedEmail}
          onSync={handleSyncEmails}
          onCompose={handleCompose}
          isSyncing={isSyncing}
          onConnect={handleConnect}
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
        gmailContext={composeOriginal?.gmailContext || 'personal'}
        onClose={() => { setComposeOpen(false); setComposeOriginal(null) }}
        onSent={() => { fetchEmails() }}
      />
    </>
  )
}
