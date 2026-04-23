'use client'

import { WikiList } from '@/app/willow-investment/(linear)/wiki/_components/wiki-list'
import { WikiNote } from '@/app/willow-investment/(linear)/wiki/_components/wiki-note-row'

type WikiSection = 'akros' | 'etf-etc' | 'willow-mgmt' | 'tensw-mgmt'

interface AkrosWikiBlockProps {
  notes: WikiNote[]
  loading: boolean
  onCreate: (data: { section: 'akros'; title: string; content: string; attachments?: unknown }) => Promise<void>
  onUpdate: (id: string, data: Partial<{ title: string; content: string; section: string; is_pinned: boolean; attachments: unknown }>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function AkrosWikiBlock({ notes, loading, onCreate, onUpdate, onDelete }: AkrosWikiBlockProps) {
  const akrosNotes = notes.filter(n => n.section === 'akros')

  const handleCreate = async (data: { section: WikiSection; title: string; content: string; attachments?: unknown }) => {
    await onCreate({ ...data, section: 'akros' })
  }

  return (
    <WikiList
      notes={akrosNotes}
      loading={loading}
      onCreate={handleCreate}
      onUpdate={onUpdate}
      onDelete={onDelete}
      hideFilter
    />
  )
}
