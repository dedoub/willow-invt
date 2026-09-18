'use client'

/**
 * 논문 데이터 웨어하우스 — 무엇이 얼마나 들어 있고, 스키마가 무엇이고, 갱신이 어디까지 왔나.
 *
 * 상태를 사람이 고르지 않는다. scripts/paper-warehouse-sync.mjs 가 AWS 를 직접 보고
 * (Glue 카탈로그·S3 목록·Athena count) 표를 덮어쓰고, 이 화면은 그걸 읽기만 한다.
 * 그래서 "마지막 확인"을 크게 적는다 — 숫자가 언제 기준인지가 곧 신뢰도다.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { t, tonePalettes, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LCardFoot } from '@/app/(dashboard)/_components/linear-card-foot'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LNotice } from '@/app/(dashboard)/_components/linear-notice'
import {
  LTableBadge, LTableBody, LTableEmpty, LTableHead, LTableMono, LTableNumber, LTableRow, LTableScroll,
  useTableSort, type LColumn,
} from '@/app/(dashboard)/_components/linear-table'
import { useAgentRefresh } from '@/hooks/use-agent-refresh'
import {
  PAPER_DATASET_STATUS_LABEL, type PaperDataset, type PaperDatasetStatus, type PaperSyncMeta,
} from '@/types/paper-warehouse'

const STATUS_TONE: Record<PaperDatasetStatus, { bg: string; fg: string }> = {
  done: tonePalettes.done,
  running: tonePalettes.progress,
  todo: tonePalettes.neutral,
  failed: tonePalettes.danger,
}

const SOURCE_LABEL: Record<string, string> = {
  openalex: 'OpenAlex',
  kci: 'KCI',
  unified: '공용',
}

function formatBytes(n: number | null): string {
  if (n === null || n === undefined) return '-'
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)} TB`
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`
  return `${Math.round(n).toLocaleString()} B`
}

function formatAgo(iso: string | null): string {
  if (!iso) return '확인 전'
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return '방금'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.round(hours / 24)}일 전`
}

// 폭은 전부 px 하한을 갖는다 — minmax(0,…) 로 두면 좁은 화면에서 열이 0까지 줄어
// 가로 스크롤 대신 표가 찌그러진다(현금관리 표와 같은 규칙).
const COLUMNS: LColumn<PaperDataset>[] = [
  { key: 'table', label: '표', width: 'minmax(180px,1.4fr)', sortValue: d => d.table_name },
  { key: 'label', label: '내용', width: 'minmax(90px,0.8fr)', sortValue: d => d.label ?? '', hideMobile: true },
  { key: 'status', label: '상태', width: '60px', align: 'center', sortValue: d => d.status },
  { key: 'rows', label: '행', width: 'minmax(104px,1fr)', align: 'right', sortValue: d => d.row_count ?? -1, sortFirst: 'desc' },
  { key: 'bytes', label: '용량', width: '84px', align: 'right', sortValue: d => d.bytes ?? -1, sortFirst: 'desc' },
  { key: 'cols', label: '열', width: '44px', align: 'right', sortValue: d => d.columns?.length ?? -1, sortFirst: 'desc', hideMobile: true },
  { key: 'snapshot', label: '스냅샷', width: '84px', sortValue: d => d.snapshot ?? '', hideMobile: true },
]

/** 한 표의 스키마. 행을 누르면 그 자리에서 펼친다 — 뜬 창을 띄우면 표를 덮는다. */
function SchemaPanel({ dataset }: { dataset: PaperDataset }) {
  const columns = dataset.columns ?? []
  return (
    <div style={{
      padding: `${t.density.gapSm}px ${t.density.tableRowPadX}px ${t.density.gapMd}px`,
      display: 'flex', flexDirection: 'column', gap: t.density.gapSm,
    }}>
      <div style={{ fontSize: `calc(${t.type.label}px * var(--fz, 1))`, color: t.neutrals.subtle }}>
        {dataset.location}
      </div>
      {columns.length === 0 ? (
        <div style={{ fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, color: t.neutrals.subtle }}>
          열 정보를 아직 못 읽었어요.
        </div>
      ) : (
        <div style={{
          display: 'grid', gap: `${t.density.tableRowGap}px ${t.density.gapMd}px`,
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        }}>
          {columns.map(c => (
            <div key={c.name} style={{ display: 'flex', gap: t.density.gapSm, minWidth: 0 }}>
              <span style={{
                fontFamily: t.font.mono, fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`,
                color: t.neutrals.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{c.name}</span>
              <span style={{
                fontFamily: t.font.mono, fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`,
                color: t.neutrals.subtle, marginLeft: 'auto', whiteSpace: 'nowrap',
              }}>{c.type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PapersPage() {
  const mobile = useIsMobile()
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [datasets, setDatasets] = useState<PaperDataset[]>([])
  const [lastSync, setLastSync] = useState<PaperSyncMeta | null>(null)
  const [openTable, setOpenTable] = useState<number | null>(null)
  const { sort, toggle: toggleSort, apply: sortApply } = useTableSort<PaperDataset>('paper-datasets', COLUMNS)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/paper-warehouse', { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      const json = await res.json()
      setDatasets(json.datasets ?? [])
      setLastSync(json.lastSync ?? null)
    } catch {
      setError('적재 현황을 불러오지 못했습니다. 새로고침으로 다시 시도해 주세요.')
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useAgentRefresh(['paper_'], load)

  const summary = useMemo(() => {
    const live = datasets.filter(d => d.status !== 'todo')
    return {
      tables: live.length,
      rows: live.reduce((s, d) => s + Number(d.row_count ?? 0), 0),
      bytes: live.reduce((s, d) => s + Number(d.bytes ?? 0), 0),
      loading: datasets.filter(d => d.status === 'running').length,
    }
  }, [datasets])

  // 갱신 회차 = 스냅샷. 원본 공개 스냅샷이 분기마다 바뀌므로, 그 단위로 몇 개 표가
  // 들어왔는지가 곧 이번 갱신의 진행이다. 기대치는 직전 회차에 있던 표 수로 본다.
  const rounds = useMemo(() => {
    const groups = new Map<string, PaperDataset[]>()
    for (const d of datasets) {
      const key = `${d.source}\n${d.snapshot ?? ''}`
      const arr = groups.get(key) ?? []
      arr.push(d)
      groups.set(key, arr)
    }
    const rows = [...groups.entries()].map(([key, items]) => {
      const [source, snapshot] = key.split('\n')
      const done = items.filter(d => d.status === 'done').length
      return {
        key, source, snapshot,
        total: items.length,
        done,
        rows: items.reduce((s, d) => s + Number(d.row_count ?? 0), 0),
        bytes: items.reduce((s, d) => s + Number(d.bytes ?? 0), 0),
        updated: items.reduce((a, d) => (d.updated_at > a ? d.updated_at : a), ''),
      }
    })
    // 최신 스냅샷이 위로. 스냅샷이 없는 공용 차원은 맨 아래.
    return rows.sort((a, b) => (b.snapshot || '0').localeCompare(a.snapshot || '0'))
  }, [datasets])

  const sorted = useMemo(() => sortApply(datasets), [datasets, sortApply])

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
          title="논문데이터"
          meta={`마지막 확인 ${formatAgo(lastSync?.at ?? null)}`}
          tools={(
            <LBtn variant="secondary" size="sm" onClick={() => { window.location.href = '/api/paper-warehouse/guide' }}>
              사용법 문서
            </LBtn>
          )}
        />
        {error && <div style={{ marginBottom: t.density.gapMd }}><LNotice tone="danger" text={error} /></div>}
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: t.density.kpiGap }}>
          <LStat label="적재 행" value={summary.rows.toLocaleString()} unit="행" />
          <LStat label="용량" value={formatBytes(summary.bytes)} />
          <LStat label="표" value={String(summary.tables)} unit="개" sub={summary.loading > 0 ? `${summary.loading}개 적재 중` : undefined} tone={summary.loading > 0 ? 'info' : 'default'} />
          <LStat
            label="마지막 확인"
            value={formatAgo(lastSync?.at ?? null)}
            sub={lastSync ? `${lastSync.tables}개 표 · 스캔 ${lastSync.scanned_bytes.toLocaleString()}B` : undefined}
            title="AWS 를 직접 보고 적은 시각. count(*) 는 파케이 메타만 읽어 스캔이 0바이트라 자주 확인해도 Athena 비용이 붙지 않는다."
          />
        </div>
        <LCardFoot left="AWS 965522962451 · us-east-1 · Glue biblo_warehouse · Athena biblo-warehouse-etl" />
      </LCard>

      <LCard>
        <LSectionHead title="갱신 진행" mb={10} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.tableRowGap }}>
          {rounds.map(r => {
            const pct = r.total > 0 ? Math.round((r.done / r.total) * 100) : 0
            return (
              <div key={r.key} style={{
                display: 'grid',
                gridTemplateColumns: mobile ? '1fr 64px' : '120px 96px 1fr 120px 96px',
                gap: t.density.tableColGap, alignItems: 'center',
                padding: `7px ${t.density.tableRowPadX}px`,
                background: t.neutrals.inner, borderRadius: t.radius.sm,
                fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`,
              }}>
                <span style={{ color: t.neutrals.text }}>
                  {SOURCE_LABEL[r.source] ?? r.source}
                  {r.snapshot && <span style={{ fontFamily: t.font.mono, color: t.neutrals.subtle }}> {r.snapshot}</span>}
                </span>
                {!mobile && (
                  <span style={{ fontFamily: t.font.mono, fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, color: t.neutrals.muted }}>
                    {r.done}/{r.total} 표
                  </span>
                )}
                {!mobile && (
                  <span style={{ display: 'block', height: 4, borderRadius: 2, background: t.neutrals.line, overflow: 'hidden' }}>
                    <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: t.chart.mono }} />
                  </span>
                )}
                {!mobile && (
                  <span style={{ fontFamily: t.font.mono, fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, color: t.neutrals.muted, textAlign: 'right' }}>
                    {r.rows.toLocaleString()}행
                  </span>
                )}
                <span style={{ fontFamily: t.font.mono, fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, color: t.neutrals.subtle, textAlign: 'right' }}>
                  {mobile ? `${r.done}/${r.total}` : formatBytes(r.bytes)}
                </span>
              </div>
            )
          })}
          {rounds.length === 0 && <LTableEmpty>아직 확인된 스냅샷이 없어요.</LTableEmpty>}
        </div>
        <LCardFoot left="원본 공개 스냅샷은 분기 갱신이다. 새 스냅샷이 뜨면 여기 한 줄이 늘고, 표가 하나씩 채워진다" />
      </LCard>

      <LCard>
        <LSectionHead title="데이터" meta="표를 누르면 스키마가 펼쳐진다" mb={10} />
        <LTableScroll columns={COLUMNS} mobile={mobile}>
          <LTableHead columns={COLUMNS} mobile={mobile} sort={sort} onSort={toggleSort} />
          <LTableBody columns={COLUMNS} mobile={mobile}>
            {sorted.map(d => (
              <div key={d.id}>
                <LTableRow
                  columns={COLUMNS} mobile={mobile}
                  onClick={() => setOpenTable(prev => (prev === d.id ? null : d.id))}
                >
                  <LTableMono>{d.table_name}</LTableMono>
                  {!mobile && <span style={{ color: t.neutrals.muted }}>{d.label ?? '—'}</span>}
                  <LTableBadge tone={STATUS_TONE[d.status]}>{PAPER_DATASET_STATUS_LABEL[d.status]}</LTableBadge>
                  <LTableNumber value={d.row_count ?? 0} muted={d.row_count === null} />
                  <LTableMono align="right" tone="muted">{formatBytes(d.bytes)}</LTableMono>
                  {!mobile && <LTableMono align="right" tone="muted">{d.columns?.length ?? '-'}</LTableMono>}
                  {!mobile && <LTableMono tone="muted">{d.snapshot ?? '—'}</LTableMono>}
                </LTableRow>
                {openTable === d.id && <SchemaPanel dataset={d} />}
              </div>
            ))}
            {sorted.length === 0 && <LTableEmpty>아직 적재된 표가 없어요.</LTableEmpty>}
          </LTableBody>
        </LTableScroll>
        <LCardFoot
          left="행 수·용량·스키마는 AWS 에서 직접 읽은 값이다 (scripts/paper-warehouse-sync.mjs)"
          right={`${sorted.length}개`}
        />
      </LCard>
    </div>
  )
}
