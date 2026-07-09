'use client'

import { useMemo, useState } from 'react'
import { t, tonePalettes } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { Bone } from '@/app/(dashboard)/_components/linear-skeleton'
import { kstToday } from '@/lib/kst'
import type { AkrosEmailIssue, AkrosEmailDeadline } from '@/lib/supabase-etf'

// 상태 → 배지 톤/라벨 + 정렬 우선순위(작을수록 위)
const STATUS_META: Record<string, { label: string; bg: string; fg: string; rank: number }> = {
  'needs-action': { label: '처리필요', ...tonePalettes.danger, rank: 0 },
  'waiting':      { label: '대기',     ...tonePalettes.info,   rank: 1 },
  'resolved':     { label: '완료',     ...tonePalettes.done,   rank: 2 },
}

type StatusFilter = 'all' | 'needs-action' | 'waiting' | 'resolved'

function fmtDate(d?: string | null): string {
  if (!d) return ''
  const dt = new Date(d)
  return `${dt.getMonth() + 1}/${dt.getDate()}`
}

// 마감까지 D-day. 초과면 음수. resolved면 null.
function dday(deadline?: string | null): number | null {
  if (!deadline) return null
  const today = new Date(`${kstToday()}T00:00:00+09:00`)
  const dl = new Date(`${deadline}T00:00:00+09:00`)
  return Math.round((dl.getTime() - today.getTime()) / 86400000)
}

interface Props {
  issues: AkrosEmailIssue[]
  deadlines: AkrosEmailDeadline[]
  loading?: boolean
  onRefresh?: () => void
}

const PAGE_SIZE_KEY = 'akros-issues-page-size'
const DEFAULT_PAGE_SIZE = 8
function getStoredPageSize(): number {
  if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE
  const n = Number(localStorage.getItem(PAGE_SIZE_KEY))
  return n >= 3 && n <= 50 ? n : DEFAULT_PAGE_SIZE
}

export function IssueTrackerBlock({ issues, deadlines, loading, onRefresh }: Props) {
  const [filter, setFilter] = useState<StatusFilter>('needs-action')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(getStoredPageSize)
  const [pageSizeInput, setPageSizeInput] = useState(String(getStoredPageSize()))

  const commitPageSize = () => {
    const n = Math.max(3, Math.min(50, Number(pageSizeInput) || DEFAULT_PAGE_SIZE))
    setPageSizeInput(String(n))
    setPageSize(n)
    setPage(0)
    localStorage.setItem(PAGE_SIZE_KEY, String(n))
  }

  const counts = useMemo(() => {
    const c = { 'needs-action': 0, waiting: 0, resolved: 0 } as Record<string, number>
    for (const i of issues) c[i.status] = (c[i.status] || 0) + 1
    return c
  }, [issues])

  const rows = useMemo(() => {
    const filtered = filter === 'all' ? issues : issues.filter(i => i.status === filter)
    return [...filtered].sort((a, b) => {
      const ra = STATUS_META[a.status]?.rank ?? 9
      const rb = STATUS_META[b.status]?.rank ?? 9
      if (ra !== rb) return ra - rb
      // 마감 있는 것 먼저(초과·임박 우선), 없으면 최근 업데이트순
      const da = dday(a.deadline), db = dday(b.deadline)
      if (da !== null && db !== null) return da - db
      if (da !== null) return -1
      if (db !== null) return 1
      return (b.updated_at || '').localeCompare(a.updated_at || '')
    })
  }, [issues, filter])

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const paged = rows.slice(safePage * pageSize, (safePage + 1) * pageSize)

  const FILTERS: { key: StatusFilter; label: string }[] = [
    { key: 'needs-action', label: `처리필요 ${counts['needs-action'] || 0}` },
    { key: 'waiting', label: `대기 ${counts['waiting'] || 0}` },
    { key: 'resolved', label: `완료 ${counts['resolved'] || 0}` },
    { key: 'all', label: `전체 ${issues.length}` },
  ]

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 10 }}>
        <LSectionHead
          eyebrow="ISSUE TRACKING"
          title="이메일 이슈 트래킹"
          action={
            <button onClick={onRefresh} title="새로고침" style={{
              width: 28, height: 28, borderRadius: t.radius.sm, background: t.neutrals.inner,
              border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: t.neutrals.muted,
            }}>
              <LIcon name="refresh" size={13} stroke={1.8} />
            </button>
          }
        />
      </div>

      {/* 다가오는 마감 스트립 (줄바꿈, 글자 안 잘림) */}
      {deadlines.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 14px 18px',
        }}>
          {deadlines.map(d => {
            const n = dday(d.due_date)
            const overdue = n !== null && n < 0
            const soon = n !== null && n >= 0 && n <= 3
            return (
              <div key={d.id} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: t.neutrals.inner, borderRadius: t.radius.md, padding: '5px 9px',
              }}>
                <LIcon name="calendar" size={11} color={overdue ? t.accent.neg : soon ? t.accent.warn : t.neutrals.subtle} />
                <span style={{
                  fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, fontWeight: t.weight.medium,
                  color: overdue ? t.accent.neg : soon ? t.accent.warn : t.neutrals.muted, whiteSpace: 'nowrap',
                }}>
                  {d.due_label || fmtDate(d.due_date)}
                </span>
                <span style={{ fontSize: 'calc(11px * var(--fz, 1))', color: t.neutrals.text }}>
                  {d.event}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* 상태 필터 */}
      <div style={{ display: 'flex', gap: 5, padding: '0 14px 8px', flexWrap: 'wrap' }}>
        {FILTERS.map(f => {
          const active = filter === f.key
          return (
            <button key={f.key} onClick={() => { setFilter(f.key); setPage(0) }} style={{
              border: 'none', cursor: 'pointer', borderRadius: t.radius.pill,
              padding: '3px 10px', fontFamily: t.font.sans,
              fontSize: 'calc(11px * var(--fz, 1))', fontWeight: active ? t.weight.medium : t.weight.regular,
              background: active ? t.brand[600] : t.neutrals.inner,
              color: active ? '#fff' : t.neutrals.muted,
            }}>
              {f.label}
            </button>
          )
        })}
      </div>

      {/* 이슈 목록 */}
      <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 6 }}>
        {loading ? (
          // 로딩 스켈레톤 — 앱 전체 shimmer(.l-skeleton)와 동일, 페이지당 개수만큼 행 표시
          Array.from({ length: Math.min(pageSize, 6) }).map((_, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '11px 14px', borderTop: `1px solid ${t.neutrals.line}`,
            }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Bone w={`${58 + (i % 3) * 12}%`} h={12} />
                <Bone w="42%" h={9} />
                <Bone w="88%" h={9} />
              </div>
              <Bone w={40} h={16} r={4} />
            </div>
          ))
        ) : rows.length === 0 ? (
          <div style={{ padding: '28px 14px', textAlign: 'center', fontSize: 'calc(12px * var(--fz, 1))', color: t.neutrals.subtle }}>해당 상태의 이슈가 없습니다</div>
        ) : paged.map(issue => {
          const sm = STATUS_META[issue.status] || { label: issue.status, ...tonePalettes.neutral, rank: 9 }
          const n = issue.status === 'resolved' ? null : dday(issue.deadline)
          const overdue = n !== null && n < 0
          const soon = n !== null && n >= 0 && n <= 3
          return (
            <div key={issue.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '9px 14px', borderTop: `1px solid ${t.neutrals.line}`,
            }}>
              {/* 좌: 코드 + 제목 + 메타 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 3 }}>
                  {issue.issue_code && (
                    <span style={{
                      fontSize: 'calc(9.5px * var(--fz, 1))', fontFamily: t.font.mono, fontWeight: t.weight.medium,
                      color: t.neutrals.subtle, background: t.neutrals.inner, borderRadius: 3, padding: '1px 4px', flexShrink: 0, marginTop: 1,
                    }}>{issue.issue_code}</span>
                  )}
                  <span style={{
                    fontSize: 'calc(12.5px * var(--fz, 1))', fontWeight: t.weight.semibold, color: t.neutrals.text, lineHeight: 1.35,
                  }}>{issue.title}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 'calc(10.5px * var(--fz, 1))', color: t.neutrals.subtle }}>
                  {issue.cluster && <span style={{ color: t.brand[600] }}>{issue.cluster}</span>}
                  {issue.counterparty && <span>· {issue.counterparty}</span>}
                  {issue.last_email_date && <span style={{ fontFamily: t.font.mono }}>· 최근메일 {fmtDate(issue.last_email_date)}</span>}
                </div>
                {/* 상세 내용 — 이슈별 내용 파악의 핵심, 항상 노출 */}
                {issue.detail && (
                  <div style={{ fontSize: 'calc(11.5px * var(--fz, 1))', color: t.neutrals.text, marginTop: 5, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                    {issue.detail}
                  </div>
                )}
                {issue.next_action && issue.status !== 'resolved' && (
                  <div style={{ fontSize: 'calc(11px * var(--fz, 1))', color: t.brand[700], marginTop: 4, fontWeight: t.weight.medium }}>
                    → {issue.next_action}
                  </div>
                )}
              </div>

              {/* 우: 마감 + 상태 + Gmail */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {n !== null && (
                  <span style={{
                    fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, fontWeight: t.weight.medium,
                    color: overdue ? t.accent.neg : soon ? t.accent.warn : t.neutrals.muted, whiteSpace: 'nowrap',
                  }}>
                    {overdue ? `초과 ${Math.abs(n)}일` : n === 0 ? '오늘' : `D-${n}`}
                  </span>
                )}
                <span style={{
                  fontSize: `calc(${t.badge.size}px * var(--fz, 1))`, fontWeight: t.badge.weight,
                  padding: `${t.badge.padY}px ${t.badge.padX}px`, borderRadius: t.badge.radius,
                  background: sm.bg, color: sm.fg, whiteSpace: 'nowrap',
                }}>{sm.label}</span>
                {issue.thread_url && (
                  <a href={issue.thread_url} target="_blank" rel="noopener noreferrer" title="Gmail 스레드 열기" style={{
                    width: 26, height: 26, borderRadius: t.radius.sm, background: t.neutrals.inner,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.neutrals.muted,
                  }}>
                    <LIcon name="mail" size={12} />
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* 페이지네이션 (wiki-list 패턴 참조) — N개씩 선택 + 이전/다음 */}
      {!loading && rows.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          padding: '8px 14px', borderTop: `1px solid ${t.neutrals.line}`,
        }}>
          {/* 페이지당 개수 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              value={pageSizeInput}
              onChange={e => setPageSizeInput(e.target.value.replace(/\D/g, ''))}
              onBlur={commitPageSize}
              onKeyDown={e => { if (e.key === 'Enter') commitPageSize() }}
              style={{
                width: 32, textAlign: 'center', border: 'none',
                background: t.neutrals.inner, borderRadius: t.radius.sm,
                fontSize: 'calc(11px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted,
                padding: '2px 0', outline: 'none',
              }}
            />
            <span style={{ fontSize: 'calc(10px * var(--fz, 1))', color: t.neutrals.subtle, fontFamily: t.font.sans }}>개씩</span>
          </div>

          {/* 범위 + 네비게이션 */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted }}>
                {safePage * pageSize + 1}-{Math.min((safePage + 1) * pageSize, rows.length)} / {rows.length}
              </span>
              <button disabled={safePage === 0} onClick={() => setPage(safePage - 1)} style={{
                background: 'transparent', border: 'none', cursor: safePage === 0 ? 'default' : 'pointer',
                padding: 4, borderRadius: 4, color: safePage === 0 ? t.neutrals.line : t.neutrals.muted, opacity: safePage === 0 ? 0.4 : 1,
              }}>
                <LIcon name="chevronLeft" size={13} stroke={2} />
              </button>
              <button disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)} style={{
                background: 'transparent', border: 'none', cursor: safePage >= totalPages - 1 ? 'default' : 'pointer',
                padding: 4, borderRadius: 4, color: safePage >= totalPages - 1 ? t.neutrals.line : t.neutrals.muted, opacity: safePage >= totalPages - 1 ? 0.4 : 1,
              }}>
                <LIcon name="chevronRight" size={13} stroke={2} />
              </button>
            </div>
          )}
        </div>
      )}
    </LCard>
  )
}
