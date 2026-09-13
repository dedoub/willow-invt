'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { t } from './linear-tokens'
import { LIcon } from './linear-icons'

/**
 * 필기 도구 바 — 아이콘만, 위쪽 바 또는 띄우기.
 *
 * 스크립타의 주석 도구줄(features/practice/draggable-tools.tsx)에서 동작을 가져왔다.
 * 거기서 실제로 겪은 것들이 규칙이 됐다:
 *
 *  · 도구에 줄 하나를 통째로 내주면 정작 쓰는 자리가 그만큼 밀린다. 그래서 넓을 때는
 *    판 위에 띄우고, 가리면 손수 치우게 한다. 어디를 가릴지는 그때그때 달라서
 *    우리가 정할 일이 아니다.
 *  · 좁으면 띄우지 않는다. 알약이 두 줄로 접히며 글을 덮는데, 덮인 글은 치우기
 *    전엔 읽을 수가 없다. 그때는 줄 하나를 내주는 편이 낫다.
 *  · 끄는 자리와 누르는 자리를 갈라 둔다. 아무 데나 끌 수 있으면 단추를 누르려다
 *    끌리고, 끌려다 눌린다. 그래서 손잡이가 따로 있다.
 *  · 옮긴 자리는 판 크기에 대한 비율로 기억하고 판 안에 가둔다. 끝으로 끌어 손잡이가
 *    잘리면 되돌릴 길이 없다. 두 번 누르면 제자리로 돌아온다.
 */

export type ToolsPlace = { x: number; y: number } | null
type ToolsMode = 'float' | 'bar' | null

/** 이 폭 아래로는 띄우지 않고 바로 세운다. 아이콘 여섯에 손잡이까지 들어갈 폭. */
const DOCK_WIDTH = 360

const clamp = (v: number) => Math.min(1, Math.max(0, v))

function readPlace(key: string): ToolsPlace {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<{ x: number; y: number }>
    if (typeof v?.x !== 'number' || typeof v?.y !== 'number') return null
    return { x: clamp(v.x), y: clamp(v.y) }
  } catch { return null }
}

function readMode(key: string): ToolsMode {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(`${key}:mode`)
    return raw === 'float' || raw === 'bar' ? raw : null
  } catch { return null }
}

export function useDrawTools(storageKey: string) {
  const [place, setPlace] = useState<ToolsPlace>(null)
  const [mode, setMode] = useState<ToolsMode>(null)
  const [narrow, setNarrow] = useState(false)

  const boxRef = useRef<HTMLDivElement | null>(null)
  const toolsRef = useRef<HTMLDivElement | null>(null)
  const draggingRef = useRef(false)

  // 기기에 남긴 값은 붙은 뒤에 읽는다 — 서버 렌더와 첫 그림이 어긋나면 화면을 버린다.
  useEffect(() => {
    setPlace(readPlace(storageKey))
    setMode(readMode(storageKey))
  }, [storageKey])

  const save = useCallback((next: ToolsPlace) => {
    setPlace(next)
    try {
      if (next) window.localStorage.setItem(storageKey, JSON.stringify(next))
      else window.localStorage.removeItem(storageKey)
    } catch { /* 못 남겨도 이번 화면에서는 그대로 쓴다 */ }
  }, [storageKey])

  /** 도구 바가 판 안에 온전히 들어오는 자리로 접는다. 자리는 바의 한가운데를 가리킨다. */
  const confine = useCallback((next: { x: number; y: number }) => {
    const box = boxRef.current?.getBoundingClientRect()
    const tools = toolsRef.current?.getBoundingClientRect()
    if (!box || !tools || box.width === 0 || box.height === 0) return { x: clamp(next.x), y: clamp(next.y) }
    const halfX = Math.min(0.5, tools.width / 2 / box.width)
    const halfY = Math.min(0.5, tools.height / 2 / box.height)
    return {
      x: Math.min(1 - halfX, Math.max(halfX, clamp(next.x))),
      y: Math.min(1 - halfY, Math.max(halfY, clamp(next.y))),
    }
  }, [])

  const docked = mode ? mode === 'bar' : narrow

  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const measure = () => {
      const width = box.getBoundingClientRect().width
      setNarrow(width > 0 && width < DOCK_WIDTH)
      // 크기가 바뀌면 기억해 둔 자리도 다시 가둔다. 바로 서 있을 때는 건드리지 않는다 —
      // 그때 바는 판 폭을 다 쓰므로 가두면 한가운데로 끌려가 자리가 망가진다.
      if (!place || docked) return
      const next = confine(place)
      if (next.x !== place.x || next.y !== place.y) save(next)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    if (toolsRef.current) observer.observe(toolsRef.current)
    return () => observer.disconnect()
  }, [place, docked, confine, save])

  const moveTo = (e: { clientX: number; clientY: number }) => {
    const box = boxRef.current?.getBoundingClientRect()
    if (!box || box.width === 0 || box.height === 0) return
    save(confine({ x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height }))
  }

  const handleProps = {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      draggingRef.current = true
      e.currentTarget.setPointerCapture?.(e.pointerId)
      e.preventDefault()
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => { if (draggingRef.current) moveTo(e) },
    onPointerUp: () => { draggingRef.current = false },
    onPointerCancel: () => { draggingRef.current = false },
    /** 두 번 누르면 제자리로. 끌다 놓친 바를 되찾는 길이다. */
    onDoubleClick: () => save(null),
  }

  const toggleDock = useCallback(() => {
    // 지금 보이는 꼴의 반대로 간다 — 눌렀는데 그대로면 고장으로 보인다.
    const next: ToolsMode = docked ? 'float' : 'bar'
    setMode(next)
    try { window.localStorage.setItem(`${storageKey}:mode`, next) } catch { /* 무시 */ }
  }, [storageKey, docked])

  return { boxRef, toolsRef, place, docked, toggleDock, handleProps }
}

/** 아이콘 단추 하나. 28px 정사각(t.density.controlHSm), 손가락·펜에서는 커진다. */
function ToolButton({ icon, label, active, disabled, onClick, ...rest }: {
  icon: string
  label: string
  active?: boolean
  disabled?: boolean
  onClick?: () => void
} & React.ComponentProps<'button'>) {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onClick={onClick}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      style={{
        width: t.density.controlHSm, height: t.density.controlHSm,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: 'none', borderRadius: t.radius.sm, flexShrink: 0,
        background: active ? t.brand[600] : hover && !disabled ? t.neutrals.inner : 'transparent',
        color: active ? '#FFFFFF' : disabled ? t.neutrals.subtle : t.neutrals.muted,
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? 'default' : 'pointer',
        transition: 'background 120ms ease, color 120ms ease',
        touchAction: 'manipulation',
      }}
      {...rest}
    >
      <LIcon name={icon} size={14} stroke={1.8} color="currentColor" />
    </button>
  )
}

export interface DrawToolsProps {
  tool: 'pen' | 'eraser'
  onToolChange: (tool: 'pen' | 'eraser') => void
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
  canUndo: boolean
  canRedo: boolean
  docked: boolean
  onToggleDock: () => void
  place: ToolsPlace
  handleProps: React.ComponentProps<'button'>
}

/**
 * 도구 바 본체. 바로 설 때는 판 밖 위에, 띄울 때는 판 위에 겹쳐 선다.
 * 어디에 넣을지는 부모가 정한다 — 이 컴포넌트는 제 꼴만 안다.
 */
export const DrawTools = function DrawTools({
  tool, onToolChange, onUndo, onRedo, onClear, canUndo, canRedo,
  docked, onToggleDock, place, handleProps,
  toolsRef,
}: DrawToolsProps & { toolsRef: React.RefObject<HTMLDivElement | null> }) {
  const floating: React.CSSProperties = docked ? {} : {
    position: 'absolute', zIndex: 20,
    ...(place
      ? { left: `${place.x * 100}%`, top: `${place.y * 100}%`, transform: 'translate(-50%, -50%)' }
      // 처음 자리는 오른쪽 위 — 쓰는 손이 오른쪽에서 올라오므로 왼쪽 위보다 덜 가린다.
      : { right: t.density.gapSm, top: t.density.gapSm }),
    background: 'rgba(255,255,255,0.92)',
    backdropFilter: 'blur(3px)',
    border: `1px solid ${t.neutrals.line}`,
    width: 'max-content', maxWidth: 'calc(100% - 16px)',
  }

  return (
    <div
      ref={toolsRef}
      style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap',
        gap: t.density.gapXs, padding: t.density.tableRowGap,
        borderRadius: t.radius.md,
        ...(docked
          ? { width: '100%', background: t.neutrals.inner, marginBottom: t.density.gapSm }
          : floating),
      }}
    >
      {/* 바로 서 있으면 끌 일이 없다 — 흐름에 든 줄은 옮길 자리가 없다. */}
      {!docked && (
        <button
          type="button"
          aria-label="도구 바 옮기기"
          title="끌어서 옮기기 · 두 번 누르면 제자리"
          {...handleProps}
          style={{
            width: 16, height: t.density.controlHSm, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', background: 'transparent', color: t.neutrals.subtle,
            cursor: 'grab', touchAction: 'none',
          }}
        >
          <LIcon name="grip" size={14} stroke={1.8} color="currentColor" />
        </button>
      )}

      <ToolButton
        icon={docked ? 'floatTools' : 'dockTop'}
        label={docked ? '띄우기' : '위쪽 바로'}
        onClick={onToggleDock}
      />

      <span style={{ width: 1, height: 16, background: t.neutrals.line, flexShrink: 0, margin: `0 ${t.density.gapXs}px` }} />

      <ToolButton icon="pencil" label="펜" active={tool === 'pen'} onClick={() => onToolChange('pen')} />
      <ToolButton icon="eraser" label="지우개" active={tool === 'eraser'} onClick={() => onToolChange('eraser')} />
      <ToolButton icon="undo" label="한 획 취소" disabled={!canUndo} onClick={onUndo} />
      <ToolButton icon="redo" label="다시" disabled={!canRedo} onClick={onRedo} />
      {/* 지우개 그림은 지우개 도구의 것이다 — 전체 지우기는 휴지통. */}
      <ToolButton icon="trash" label="전체 지우기" disabled={!canUndo} onClick={onClear} />
    </div>
  )
}
