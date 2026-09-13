'use client'

import { useState, useRef, useEffect } from 'react'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LSegmented } from '@/app/(dashboard)/_components/linear-segmented'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { LNotice } from '@/app/(dashboard)/_components/linear-notice'
import { DrawPad, type DrawPadHandle } from '@/app/(dashboard)/_components/linear-draw-pad'
import type { WikiSection } from './wiki-list'

/**
 * 손글씨 연습장 — 펜으로 갈겨 쓰고, 읽어서, 복사하거나 위키 노트로 남긴다.
 *
 * 키보드로 치기 전에 손으로 정리하는 자리다. 그래서 판이 먼저고 텍스트는 읽은 뒤에야
 * 나타난다. 읽어낸 글은 고쳐서 저장할 수 있게 편집 가능한 채로 둔다 — 비전 모델이
 * 한두 글자는 흘리고, 그걸 못 고치면 다시 쓰는 수밖에 없어진다.
 *
 * 펜 판은 영작연습이 쓰던 것과 같은 컴포넌트다(linear-draw-pad).
 */
export function ScratchpadDialog({ onClose, onSave }: {
  onClose: () => void
  onSave: (data: { section: WikiSection; title: string; content: string }) => Promise<void>
}) {
  const mobile = useIsMobile()
  const padRef = useRef<DrawPadHandle | null>(null)
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen')
  const [hasInk, setHasInk] = useState(false)
  const [text, setText] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const read = async () => {
    const imageBase64 = padRef.current?.getImage()
    if (!imageBase64) return
    setReading(true)
    setError(null)
    try {
      const res = await fetch('/api/handwriting/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || '읽지 못했어요')
      // 빈 결과는 오류가 아니라 "읽을 글씨가 없다"는 답이다.
      setText(data.text || '')
      if (!data.text) setError('읽을 글씨를 찾지 못했어요. 더 크게 써 보세요.')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setReading(false)
    }
  }

  const copy = async () => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setError('복사할 수 없는 브라우저예요. 글을 직접 선택해 주세요.')
    }
  }

  const save = async () => {
    if (!text?.trim()) return
    setSaving(true)
    setError(null)
    try {
      // 제목은 첫 줄에서 따고 본문은 통째로 남긴다 — 첫 줄을 본문에서 빼면
      // 제목을 고쳤을 때 원문이 사라진다.
      const firstLine = text.trim().split('\n')[0].trim()
      const title = firstLine.length > 40 ? `${firstLine.slice(0, 40)}…` : firstLine
      // 손글씨는 메모다 — 도메인 위키가 아니라 '메모' 구분으로 남긴다.
      await onSave({ section: 'memo', title: title || '손글씨 메모', content: text.trim() })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,15,18,0.18)', backdropFilter: 'blur(3px)' }} />
      <LCard pad={0} style={{
        position: 'relative', width: 'min(860px, calc(100vw - 24px))', maxHeight: 'min(90vh, 900px)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <button onClick={onClose} aria-label="닫기" style={{
          position: 'absolute', top: 10, right: 10, zIndex: 2,
          background: 'transparent', border: 'none', borderRadius: t.radius.sm, padding: t.density.gapXs,
          cursor: 'pointer', color: t.neutrals.muted, display: 'flex',
        }}>
          <LIcon name="x" size={14} stroke={2} />
        </button>

        <div style={{
          padding: t.density.cardPad, paddingBottom: t.density.blockGap,
          overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: t.density.blockGap,
        }}>
          {/* 도구 줄 — 판 바로 위. 제목과 같은 줄에 두면 펜을 쥔 손이 멀리 간다. */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: t.density.gapSm, flexWrap: 'wrap' }}>
            <span style={{ fontSize: `calc(${t.type.sectionTitle}px * var(--fz, 1))`, fontWeight: t.weight.semibold }}>
              연습장
            </span>
            <div style={{ display: 'flex', gap: t.density.gapSm, alignItems: 'center', flexWrap: 'wrap' }}>
              <LSegmented<'pen' | 'eraser'>
                value={tool}
                onChange={setTool}
                options={[{ value: 'pen', label: '펜' }, { value: 'eraser', label: '지우개' }]}
              />
              <LBtn size="sm" variant="secondary" onClick={() => { padRef.current?.undo(); setHasInk(!padRef.current?.isEmpty()) }}>
                한 획 취소
              </LBtn>
              <LBtn size="sm" variant="secondary" onClick={() => { padRef.current?.clear(); setHasInk(false) }}>
                전체 지우기
              </LBtn>
            </div>
          </div>

          <DrawPad
            ref={padRef}
            height={mobile ? 300 : 380}
            storageKey="work-scratchpad-h"
            tool={tool}
            onInkChange={setHasInk}
          />

          {error && <LNotice tone="warn" text={error} />}

          {text !== null && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.gapSm }}>
              <span style={{ fontSize: `calc(${t.type.label}px * var(--fz, 1))`, color: t.neutrals.subtle }}>
                읽은 글 · 고쳐서 저장할 수 있어요
              </span>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                rows={mobile ? 5 : 7}
                style={{
                  width: '100%', boxSizing: 'border-box', resize: 'vertical',
                  background: t.neutrals.inner, border: 'none', borderRadius: t.radius.md,
                  padding: `${t.density.gapMd}px ${t.density.gapLg}px`,
                  fontSize: `calc(${t.type.body}px * var(--fz, 1))`, lineHeight: 1.6,
                  fontFamily: t.font.sans, color: t.neutrals.text,
                }}
              />
            </div>
          )}
        </div>

        {/* 바닥 줄 — 읽기 전에는 읽기만, 읽은 뒤에 복사·저장이 붙는다 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: t.density.gapSm,
          padding: `${t.density.panelPadY}px ${t.density.cardPad}px ${t.density.cardPad}px`,
          borderTop: `1px solid ${t.neutrals.line}`, flexShrink: 0, flexWrap: 'wrap',
        }}>
          {text && (
            <>
              <LBtn size="sm" variant="secondary" onClick={copy}>
                {copied ? '복사됨' : '복사'}
              </LBtn>
              <LBtn size="sm" onClick={save} disabled={saving || !text.trim()}>
                {saving ? '저장 중…' : '노트로 저장'}
              </LBtn>
            </>
          )}
          <LBtn size="sm" variant="brand" onClick={read} disabled={!hasInk || reading}>
            {reading ? '읽는 중…' : text ? '다시 읽기' : '읽어오기'}
          </LBtn>
        </div>
      </LCard>
    </div>
  )
}
