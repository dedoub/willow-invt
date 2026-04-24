'use client'

import { useState, useMemo } from 'react'
import { t, tonePalettes } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import { FullEmail } from './email-detail-dialog'

interface EmailBlockProps {
  emails: FullEmail[]
  connected: boolean
  onSelectEmail: (email: FullEmail) => void
  onSync: () => void
  onCompose: () => void
  isSyncing?: boolean
}

const SOURCE_FILTERS = [
  { key: 'all',    label: '전체' },
  { key: 'WILLOW', label: '윌로우' },
  { key: 'TENSW',  label: '텐소프트웍스' },
  { key: 'ETC',    label: 'ETC' },
  { key: 'Akros',  label: '아크로스' },
] as const

const SOURCE_TONE: Record<string, { bg: string; fg: string }> = {
  WILLOW: tonePalettes.done,
  TENSW:  tonePalettes.warn,
  ETC:    tonePalettes.info,
  Akros:  { bg: '#E0F2F1', fg: '#00695C' },
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}분`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간`
  const days = Math.floor(hours / 24)
  return `${days}일`
}

function ActionBtn({ icon, label, onClick, spinning, disabled }: {
  icon: string; label: string; onClick: () => void; spinning?: boolean; disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || spinning}
      title={label}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '4px 10px', borderRadius: t.radius.sm,
        background: t.neutrals.inner, border: 'none',
        fontSize: 11.5, fontFamily: t.font.sans, fontWeight: t.weight.regular,
        color: disabled ? t.neutrals.subtle : t.neutrals.text,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      <LIcon name={spinning ? 'loader' : icon} size={11} stroke={2}
        className={spinning ? 'spin' : undefined} />
      {label}
    </button>
  )
}

const EMAIL_PAGE_KEY = 'email-page-size'
const DEFAULT_PAGE_SIZE = 25

function getStoredPageSize(): number {
  if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE
  const v = localStorage.getItem(EMAIL_PAGE_KEY)
  if (!v) return DEFAULT_PAGE_SIZE
  const n = Number(v)
  return n >= 5 && n <= 100 ? n : DEFAULT_PAGE_SIZE
}

export function EmailBlock({
  emails, connected, onSelectEmail, onSync, onCompose, isSyncing,
}: EmailBlockProps) {
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(getStoredPageSize)
  const [pageSizeInput, setPageSizeInput] = useState(String(getStoredPageSize()))

  // Count emails per source
  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const e of emails) {
      const src = e.sourceLabel || 'WILLOW'
      counts[src] = (counts[src] || 0) + 1
    }
    return counts
  }, [emails])

  // Only show filters for sources that have emails
  const activeFilters = useMemo(() => {
    const available = SOURCE_FILTERS.filter(f => f.key === 'all' || sourceCounts[f.key])
    // Don't show filters if only one source exists
    return available.length <= 2 ? [] : available
  }, [sourceCounts])

  const filtered = useMemo(() => {
    if (sourceFilter === 'all') return emails
    return emails.filter(e => (e.sourceLabel || 'WILLOW') === sourceFilter)
  }, [emails, sourceFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize)

  const handleFilterChange = (key: string) => {
    setSourceFilter(key)
    setPage(0)
  }

  const commitPageSize = () => {
    const n = Math.max(5, Math.min(100, Number(pageSizeInput) || DEFAULT_PAGE_SIZE))
    setPageSizeInput(String(n))
    setPageSize(n)
    setPage(0)
    localStorage.setItem(EMAIL_PAGE_KEY, String(n))
  }

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 10 }}>
        <LSectionHead eyebrow={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            EMAIL
            <span style={{
              fontSize: 9, fontFamily: t.font.mono,
              color: connected ? t.accent.pos : t.accent.neg,
              display: 'inline-flex', alignItems: 'center', gap: 3,
              fontWeight: t.weight.medium,
            }}>
              <span style={{
                width: 5, height: 5, borderRadius: 3,
                background: connected ? t.accent.pos : t.accent.neg,
              }} />
              {connected ? '연결됨' : '미연결'}
            </span>
          </span>
        } title="이메일" action={connected ? (
          <div style={{ display: 'flex', gap: 4 }}>
            <ActionBtn icon="refresh" label="동기화" onClick={onSync} spinning={isSyncing} />
            <ActionBtn icon="send" label="이메일 작성" onClick={onCompose} />
          </div>
        ) : undefined} />
      </div>

      {/* Source filter */}
      {connected && (
        <div style={{ padding: '0 16px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {activeFilters.length > 0 && (
            <div style={{ display: 'flex', gap: 5 }}>
              {activeFilters.map(f => {
                const active = sourceFilter === f.key
                return (
                  <button
                    key={f.key}
                    onClick={() => handleFilterChange(f.key)}
                    style={{
                      padding: '4px 10px', borderRadius: t.radius.pill,
                      border: 'none', cursor: 'pointer',
                      fontSize: 11, fontFamily: t.font.sans,
                      fontWeight: active ? t.weight.medium : t.weight.regular,
                      background: active ? t.brand[100] : t.neutrals.inner,
                      color: active ? t.brand[700] : t.neutrals.muted,
                      transition: 'all .12s',
                    }}
                  >
                    {f.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Email list */}
      <div>
        {paged.map((m) => {
          const srcTone = m.sourceLabel ? SOURCE_TONE[m.sourceLabel] : undefined
          return (
            <div
              key={`${m.sourceLabel || ''}-${m.id}`}
              onClick={() => onSelectEmail(m)}
              style={{
                display: 'grid', gridTemplateColumns: '1fr 50px',
                gap: 8, padding: '9px 16px', alignItems: 'center',
                borderTop: `1px solid ${t.neutrals.line}`,
                fontSize: 12, cursor: 'pointer',
                background: m.unread ? 'transparent' : t.neutrals.inner + '40',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  {m.unread && <span style={{ width: 5, height: 5, borderRadius: 3, background: t.brand[600], flexShrink: 0 }} />}
                  {m.direction === 'outbound' && (
                    <span style={{
                      fontSize: 8.5, fontFamily: t.font.mono, fontWeight: 600,
                      padding: '0 4px', borderRadius: 2,
                      background: '#DAEEDD', color: '#1F5F3D',
                    }}>발신</span>
                  )}
                  {m.sourceLabel && sourceFilter === 'all' && activeFilters.length > 0 && (
                    <span style={{
                      fontSize: 8, fontFamily: t.font.mono, fontWeight: 600,
                      padding: '0 4px', borderRadius: 2,
                      background: srcTone?.bg || t.neutrals.inner,
                      color: srcTone?.fg || t.neutrals.subtle,
                      flexShrink: 0,
                    }}>
                      {SOURCE_FILTERS.find(f => f.key === m.sourceLabel)?.label || m.sourceLabel}
                    </span>
                  )}
                  <span style={{
                    fontSize: 10.5, color: t.neutrals.muted,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {m.fromName || m.from.replace(/<.*>/, '').trim() || m.from}
                  </span>
                  {m.category && (
                    <span style={{
                      fontSize: 8.5, fontFamily: t.font.mono,
                      padding: '0 4px', borderRadius: 2,
                      background: t.neutrals.inner, color: t.neutrals.subtle,
                      flexShrink: 0,
                    }}>{m.category}</span>
                  )}
                </div>
                <div style={{
                  fontWeight: m.unread ? 500 : 400,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{m.subject || '(제목 없음)'}</div>
              </div>
              <span style={{
                fontFamily: t.font.mono, fontSize: 10, color: t.neutrals.subtle,
                textAlign: 'right',
              }}>{timeAgo(m.date)} 전</span>
            </div>
          )
        })}
        {filtered.length === 0 && connected && (
          <div style={{
            padding: '20px 16px', textAlign: 'center',
            fontSize: 12, color: t.neutrals.subtle,
          }}>이메일이 없습니다</div>
        )}
        {!connected && (
          <div style={{
            padding: '20px 16px', textAlign: 'center',
            fontSize: 12, color: t.neutrals.subtle,
          }}>Gmail 연결이 필요합니다</div>
        )}
      </div>

      {/* Pagination bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 16px',
        borderTop: `1px solid ${t.neutrals.line}`,
      }}>
        {/* Page size input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            value={pageSizeInput}
            onChange={e => setPageSizeInput(e.target.value.replace(/\D/g, ''))}
            onBlur={commitPageSize}
            onKeyDown={e => { if (e.key === 'Enter') commitPageSize() }}
            style={{
              width: 32, textAlign: 'center', border: 'none',
              background: t.neutrals.inner, borderRadius: t.radius.sm,
              fontSize: 11, fontFamily: t.font.mono, color: t.neutrals.muted,
              padding: '2px 0', outline: 'none',
            }}
          />
          <span style={{ fontSize: 10, color: t.neutrals.subtle, fontFamily: t.font.sans }}>개씩</span>
        </div>

        {/* Page navigation */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
              style={{
                background: 'transparent', border: 'none',
                cursor: page === 0 ? 'default' : 'pointer',
                padding: 4, borderRadius: 4,
                color: page === 0 ? t.neutrals.line : t.neutrals.muted,
                opacity: page === 0 ? 0.4 : 1,
              }}>
              <LIcon name="chevronLeft" size={13} stroke={2} />
            </button>
            <span style={{
              fontSize: 10, fontFamily: t.font.mono, color: t.neutrals.muted,
            }}>
              {page * pageSize + 1}-{Math.min((page + 1) * pageSize, filtered.length)} / {filtered.length}
            </span>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
              style={{
                background: 'transparent', border: 'none',
                cursor: page >= totalPages - 1 ? 'default' : 'pointer',
                padding: 4, borderRadius: 4,
                color: page >= totalPages - 1 ? t.neutrals.line : t.neutrals.muted,
                opacity: page >= totalPages - 1 ? 0.4 : 1,
              }}>
              <LIcon name="chevronRight" size={13} stroke={2} />
            </button>
          </div>
        )}
      </div>
    </LCard>
  )
}
