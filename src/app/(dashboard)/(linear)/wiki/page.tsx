'use client'

import { useState, useEffect, useCallback } from 'react'
import { t } from '@/app/(dashboard)/_components/linear-tokens'
import { WikiSkeleton } from '@/app/(dashboard)/_components/linear-skeleton'
import { WikiList } from './_components/wiki-list'
import { WikiNote } from './_components/wiki-note-row'

type WikiSection = 'akros' | 'etf-etc' | 'willow-mgmt' | 'tensw-mgmt'

export default function WikiPage() {
  const [notes, setNotes] = useState<WikiNote[]>([])
  const [loading, setLoading] = useState(true)

  const loadNotes = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/wiki', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setNotes(Array.isArray(data) ? data : [])
      }
    } catch (e) {
      console.error('Failed to load wiki notes:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadNotes() }, [loadNotes])

  const handleCreate = async (data: { section: WikiSection; title: string; content: string; attachments?: unknown }) => {
    const res = await fetch('/api/wiki', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      await loadNotes()
    }
  }

  const handleUpdate = async (id: string, data: Partial<{ title: string; content: string; section: string; is_pinned: boolean; attachments: unknown }>) => {
    const res = await fetch(`/api/wiki/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      await loadNotes()
    }
  }

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/wiki/${id}`, { method: 'DELETE' })
    if (res.ok) {
      await loadNotes()
    }
  }

  return (
    <>
      <div style={{ padding: '20px 0 0' }}>
        <h1 style={{
          margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: -0.3,
          fontFamily: t.font.sans, color: t.neutrals.text,
        }}>업무위키</h1>
        <p style={{
          margin: '4px 0 16px', fontSize: 12, color: t.neutrals.muted,
          fontFamily: t.font.sans,
        }}>
          전사 업무 지식 베이스
        </p>
      </div>

      {loading ? <WikiSkeleton /> : (
        <WikiList
          notes={notes}
          loading={false}
          onCreate={handleCreate}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      )}
    </>
  )
}
