'use client'

import { WikiList } from '@/app/(dashboard)/(linear)/wiki/_components/wiki-list'
import { WikiNote } from '@/app/(dashboard)/(linear)/wiki/_components/wiki-note-row'

type WikiSection = 'memo' | 'akros' | 'etf-etc' | 'willow-mgmt' | 'tensw-mgmt' | 'invest-mgmt'

interface TenswWikiBlockProps {
  notes: WikiNote[]
  loading: boolean
  onCreate: (data: { section: 'tensw-mgmt'; title: string; content: string; attachments?: unknown }) => Promise<void>
  onUpdate: (id: string, data: Partial<{ title: string; content: string; section: string; is_pinned: boolean; attachments: unknown }>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  // 이메일과 나란히 놓일 때만 부모 높이를 채운다. 목록+상세 2단 레이아웃은 그대로다
  // (아크로스가 쓰는 embedded와 달리 1단으로 접지 않는다).
  fillHeight?: boolean
}

export function TenswWikiBlock({ notes, loading, onCreate, onUpdate, onDelete, fillHeight }: TenswWikiBlockProps) {
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
      fillHeight={fillHeight}
    />
  )
}
