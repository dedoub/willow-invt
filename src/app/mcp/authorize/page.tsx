'use client'

import { useState, useEffect } from 'react'

function parseCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

export default function McpAuthorizePage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [clientId, setClientId] = useState('')
  const [scopes, setScopes] = useState<string[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const raw = parseCookie('mcp_oauth_params')
    if (raw) {
      try {
        const params = JSON.parse(raw)
        setClientId(params.client_id || '')
        if (params.scope) {
          setScopes(params.scope.split(' ').filter(Boolean))
        }
      } catch {
        // ignore parse error
      }
    }
    setReady(true)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/mcp/oauth/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error_description || data.error || '인증 실패')
        setLoading(false)
        return
      }

      if (data.redirect_uri) {
        window.location.href = data.redirect_uri
      } else {
        setError('리다이렉트 URL을 받지 못했습니다')
        setLoading(false)
      }
    } catch {
      setError('서버 연결 실패')
      setLoading(false)
    }
  }

  const scopeLabels: Record<string, string> = {
    'wiki:read': '위키 조회',
    'wiki:write': '위키 수정',
    'projects:read': '프로젝트 조회',
    'projects:write': '프로젝트 수정',
    'schedules:read': '일정 조회',
    'schedules:write': '일정 수정',
    'invoices:read': '인보이스 조회',
    'invoices:write': '인보이스 수정',
    'etf:read': 'ETF 데이터 조회',
    'dashboard:read': '대시보드 조회',
    'ryuha:read': '류하 학습관리 조회',
    'ryuha:write': '류하 학습관리 수정',
    'willow:read': '윌로우 경영관리 조회',
    'willow:write': '윌로우 경영관리 수정',
    'tensw:read': '텐소프트웍스 경영관리 조회',
    'tensw:write': '텐소프트웍스 경영관리 수정',
    'admin:read': '관리자 조회',
    'admin:write': '관리자 수정',
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-slate-500">로딩 중...</div>
      </div>
    )
  }

  if (!clientId) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              OAuth 인증 세션이 만료되었습니다.
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
              MCP 클라이언트에서 다시 연결해주세요.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/50 rounded-xl flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">MCP 인증</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              외부 앱이 Willow Dashboard에 접근하려고 합니다
            </p>
          </div>

          {/* Client info */}
          <div className="bg-slate-100 dark:bg-slate-700 rounded-lg p-3 mb-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">클라이언트</p>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{clientId}</p>
          </div>

          {/* Requested scopes */}
          {scopes.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">요청된 권한</p>
              <div className="flex flex-wrap gap-1.5">
                {scopes.map(s => (
                  <span
                    key={s}
                    className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400"
                  >
                    {scopeLabels[s] || s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Login form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="이메일"
                required
                className="w-full h-9 px-3 text-sm rounded-lg bg-slate-100 dark:bg-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="비밀번호"
                required
                className="w-full h-9 px-3 text-sm rounded-lg bg-slate-100 dark:bg-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {error && (
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-9 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors"
            >
              {loading ? '인증 중...' : '로그인 및 승인'}
            </button>
          </form>

          <p className="text-xs text-slate-400 dark:text-slate-500 text-center mt-4">
            로그인하면 위 권한이 부여됩니다
          </p>
        </div>
      </div>
    </div>
  )
}
