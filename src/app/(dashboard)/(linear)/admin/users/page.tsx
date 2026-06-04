'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth, useIsAdmin } from '@/lib/auth-context'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'

interface UserData {
  id: string
  email: string
  name: string
  role: string
  is_active: boolean
  created_at: string
  last_login_at: string | null
}

interface PageInfo {
  path: string
  section: string
  name: string
}

const ROLE_META: Record<string, { label: string; bg: string; fg: string }> = {
  admin:  { label: '관리자', bg: '#A78BFA22', fg: '#7C3AED' },
  editor: { label: '편집자', bg: '#3B82F622', fg: '#1D4ED8' },
  viewer: { label: '뷰어',   bg: '#94A3B822', fg: '#475569' },
}

const SECTION_LABEL: Record<string, string> = {
  willowInvest:  '윌로우인베스트먼트',
  etfIndexing:   'ETF/Index',
  tenSoftworks:  '텐소프트웍스',
  monoRApps:     'MonoR Apps',
  others:        '기타',
}

function formatRelative(dateString: string | null): string {
  if (!dateString) return '-'
  const date = new Date(dateString)
  const diffMs = Date.now() - date.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return '방금'
  if (mins < 60) return `${mins}분 전`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}일 전`
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

export default function UsersPage() {
  const router = useRouter()
  const { user: currentUser } = useAuth()
  const isAdmin = useIsAdmin()
  const mobile = useIsMobile()

  const [users, setUsers] = useState<UserData[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [editingRole, setEditingRole] = useState<string | null>(null)

  const [permUser, setPermUser] = useState<UserData | null>(null)
  const [availablePages, setAvailablePages] = useState<PageInfo[]>([])
  const [userPerms, setUserPerms] = useState<string[]>([])
  const [savingPerms, setSavingPerms] = useState(false)

  useEffect(() => {
    if (!isAdmin && !loading) router.push('/')
  }, [isAdmin, loading, router])

  const loadUsers = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/admin/users')
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  const loadPages = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/permissions')
      if (res.ok) {
        const data = await res.json()
        setAvailablePages(data.pages)
      }
    } catch (err) {
      console.error(err)
    }
  }, [])

  useEffect(() => {
    if (isAdmin) {
      loadUsers()
      loadPages()
    }
  }, [isAdmin, loadUsers, loadPages])

  const openPerms = async (u: UserData) => {
    setPermUser(u)
    try {
      const res = await fetch(`/api/admin/permissions?userId=${u.id}`)
      if (res.ok) {
        const data = await res.json()
        setUserPerms(data.permissions || [])
      }
    } catch {
      setUserPerms([])
    }
  }

  const togglePerm = (path: string) => {
    setUserPerms(prev => prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path])
  }

  const toggleAllPerms = () => {
    setUserPerms(userPerms.length === availablePages.length ? [] : availablePages.map(p => p.path))
  }

  const savePerms = async () => {
    if (!permUser) return
    setSavingPerms(true)
    try {
      const res = await fetch('/api/admin/permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: permUser.id, permissions: userPerms }),
      })
      if (res.ok) setPermUser(null)
    } finally {
      setSavingPerms(false)
    }
  }

  const handleRole = async (userId: string, role: string) => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role }),
      })
      if (res.ok) await loadUsers()
    } finally {
      setEditingRole(null)
    }
  }

  const handleToggleActive = async (userId: string, isActive: boolean) => {
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, is_active: !isActive }),
    })
    if (res.ok) await loadUsers()
  }

  const handleDelete = async (u: UserData) => {
    if (!confirm(`정말 ${u.name}님을 삭제하시겠습니까?`)) return
    const res = await fetch(`/api/admin/users?userId=${u.id}`, { method: 'DELETE' })
    if (res.ok) await loadUsers()
  }

  if (!isAdmin) return null

  const totalUsers = users.length
  const activeUsers = users.filter(u => u.is_active).length
  const inactiveUsers = totalUsers - activeUsers
  const adminUsers = users.filter(u => u.role === 'admin').length

  const pagesBySection = availablePages.reduce<Record<string, PageInfo[]>>((acc, p) => {
    if (!acc[p.section]) acc[p.section] = []
    acc[p.section].push(p)
    return acc
  }, {})

  const iconBtn = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    width: 24, height: 24, borderRadius: t.radius.sm,
    background: t.neutrals.inner, border: 'none', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    color: t.neutrals.muted,
    ...extra,
  })

  return (
    <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <LCard pad={0}>
        <div style={{ padding: t.density.cardPad, paddingBottom: 12 }}>
          <LSectionHead
            eyebrow="ADMIN"
            title="사용자 관리"
            action={
              <button
                onClick={loadUsers}
                disabled={refreshing}
                style={{ ...iconBtn({ width: 28, height: 28, opacity: refreshing ? 0.5 : 1 }) }}
                title="새로고침"
              >
                <LIcon name="refresh" size={13} stroke={1.8} />
              </button>
            }
          />

          <div style={{
            display: 'grid',
            gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
            gap: 8,
          }}>
            <LStat label="전체"   value={totalUsers.toLocaleString()} sub="사용자" />
            <LStat label="활성"   value={activeUsers.toLocaleString()} sub={totalUsers > 0 ? `${Math.round(activeUsers / totalUsers * 100)}%` : '0%'} tone="pos" />
            <LStat label="비활성" value={inactiveUsers.toLocaleString()} sub={totalUsers > 0 ? `${Math.round(inactiveUsers / totalUsers * 100)}%` : '0%'} tone={inactiveUsers > 0 ? 'warn' : 'default'} />
            <LStat label="관리자" value={adminUsers.toLocaleString()} sub="role=admin" tone="info" />
          </div>
        </div>

        <div style={{ padding: `12px ${t.density.cardPad}px ${t.density.cardPad}px` }}>
          <div style={{
            fontSize: 'calc(11px * var(--fz, 1))', fontWeight: 600, color: t.neutrals.subtle,
            fontFamily: t.font.mono, letterSpacing: 0.3,
            textTransform: 'uppercase', marginBottom: 10,
          }}>
            사용자
          </div>

          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 'calc(12px * var(--fz, 1))', color: t.neutrals.muted }}>로딩 중…</div>
          ) : users.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 'calc(12px * var(--fz, 1))', color: t.neutrals.muted }}>사용자가 없습니다</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {users.map(u => {
                const isMe = u.id === currentUser?.id
                const role = ROLE_META[u.role] ?? { label: u.role, bg: '#94A3B822', fg: '#475569' }
                return (
                  <div key={u.id} style={{
                    padding: '8px 10px', borderRadius: t.radius.sm,
                    background: t.neutrals.inner,
                    display: 'flex', alignItems: 'center', gap: 10,
                    minWidth: 0,
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 28, flexShrink: 0,
                      background: t.brand[200], color: t.brand[800],
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 'calc(11px * var(--fz, 1))', fontWeight: 600,
                    }}>{(u.name?.[0] || '?').toUpperCase()}</div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 'calc(12.5px * var(--fz, 1))', fontWeight: 500, color: t.neutrals.text,
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{u.name}</span>
                        {isMe && <span style={{ fontSize: 'calc(9.5px * var(--fz, 1))', color: t.neutrals.muted, fontFamily: t.font.mono }}>(나)</span>}
                      </div>
                      <div style={{
                        fontSize: 'calc(10.5px * var(--fz, 1))', color: t.neutrals.muted,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{u.email}</div>
                    </div>

                    {editingRole === u.id ? (
                      <select
                        value={u.role}
                        onChange={(e) => handleRole(u.id, e.target.value)}
                        onBlur={() => setEditingRole(null)}
                        autoFocus
                        style={{
                          fontSize: 'calc(11px * var(--fz, 1))', padding: '2px 4px', borderRadius: t.radius.sm,
                          background: t.neutrals.card, color: t.neutrals.text,
                          border: 'none', flexShrink: 0,
                        }}
                      >
                        <option value="admin">관리자</option>
                        <option value="editor">편집자</option>
                        <option value="viewer">뷰어</option>
                      </select>
                    ) : (
                      <button
                        onClick={() => !isMe && setEditingRole(u.id)}
                        disabled={isMe}
                        style={{
                          fontSize: 'calc(10px * var(--fz, 1))', fontWeight: 500, fontFamily: t.font.sans,
                          padding: '2px 8px', borderRadius: 999,
                          background: role.bg, color: role.fg,
                          border: 'none', cursor: isMe ? 'default' : 'pointer',
                          flexShrink: 0,
                        }}
                      >{role.label}</button>
                    )}

                    <button
                      onClick={() => !isMe && handleToggleActive(u.id, u.is_active)}
                      disabled={isMe}
                      style={{
                        fontSize: 'calc(10px * var(--fz, 1))', fontWeight: 500, fontFamily: t.font.sans,
                        padding: '2px 8px', borderRadius: 999, border: 'none',
                        background: u.is_active ? '#10B98122' : '#EF444422',
                        color: u.is_active ? '#059669' : '#DC2626',
                        cursor: isMe ? 'default' : 'pointer',
                        opacity: isMe ? 0.6 : 1,
                        flexShrink: 0,
                      }}
                    >{u.is_active ? '활성' : '비활성'}</button>

                    {!mobile && (
                      <span style={{
                        fontSize: 'calc(10.5px * var(--fz, 1))', color: t.neutrals.muted, fontFamily: t.font.mono,
                        flexShrink: 0, minWidth: 56, textAlign: 'right',
                      }}>{formatRelative(u.last_login_at)}</span>
                    )}

                    <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                      {u.role !== 'admin' && (
                        <button onClick={() => openPerms(u)} style={iconBtn()} title="권한 설정">
                          <LIcon name="settings" size={12} stroke={1.8} />
                        </button>
                      )}
                      {!isMe && (
                        <button
                          onClick={() => handleDelete(u)}
                          style={iconBtn({ color: '#DC2626' })}
                          title="삭제"
                        >
                          <LIcon name="trash" size={12} stroke={1.8} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </LCard>

      {permUser && (
        <div
          onClick={() => setPermUser(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: t.neutrals.card, borderRadius: t.radius.md,
              padding: 20, width: '100%', maxWidth: 420,
              maxHeight: '85vh', display: 'flex', flexDirection: 'column', gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <div style={{
                  fontSize: 'calc(10px * var(--fz, 1))', fontWeight: 600, color: t.neutrals.subtle,
                  fontFamily: t.font.mono, letterSpacing: 0.8, textTransform: 'uppercase',
                  marginBottom: 4,
                }}>PERMISSIONS</div>
                <div style={{ fontSize: 'calc(14px * var(--fz, 1))', fontWeight: 600, color: t.neutrals.text }}>{permUser.name}</div>
                <div style={{ fontSize: 'calc(11px * var(--fz, 1))', color: t.neutrals.muted }}>{permUser.email}</div>
              </div>
              <button
                onClick={() => setPermUser(null)}
                style={iconBtn({ width: 28, height: 28 })}
                title="닫기"
              >
                <LIcon name="x" size={13} stroke={1.8} />
              </button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 8px', borderRadius: t.radius.sm,
                background: t.neutrals.inner, cursor: 'pointer',
                fontSize: 'calc(12px * var(--fz, 1))', fontWeight: 500, color: t.neutrals.text,
              }}>
                <input
                  type="checkbox"
                  checked={availablePages.length > 0 && userPerms.length === availablePages.length}
                  onChange={toggleAllPerms}
                />
                전체 페이지 선택
              </label>

              {Object.entries(pagesBySection).map(([section, pages]) => (
                <div key={section}>
                  <div style={{
                    fontSize: 'calc(9.5px * var(--fz, 1))', fontWeight: 600, color: t.neutrals.subtle,
                    fontFamily: t.font.mono, letterSpacing: 0.8, textTransform: 'uppercase',
                    marginBottom: 4,
                  }}>{SECTION_LABEL[section] ?? section}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 6 }}>
                    {pages.map(p => (
                      <label key={p.path} style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '4px 6px', borderRadius: t.radius.sm, cursor: 'pointer',
                        fontSize: 'calc(12px * var(--fz, 1))', color: t.neutrals.text,
                      }}>
                        <input
                          type="checkbox"
                          checked={userPerms.includes(p.path)}
                          onChange={() => togglePerm(p.path)}
                        />
                        <span style={{ flex: 1 }}>{p.name}</span>
                        <span style={{ fontFamily: t.font.mono, fontSize: 'calc(10px * var(--fz, 1))', color: t.neutrals.muted }}>{p.path}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
              <button
                onClick={() => setPermUser(null)}
                style={{
                  padding: '6px 12px', fontSize: 'calc(12px * var(--fz, 1))', fontWeight: 500,
                  background: t.neutrals.inner, color: t.neutrals.muted,
                  border: 'none', borderRadius: t.radius.sm, cursor: 'pointer',
                }}
              >취소</button>
              <button
                onClick={savePerms}
                disabled={savingPerms}
                style={{
                  padding: '6px 12px', fontSize: 'calc(12px * var(--fz, 1))', fontWeight: 500,
                  background: t.brand[600], color: '#fff',
                  border: 'none', borderRadius: t.radius.sm, cursor: 'pointer',
                  opacity: savingPerms ? 0.6 : 1,
                }}
              >{savingPerms ? '저장 중…' : '저장'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
