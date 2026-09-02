'use client'

import { useState, useEffect, type ReactNode, type CSSProperties } from 'react'
import { t } from './linear-tokens'
import { navGroup, type NavItem } from './linear-nav'
import { LIcon } from './linear-icons'
import { useAuth, useIsAdmin } from '@/lib/auth-context'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// 저장된 id 순서로 정렬. 저장에 없는 신규 항목은 뒤에 붙이고, 사라진 id는 무시.
function orderItems(items: NavItem[], order: string[]): NavItem[] {
  const byId = new Map(items.map(c => [c.id, c]))
  const seen = new Set<string>()
  const out: NavItem[] = []
  for (const id of order) {
    const c = byId.get(id)
    if (c && !seen.has(id)) { out.push(c); seen.add(id) }
  }
  for (const c of items) if (!seen.has(c.id)) out.push(c)
  return out
}

const GROUP_LABEL_STYLE: CSSProperties = {
  fontSize: 'calc(10px * var(--fz, 1))', fontWeight: 600, letterSpacing: 0.8,
  textTransform: 'uppercase' as const, color: t.sidebar.subtle,
  padding: '12px 8px 4px',
}

// 섹션 머리글. onToggle이 있으면 통째로 누를 수 있는 접기 버튼이 된다.
// 쉐브론은 아래(펼침)를 기본으로 두고 접히면 왼쪽으로 눕는다 — 목록이 그 아래
// 있다가 사라지는 방향과 같아야 어디로 접히는지 읽힌다.
function GroupLabel({ label, collapsed, onToggle }: {
  label: string
  collapsed?: boolean
  onToggle?: () => void
}) {
  if (!onToggle) return <div style={GROUP_LABEL_STYLE}>{label}</div>
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      title={collapsed ? `${label} 펼치기` : `${label} 접기`}
      style={{
        ...GROUP_LABEL_STYLE,
        display: 'flex', alignItems: 'center', gap: 4, width: '100%',
        background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        fontFamily: 'inherit',
      }}
    >
      <span style={{
        display: 'inline-flex', flexShrink: 0,
        transform: collapsed ? 'rotate(-90deg)' : 'none',
        transition: 'transform 0.12s ease',
      }}>
        <LIcon name="chevronDown" size={11} stroke={2.2} />
      </span>
      {label}
    </button>
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
/**
 * 서비스 표식. 색점 하나로는 여덟 서비스가 서로 구분되지 않아, 로고가 있으면
 * 그 실루엣을, 없으면 이름 첫 글자를 찍는다.
 *
 * 로고는 파일을 그대로 얹지 않고 마스크로 칠한다. 아크로스 마크는 진회색이라
 * 네이비 위에서 사라지고 텐소 마크만 흰색이라, 원본 색을 쓰면 둘이 따로 논다.
 * 실루엣만 빌려 한 가지 색으로 통일한다 — 로고는 제 형태로 읽히는 것이 먼저다.
 * 다만 그 색을 여기서 정하지는 않는다. NavRow 가 행 상태로 정한 currentColor 를
 * 물려받아, 일반 아이콘과 똑같이 쉴 때 muted(72%), hover·active 에서 text(100%)
 * 가 된다. 흰색을 박아두면 로고 달린 행만 늘 순백이라, 쉬는 줄에서 그 여섯만
 * 도드라진다. 글자 표식도 같은 규칙을 따른다.
 */
function ServiceMark({ mark, label, size }: {
  mark?: string; label: string; size: number
}) {
  if (mark) {
    return (
      <span
        aria-hidden
        style={{
          width: size, height: size, flexShrink: 0, background: 'currentColor',
          WebkitMaskImage: `url(${mark})`, maskImage: `url(${mark})`,
          // 로고 실루엣은 캔버스를 꽉 채우지만 Lucide 아이콘은 24 그리드 안에 여백이
          // 있어, 같은 박스에 contain 으로 얹으면 로고만 한 치수 커 보인다. 75%로
          // 줄여 시각 크기를 맞춘다(아이콘 경로가 24 그리드의 3~21을 쓴다). 박스는 그대로라 행 높이·정렬은 안 바뀐다.
          WebkitMaskSize: '75%', maskSize: '75%',
          WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center', maskPosition: 'center',
        }}
      />
    )
  }
  // 한글 이름은 첫 글자가 알파벳이 아니다(텐소프트웍스·아크로스). 라벨에서 첫
  // 알파벳을 찾고, 없으면 태그에서 — 그것도 없으면 라벨 첫 글자를 그대로 쓴다.
  const letter = (label.match(/[A-Za-z]/)?.[0] ?? label.trim().charAt(0)).toUpperCase()
  return (
    <span
      aria-hidden
      style={{
        width: size, height: size, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: t.font.mono, fontSize: `calc(${Math.round(size * 0.72)}px * var(--fz, 1))`,
        fontWeight: t.weight.medium, lineHeight: 1, letterSpacing: 0,
      }}
    >
      {letter}
    </span>
  )
}

function NavRow({ href, icon, label, dot, mark, tag, isActive, rail, onClose }: {
  href?: string; icon?: string; label: string; dot?: string; mark?: string; tag?: string
  isActive: boolean; rail: boolean; onClose?: () => void
}) {
  const [hover, setHover] = useState(false)
  const bg = isActive ? t.sidebar.active : hover ? t.sidebar.hover : 'transparent'
  const color = isActive || hover ? t.sidebar.text : t.sidebar.muted
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
          <span style={{ position: 'absolute', left: 0, top: 7, bottom: 7, width: 3, borderRadius: 3, background: t.sidebar.accent }} />
        )}
        {icon ? (
          <LIcon name={icon} size={rail ? 18 : 14} stroke={1.8} />
        ) : dot ? (
          <ServiceMark mark={mark} label={label} size={rail ? 18 : 14} />
        ) : null}
        {!rail && <span style={{ flex: tag ? 1 : undefined }}>{label}</span>}
        {!rail && tag && (
          <span style={{ fontFamily: t.font.mono, fontSize: 'calc(10px * var(--fz, 1))', color: isActive ? t.sidebar.accent : t.sidebar.subtle }}>{tag}</span>
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
        background: h ? t.sidebar.hover : 'none', border: 'none', cursor: 'pointer',
        padding: 4, borderRadius: 5, flexShrink: 0, display: 'inline-flex', alignItems: 'center',
        color: h ? t.sidebar.text : t.sidebar.subtle, transition: 'background .12s ease, color .12s ease',
      }}
    >
      {children}
    </button>
  )
}

// 드래그로 순서 변경 가능한 행 (확장 모드 전용). distance:8 활성화라 짧은 탭은 클릭(내비) 유지.
function SortableRow({ c, isActive, onClose }: { c: NavItem; isActive: boolean; onClose?: () => void }) {
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
      <NavRow href={c.href} dot={c.dot} mark={c.mark} label={c.label} tag={c.tag}
        isActive={isActive} rail={false} onClose={onClose} />
    </div>
  )
}

// 접어 둔 섹션 (localStorage 영속, 기기별). 기본은 전부 펼침 — 처음 보는 사람에게
// 메뉴가 숨어 있으면 안 된다. 사이드바 열림 상태와 같은 방식으로 첫 렌더에서 바로
// 읽는다: useEffect 로 미루면 접어 둔 섹션이 한 번 펼쳐졌다 접히는 게 보인다.
const COLLAPSED_GROUPS_KEY = 'sidebar-collapsed-groups'

function useCollapsedGroups() {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const raw = localStorage.getItem(COLLAPSED_GROUPS_KEY)
      const arr = raw ? JSON.parse(raw) : null
      return Array.isArray(arr) ? new Set<string>(arr) : new Set<string>()
    } catch { return new Set() }
  })

  const toggle = (key: string) => setCollapsed(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    try { localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify([...next])) } catch { /* 저장 실패 무시 */ }
    return next
  })

  return { collapsed, toggle }
}

// 그룹 하나의 드래그 정렬 상태 (localStorage 영속) — 앱서비스/관계회사/컨설팅이 각각 사용
function useOrderedGroup(items: NavItem[], storageKey: string) {
  const [order, setOrder] = useState<string[]>(() => items.map(c => c.id))
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr)) setOrder(arr) }
    } catch { /* 파싱 실패 시 기본 순서 유지 */ }
  }, [storageKey])
  const ordered = orderItems(items, order)
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const ids = ordered.map(c => c.id)
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    const next = arrayMove(ids, from, to)
    setOrder(next)
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* 저장 실패 무시 */ }
  }
  return { ordered, onDragEnd }
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
  const navLink = (n: NavItem) => (
    <NavRow key={n.id} href={n.href} icon={n.icon} label={n.label}
      isActive={isActiveHref(n.href)} rail={rail} onClose={onClose} />
  )

  // 앱서비스/관계회사/컨설팅 메뉴 순서 — 드래그로 변경, localStorage에 저장(기기별)
  const willow = navGroup('willow')
  const admin = navGroup('admin')
  const appsFinance = navGroup('apps-finance')
  const appsEdu = navGroup('apps-edu')
  const investees = navGroup('investees')
  const clients = navGroup('clients')
  const inquiries = navGroup('inquiries')
  // 섹션 접기 — rail(아이콘 전용)에서는 머리글이 없으므로 접기도 없다.
  const { collapsed: collapsedGroups, toggle: toggleGroup } = useCollapsedGroups()
  const isFolded = (key: string) => !rail && collapsedGroups.has(key)
  const groupHead = (key: string, label: string) => (
    <GroupLabel label={label} collapsed={collapsedGroups.has(key)} onToggle={() => toggleGroup(key)} />
  )

  const appsFinanceOrder = useOrderedGroup(appsFinance.items, appsFinance.orderKey!)
  const appsEduOrder = useOrderedGroup(appsEdu.items, appsEdu.orderKey!)
  const investeesOrder = useOrderedGroup(investees.items, investees.orderKey!)
  const clientsOrder = useOrderedGroup(clients.items, clients.orderKey!)
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  // 그룹 렌더 — rail(접힘)에서는 드래그 없이 아이콘만
  const sortableGroup = (key: string, label: string, group: ReturnType<typeof useOrderedGroup>) => (
    <>
      {!rail && groupHead(key, label)}
      {rail && <div style={{ height: 1, background: t.sidebar.line, margin: '8px 6px' }} />}
      {rail ? (
        group.ordered.map(c => (
          <NavRow key={c.id} href={c.href} dot={c.dot} mark={c.mark} label={c.label} tag={c.tag}
            isActive={isActiveHref(c.href)} rail={rail} onClose={onClose} />
        ))
      ) : isFolded(key) ? null : (
        <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={group.onDragEnd}>
          <SortableContext items={group.ordered.map(c => c.id)} strategy={verticalListSortingStrategy}>
            {group.ordered.map(c => (
              <SortableRow key={c.id} c={c}
                isActive={isActiveHref(c.href)} onClose={onClose} />
            ))}
          </SortableContext>
        </DndContext>
      )}
    </>
  )

  const sidebar = (
    <aside id="app-sidebar" style={{
      width: rail ? 56 : mobile ? 'min(85vw, 320px)' : 232, background: t.sidebar.bg,
      display: 'flex', flexDirection: 'column', flexShrink: 0,
      fontFamily: t.font.sans,
      height: mobile ? '100vh' : undefined,
      transition: animate ? 'width 0.15s ease' : 'none',
    }}>
      {/* Logo */}
      <div style={{
        height: t.density.headerH, padding: rail ? '0' : `0 ${t.density.cardPad}px`, display: 'flex', alignItems: 'center',
        justifyContent: rail ? 'center' : (mobile ? 'space-between' : undefined),
        borderBottom: `1px solid ${t.sidebar.line}`,
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
        {!rail && groupHead(willow.key, willow.label)}
        {!isFolded(willow.key) && willow.items.map(navLink)}

        {/* 앱서비스 통합관리 — 네 앱을 가로지르는 화면이라 앱 그룹들 앞에 선다. 관리자만. */}
        {isAdmin && (
          <>
            {!rail && groupHead(inquiries.key, inquiries.label)}
            {rail && <div style={{ height: 1, background: t.sidebar.line, margin: '8px 6px' }} />}
            {!isFolded(inquiries.key) && inquiries.items.map(navLink)}
          </>
        )}

        {sortableGroup(appsFinance.key, appsFinance.label, appsFinanceOrder)}
        {sortableGroup(appsEdu.key, appsEdu.label, appsEduOrder)}
        {sortableGroup(investees.key, investees.label, investeesOrder)}
        {sortableGroup(clients.key, clients.label, clientsOrder)}

        {isAdmin && (
          <>
            {!rail && groupHead(admin.key, admin.label)}
            {rail && <div style={{ height: 1, background: t.sidebar.line, margin: '8px 6px' }} />}
            {!isFolded(admin.key) && admin.items.map(navLink)}
          </>
        )}
      </nav>

      {/* User */}
      {user && (
        <div style={{
          padding: rail ? '10px 0' : '10px 12px', borderTop: `1px solid ${t.sidebar.line}`,
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
                <div style={{ fontSize: 'calc(12.5px * var(--fz, 1))', fontWeight: t.weight.medium, color: t.sidebar.text }}>{user.name}</div>
                <div style={{
                  fontSize: 'calc(10.5px * var(--fz, 1))', color: t.sidebar.subtle,
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
