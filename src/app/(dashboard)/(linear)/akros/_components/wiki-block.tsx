'use client'

import { WikiList } from '@/app/(dashboard)/(linear)/work/_components/wiki-list'
import { WikiNote } from '@/app/(dashboard)/(linear)/wiki/_components/wiki-note-row'

type WikiSection = 'memo' | 'akros' | 'etf-etc' | 'willow-mgmt' | 'tensw-mgmt' | 'invest-mgmt'

interface AkrosWikiBlockProps {
  notes: WikiNote[]
  loading: boolean
  onCreate: (data: { section: 'akros'; title: string; content: string; attachments?: unknown }) => Promise<void>
  onUpdate: (id: string, data: Partial<{ title: string; content: string; section: string; is_pinned: boolean; attachments: unknown }>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  // 옆 카드와 나란히 설 때만 부모 높이를 채운다.
  fillHeight?: boolean
}

export function AkrosWikiBlock({ notes, loading, onCreate, onUpdate, onDelete, fillHeight }: AkrosWikiBlockProps) {
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
      fillHeight={fillHeight}
      // 이메일·이슈와 1/2씩 나누는 자리라 2단(목록+상세)이 들어가지 않는다.
      // 목록은 표로 두고 상세는 모달로 간다 — 텐소프트웍스와 같다(CEO 2026-09-15).
      detailMode="modal"
    />
  )
}
