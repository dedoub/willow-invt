'use client'

import { EmailBlock } from '@/app/(dashboard)/(linear)/mgmt/_components/email-block'
import { FullEmail } from '@/app/(dashboard)/(linear)/mgmt/_components/email-detail-dialog'

interface AkrosEmailBlockProps {
  emails: FullEmail[]
  connected: boolean
  onSelectEmail: (email: FullEmail) => void
  onSync: () => void
  onCompose: () => void
  isSyncing?: boolean
}

export function AkrosEmailBlock({ emails, connected, onSelectEmail, onSync, onCompose, isSyncing }: AkrosEmailBlockProps) {
  return (
    <EmailBlock
      emails={emails}
      connected={connected}
      onSelectEmail={onSelectEmail}
      onSync={onSync}
      onCompose={onCompose}
      isSyncing={isSyncing}
    />
  )
}
