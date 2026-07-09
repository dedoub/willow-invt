'use client'

import { WikiList } from '@/app/(dashboard)/(linear)/wiki/_components/wiki-list'
import { WikiNote } from '@/app/(dashboard)/(linear)/wiki/_components/wiki-note-row'

type WikiSection = 'memo' | 'akros' | 'etf-etc' | 'willow-mgmt' | 'tensw-mgmt' | 'invest-mgmt'

interface AkrosWikiBlockProps {
  notes: WikiNote[]
  loading: boolean
  onCreate: (data: { section: 'akros'; title: string; content: string; attachments?: unknown }) => Promise<void>
  onUpdate: (id: string, data: Partial<{ title: string; content: string; section: string; is_pinned: boolean; attachments: unknown }>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  // 2열 배치(좁은 1/3 칼럼)에서만 임베드(부모 높이 채움). 단일열에선 미전달 → 일반 동작.
  embedded?: boolean
}

export function AkrosWikiBlock({ notes, loading, onCreate, onUpdate, onDelete, embedded }: AkrosWikiBlockProps) {
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
      embedded={embedded}
    />
  )
}
