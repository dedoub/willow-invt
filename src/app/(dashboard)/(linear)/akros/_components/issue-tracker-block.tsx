'use client'

import { useMemo, useState } from 'react'
import { t, tonePalettes, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead, LHeadBtn } from '@/app/(dashboard)/_components/linear-section-head'
import { LCardFoot } from '@/app/(dashboard)/_components/linear-card-foot'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { LFilterChip } from '@/app/(dashboard)/_components/linear-filter-chip'
import { Bone } from '@/app/(dashboard)/_components/linear-skeleton'
import { kstToday } from '@/lib/kst'
import type { AkrosEmailIssue, AkrosEmailDeadline } from '@/lib/supabase-etf'
import {
  LPageSize, LTableScroll, LTableHead, LTableBody, LTableRow, LTableEmpty, LTableBadge, LTableDate,
  useTableSort, type LColumn,
} from '@/app/(dashboard)/_components/linear-table'

// 단계 → 배지 톤/라벨 + 정렬 우선순위(작을수록 위, 상장에 가까운 쪽이 먼저)
//
// 2026-09-22 축을 바꿨다. 전에는 처리필요·대기·완료였는데, 그건 Akros 가 답할 차례인지를
// 우리 할 일처럼 보여 준 것이다. 우리는 지켜보는 쪽이라 궁금한 건 "어디까지 갔나"다.
// 슬러그는 email_issues.status 의 CHECK 여섯 값과 같다. 누가 답할 차례인지는 '현황' 열에
// 글로 남아 있다.
const STATUS_META: Record<string, { label: string; bg: string; fg: string; rank: number }> = {
  live:     { label: '⓪ 운영', ...tonePalettes.done,     rank: 0 }, // 상장·산출 중 (운영·정산·라이선스)
  near:     { label: '① 임박', ...tonePalettes.warn,     rank: 1 }, // 임시심볼 배정·런칭 셋업
  filing:   { label: '② 심사', ...tonePalettes.progress, rank: 2 }, // 예비심사·filing
  dev:      { label: '③ 개발', ...tonePalettes.brand,    rank: 3 }, // 방법론·초안·제안·BD 리드
  fyi:      { label: '참고',   ...tonePalettes.neutral,  rank: 4 },
  resolved: { label: '해결',   ...tonePalettes.neutral,  rank: 5 }, // 종결 (14일 보관)
}

type StatusFilter = 'all' | 'live' | 'near' | 'filing' | 'dev' | 'fyi' | 'resolved'

const COLUMNS: LColumn<AkrosEmailIssue>[] = [
  { key: 'code',    label: '코드',   width: '58px',             sortValue: r => r.issue_code ?? '' },
  { key: 'stage',   label: '단계',   width: '74px',             sortValue: r => STATUS_META[r.status]?.rank ?? 9 },
  { key: 'title',   label: '이슈',   width: 'minmax(200px,1.3fr)', sortValue: r => r.title },
  { key: 'detail',  label: '현황',   width: 'minmax(160px,1fr)', hideMobile: true, sortValue: r => r.detail ?? '' },
  { key: 'party',   label: '상대',   width: '100px',            hideMobile: true, sortValue: r => r.counterparty ?? '' },
  { key: 'mail',    label: '최근메일', width: '64px',           hideMobile: true, sortValue: r => r.last_email_date ?? '', sortFirst: 'desc' },
  { key: 'due',     label: '마감',   width: '64px',             hideMobile: true, sortValue: r => r.deadline ?? '', sortFirst: 'desc' },
  { key: 'link',    label: '',       width: '24px' },
]

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
  return n >= 1 && n <= 50 ? n : DEFAULT_PAGE_SIZE
}

export function IssueTrackerBlock({ issues, deadlines, loading, onRefresh }: Props) {
  const mobile = useIsMobile()
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(getStoredPageSize)
  const [expanded, setExpanded] = useState<string | null>(null)
  const { sort, toggle: toggleSort, apply: sortApply } = useTableSort<AkrosEmailIssue>('akros-issues', COLUMNS)

  const applyPageSize = (n: number) => {
    setPageSize(n)
    setPage(0)
    localStorage.setItem(PAGE_SIZE_KEY, String(n))
  }

  const counts = useMemo(() => {
    const c = Object.fromEntries(Object.keys(STATUS_META).map(k => [k, 0])) as Record<string, number>
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

  // 머리를 누르기 전까지는 위 기본 순서(단계 → 마감 → 최근 갱신)를 쓴다.
  const sorted = useMemo(() => sortApply(rows), [rows, sortApply])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const paged = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize)

  const FILTERS: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: `전체 ${issues.length}` },
    ...Object.entries(STATUS_META)
      .filter(([key]) => (counts[key] || 0) > 0 || filter === key)
      .map(([key, meta]) => ({ key: key as StatusFilter, label: `${meta.label} ${counts[key] || 0}` })),
  ]

  return (
    <LCard pad={0}>
      {/* 머리 간격은 사업관리 표 카드와 같다(16/16/8). 눈썹은 두지 않는다. */}
      <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadY }}>
        <LSectionHead
          title="이메일 이슈 트래킹"
          action={<LHeadBtn icon="refresh" title="새로고침" onClick={onRefresh} />}
          mb={0}
        />
      </div>

      {/* 다가오는 마감 스트립 (줄바꿈, 글자 안 잘림) */}
      {deadlines.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: t.density.gapSm, padding: `0 ${t.density.cardPad}px ${t.density.cardPad + 2}px`,
        }}>
          {deadlines.map(d => {
            const n = dday(d.due_date)
            const overdue = n !== null && n < 0
            const soon = n !== null && n >= 0 && n <= 3
            return (
              <div key={d.id} style={{
                display: 'flex', flexDirection: mobile ? 'column' : 'row',
                alignItems: mobile ? 'flex-start' : 'center', gap: mobile ? 2 : 6,
                width: mobile ? '100%' : undefined,
                background: t.neutrals.inner, borderRadius: t.radius.md, padding: `${t.density.gapSm}px ${t.density.panelPadX}px`,
              }}>
                {/* 날짜 (모바일: 내용 위) */}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: t.density.gapSm, flexShrink: 0 }}>
                  <LIcon name="calendar" size={11} color={overdue ? t.accent.neg : soon ? t.accent.warn : t.neutrals.subtle} />
                  <span style={{
                    fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, fontFamily: t.font.mono, fontWeight: t.weight.medium,
                    color: overdue ? t.accent.neg : soon ? t.accent.warn : t.neutrals.muted, whiteSpace: 'nowrap',
                  }}>
                    {d.due_label || fmtDate(d.due_date)}
                  </span>
                </span>
                <span style={{ fontSize: `calc(${t.type.control}px * var(--fz, 1))`, color: t.neutrals.text }}>
                  {d.event}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* 상태 필터 */}
      <div style={{ padding: `0 ${t.density.cardPad}px ${t.density.panelPadY}px` }}>
        <LFilterChip
          options={FILTERS.map(f => ({ value: f.key, label: f.label }))}
          value={filter}
          onChange={(v) => { setFilter(v); setPage(0) }}
          gap={t.density.gapSm}
        />
      </div>

      {/* 이슈 목록 — 다른 카드와 같은 표(LTable*). 머리를 눌러 정렬한다. */}
      <div style={{ padding: `0 ${t.density.cardPad}px` }}>
        <LTableScroll columns={COLUMNS} mobile={mobile}>
          <LTableHead columns={COLUMNS} mobile={mobile} sort={sort} onSort={toggleSort} />
          <LTableBody columns={COLUMNS} mobile={mobile}>
            {loading ? (
              Array.from({ length: Math.min(pageSize, 6) }).map((_, i) => (
                <LTableRow key={i} columns={COLUMNS} mobile={mobile}>
                  <Bone w="80%" h={11} />
                  <Bone w={40} h={14} r={4} />
                  <Bone w={`${58 + (i % 3) * 12}%`} h={11} />
                  {!mobile && <Bone w="70%" h={9} />}
                  {!mobile && <Bone w="60%" h={9} />}
                  {!mobile && <Bone w={34} h={9} />}
                  {!mobile && <Bone w={34} h={9} />}
                  <span />
                </LTableRow>
              ))
            ) : paged.map(issue => {
              const sm = STATUS_META[issue.status] || { label: issue.status, ...tonePalettes.neutral, rank: 9 }
              const n = issue.status === 'resolved' ? null : dday(issue.deadline)
              const open = expanded === issue.id
              return (
                <div key={issue.id}>
                  <LTableRow columns={COLUMNS} mobile={mobile} onClick={() => setExpanded(open ? null : issue.id)}>
                    <span style={{ fontFamily: t.font.mono, fontSize: `calc(${t.type.label}px * var(--fz, 1))`, color: t.neutrals.muted, whiteSpace: 'nowrap' }}>
                      {issue.issue_code || '-'}
                    </span>
                    <LTableBadge tone={{ bg: sm.bg, fg: sm.fg }}>{sm.label}</LTableBadge>
                    <span style={{ minWidth: 0, fontWeight: t.weight.medium, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {issue.title}
                      {issue.cluster && <span style={{ color: t.brand[600], fontWeight: t.weight.regular }}> · {issue.cluster}</span>}
                    </span>
                    {!mobile && (
                      <span style={{ minWidth: 0, color: t.neutrals.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {issue.detail || '-'}
                      </span>
                    )}
                    {!mobile && (
                      <span style={{ minWidth: 0, color: t.neutrals.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {issue.counterparty || '-'}
                      </span>
                    )}
                    {!mobile && (issue.last_email_date
                      ? <LTableDate value={issue.last_email_date} />
                      : <span style={{ color: t.neutrals.subtle }}>-</span>)}
                    {!mobile && (issue.deadline
                      ? (
                        // 마감이 지난 것은 날짜만 둔다. 남의 마감이라 '초과 N일' 은 우리가 쓸 신호가
                        // 아니고, 운영 중인 건에도 붙어 빨갛게 우는 칸이 됐다(E-029 초과 71일).
                        <span style={{
                          fontFamily: t.font.mono, fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`,
                          color: n !== null && n >= 0 && n <= 3 ? t.accent.warn : t.neutrals.muted, whiteSpace: 'nowrap',
                        }}>
                          {n !== null && n === 0 ? '오늘' : n !== null && n > 0 && n <= 3 ? `D-${n}` : fmtDate(issue.deadline)}
                        </span>
                      )
                      : <span style={{ color: t.neutrals.subtle }}>-</span>)}
                    {issue.thread_url ? (
                      <a href={issue.thread_url} target="_blank" rel="noopener noreferrer" title="Gmail 스레드 열기"
                        onClick={e => e.stopPropagation()}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.neutrals.muted }}>
                        <LIcon name="mail" size={12} />
                      </a>
                    ) : <span />}
                  </LTableRow>
                  {open && (issue.detail || issue.next_action) && (
                    <div style={{
                      padding: `${t.density.gapSm}px ${t.density.panelPadX}px ${t.density.panelPadX}px`,
                      background: t.neutrals.inner, borderRadius: t.radius.sm, marginBottom: t.density.tableRowGap,
                    }}>
                      {issue.detail && (
                        <div style={{ fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, color: t.neutrals.text, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                          {issue.detail}
                        </div>
                      )}
                      {issue.next_action && issue.status !== 'resolved' && (
                        <div style={{ fontSize: `calc(${t.type.control}px * var(--fz, 1))`, color: t.brand[700], marginTop: t.density.gapXs, fontWeight: t.weight.medium }}>
                          → {issue.next_action}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </LTableBody>
          {!loading && sorted.length === 0 && <LTableEmpty>해당 단계의 이슈가 없습니다</LTableEmpty>}
        </LTableScroll>
      </div>


      {/* 페이지네이션 (wiki-list 패턴 참조) — N개씩 선택 + 이전/다음 */}
      {!loading && sorted.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: t.density.kpiGap,
          padding: `${t.density.panelPadY}px ${t.density.controlPadXMd}px`, borderTop: `1px solid ${t.neutrals.line}`,
        }}>
          {/* 페이지당 개수 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapXs }}>
            <LPageSize value={pageSize} onChange={applyPageSize} />
          </div>

          {/* 범위 + 네비게이션 */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm }}>
              <span style={{ fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, fontFamily: t.font.mono, color: t.neutrals.muted }}>
                {safePage * pageSize + 1}-{Math.min((safePage + 1) * pageSize, sorted.length)} / {sorted.length}
              </span>
              <button disabled={safePage === 0} onClick={() => setPage(safePage - 1)} style={{
                background: 'transparent', border: 'none', cursor: safePage === 0 ? 'default' : 'pointer',
                padding: t.density.gapXs, borderRadius: t.radius.sm, color: safePage === 0 ? t.neutrals.line : t.neutrals.muted, opacity: safePage === 0 ? 0.4 : 1,
              }}>
                <LIcon name="chevronLeft" size={13} stroke={2} />
              </button>
              <button disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)} style={{
                background: 'transparent', border: 'none', cursor: safePage >= totalPages - 1 ? 'default' : 'pointer',
                padding: t.density.gapXs, borderRadius: t.radius.sm, color: safePage >= totalPages - 1 ? t.neutrals.line : t.neutrals.muted, opacity: safePage >= totalPages - 1 ? 0.4 : 1,
              }}>
                <LIcon name="chevronRight" size={13} stroke={2} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* 쪽넘김 줄과 따로 둔다 — 그 줄은 몇 개 중 몇 개인지만 말하고, 이 줄이 어디서 온
          숫자인지를 말한다(CEO 2026-09-15). */}
      <LCardFoot
        left="Gmail 스레드에서 뽑은 이슈 · 마감은 메일 본문 기준"
        right={`${issues.length}건`}
        style={{ marginTop: 0, padding: `${t.density.panelPadY}px ${t.density.cardPad}px` }}
      />
    </LCard>
  )
}
