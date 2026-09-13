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
  /** 되돌린 획을 되살린다. 되살릴 게 없으면 아무 일도 하지 않는다. */
  redo: () => void
  isEmpty: () => boolean
  canRedo: () => boolean
}

/**
 * 손바닥 무시 — 이 판이 펜을 본 적 있으면 그 뒤로 손가락은 받지 않는다.
 *
 * 펜을 쥔 손은 판에 얹히기 마련이고, 그 접촉이 획이 되면 글씨 위에 손바닥 자국이 남는다.
 * 펜이 없는 기기는 아무것도 달라지지 않는다 — 본 적이 없으니 막을 이유가 없다.
 * 마우스는 손가락이 아니라서 막지 않는다.
 */
export function acceptsPointer(pointerType: string, sawPen: boolean): boolean {
  if (pointerType === 'pen') return true
  return !(sawPen && pointerType === 'touch')
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
  // 되돌린 획. 새로 그리면 버린다 — 갈라진 역사를 들고 있으면 다시하기가
  // 엉뚱한 획을 되살린다(스크립타 주석 도구와 같은 규칙).
  const undoneRef = useRef<Stroke[]>([])
  /**
   * 이 판에서 펜을 본 적이 있나. 손바닥 무시의 전부다.
   *
   * 한 번이라도 펜이 닿았으면 그 뒤로 손가락은 무시한다 — 펜을 쥔 손은 판에 얹히기
   * 마련이고, 그 접촉이 획이 되면 글씨 위에 손바닥 자국이 남는다.
   * 펜이 없는 기기에서는 아무것도 달라지지 않는다. 본 적이 없으니 막을 이유가 없다.
   * 기기에 남기지 않는다 — 펜을 쓰는 사람은 어차피 첫 획에서 바로 잡힌다.
   * 마우스는 손가락이 아니다. 막지 않는다.
   */
  const sawPenRef = useRef(false)
  /** 지금 그리는 획을 시작한 포인터 종류. 손바닥이 먼저 닿은 획을 되돌리는 데 쓴다. */
  const activeTypeRef = useRef<string | null>(null)
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
    clear: () => { strokesRef.current = []; undoneRef.current = []; redraw(); onInkChange?.(false) },
    undo: () => {
      const removed = strokesRef.current.pop()
      if (removed) undoneRef.current.push(removed)
      redraw()
      onInkChange?.(strokesRef.current.length > 0)
    },
    redo: () => {
      const restored = undoneRef.current.pop()
      if (!restored) return
      strokesRef.current.push(restored)
      redraw()
      onInkChange?.(strokesRef.current.length > 0)
    },
    isEmpty: () => strokesRef.current.length === 0,
    canRedo: () => undoneRef.current.length > 0,
  }), [redraw, onInkChange])

  const pointFrom = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  /** 펜을 본 적 있는 판에서 온 손가락이면 참. 그 접촉은 없던 일로 친다. */
  const isRejectedTouch = (e: React.PointerEvent) => {
    if (e.pointerType === 'pen') {
      // 처음 펜을 본 순간, 손바닥이 먼저 찍어 둔 획이 있으면 지운다. 펜을 대기 직전에
      // 손이 먼저 닿는 것이 보통이라, 안 지우면 첫 글씨 옆에 점 하나가 남는다.
      if (!sawPenRef.current && drawingRef.current && activeTypeRef.current === 'touch') {
        strokesRef.current.pop()
        drawingRef.current = false
        redraw()
      }
      sawPenRef.current = true
      return false
    }
    return !acceptsPointer(e.pointerType, sawPenRef.current)
  }

  // 개체 지우개 — 커서 반경 안에 점이 있는 획을 통째로 제거
  const eraseAt = (p: { x: number; y: number }) => {
    const R = 12
    const before = strokesRef.current.length
    strokesRef.current = strokesRef.current.filter(
      stroke => !stroke.some(q => (q.x - p.x) ** 2 + (q.y - p.y) ** 2 <= R * R),
    )
    if (strokesRef.current.length !== before) {
      undoneRef.current = []
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
          if (disabled || isRejectedTouch(e)) return
          e.currentTarget.setPointerCapture(e.pointerId)
          drawingRef.current = true
          activeTypeRef.current = e.pointerType
          if (tool === 'eraser') { eraseAt(pointFrom(e)); return }
          undoneRef.current = []
          strokesRef.current.push([pointFrom(e)])
        }}
        onPointerMove={(e) => {
          if (!drawingRef.current || disabled || isRejectedTouch(e)) return
          if (tool === 'eraser') { eraseAt(pointFrom(e)); return }
          const stroke = strokesRef.current[strokesRef.current.length - 1]
          stroke.push(pointFrom(e))
          redraw()
        }}
        onPointerUp={(e) => {
          // 무시하기로 한 손가락이 떨어지는 것으로 펜 획을 끊지 않는다.
          if (!drawingRef.current || isRejectedTouch(e)) return
          drawingRef.current = false
          activeTypeRef.current = null
          onInkChange?.(strokesRef.current.length > 0)
        }}
        onPointerCancel={(e) => {
          if (isRejectedTouch(e)) return
          drawingRef.current = false
          activeTypeRef.current = null
        }}
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
