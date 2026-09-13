'use client'

import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react'
import { t } from '@/app/(dashboard)/_components/linear-tokens'

// ─── 손글씨 패드 (펜슬/터치) ─────────────────────────────────────────────
// 류하가 영문 키보드 대신 펜슬로 답을 쓴다. 획 단위 undo, 전체 clear,
// 채점 시 흰 배경 PNG(base64)로 내보내 Gemini 비전이 전사+채점한다.

export interface DrawPadHandle {
  /** 흰 배경 PNG base64 (data: 프리픽스 제외). 빈 패드면 null */
  getImage: () => string | null
  clear: () => void
  undo: () => void
  isEmpty: () => boolean
}

type Stroke = { x: number; y: number }[]

const DEFAULT_PAD_H_KEY = 'english-pad-h'
const PAD_H_MIN = 160
const PAD_H_MAX = 1200

export const DrawPad = forwardRef<DrawPadHandle, {
  disabled?: boolean
  height: number
  storageKey?: string
  /** pen: 그리기, eraser: 스친 획을 통째로 지우는 개체 지우개 */
  tool?: 'pen' | 'eraser'
  onInkChange?: (hasInk: boolean) => void
}>(function DrawPad({ disabled, height, storageKey = DEFAULT_PAD_H_KEY, tool = 'pen', onInkChange }, ref) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const strokesRef = useRef<Stroke[]>([])
  const drawingRef = useRef(false)
  // 높이 — 긴 답(작문)을 쓸 수 있게 드래그로 조절, 기기별 localStorage 기억
  const [padH, setPadH] = useState<number>(() => {
    if (typeof window === 'undefined') return height
    const v = Number(localStorage.getItem(storageKey))
    return v >= PAD_H_MIN && v <= PAD_H_MAX ? v : height
  })
  const gripStart = useRef<{ y: number; h: number } | null>(null)

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = t.neutrals.text
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const stroke of strokesRef.current) {
      if (stroke.length < 2) continue
      ctx.beginPath()
      ctx.moveTo(stroke[0].x, stroke[0].y)
      for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x, stroke[i].y)
      ctx.stroke()
    }
  }, [])

  // 캔버스 실측 크기 세팅 (dpr 반영) — 리사이즈 시 기존 획 유지한 채 재도장
  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const size = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = wrap.clientWidth * dpr
      canvas.height = padH * dpr
      canvas.style.width = '100%'
      canvas.style.height = `${padH}px`
      redraw()
    }
    size()
    const ro = new ResizeObserver(size)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [padH, redraw])

  useImperativeHandle(ref, () => ({
    getImage: () => {
      const canvas = canvasRef.current
      if (!canvas || strokesRef.current.length === 0) return null
      // 흰 배경 합성 — 투명 PNG는 모델이 읽기 어렵다
      const out = document.createElement('canvas')
      out.width = canvas.width
      out.height = canvas.height
      const ctx = out.getContext('2d')!
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, out.width, out.height)
      ctx.drawImage(canvas, 0, 0)
      return out.toDataURL('image/png').split(',')[1]
    },
    clear: () => { strokesRef.current = []; redraw(); onInkChange?.(false) },
    undo: () => {
      strokesRef.current.pop()
      redraw()
      onInkChange?.(strokesRef.current.length > 0)
    },
    isEmpty: () => strokesRef.current.length === 0,
  }), [redraw, onInkChange])

  const pointFrom = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  // 개체 지우개 — 커서 반경 안에 점이 있는 획을 통째로 제거
  const eraseAt = (p: { x: number; y: number }) => {
    const R = 12
    const before = strokesRef.current.length
    strokesRef.current = strokesRef.current.filter(
      stroke => !stroke.some(q => (q.x - p.x) ** 2 + (q.y - p.y) ** 2 <= R * R),
    )
    if (strokesRef.current.length !== before) {
      redraw()
      onInkChange?.(strokesRef.current.length > 0)
    }
  }

  return (
    <div
      ref={wrapRef}
      style={{
        borderRadius: t.radius.md, overflow: 'hidden',
        background: t.neutrals.inner,
        // 공책 줄 — 아이가 baseline에 맞춰 쓰도록
        backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent 56px, ${t.neutrals.line} 56px, ${t.neutrals.line} 57px)`,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', touchAction: 'none', cursor: disabled ? 'default' : 'crosshair' }}
        onPointerDown={(e) => {
          if (disabled) return
          e.currentTarget.setPointerCapture(e.pointerId)
          drawingRef.current = true
          if (tool === 'eraser') { eraseAt(pointFrom(e)); return }
          strokesRef.current.push([pointFrom(e)])
        }}
        onPointerMove={(e) => {
          if (!drawingRef.current || disabled) return
          if (tool === 'eraser') { eraseAt(pointFrom(e)); return }
          const stroke = strokesRef.current[strokesRef.current.length - 1]
          stroke.push(pointFrom(e))
          redraw()
        }}
        onPointerUp={() => {
          if (!drawingRef.current) return
          drawingRef.current = false
          onInkChange?.(strokesRef.current.length > 0)
        }}
        onPointerCancel={() => { drawingRef.current = false }}
      />
      {/* 높이 조절 그립 — 드래그로 160~1200px, 기기별 기억 */}
      <div
        title="드래그해서 높이 조절"
        style={{
          height: 18, display: 'grid', placeItems: 'center', cursor: 'ns-resize',
          touchAction: 'none', borderTop: `1px solid ${t.neutrals.line}`, background: t.neutrals.card,
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          gripStart.current = { y: e.clientY, h: padH }
        }}
        onPointerMove={(e) => {
          if (!gripStart.current) return
          const next = Math.max(PAD_H_MIN, Math.min(PAD_H_MAX, Math.round(gripStart.current.h + e.clientY - gripStart.current.y)))
          setPadH(next)
          try { localStorage.setItem(storageKey, String(next)) } catch { /* noop */ }
        }}
        onPointerUp={() => { gripStart.current = null }}
        onPointerCancel={() => { gripStart.current = null }}
      >
        <span style={{ width: 38, height: 4, borderRadius: t.radius.pill, background: t.neutrals.line }} />
      </div>
    </div>
  )
})
