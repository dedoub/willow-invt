'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/lib/i18n'
import { useAuth, useIsAdmin } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'
import {
  Users,
  UserCheck,
  UserX,
  Shield,
  Pencil,
  Trash2,
  RefreshCw,
  ChevronDown,
} from 'lucide-react'

interface UserData {
  id: string
  email: string
  name: string
  role: string
  is_active: boolean
  created_at: string
  last_login_at: string | null
}

function formatDate(dateString: string | null, locale: string) {
  if (!dateString) return '-'
  const date = new Date(dateString)
  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatRelativeDate(dateString: string | null, t: ReturnType<typeof useI18n>['t'], locale: string) {
  if (!dateString) return '-'
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return t.time.justNow
  if (diffMins < 60) return t.time.minutesAgo.replace('{minutes}', String(diffMins))
  if (diffHours < 24) return t.time.hoursAgo.replace('{hours}', String(diffHours))
  if (diffDays < 7) return t.time.daysAgo.replace('{days}', String(diffDays))
  return date.toLocaleDateString(locale)
}

export default function UsersPage() {
  const { t, language } = useI18n()
  const locale = language === 'ko' ? 'ko-KR' : 'en-US'
  const { user: currentUser } = useAuth()
  const isAdmin = useIsAdmin()
  const router = useRouter()

  const [users, setUsers] = useState<UserData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingUser, setEditingUser] = useState<UserData | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Redirect non-admin users
  useEffect(() => {
    if (!isAdmin && !isLoading) {
      router.push('/')
    }
  }, [isAdmin, isLoading, router])

  const loadUsers = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/admin/users')
      if (response.ok) {
        const data = await response.json()
        setUsers(data.users)
      }
    } catch (error) {
      console.error('Failed to load users:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isAdmin) {
      loadUsers()
    }
  }, [isAdmin])

  // Stats
  const totalUsers = users.length
  const activeUsers = users.filter(u => u.is_active).length
  const adminUsers = users.filter(u => u.role === 'admin').length
  const editorUsers = users.filter(u => u.role === 'editor').length
  const viewerUsers = users.filter(u => u.role === 'viewer').length

  const handleRoleChange = async (userId: string, newRole: string) => {
    setIsSaving(true)
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: newRole }),
      })
      if (response.ok) {
        await loadUsers()
      }
    } catch (error) {
      console.error('Failed to update role:', error)
    } finally {
      setIsSaving(false)
      setEditingUser(null)
    }
  }

  const handleToggleActive = async (userId: string, isActive: boolean) => {
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, is_active: !isActive }),
      })
      if (response.ok) {
        await loadUsers()
      }
    } catch (error) {
      console.error('Failed to toggle user status:', error)
    }
  }

  const handleDeleteUser = async (user: UserData) => {
    const confirmMessage = language === 'ko'
      ? `정말 ${user.name}님을 삭제하시겠습니까?`
      : `Are you sure you want to delete ${user.name}?`

    if (!confirm(confirmMessage)) return

    try {
      const response = await fetch(`/api/admin/users?userId=${user.id}`, {
        method: 'DELETE',
      })
      if (response.ok) {
        await loadUsers()
      }
    } catch (error) {
      console.error('Failed to delete user:', error)
    }
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
      case 'editor':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
      default:
        return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
    }
  }

  const getStatusBadgeColor = (isActive: boolean) => {
    return isActive
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
      : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">{t.common.loading}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t.users.title}</CardTitle>
            <div className="rounded-lg bg-white/50 dark:bg-white/10 p-2">
              <Users className="h-4 w-4 text-slate-600 dark:text-slate-400" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="animate-pulse">
                <div className="h-7 w-12 bg-slate-300 dark:bg-slate-600 rounded" />
              </div>
            ) : (
              <div className="text-2xl font-bold">{totalUsers}</div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t.users.activeUsers}
            </CardTitle>
            <div className="rounded-lg bg-white/50 dark:bg-white/10 p-2">
              <UserCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="animate-pulse">
                <div className="h-7 w-12 bg-slate-300 dark:bg-slate-600 rounded" />
              </div>
            ) : (
              <div>
                <div className="text-2xl font-bold">{activeUsers}</div>
                <p className="text-xs text-muted-foreground">
                  {totalUsers > 0 ? `${Math.round((activeUsers / totalUsers) * 100)}%` : '0%'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t.users.inactiveUsers}
            </CardTitle>
            <div className="rounded-lg bg-white/50 dark:bg-white/10 p-2">
              <UserX className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="animate-pulse">
                <div className="h-7 w-12 bg-slate-300 dark:bg-slate-600 rounded" />
              </div>
            ) : (
              <div>
                <div className="text-2xl font-bold">{totalUsers - activeUsers}</div>
                <p className="text-xs text-muted-foreground">
                  {totalUsers > 0 ? `${Math.round(((totalUsers - activeUsers) / totalUsers) * 100)}%` : '0%'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t.users.roleDistribution}
            </CardTitle>
            <div className="rounded-lg bg-white/50 dark:bg-white/10 p-2">
              <Shield className="h-4 w-4 text-slate-600 dark:text-slate-400" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="animate-pulse space-y-1">
                <div className="h-4 w-20 bg-slate-300 dark:bg-slate-600 rounded" />
                <div className="h-4 w-16 bg-slate-300 dark:bg-slate-600 rounded" />
              </div>
            ) : (
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-purple-600 dark:text-purple-400">{t.users.roles.admin}</span>
                  <span className="font-medium">{adminUsers}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-600 dark:text-blue-400">{t.users.roles.editor}</span>
                  <span className="font-medium">{editorUsers}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">{t.users.roles.viewer}</span>
                  <span className="font-medium">{viewerUsers}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Users Table */}
      <Card className="bg-slate-100 dark:bg-slate-800">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle>{t.users.title}</CardTitle>
            <CardDescription>{t.users.description}</CardDescription>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={loadUsers}
              disabled={isLoading}
              className="flex items-center justify-center gap-2 rounded-lg bg-white dark:bg-slate-700 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-max">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-sm text-muted-foreground whitespace-nowrap">
                    <th className="pb-3 pr-4 font-medium">{t.users.columns.name}</th>
                    <th className="pb-3 pr-4 font-medium">{t.users.columns.email}</th>
                    <th className="pb-3 pr-4 font-medium">{t.users.columns.role}</th>
                    <th className="pb-3 pr-4 font-medium">{t.users.columns.status}</th>
                    <th className="pb-3 pr-4 font-medium">{t.users.columns.lastLogin}</th>
                    <th className="pb-3 font-medium">{t.users.columns.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-slate-200 dark:border-slate-700 last:border-0 animate-pulse whitespace-nowrap">
                      <td className="py-3 pr-4"><div className="h-4 w-24 bg-slate-200 dark:bg-slate-600 rounded" /></td>
                      <td className="py-3 pr-4"><div className="h-4 w-36 bg-slate-200 dark:bg-slate-600 rounded" /></td>
                      <td className="py-3 pr-4"><div className="h-5 w-16 bg-slate-200 dark:bg-slate-600 rounded-full" /></td>
                      <td className="py-3 pr-4"><div className="h-5 w-14 bg-slate-200 dark:bg-slate-600 rounded-full" /></td>
                      <td className="py-3 pr-4"><div className="h-4 w-20 bg-slate-200 dark:bg-slate-600 rounded" /></td>
                      <td className="py-3">
                        <div className="flex items-center gap-1">
                          <div className="h-6 w-6 bg-slate-200 dark:bg-slate-600 rounded" />
                          <div className="h-6 w-6 bg-slate-200 dark:bg-slate-600 rounded" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">{t.users.noData}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-max">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-sm text-muted-foreground whitespace-nowrap">
                    <th className="pb-3 pr-4 font-medium">{t.users.columns.name}</th>
                    <th className="pb-3 pr-4 font-medium">{t.users.columns.email}</th>
                    <th className="pb-3 pr-4 font-medium">{t.users.columns.role}</th>
                    <th className="pb-3 pr-4 font-medium">{t.users.columns.status}</th>
                    <th className="pb-3 pr-4 font-medium">{t.users.columns.lastLogin}</th>
                    <th className="pb-3 font-medium">{t.users.columns.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-slate-200 dark:border-slate-700 last:border-0 whitespace-nowrap">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{user.name}</span>
                          {user.id === currentUser?.id && (
                            <span className="text-xs text-muted-foreground">({language === 'ko' ? '나' : 'You'})</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-sm text-muted-foreground">{user.email}</td>
                      <td className="py-3 pr-4">
                        {editingUser?.id === user.id ? (
                          <select
                            value={editingUser.role}
                            onChange={(e) => handleRoleChange(user.id, e.target.value)}
                            disabled={isSaving || user.id === currentUser?.id}
                            className="rounded border px-2 py-1 text-sm bg-white dark:bg-slate-700"
                          >
                            <option value="admin">{t.users.roles.admin}</option>
                            <option value="editor">{t.users.roles.editor}</option>
                            <option value="viewer">{t.users.roles.viewer}</option>
                          </select>
                        ) : (
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${getRoleBadgeColor(user.role)}`}>
                            {t.users.roles[user.role as keyof typeof t.users.roles] || user.role}
                            {user.id !== currentUser?.id && (
                              <button
                                onClick={() => setEditingUser(user)}
                                className="ml-1 opacity-60 hover:opacity-100"
                              >
                                <ChevronDown className="h-3 w-3" />
                              </button>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <button
                          onClick={() => handleToggleActive(user.id, user.is_active)}
                          disabled={user.id === currentUser?.id}
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusBadgeColor(user.is_active)} ${user.id === currentUser?.id ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:opacity-80'}`}
                        >
                          {user.is_active ? t.users.status.active : t.users.status.inactive}
                        </button>
                      </td>
                      <td className="py-3 pr-4 text-sm text-muted-foreground">
                        {formatRelativeDate(user.last_login_at, t, locale)}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setEditingUser(user)}
                            disabled={user.id === currentUser?.id}
                            className={`rounded p-1 hover:bg-slate-200 dark:hover:bg-slate-700 ${user.id === currentUser?.id ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                            title={t.common.edit}
                          >
                            <Pencil className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user)}
                            disabled={user.id === currentUser?.id}
                            className={`rounded p-1 hover:bg-slate-200 dark:hover:bg-slate-700 ${user.id === currentUser?.id ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                            title={t.common.delete}
                          >
                            <Trash2 className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
