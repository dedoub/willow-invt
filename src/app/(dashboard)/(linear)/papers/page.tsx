'use client'

/**
 * 논문 데이터 웨어하우스 — 적재 현황.
 *
 * 진짜 상태는 AWS(Glue·S3·Athena)에 있다. 이 화면은 그걸 받아 적은 판을 읽는다 —
 * 대시보드에는 AWS 자격증명이 없고(브라우저 로그인이 필요해 에이전트가 대신 못 돌린다)
 * 웨어하우스 세션에는 화면이 없어서다. 숫자는 그 세션이
 * `node scripts/paper-warehouse-report.mjs` 로 적고, 상태와 메모는 여기서도 고친다.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { t, tonePalettes, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LCardFoot } from '@/app/(dashboard)/_components/linear-card-foot'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'
import { LNotice } from '@/app/(dashboard)/_components/linear-notice'
import {
  LTableBadge, LTableBody, LTableHead, LTableRow, LTableScroll, type LColumn,
} from '@/app/(dashboard)/_components/linear-table'
import { useAgentRefresh } from '@/hooks/use-agent-refresh'
import {
  PAPER_LOAD_STATUS_LABEL, PAPER_STAGE_STATUS_LABEL,
  type PaperWarehouseLoad, type PaperWarehouseLoadStatus,
  type PaperWarehouseStage, type PaperWarehouseStageStatus,
} from '@/types/paper-warehouse'

// 배지 색은 다른 표와 같은 뜻으로 쓴다 — 완료는 초록, 도는 중은 파랑, 막힘·실패는 빨강.
const STAGE_TONE: Record<PaperWarehouseStageStatus, { bg: string; fg: string }> = {
  done: tonePalettes.done,
  running: tonePalettes.progress,
  todo: tonePalettes.neutral,
  blocked: tonePalettes.danger,
}
const LOAD_TONE: Record<PaperWarehouseLoadStatus, { bg: string; fg: string }> = {
  done: tonePalettes.done,
  running: tonePalettes.progress,
  todo: tonePalettes.neutral,
  failed: tonePalettes.danger,
}

// 배지를 누르면 다음 상태로 돈다. 상태 넷을 고르는 데 뜬 창까지 띄울 일은 아니다.
const STAGE_NEXT: Record<PaperWarehouseStageStatus, PaperWarehouseStageStatus> = {
  todo: 'running', running: 'done', done: 'blocked', blocked: 'todo',
}
const LOAD_NEXT: Record<PaperWarehouseLoadStatus, PaperWarehouseLoadStatus> = {
  todo: 'running', running: 'done', done: 'failed', failed: 'todo',
}

const SOURCE_LABEL: Record<string, string> = { openalex: 'OpenAlex', kci: 'KCI' }

function formatCount(value: number | null): string {
  return value === null ? '—' : value.toLocaleString()
}
function formatGb(value: number | null): string {
  return value === null ? '—' : `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })} GB`
}
function formatSeconds(value: number | null): string {
  if (value === null) return '—'
  if (value < 60) return `${value}초`
  return `${Math.floor(value / 60)}분 ${value % 60}초`
}
function formatCost(value: number | null): string {
  return value === null ? '—' : `$${Number(value).toFixed(2)}`
}
function formatWhen(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const LOAD_COLUMNS: LColumn<PaperWarehouseLoad>[] = [
  { key: 'source', label: '출처', width: '72px', hideMobile: true },
  { key: 'table', label: '테이블', width: 'minmax(180px,1.4fr)' },
  { key: 'label', label: '내용', width: 'minmax(80px,0.8fr)', hideMobile: true },
  { key: 'status', label: '상태', width: '68px', align: 'center' },
  { key: 'rows', label: '행', width: 'minmax(96px,0.8fr)', align: 'right' },
  { key: 'scan', label: '스캔', width: '84px', align: 'right', hideMobile: true },
  { key: 'seconds', label: '소요', width: '72px', align: 'right', hideMobile: true },
  { key: 'cost', label: '비용', width: '64px', align: 'right' },
  { key: 'note', label: '메모', width: 'minmax(140px,1.2fr)', hideMobile: true },
  { key: 'updated', label: '갱신', width: '84px', align: 'right', hideMobile: true },
]

/** 제자리에서 고치는 한 줄 메모. 누르면 입력칸이 되고 빠져나오면 저장한다. */
function NoteCell({ value, onSave }: { value: string | null; onSave: (next: string) => void }) {
  const [editing, setEditing] = useState(false)
  // 들어갈 때 지금 값을 담는다. 밖에서 값이 바뀌어도 쓰던 글을 덮지 않는다.
  const [draft, setDraft] = useState('')

  if (!editing) {
    return (
      <span
        onClick={e => { e.stopPropagation(); setDraft(value ?? ''); setEditing(true) }}
        title={value ?? '메모 적기'}
        style={{
          color: value ? t.neutrals.muted : t.neutrals.subtle, cursor: 'text',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {value || '—'}
      </span>
    )
  }
  return (
    <input
      autoFocus
      value={draft}
      onClick={e => e.stopPropagation()}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { setEditing(false); if (draft !== (value ?? '')) onSave(draft) }}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false) }
      }}
      style={{
        width: '100%', minWidth: 0, boxSizing: 'border-box',
        background: t.neutrals.card, border: `1px solid ${t.neutrals.line}`, borderRadius: t.radius.sm,
        padding: '2px 6px', fontSize: 'inherit', fontFamily: t.font.sans, color: t.neutrals.text,
      }}
    />
  )
}

export default function PapersPage() {
  const mobile = useIsMobile()
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stages, setStages] = useState<PaperWarehouseStage[]>([])
  const [loads, setLoads] = useState<PaperWarehouseLoad[]>([])

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/paper-warehouse', { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      const json = await res.json()
      setStages(json.stages ?? [])
      setLoads(json.loads ?? [])
    } catch {
      setError('적재 현황을 불러오지 못했습니다. 새로고침으로 다시 시도해 주세요.')
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useAgentRefresh(['paper_'], load)

  const patch = useCallback(async (body: Record<string, unknown>) => {
    try {
      const res = await fetch('/api/paper-warehouse', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(String(res.status))
      const json = await res.json()
      if (json.stage) setStages(prev => prev.map(s => (s.key === json.stage.key ? json.stage : s)))
      if (json.load) setLoads(prev => prev.map(l => (l.id === json.load.id ? json.load : l)))
    } catch {
      setError('저장하지 못했습니다. 다시 시도해 주세요.')
    }
  }, [])

  const summary = useMemo(() => {
    const stageDone = stages.filter(s => s.status === 'done').length
    const loadDone = loads.filter(l => l.status === 'done').length
    const scanned = loads.reduce((sum, l) => sum + Number(l.scanned_gb ?? 0), 0)
    const cost = loads.reduce((sum, l) => sum + Number(l.cost_usd ?? 0), 0)
    const rows = loads.reduce((sum, l) => sum + Number(l.row_count ?? 0), 0)
    const snapshot = loads.find(l => l.snapshot)?.snapshot ?? null
    const blocked = stages.filter(s => s.status === 'blocked').length
      + loads.filter(l => l.status === 'failed').length
    const running = stages.find(s => s.status === 'running')
    return { stageDone, loadDone, scanned, cost, rows, snapshot, blocked, running }
  }, [stages, loads])

  if (!loaded) {
    return (
      <LCard>
        <LSectionHead eyebrow="PAPER WAREHOUSE" title="논문데이터" />
        <div style={{ color: t.neutrals.subtle, fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))` }}>불러오는 중</div>
      </LCard>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.blockGap }}>
      <LCard>
        <LSectionHead
          eyebrow="PAPER WAREHOUSE"
          title="논문데이터 적재"
          meta={summary.running ? `${summary.running.seq}단계 ${summary.running.title} 진행 중` : undefined}
        />
        {error && <div style={{ marginBottom: t.density.gapMd }}><LNotice tone="danger" text={error} /></div>}
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: t.density.kpiGap }}>
          <LStat
            label="단계"
            value={`${summary.stageDone}/${stages.length}`}
            sub={summary.blocked > 0 ? `막힘 ${summary.blocked}건` : undefined}
            tone={summary.blocked > 0 ? 'neg' : 'default'}
          />
          <LStat
            label="적재 테이블"
            value={`${summary.loadDone}/${loads.length}`}
            sub={summary.snapshot ? `스냅샷 ${summary.snapshot}` : undefined}
          />
          <LStat
            label="누적 스캔"
            value={formatGb(summary.scanned)}
            title="Athena 가 실제로 읽은 양. 비용은 스캔량으로 매겨지고, IAM 사용자에게 비용 조회 권한이 없어 이 합이 유일한 실측이다."
          />
          <LStat
            label="누적 비용"
            value={formatCost(summary.cost)}
            sub={summary.rows > 0 ? `${summary.rows.toLocaleString()}행` : undefined}
          />
        </div>
        <LCardFoot left="AWS 965522962451 · us-east-1 · biblo-paper-data-warehouse" />
      </LCard>

      <LCard>
        <LSectionHead title="단계" mb={10} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.tableRowGap }}>
          {stages.map(s => (
            <div key={s.key} style={{
              display: 'grid',
              gridTemplateColumns: mobile ? '20px 1fr 68px' : '20px minmax(140px,1fr) 68px minmax(160px,2fr) 84px',
              gap: t.density.tableColGap, alignItems: 'center',
              padding: `6px ${t.density.tableRowPadX}px`,
              background: t.neutrals.inner, borderRadius: t.radius.sm,
              fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`,
            }}>
              <span style={{ fontFamily: t.font.mono, color: t.neutrals.subtle }}>{s.seq}</span>
              <span style={{ color: t.neutrals.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</span>
              <span
                onClick={() => patch({ kind: 'stage', key: s.key, status: STAGE_NEXT[s.status] })}
                title="눌러서 상태 바꾸기"
                style={{ cursor: 'pointer', display: 'block' }}
              >
                <LTableBadge tone={STAGE_TONE[s.status]}>{PAPER_STAGE_STATUS_LABEL[s.status]}</LTableBadge>
              </span>
              {!mobile && <NoteCell value={s.note} onSave={note => patch({ kind: 'stage', key: s.key, note })} />}
              {!mobile && (
                <span style={{ fontFamily: t.font.mono, fontSize: `calc(11px * var(--fz, 1))`, color: t.neutrals.subtle, textAlign: 'right' }}>
                  {formatWhen(s.updated_at)}
                </span>
              )}
            </div>
          ))}
        </div>
        <LCardFoot left="상태 배지를 누르면 미착수 → 진행 중 → 완료 → 막힘 순으로 돈다" />
      </LCard>

      <LCard>
        <LSectionHead title="테이블별 적재" mb={10} />
        <LTableScroll columns={LOAD_COLUMNS} mobile={mobile}>
          <LTableHead columns={LOAD_COLUMNS} mobile={mobile} />
          <LTableBody columns={LOAD_COLUMNS} mobile={mobile}>
            {loads.map(l => (
              <LTableRow key={l.id} columns={LOAD_COLUMNS} mobile={mobile}>
                {!mobile && <span style={{ color: t.neutrals.muted }}>{SOURCE_LABEL[l.source] ?? l.source}</span>}
                <span style={{ fontFamily: t.font.mono, color: t.neutrals.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.table_name}</span>
                {!mobile && <span style={{ color: t.neutrals.muted }}>{l.label ?? '—'}</span>}
                <span
                  onClick={() => patch({ kind: 'load', source: l.source, table_name: l.table_name, status: LOAD_NEXT[l.status] })}
                  title="눌러서 상태 바꾸기"
                  style={{ cursor: 'pointer', display: 'block' }}
                >
                  <LTableBadge tone={LOAD_TONE[l.status]}>{PAPER_LOAD_STATUS_LABEL[l.status]}</LTableBadge>
                </span>
                <span style={{ fontFamily: t.font.mono, fontSize: `calc(11px * var(--fz, 1))`, color: t.neutrals.text, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCount(l.row_count)}</span>
                {!mobile && <span style={{ fontFamily: t.font.mono, fontSize: `calc(11px * var(--fz, 1))`, color: t.neutrals.muted, textAlign: 'right' }}>{formatGb(l.scanned_gb)}</span>}
                {!mobile && <span style={{ fontFamily: t.font.mono, fontSize: `calc(11px * var(--fz, 1))`, color: t.neutrals.muted, textAlign: 'right' }}>{formatSeconds(l.seconds)}</span>}
                <span style={{ fontFamily: t.font.mono, fontSize: `calc(11px * var(--fz, 1))`, color: t.neutrals.muted, textAlign: 'right' }}>{formatCost(l.cost_usd)}</span>
                {!mobile && <NoteCell value={l.note} onSave={note => patch({ kind: 'load', source: l.source, table_name: l.table_name, note })} />}
                {!mobile && (
                  <span style={{ fontFamily: t.font.mono, fontSize: `calc(11px * var(--fz, 1))`, color: t.neutrals.subtle, textAlign: 'right' }}>
                    {formatWhen(l.updated_at)}
                  </span>
                )}
              </LTableRow>
            ))}
          </LTableBody>
        </LTableScroll>
        <LCardFoot
          left="행 수·스캔량·비용은 AWS 를 실제로 돌린 쪽이 적는다 (scripts/paper-warehouse-report.mjs)"
          right={`${loads.length}개`}
        />
      </LCard>
    </div>
  )
}
