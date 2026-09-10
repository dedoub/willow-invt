'use client'

import { useState, useEffect, useRef } from 'react'
import { t } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead, LHeadBtn } from '@/app/(dashboard)/_components/linear-section-head'
import { RyuhaDailyMemo } from '@/types/ryuha'

interface DailyMemoProps {
  memos: RyuhaDailyMemo[]
  selectedDate: string
  onSave: (date: string, content: string) => Promise<void>
}

export function DailyMemo({ memos, selectedDate, onSave }: DailyMemoProps) {
  const memo = memos.find(m => m.memo_date === selectedDate)
  const [content, setContent] = useState(memo?.content || '')
  const [saving, setSaving] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSaved = useRef(memo?.content || '')

  useEffect(() => {
    const c = memo?.content || ''
    setContent(c)
    lastSaved.current = c
  }, [selectedDate, memo?.content])

  const save = async (text: string) => {
    if (text === lastSaved.current) return
    setSaving(true)
    try {
      await onSave(selectedDate, text)
      lastSaved.current = text
    } finally {
      setSaving(false)
    }
  }

  const handleChange = (val: string) => {
    setContent(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => save(val), 1500)
  }

  const handleBlur = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    save(content)
  }

  const dateParts = selectedDate.split('-')
  const dateLabel = `${parseInt(dateParts[1])}월 ${parseInt(dateParts[2])}일`

  return (
    <LCard>
      <LSectionHead eyebrow="MEMO" title={`${dateLabel} 메모`} action={
        saving ? (
          <span style={{ fontSize: `calc(${t.type.control}px * var(--fz, 1))`, color: t.neutrals.subtle, fontFamily: t.font.mono }}>저장중...</span>
        ) : content !== lastSaved.current ? (
          <LHeadBtn label="저장" title="메모 저장" onClick={() => save(content)} />
        ) : null
      } />
      <textarea
        value={content}
        onChange={e => handleChange(e.target.value)}
        onBlur={handleBlur}
        placeholder="메모를 작성하세요..."
        rows={3}
        style={{
          width: '100%', padding: `${t.density.panelPadY}px ${t.density.panelPadX}px`, borderRadius: t.radius.sm,
          border: 'none', background: t.neutrals.inner,
          fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, fontFamily: t.font.sans, color: t.neutrals.text,
          resize: 'vertical', outline: 'none', lineHeight: 1.5,
        }}
      />
    </LCard>
  )
}
