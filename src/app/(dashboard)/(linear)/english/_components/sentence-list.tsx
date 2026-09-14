'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LCardFoot } from '@/app/(dashboard)/_components/linear-card-foot'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LSegmented } from '@/app/(dashboard)/_components/linear-segmented'
import { LFilterChip } from '@/app/(dashboard)/_components/linear-filter-chip'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { LBadge } from '@/app/(dashboard)/_components/linear-badge'
import {
  LPageSize, LTableScroll, LTableHead, LTableBody, LTableRow, LTableEmpty, LTableBadge, LTableDate,
  type LColumn,
} from '@/app/(dashboard)/_components/linear-table'
import { HINT_LABEL, type HintLevel } from '@/lib/english-practice-review'
import type { PracticeTarget } from '@/lib/english-targets'

/**
 * 문제은행 전체와 문장별 학습 기록.
 *
 * 연습 화면과 나란히 두지 않는다 — 거기는 한 문장만 보는 자리고, 목록이 끼면 눈이 갈린다.
 * 통계 카드 머리의 탭으로 갈라, 연습하기와 둘 중 하나만 보인다(CEO 2026-09-14).
 */

interface ListItem {
  id: string
  korean_full: string
  korean_chunks: string[]
  english_chunks: string[] | null
  reference_english: string
  topic: string | null
  created_at: string
  attempts: { score: number; passed: boolean; used_hint: boolean; created_at: string }[]
  tries: number
  last_score: number | null
  last_passed: boolean | null
  last_at: string | null
  streak: number
  hint_level: HintLevel
  best_score: number | null
}

type StateKey = 'all' | 'fresh' | 'review' | 'passed'

const STATE_FILTERS: { value: StateKey; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'fresh', label: '안 푼 것' },
  { value: 'review', label: '복습 대기' },
  { value: 'passed', label: '합격' },
]

// 상태는 분류다. 회색 명도로 가른다 — 색은 점수 쪽에만 남긴다(카드 문법).
const STATE_TONE: Record<Exclude<StateKey, 'all'>, { bg: string; fg: string }> = {
  review: { bg: '#D3D7DD', fg: '#1F242B' },
  fresh: { bg: '#E4E7EB', fg: '#2C323A' },
  passed: { bg: '#F5F6F8', fg: '#4B525A' },
}
const STATE_LABEL: Record<Exclude<StateKey, 'all'>, string> = {
  review: '복습', fresh: '안 풂', passed: '합격',
}

function stateOf(it: ListItem): Exclude<StateKey, 'all'> {
  if (it.tries === 0) return 'fresh'
  return it.last_passed ? 'passed' : 'review'
}

const COLUMNS: LColumn<ListItem>[] = [
  { key: 'state', label: '상태', width: '58px' },
  { key: 'sentence', label: '문장', width: 'minmax(200px,1fr)' },
  { key: 'hint', label: '힌트', width: '72px', hideMobile: true },
  { key: 'tries', label: '시도', width: '44px', align: 'right' },
  { key: 'score', label: '마지막', width: '52px', align: 'right' },
  { key: 'date', label: '최근', width: '56px', hideMobile: true },
]

const PAGE_SIZE_KEY = 'english-items-page-size'

function storedPageSize(): number {
  if (typeof window === 'undefined') return 10
  const n = Number(localStorage.getItem(PAGE_SIZE_KEY))
  return n >= 1 && n <= 50 ? n : 10
}

export function SentenceList({ target }: { target: PracticeTarget }) {
  const mobile = useIsMobile()
  const [items, setItems] = useState<ListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [state, setState] = useState<StateKey>('all')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'recent' | 'weakest' | 'added'>('recent')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(storedPageSize)
  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/english/items?profile=${target.id}`)
      if (res.ok) setItems((await res.json()).items ?? [])
    } finally {
      setLoading(false)
    }
  }, [target.id])

  // 탭으로 들어올 때마다 새로 붙으므로, 붙을 때 한 번 읽으면 방금 푼 문장까지 들어 있다.
  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    let out = items
    if (state !== 'all') out = out.filter(it => stateOf(it) === state)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      out = out.filter(it =>
        it.korean_full.toLowerCase().includes(q)
        || it.reference_english.toLowerCase().includes(q)
        || (it.topic ?? '').toLowerCase().includes(q))
    }
    return [...out].sort((a, b) => {
      if (sortBy === 'added') return b.created_at.localeCompare(a.created_at)
      if (sortBy === 'weakest') {
        // 약한 것부터: 마지막 점수가 낮은 순, 아직 안 푼 것은 뒤로 — 점수가 없는 것을
        // 0점으로 치면 한 번도 안 본 문장이 '가장 약한 문장' 자리를 다 차지한다.
        const av = a.last_score ?? 1000
        const bv = b.last_score ?? 1000
        return av - bv
      }
      return (b.last_at ?? '').localeCompare(a.last_at ?? '')
    })
  }, [items, state, search, sortBy])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize)
  const open = openId ? items.find(it => it.id === openId) ?? null : null

  const applyPageSize = (n: number) => {
    setPageSize(n); setPage(0)
    try { localStorage.setItem(PAGE_SIZE_KEY, String(n)) } catch { /* 못 남겨도 이번 화면에서는 그대로 */ }
  }

  const passed = items.filter(it => stateOf(it) === 'passed').length

  return (
    <>
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadY + t.density.panelPadX }}>
        <LSectionHead
          title="문장 목록"
          meta={`${target.sourceLabel} · 문장마다 지나온 기록`}
          tools={
            <LSegmented
              options={[
                { value: 'recent', label: '최근' },
                { value: 'weakest', label: '약한 순' },
                { value: 'added', label: '추가순' },
              ]}
              value={sortBy}
              onChange={v => { setSortBy(v); setPage(0) }}
            />
          }
          toolsInline
          mb={0}
        />
      </div>

      {/* 상태 칩 · 검색 한 줄 — 업무위키·수첩과 같은 자리, 같은 모양 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: t.density.gapSm,
        padding: `0 ${t.density.cardPad}px ${t.density.gapSm}px`,
        flexWrap: mobile ? 'wrap' : 'nowrap',
      }}>
        <div style={{ flexShrink: 0 }}>
          <LFilterChip
            options={STATE_FILTERS}
            value={state}
            onChange={v => { setState(v as StateKey); setPage(0) }}
            gap={t.density.gapXs}
          />
        </div>
        <div style={{ position: 'relative', flex: 1, minWidth: mobile ? '100%' : 120 }}>
          <div style={{ position: 'absolute', left: t.density.panelPadX, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}>
            <LIcon name="search" size={13} stroke={2} color={t.neutrals.subtle} />
          </div>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
            placeholder="한글 · 영어 · 주제 검색"
            style={{
              width: '100%', boxSizing: 'border-box', minHeight: t.density.controlHSm,
              padding: `0 ${t.density.panelPadX}px 0 30px`, fontSize: `calc(${t.type.control}px * var(--fz, 1))`,
              fontFamily: t.font.sans, color: t.neutrals.text,
              background: t.neutrals.card, border: `1px solid ${t.neutrals.line}`,
              borderRadius: t.radius.sm, outline: 'none',
            }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{
              position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: t.density.tableRowGap, color: t.neutrals.muted, display: 'flex', alignItems: 'center',
            }}>
              <LIcon name="x" size={12} stroke={2} />
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: `0 ${t.density.cardPad}px ${t.density.gapSm}px` }}>
        <LTableScroll columns={COLUMNS} mobile={mobile}>
          <LTableHead columns={COLUMNS} mobile={mobile} />
          {loading ? (
            <LTableEmpty>불러오는 중…</LTableEmpty>
          ) : paged.length === 0 ? (
            <LTableEmpty>{search || state !== 'all' ? '해당하는 문장이 없습니다' : '문장이 없습니다'}</LTableEmpty>
          ) : (
            <LTableBody columns={COLUMNS} mobile={mobile}>
              {paged.map(it => {
                const st = stateOf(it)
                return (
                  <LTableRow key={it.id} columns={COLUMNS} mobile={mobile} onClick={() => setOpenId(it.id)}>
                    <LTableBadge tone={STATE_TONE[st]}>{STATE_LABEL[st]}</LTableBadge>
                    <span style={{
                      minWidth: 0, color: t.neutrals.text,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }} title={it.korean_full}>
                      {it.korean_full}
                    </span>
                    <span style={{ fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, color: t.neutrals.subtle }}>
                      {HINT_LABEL[it.hint_level]}
                    </span>
                    <span style={{ fontFamily: t.font.mono, color: t.neutrals.subtle, textAlign: 'right' }}>
                      {it.tries || ''}
                    </span>
                    {/* 점수만 색을 갖는다 — 합격이냐 아니냐는 부호다 */}
                    <span style={{
                      fontFamily: t.font.mono, textAlign: 'right',
                      color: it.last_score == null ? t.neutrals.subtle
                        : it.last_passed ? t.accent.pos : t.accent.neg,
                    }}>
                      {it.last_score ?? ''}
                    </span>
                    {it.last_at
                      ? <LTableDate value={it.last_at.slice(0, 10)} />
                      : <span style={{ color: t.neutrals.subtle }}>–</span>}
                  </LTableRow>
                )
              })}
            </LTableBody>
          )}
        </LTableScroll>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `0 ${t.density.cardPad}px`,
      }}>
        <LPageSize value={pageSize} onChange={applyPageSize} />
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm }}>
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={pagerBtn(page === 0)}>
              <LIcon name="chevronLeft" size={13} stroke={2} />
            </button>
            <span style={{ fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, fontFamily: t.font.mono, color: t.neutrals.muted }}>
              {page * pageSize + 1}-{Math.min((page + 1) * pageSize, filtered.length)} / {filtered.length}
            </span>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} style={pagerBtn(page >= totalPages - 1)}>
              <LIcon name="chevronRight" size={13} stroke={2} />
            </button>
          </div>
        )}
      </div>

      <LCardFoot
        left={items.length > 0 ? `합격 ${passed} / ${items.length}` : undefined}
        right={`${items.length}문장`}
        style={{ marginTop: t.density.gapSm, padding: `${t.density.panelPadY}px ${t.density.cardPad}px` }}
      />
    </LCard>

    {open && <DetailModal item={open} onClose={() => setOpenId(null)} />}
    </>
  )
}

function pagerBtn(disabled: boolean): React.CSSProperties {
  return {
    background: 'transparent', border: 'none',
    cursor: disabled ? 'default' : 'pointer',
    padding: t.density.gapXs, borderRadius: t.radius.sm,
    color: disabled ? t.neutrals.line : t.neutrals.muted,
    opacity: disabled ? 0.4 : 1,
  }
}

/** 한 문장의 기록 전부. 카드 밖 형제로 열린다 — 카드 안이면 테마가 테두리를 지운다. */
function DetailModal({ item, onClose }: { item: ListItem; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: t.density.pagePadX,
    }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,15,18,0.18)', backdropFilter: 'blur(3px)' }} />
      <LCard pad={0} style={{
        position: 'relative', width: 'min(720px, calc(100vw - 24px))', maxHeight: 'min(85vh, 760px)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <button onClick={onClose} aria-label="닫기" style={{
          position: 'absolute', top: 10, right: 10, zIndex: 2,
          background: 'transparent', border: 'none', borderRadius: t.radius.sm, padding: t.density.gapXs,
          cursor: 'pointer', color: t.neutrals.muted, display: 'flex',
        }}>
          <LIcon name="x" size={14} stroke={2} />
        </button>

        <div style={{ padding: t.density.cardPad, paddingRight: 40, paddingBottom: t.density.panelPadY }}>
          <LSectionHead
            title={item.topic || '문장'}
            meta={`${item.tries}회 시도 · 힌트 ${HINT_LABEL[item.hint_level]}${item.streak > 0 ? ` · 연속 ${item.streak}회` : ''}`}
            mb={0}
          />
        </div>

        <div style={{
          padding: `0 ${t.density.cardPad}px ${t.density.cardPad}px`, overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: t.density.blockGap,
        }}>
          {/* 청크 짝 — 한글과 영어를 같은 줄에서 본다 */}
          <div data-panel="">
            <div data-panel-title="" style={{
              fontSize: `calc(${t.type.panelTitle}px * var(--fz, 1))`, fontFamily: t.font.mono, letterSpacing: 0.8,
              textTransform: 'uppercase' as const, color: t.neutrals.subtle, marginBottom: t.density.gapSm,
            }}>
              의미조각
            </div>
            {item.korean_chunks.map((ko, i) => (
              <div key={i} data-panel-row="" style={{
                display: 'grid',
                gridTemplateColumns: '18px minmax(0,1fr) minmax(0,1fr)',
                gap: t.density.gapMd, alignItems: 'baseline',
                padding: `${t.density.gapSm}px ${t.density.tableRowPadX}px`,
              }}>
                <span style={{ fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, color: t.neutrals.subtle, fontFamily: t.font.mono }}>{i + 1}</span>
                <span style={{ minWidth: 0 }}>{ko}</span>
                <span style={{ minWidth: 0, color: t.chart.mono }}>{item.english_chunks?.[i] ?? ''}</span>
              </div>
            ))}
          </div>

          <div style={{
            border: `1px solid ${t.neutrals.line}`, borderRadius: t.radius.md,
            padding: `${t.density.blockGap}px ${t.density.gapLg}px`,
            fontSize: `calc(${t.type.body}px * var(--fz, 1))`, lineHeight: 1.55,
          }}>
            {item.reference_english}
          </div>

          {/* 시도 이력 — 최근이 위로. 없으면 그렇다고 말한다 */}
          <div data-panel="">
            <div data-panel-title="" style={{
              fontSize: `calc(${t.type.panelTitle}px * var(--fz, 1))`, fontFamily: t.font.mono, letterSpacing: 0.8,
              textTransform: 'uppercase' as const, color: t.neutrals.subtle, marginBottom: t.density.gapSm,
            }}>
              시도 기록
            </div>
            {item.attempts.length === 0 ? (
              <div style={{ padding: `${t.density.gapSm}px ${t.density.tableRowPadX}px`, color: t.neutrals.subtle, fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))` }}>
                아직 풀지 않았습니다.
              </div>
            ) : (
              [...item.attempts].reverse().map((a, i) => (
                <div key={i} data-panel-row="" style={{
                  display: 'flex', alignItems: 'center', gap: t.density.gapMd,
                  padding: `${t.density.gapSm}px ${t.density.tableRowPadX}px`,
                }}>
                  <span style={{
                    fontFamily: t.font.mono, minWidth: 28, textAlign: 'right',
                    color: a.passed ? t.accent.pos : t.accent.neg,
                  }}>{a.score}</span>
                  <LBadge palette={a.passed ? { bg: '#DAEEDD', fg: '#1F5F3D' } : { bg: '#F3DADA', fg: '#8A2A2A' }}>
                    {a.passed ? '합격' : '미합격'}
                  </LBadge>
                  {a.used_hint && <LBadge tone="neutral">힌트</LBadge>}
                  <span style={{ marginLeft: 'auto', fontFamily: t.font.mono, fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, color: t.neutrals.subtle }}>
                    {a.created_at.slice(0, 10)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </LCard>
    </div>
  )
}
