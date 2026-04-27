'use client'

import { WikiList } from '@/app/(dashboard)/(linear)/wiki/_components/wiki-list'
import { WikiNote } from '@/app/(dashboard)/(linear)/wiki/_components/wiki-note-row'

type WikiSection = 'akros' | 'etf-etc' | 'willow-mgmt' | 'tensw-mgmt'

interface EtcWikiBlockProps {
  notes: WikiNote[]
  loading: boolean
  onCreate: (data: { section: 'etf-etc'; title: string; content: string; attachments?: unknown }) => Promise<void>
  onUpdate: (id: string, data: Partial<{ title: string; content: string; section: string; is_pinned: boolean; attachments: unknown }>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function EtcWikiBlock({ notes, loading, onCreate, onUpdate, onDelete }: EtcWikiBlockProps) {
  const etcNotes = notes.filter(n => n.section === 'etf-etc')

  const handleCreate = async (data: { section: WikiSection; title: string; content: string; attachments?: unknown }) => {
    await onCreate({ ...data, section: 'etf-etc' })
  }

  return (
    <WikiList
      notes={etcNotes}
      loading={loading}
      onCreate={handleCreate}
      onUpdate={onUpdate}
      onDelete={onDelete}
      hideFilter
    />
  )
}
