'use client'

import { useState, useEffect, type ReactNode, type CSSProperties } from 'react'
import { t } from './linear-tokens'
import { LIcon } from './linear-icons'
import { useAuth, useIsAdmin } from '@/lib/auth-context'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const NAV_ITEMS = [
  { key: 'mgmt',       href: '/mgmt',       label: '사업관리',    icon: 'briefcase' },
  { key: 'email',      href: '/email',      label: '이메일',      icon: 'mail' },
  { key: 'wiki',       href: '/wiki',       label: '업무위키',    icon: 'book' },
  { key: 'invest',     href: '/invest',     label: '주식투자',     icon: 'trending' },
  { key: 'realestate', href: '/realestate', label: '부동산',      icon: 'building' },
  { key: 'ryuha',      href: '/ryuha',      label: '류하일정',    icon: 'calendar' },
]

const CLIENTS = [
  { id: 'monor', name: 'MonoR Apps',    tag: 'Education', dot: '#2F8F5B' },
  { id: 'tensw', name: '텐소프트웍스',  tag: 'Data & AI', dot: '#B88A2A' },
  { id: 'akros', name: '아크로스',      tag: 'Indexing',  dot: '#3F93C6' },
  { id: 'etc',   name: 'ETC',           tag: 'ETF Platform', dot: '#1F4E79' },
  { id: 'valuechain', name: 'LLM Wiki', tag: 'Experiment', dot: '#7C5CD6' },
]

const CLIENT_HREF: Record<string, string | undefined> = {
  akros: '/akros', etc: '/etc', tensw: '/tensw', monor: '/monor', valuechain: '/valuechain',
}

type Client = (typeof CLIENTS)[number]

// 프로젝트 메뉴 순서 — 사용자가 드래그로 바꾼 순서를 localStorage에 저장(기기별).
const PROJECT_ORDER_KEY = 'sidebar-project-order'

// 저장된 id 순서로 CLIENTS 정렬. 저장에 없는 신규 항목은 뒤에 붙이고, 사라진 id는 무시.
function orderClients(order: string[]): Client[] {
  const byId = new Map(CLIENTS.map(c => [c.id, c]))
  const seen = new Set<string>()
  const out: Client[] = []
  for (const id of order) {
    const c = byId.get(id)
    if (c && !seen.has(id)) { out.push(c); seen.add(id) }
  }
  for (const c of CLIENTS) if (!seen.has(c.id)) out.push(c)
  return out
}

const ADMIN_ITEMS = [
  { key: 'users', href: '/admin/users', label: '사용자 관리', icon: 'user' },
]

function GroupLabel({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: 'calc(10px * var(--fz, 1))', fontWeight: 600, letterSpacing: 0.8,
      textTransform: 'uppercase' as const, color: t.neutrals.subtle,
      padding: '12px 8px 4px',
    }}>{label}</div>
  )
}

// 접힌 rail에서 아이콘 호버 시 오른쪽에 뜨는 커스텀 툴팁
function RailTip({ label, sub, enabled, children }: {
  label: string; sub?: string; enabled: boolean; children: ReactNode
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  if (!enabled) return <>{children}</>
  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={e => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
        setPos({ top: r.top + r.height / 2, left: r.right + 10 })
      }}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos && (
        <div style={{
          position: 'fixed', top: pos.top, left: pos.left,
          transform: 'translateY(-50%)',
          display: 'flex', alignItems: 'center', gap: 6,
          background: t.brand[800], color: '#fff',
          padding: '5px 9px', borderRadius: 7,
          fontSize: 'calc(11.5px * var(--fz, 1))', fontWeight: t.weight.medium,
          whiteSpace: 'nowrap', zIndex: 200, pointerEvents: 'none',
          fontFamily: t.font.sans, letterSpacing: -0.1,
          boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
        }}>
          {/* 좌측 화살표 */}
          <span style={{
            position: 'absolute', left: -4, top: '50%', transform: 'translateY(-50%) rotate(45deg)',
            width: 8, height: 8, background: t.brand[800], borderRadius: 1,
          }} />
          <span>{label}</span>
          {sub && (
            <span style={{
              fontFamily: t.font.mono, fontSize: 'calc(9.5px * var(--fz, 1))',
              color: t.brand[200], fontWeight: t.weight.regular,
            }}>{sub}</span>
          )}
        </div>
      )}
    </div>
  )
}

// 사이드바 행(메뉴/프로젝트 공용) — hover/active 상태 + 활성 좌측 액센트 바.
// 모듈 레벨 컴포넌트라 hover 상태가 부모 리렌더에도 안정적으로 유지됨.
function NavRow({ href, icon, label, dot, tag, isActive, rail, onClose }: {
  href?: string; icon?: string; label: string; dot?: string; tag?: string
  isActive: boolean; rail: boolean; onClose?: () => void
}) {
  const [hover, setHover] = useState(false)
  const bg = isActive ? t.brand[600] + '14' : hover ? t.neutrals.inner : 'transparent'
  const color = isActive ? t.brand[700] : hover ? t.neutrals.text : t.neutrals.muted
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Wrapper: any = href ? Link : 'div'
  return (
    <RailTip label={label} sub={tag} enabled={rail}>
      <Wrapper
        {...(href ? { href, onClick: onClose } : {})}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          position: 'relative', width: '100%', display: 'flex', alignItems: 'center',
          justifyContent: rail ? 'center' : undefined, gap: 10,
          padding: rail ? '8px 0' : '7px 10px',
          background: bg, color, fontWeight: isActive ? t.weight.medium : t.weight.regular,
          fontSize: 'calc(13px * var(--fz, 1))', borderRadius: 6, textDecoration: 'none',
          marginBottom: 1, letterSpacing: -0.1, cursor: href ? 'pointer' : 'default',
          transition: 'background .12s ease, color .12s ease',
        }}
      >
        {isActive && !rail && (
          <span style={{ position: 'absolute', left: 0, top: 7, bottom: 7, width: 3, borderRadius: 3, background: t.brand[600] }} />
        )}
        {icon ? (
          <LIcon name={icon} size={rail ? 18 : 14} stroke={1.8} />
        ) : dot ? (
          <span style={{ width: rail ? 9 : 7, height: rail ? 9 : 7, borderRadius: 2, background: dot, flexShrink: 0 }} />
        ) : null}
        {!rail && <span style={{ flex: tag ? 1 : undefined }}>{label}</span>}
        {!rail && tag && (
          <span style={{ fontFamily: t.font.mono, fontSize: 'calc(10px * var(--fz, 1))', color: isActive ? t.brand[600] : t.neutrals.subtle }}>{tag}</span>
        )}
      </Wrapper>
    </RailTip>
  )
}

// hover 피드백이 있는 고스트 아이콘 버튼 (로그아웃 등)
function GhostIconBtn({ onClick, title, children }: { onClick?: () => void; title: string; children: ReactNode }) {
  const [h, setH] = useState(false)
  return (
    <button
      onClick={onClick} title={title} aria-label={title}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        background: h ? t.neutrals.inner : 'none', border: 'none', cursor: 'pointer',
        padding: 4, borderRadius: 5, flexShrink: 0, display: 'inline-flex', alignItems: 'center',
        color: h ? t.neutrals.text : t.neutrals.subtle, transition: 'background .12s ease, color .12s ease',
      }}
    >
      {children}
    </button>
  )
}

// 드래그로 순서 변경 가능한 프로젝트 행 (확장 모드 전용). distance:8 활성화라 짧은 탭은 클릭(내비) 유지.
function SortableClient({ c, isActive, onClose }: { c: Client; isActive: boolean; onClose?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: c.id })
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
    touchAction: 'none',
    position: 'relative',
    zIndex: isDragging ? 20 : undefined,
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <NavRow href={CLIENT_HREF[c.id]} dot={c.dot} label={c.name} tag={c.tag}
        isActive={isActive} rail={false} onClose={onClose} />
    </div>
  )
}

interface LinearSidebarProps {
  mobile?: boolean
  open?: boolean
  onClose?: () => void
  collapsed?: boolean
  animate?: boolean
}

export function LinearSidebar({ mobile, open, onClose, collapsed = false, animate = false }: LinearSidebarProps) {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const isAdmin = useIsAdmin()

  // 접힌 상태(아이콘 전용 rail)는 데스크톱에서만 사용
  const rail = collapsed && !mobile

  const isActiveHref = (href?: string) => !!href && (pathname === href || pathname.startsWith(href + '/'))
  const navLink = (n: { key: string; href: string; label: string; icon: string }) => (
    <NavRow key={n.key} href={n.href} icon={n.icon} label={n.label}
      isActive={isActiveHref(n.href)} rail={rail} onClose={onClose} />
  )

  // 프로젝트 메뉴 순서 — 드래그로 변경, localStorage에 저장(기기별)
  const [projectOrder, setProjectOrder] = useState<string[]>(() => CLIENTS.map(c => c.id))
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROJECT_ORDER_KEY)
      if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr)) setProjectOrder(arr) }
    } catch { /* 파싱 실패 시 기본 순서 유지 */ }
  }, [])
  const orderedClients = orderClients(projectOrder)
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const handleProjectDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const ids = orderedClients.map(c => c.id)
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    const next = arrayMove(ids, from, to)
    setProjectOrder(next)
    try { localStorage.setItem(PROJECT_ORDER_KEY, JSON.stringify(next)) } catch { /* 저장 실패 무시 */ }
  }

  const sidebar = (
    <aside style={{
      width: rail ? 56 : mobile ? 'min(85vw, 320px)' : 232, background: t.neutrals.page,
      borderRight: mobile ? 'none' : `1px solid ${t.neutrals.line}`,
      display: 'flex', flexDirection: 'column', flexShrink: 0,
      fontFamily: t.font.sans,
      height: mobile ? '100vh' : undefined,
      transition: animate ? 'width 0.15s ease' : 'none',
    }}>
      {/* Logo */}
      <div style={{
        height: 52, padding: rail ? '0' : '0 14px', display: 'flex', alignItems: 'center',
        justifyContent: rail ? 'center' : (mobile ? 'space-between' : undefined),
        background: t.brand[800],
      }}>
        {rail ? (
          <img src="/leaf-icon.png" alt="willowinvt" style={{ height: 16, width: 16, objectFit: 'contain' }} />
        ) : (
          <img src="/willow-text.png" alt="willowinvt" style={{ height: mobile ? 15 : 16.5 }} />
        )}
        {mobile && !rail && (
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 4,
            color: t.brand[200],
          }}>
            <LIcon name="x" size={16} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '4px 8px', overflowY: 'auto', overflowX: 'hidden' }}>
        {!rail && <GroupLabel label="윌로우인베스트먼트" />}
        {NAV_ITEMS.map(navLink)}

        {!rail && <GroupLabel label="프로젝트" />}
        {rail && <div style={{ height: 1, background: t.neutrals.line, margin: '8px 6px' }} />}
        {rail ? (
          orderedClients.map(c => (
            <NavRow key={c.id} href={CLIENT_HREF[c.id]} dot={c.dot} label={c.name} tag={c.tag}
              isActive={isActiveHref(CLIENT_HREF[c.id])} rail={rail} onClose={onClose} />
          ))
        ) : (
          <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleProjectDragEnd}>
            <SortableContext items={orderedClients.map(c => c.id)} strategy={verticalListSortingStrategy}>
              {orderedClients.map(c => (
                <SortableClient key={c.id} c={c}
                  isActive={isActiveHref(CLIENT_HREF[c.id])} onClose={onClose} />
              ))}
            </SortableContext>
          </DndContext>
        )}

        {isAdmin && (
          <>
            {!rail && <GroupLabel label="관리자" />}
            {rail && <div style={{ height: 1, background: t.neutrals.line, margin: '8px 6px' }} />}
            {ADMIN_ITEMS.map(navLink)}
          </>
        )}
      </nav>

      {/* User */}
      {user && (
        <div style={{
          padding: rail ? '10px 0' : '10px 12px', borderTop: `1px solid ${t.neutrals.line}`,
          display: 'flex', alignItems: 'center',
          justifyContent: rail ? 'center' : undefined, gap: 10,
        }}>
          <RailTip label={user.name} sub={user.email} enabled={rail}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 28, flexShrink: 0,
              background: t.brand[200], color: t.brand[800],
              fontSize: 'calc(11px * var(--fz, 1))', fontWeight: t.weight.semibold,
            }}>{user.name.slice(0, 2).toUpperCase()}</span>
          </RailTip>
          {!rail && (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'calc(12.5px * var(--fz, 1))', fontWeight: t.weight.medium, color: t.neutrals.text }}>{user.name}</div>
                <div style={{
                  fontSize: 'calc(10.5px * var(--fz, 1))', color: t.neutrals.subtle,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{user.email}</div>
              </div>
              <GhostIconBtn onClick={logout} title="로그아웃">
                <LIcon name="logOut" size={14} stroke={1.8} />
              </GhostIconBtn>
            </>
          )}
        </div>
      )}
    </aside>
  )

  // Desktop: render inline
  if (!mobile) return sidebar

  // Mobile: overlay
  if (!open) return null
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.35)',
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{ width: 'fit-content', height: '100%' }}>
        {sidebar}
      </div>
    </div>
  )
}
