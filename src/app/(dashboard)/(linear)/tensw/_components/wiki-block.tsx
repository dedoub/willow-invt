'use client'

import { WikiList } from '@/app/(dashboard)/(linear)/wiki/_components/wiki-list'
import { WikiNote } from '@/app/(dashboard)/(linear)/wiki/_components/wiki-note-row'

type WikiSection = 'akros' | 'etf-etc' | 'willow-mgmt' | 'tensw-mgmt'

interface TenswWikiBlockProps {
  notes: WikiNote[]
  loading: boolean
  onCreate: (data: { section: 'tensw-mgmt'; title: string; content: string; attachments?: unknown }) => Promise<void>
  onUpdate: (id: string, data: Partial<{ title: string; content: string; section: string; is_pinned: boolean; attachments: unknown }>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function TenswWikiBlock({ notes, loading, onCreate, onUpdate, onDelete }: TenswWikiBlockProps) {
  const tenswNotes = notes.filter(n => n.section === 'tensw-mgmt')

  const handleCreate = async (data: { section: WikiSection; title: string; content: string; attachments?: unknown }) => {
    await onCreate({ ...data, section: 'tensw-mgmt' })
  }

  return (
    <WikiList
      notes={tenswNotes}
      loading={loading}
      onCreate={handleCreate}
      onUpdate={onUpdate}
      onDelete={onDelete}
      hideFilter
    />
  )
}
