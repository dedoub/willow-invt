'use client'

/**
 * 논문 데이터 웨어하우스 관리 화면.
 *
 * 구성은 설계 문서(비공개 Artifact PmZU3LLA1r2oPJvmaFGiXh)의 뼈대를 그대로 따른다 —
 * 요약 · 갱신 파이프라인 다섯 단계 · 출처 · 데이터와 스키마 · 비용 · 결정이 필요한 것.
 * 카드 문법은 윌로우 사업관리(/mgmt): LCard pad={0} 안에서 머리 블록과 표 블록을 직접
 * 나누고, 지표는 상자 없이 FigureGrid 로 눕힌다.
 *
 * 상태를 사람이 고르지 않는다. scripts/paper-warehouse-sync.mjs 가 AWS 를 직접 보고
 * (Glue 카탈로그 · S3 목록 · Athena count · 원본 매니페스트) 적어 둔 것만 읽는다.
 * 그래서 "마지막 확인"을 지표 한 칸으로 크게 적는다 — 숫자가 언제 기준인지가 곧 신뢰도다.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { t, tonePalettes, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LNotice } from '@/app/(dashboard)/_components/linear-notice'
import { FigureGrid, type FigureItem } from '@/app/(dashboard)/_components/linear-figure-grid'
import {
  LTableBadge, LTableBody, LTableEmpty, LTableHead, LTableMono, LTableNumber, LTableRow, LTableScroll,
  useTableSort, type LColumn,
} from '@/app/(dashboard)/_components/linear-table'
import { useAgentRefresh } from '@/hooks/use-agent-refresh'
import {
  PAPER_DATASET_STATUS_LABEL, type PaperDataset, type PaperDatasetStatus, type PaperPipeline, type PaperSyncMeta,
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
  unified: '통합 계층',
}

// 설계 문서의 비용 근거. 실측 용량에 곱해 쓰는 단가와, 문서가 실측해 둔 1회 비용이다.
const COST = {
  storagePerGbMonth: 0.023,   // S3 표준
  archivePerSnapshot: 1.2,    // Glacier IR, 과거 스냅샷 1개당 월
  rebuild: 2.75,              // 전량 재구축 1회 (568.8 GB 스캔 실측)
  queryLow: 20,
  queryHigh: 80,
}

// 설계 문서 "결정이 필요한 것". 값이 아니라 판단이라 AWS 에서 읽어 올 수 없다 —
// 문서가 바뀌면 여기도 함께 고친다.
const DECISIONS: Array<{ item: string; detail: string; state: 'open' | 'settled' }> = [
  { item: '갱신 주기', detail: '원본이 분기 갱신이라 월 1회 계획은 조정이 필요하다. 더 자주 필요하면 유료 플랜 검토', state: 'open' },
  { item: 'KCI 보강 API', detail: '참고문헌·ORCID 를 위해 키를 받아 논문당 추가 호출을 할지. 243만 건이면 호출량이 크다', state: 'open' },
  { item: '버전 보존 기간', detail: `과거 스냅샷을 몇 개까지 남길지. 개당 월 $${COST.archivePerSnapshot}`, state: 'open' },
  { item: 'concepts 테이블', detail: '가장 크지만 OpenAlex 가 topics 로 대체 중이다. 버릴지 판단 필요', state: 'open' },
  { item: 'Athena 직접 읽기', detail: '서명 요청으로 정상 읽힘. 사본 불필요 — 월 $2.9 절감', state: 'settled' },
  { item: '기관 사전', detail: 'OpenAlex 가 한글 표기 90.8% 를 이미 제공한다. 1회 구축으로 끝나며 수작업은 9곳', state: 'settled' },
  { item: '초록 보관', detail: '보관하기로 확정. 자리를 많이 먹지만 임베딩과 AI 요약의 재료가 된다', state: 'settled' },
]

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

/** s3 경로의 첫 칸이 곧 영역이다 — warehouse(원본) · unified(통합) · derived(소비 팀) */
function zoneOf(d: PaperDataset): string {
  const p = d.location ?? ''
  if (p.includes('/warehouse/')) return 'warehouse'
  if (p.includes('/unified/')) return 'unified'
  if (p.includes('/derived/')) return 'derived'
  return '-'
}

const COLUMNS: LColumn<PaperDataset>[] = [
  { key: 'status', label: '상태', width: '60px', align: 'center', sortValue: d => d.status },
  { key: 'zone', label: '영역', width: '76px', sortValue: zoneOf, hideMobile: true },
  { key: 'table', label: '표', width: 'minmax(180px,1.4fr)', sortValue: d => d.table_name },
  { key: 'label', label: '내용', width: 'minmax(90px,0.8fr)', sortValue: d => d.label ?? '', hideMobile: true },
  { key: 'rows', label: '행', width: 'minmax(104px,1fr)', align: 'right', sortValue: d => d.row_count ?? -1, sortFirst: 'desc' },
  { key: 'bytes', label: '용량', width: '84px', align: 'right', sortValue: d => d.bytes ?? -1, sortFirst: 'desc' },
  { key: 'cols', label: '열', width: '44px', align: 'right', sortValue: d => d.columns?.length ?? -1, sortFirst: 'desc', hideMobile: true },
  { key: 'snapshot', label: '스냅샷', width: '84px', sortValue: d => d.snapshot ?? '', hideMobile: true },
]

interface SourceRow {
  key: string
  label: string
  snapshot: string
  tables: number
  done: number
  rows: number
  bytes: number
  note: string
}

const SOURCE_COLUMNS: LColumn<SourceRow>[] = [
  { key: 'source', label: '출처', width: '96px', sortValue: r => r.label },
  { key: 'snapshot', label: '스냅샷', width: '92px', sortValue: r => r.snapshot, sortFirst: 'desc' },
  { key: 'progress', label: '적재', width: 'minmax(120px,1fr)' },
  { key: 'tables', label: '표', width: '64px', align: 'right', sortValue: r => r.done, sortFirst: 'desc' },
  { key: 'rows', label: '행', width: 'minmax(104px,1fr)', align: 'right', sortValue: r => r.rows, sortFirst: 'desc', hideMobile: true },
  { key: 'bytes', label: '용량', width: '84px', align: 'right', sortValue: r => r.bytes, sortFirst: 'desc' },
  { key: 'note', label: '비고', width: 'minmax(140px,1fr)', hideMobile: true },
]

/** 한 표의 스키마. 행을 누르면 그 자리에서 펼친다 — 뜬 창을 띄우면 표를 덮는다. */
function SchemaPanel({ dataset }: { dataset: PaperDataset }) {
  const columns = dataset.columns ?? []
  return (
    <div style={{
      padding: `${t.density.gapSm}px ${t.density.tableRowPadX}px ${t.density.gapMd}px`,
      display: 'flex', flexDirection: 'column', gap: t.density.gapSm,
    }}>
      <div style={{
        fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, fontFamily: t.font.mono,
        color: t.neutrals.subtle, wordBreak: 'break-all',
      }}>
        {dataset.location}
      </div>
      {columns.length === 0 ? (
        <div style={{ fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, color: t.neutrals.subtle }}>
          열 정보를 아직 못 읽었어요.
        </div>
      ) : (
        <div style={{
          display: 'grid', gap: `0 ${t.density.gapMd}px`,
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        }}>
          {columns.map(c => (
            <div key={c.name} style={{
              display: 'flex', gap: t.density.gapSm, minWidth: 0,
              borderBottom: `1px solid ${t.neutrals.line}`, padding: `${t.density.tableRowGap}px 0`,
            }}>
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

/** 파이프라인 한 단계. 판정은 확인된 사실에서만 나온다. */
function StageRow({ step, what, ok, detail, mobile }: {
  step: string; what: string; ok: boolean | null; detail: string; mobile: boolean
}) {
  const tone = ok === null ? tonePalettes.neutral : ok ? tonePalettes.done : tonePalettes.warn
  const label = ok === null ? '확인 전' : ok ? '정상' : '할 일'
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: mobile ? '84px 1fr 56px' : '96px 220px 56px 1fr',
      gap: t.density.tableColGap, alignItems: 'center',
      padding: `6px ${t.density.tableRowPadX}px`,
      background: t.neutrals.inner, borderRadius: t.radius.sm,
      fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`,
    }}>
      <span style={{ fontFamily: t.font.mono, color: t.neutrals.text }}>{step}</span>
      {!mobile && <span style={{ color: t.neutrals.muted }}>{what}</span>}
      <span style={{ order: mobile ? 2 : 0 }}><LTableBadge tone={tone}>{label}</LTableBadge></span>
      <span style={{
        color: t.neutrals.muted, minWidth: 0,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }} title={detail}>{detail}</span>
    </div>
  )
}

export default function PapersPage() {
  const mobile = useIsMobile()
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [datasets, setDatasets] = useState<PaperDataset[]>([])
  const [lastSync, setLastSync] = useState<PaperSyncMeta | null>(null)
  const [pipeline, setPipeline] = useState<PaperPipeline | null>(null)
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
      setPipeline(json.pipeline ?? null)
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
    const bytes = live.reduce((s, d) => s + Number(d.bytes ?? 0), 0)
    return {
      tables: live.length,
      rows: live.reduce((s, d) => s + Number(d.row_count ?? 0), 0),
      bytes,
      storageCost: (bytes / 1e9) * COST.storagePerGbMonth,
      loading: datasets.filter(d => d.status === 'running').length,
      snapshot: live.find(d => d.snapshot)?.snapshot ?? null,
    }
  }, [datasets])

  // 출처별 한 줄. KCI 는 아직 표가 없으므로 목표만 적어 한 줄로 세운다 — 2차 소스가
  // 빠져 있다는 사실이 화면에서 사라지면 안 된다(설계 문서: 국문은 OpenAlex 로 못 채운다).
  const sources = useMemo<SourceRow[]>(() => {
    const groups = new Map<string, PaperDataset[]>()
    for (const d of datasets) {
      const arr = groups.get(d.source) ?? []
      arr.push(d)
      groups.set(d.source, arr)
    }
    const rows: SourceRow[] = [...groups.entries()].map(([source, items]) => ({
      key: source,
      label: SOURCE_LABEL[source] ?? source,
      snapshot: items.find(d => d.snapshot)?.snapshot ?? '',
      tables: items.length,
      done: items.filter(d => d.status === 'done').length,
      rows: items.reduce((s, d) => s + Number(d.row_count ?? 0), 0),
      bytes: items.reduce((s, d) => s + Number(d.bytes ?? 0), 0),
      note: source === 'openalex' ? '국제 논문. CC0 — 상업적 이용·재판매 자유'
        : source === 'unified' ? '기관 사전. 대학 확장의 축'
          : '',
    }))
    if (!groups.has('kci')) {
      rows.push({
        key: 'kci', label: 'KCI', snapshot: '', tables: 0, done: 0, rows: 0, bytes: 0,
        note: '국문 논문 243만 건. OAI-PMH · 공공누리 1유형 — 미착수',
      })
    }
    return rows
  }, [datasets])

  const { sort: srcSort, toggle: toggleSrcSort, apply: srcApply } = useTableSort<SourceRow>('paper-sources', SOURCE_COLUMNS)
  const sortedSources = useMemo(() => srcApply(sources), [sources, srcApply])
  const sorted = useMemo(() => sortApply(datasets), [datasets, sortApply])

  if (!loaded) {
    return (
      <LCard pad={0}>
        <div style={{ padding: t.density.cardPad }}>
          <LSectionHead title="논문데이터" mb={0} />
          <div style={{
            paddingTop: t.density.panelPadY,
            fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, color: t.neutrals.subtle,
          }}>불러오는 중</div>
        </div>
      </LCard>
    )
  }

  const summaryFigures: FigureItem[] = [
    { label: '적재 행', value: summary.rows.toLocaleString(), mono: true },
    { label: '용량', value: formatBytes(summary.bytes), mono: true },
    {
      label: '표',
      value: `${summary.tables}개`,
      mono: true,
      sub: summary.loading > 0 ? `${summary.loading}개 적재 중` : summary.snapshot ? `스냅샷 ${summary.snapshot}` : undefined,
      tone: summary.loading > 0 ? 'info' : undefined,
    },
    {
      label: '마지막 확인',
      value: formatAgo(lastSync?.at ?? null),
      sub: lastSync ? `${lastSync.tables}개 표 · Athena 스캔 ${lastSync.scanned_bytes.toLocaleString()}B` : undefined,
      title: 'AWS 를 직접 보고 적은 시각. count(*) 는 파케이 메타만 읽어 스캔이 0바이트라 자주 확인해도 Athena 비용이 붙지 않는다.',
    },
    {
      label: '저장 위치',
      value: 'Glue biblo_warehouse · Athena biblo-warehouse-etl',
      sub: 'AWS 965522962451 · us-east-1 · s3://biblo-paper-data-warehouse',
      mono: true,
      span: mobile ? 2 : 4,
      wrap: true,
    },
  ]

  const costFigures: FigureItem[] = [
    {
      label: '보관 (실측)',
      value: `$${summary.storageCost.toFixed(2)} / 월`,
      sub: `${formatBytes(summary.bytes)} × $${COST.storagePerGbMonth}/GB`,
      mono: true,
    },
    {
      label: '과거 스냅샷',
      value: `$${COST.archivePerSnapshot.toFixed(2)} / 월`,
      sub: 'Glacier IR · 스냅샷 1개당',
      mono: true,
    },
    {
      label: '전량 재구축',
      value: `$${COST.rebuild.toFixed(2)} / 회`,
      sub: '568.8 GB 스캔 실측 · 분기 1회',
      mono: true,
    },
    {
      label: '팀 쿼리',
      value: `$${COST.queryLow}~${COST.queryHigh} / 월`,
      sub: '월 500회 · 컬럼 선택 가정',
      mono: true,
    },
  ]

  const upstream = pipeline?.upstream
  const staged = pipeline?.staged ?? []
  const checks = pipeline?.checks ?? []
  const checksOk = checks.length > 0 && checks.every(c => c.ok)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.blockGap }}>
      {/* 1) 요약 — 문서의 "핵심 수치" 자리 */}
      <LCard pad={0}>
        <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadY }}>
          <div style={{ paddingBottom: t.density.panelPadY }}>
            <LSectionHead
              title="논문데이터"
              meta="전 세계 논문 원본을 상시 보유하고 정기 갱신한다. 원본과 통합 계층이 우리 몫이고, 파생과 서비스 DB 는 소비 팀 몫이다"
              tools={(
                <LBtn variant="secondary" size="sm" onClick={() => { window.location.href = '/api/paper-warehouse/guide' }}>
                  사용법 문서
                </LBtn>
              )}
              toolsInline
              mb={0}
            />
          </div>
          {error && <div style={{ paddingBottom: t.density.panelPadY }}><LNotice tone="danger" text={error} /></div>}
          {pipeline?.behind && (
            <div style={{ paddingBottom: t.density.panelPadY }}>
              <LNotice tone="warn" text={`원본에 새 스냅샷 ${upstream?.snapshot} 이 떴습니다. 우리 최신은 ${pipeline.our_snapshot} 입니다.`} />
            </div>
          )}
          <FigureGrid items={summaryFigures} cols={mobile ? 2 : 4} />
        </div>
      </LCard>

      {/* 2) 갱신 파이프라인 — 문서의 다섯 단계를 확인된 사실로만 채운다 */}
      <LCard pad={0}>
        <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadY }}>
          <LSectionHead
            title="갱신 파이프라인"
            meta="원본 공개 스냅샷은 분기 갱신이다. 새 스냅샷이 뜨면 아래 다섯 단계가 한 바퀴 돈다"
            mb={0}
          />
        </div>
        <div style={{
          padding: `0 ${t.density.cardPad}px ${t.density.gapSm}px`,
          display: 'flex', flexDirection: 'column', gap: t.density.tableRowGap,
        }}>
          <StageRow
            mobile={mobile} step="watch" what="새 스냅샷이 떴는지 본다"
            ok={pipeline ? !pipeline.behind : null}
            detail={upstream?.snapshot
              ? `원본 ${upstream.snapshot} · 우리 ${pipeline?.our_snapshot ?? '-'}${pipeline?.behind ? ' — 갱신 필요' : ' — 최신'}`
              : '원본 매니페스트를 아직 못 읽었어요'}
          />
          <StageRow
            mobile={mobile} step="stage" what="원본을 읽을 자리에 놓는다"
            ok={pipeline ? staged.length > 0 : null}
            detail={staged.length > 0 ? `외부 테이블 ${staged.join(', ')}` : '등록된 외부 테이블이 없어요'}
          />
          <StageRow
            mobile={mobile} step="transform" what="중첩을 펼쳐 표로 만든다"
            ok={pipeline ? pipeline.tables_done === pipeline.tables_total : null}
            detail={pipeline ? `${pipeline.tables_done}/${pipeline.tables_total} 표 적재` : '-'}
          />
          <StageRow
            mobile={mobile} step="validate" what="원본 레코드 수와 대조한다"
            ok={pipeline ? checksOk : null}
            detail={checks.length > 0
              ? checks.map(c => `${c.entity} ${c.actual?.toLocaleString() ?? '?'}${c.ok ? ' 일치' : ` ≠ ${c.expected?.toLocaleString() ?? '?'}`}`).join(' · ')
              : '대조할 매니페스트를 아직 못 읽었어요'}
          />
          <StageRow
            mobile={mobile} step="publish" what="카탈로그를 갱신하고 최신을 가리킨다"
            ok={pipeline ? pipeline.tables_done > 0 : null}
            detail={`Glue biblo_warehouse 에 ${pipeline?.tables_total ?? 0}개 표 등록`}
          />
        </div>
      </LCard>

      {/* 3) 출처 — OpenAlex 는 들어왔고 KCI 는 아직이다 */}
      <LCard pad={0}>
        <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadY }}>
          <LSectionHead
            title="출처"
            meta="국문 논문은 OpenAlex 로 채울 수 없다 — 2022년 이후 국문 유입이 멈췄다. KCI 가 2차 소스다"
            mb={0}
          />
        </div>
        <div style={{ padding: `0 ${t.density.cardPad}px ${t.density.gapSm}px` }}>
          <LTableScroll columns={SOURCE_COLUMNS} mobile={mobile}>
            <LTableHead columns={SOURCE_COLUMNS} mobile={mobile} sort={srcSort} onSort={toggleSrcSort} />
            <LTableBody columns={SOURCE_COLUMNS} mobile={mobile}>
              {sortedSources.map(r => {
                const pct = r.tables > 0 ? Math.round((r.done / r.tables) * 100) : 0
                return (
                  <LTableRow key={r.key} columns={SOURCE_COLUMNS} mobile={mobile}>
                    <span style={{ fontWeight: t.weight.medium }}>{r.label}</span>
                    <LTableMono tone="muted">{r.snapshot || '—'}</LTableMono>
                    <span style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm, minWidth: 0 }}>
                      <span style={{ flex: 1, height: 4, borderRadius: 2, background: t.neutrals.line, overflow: 'hidden' }}>
                        <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: t.chart.mono }} />
                      </span>
                      <span style={{
                        fontFamily: t.font.mono, fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`,
                        color: t.neutrals.subtle, whiteSpace: 'nowrap',
                      }}>{pct}%</span>
                    </span>
                    <LTableMono align="right" tone="muted">{r.done}/{r.tables}</LTableMono>
                    {!mobile && <LTableNumber value={r.rows} muted={r.rows === 0} />}
                    <LTableMono align="right" tone="muted">{r.bytes > 0 ? formatBytes(r.bytes) : '—'}</LTableMono>
                    {!mobile && (
                      <span style={{ color: t.neutrals.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.note}>
                        {r.note}
                      </span>
                    )}
                  </LTableRow>
                )
              })}
            </LTableBody>
          </LTableScroll>
        </div>
      </LCard>

      {/* 4) 데이터 — 무엇이 얼마나, 그리고 스키마 */}
      <LCard pad={0}>
        <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadY }}>
          <LSectionHead
            title="데이터"
            meta="표를 누르면 스키마가 펼쳐진다. 행 수·용량·열은 AWS 에서 직접 읽은 값이다"
            mb={0}
          />
        </div>
        <div style={{ padding: `0 ${t.density.cardPad}px ${t.density.gapSm}px` }}>
          <LTableScroll columns={COLUMNS} mobile={mobile}>
            <LTableHead columns={COLUMNS} mobile={mobile} sort={sort} onSort={toggleSort} />
            {sorted.length === 0 && <LTableEmpty>아직 적재된 표가 없습니다</LTableEmpty>}
            <LTableBody columns={COLUMNS} mobile={mobile}>
              {sorted.map(d => (
                <div key={d.id}>
                  <LTableRow
                    columns={COLUMNS} mobile={mobile}
                    onClick={() => setOpenTable(prev => (prev === d.id ? null : d.id))}
                  >
                    <LTableBadge tone={STATUS_TONE[d.status]}>{PAPER_DATASET_STATUS_LABEL[d.status]}</LTableBadge>
                    {!mobile && <LTableMono tone="muted">{zoneOf(d)}</LTableMono>}
                    <LTableMono>{d.table_name}</LTableMono>
                    {!mobile && (
                      <span style={{ color: t.neutrals.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {d.label ?? '—'}
                      </span>
                    )}
                    <LTableNumber value={d.row_count ?? 0} muted={d.row_count === null} />
                    <LTableMono align="right" tone="muted">{formatBytes(d.bytes)}</LTableMono>
                    {!mobile && <LTableMono align="right" tone="muted">{d.columns?.length ?? '-'}</LTableMono>}
                    {!mobile && <LTableMono tone="muted">{d.snapshot ?? '—'}</LTableMono>}
                  </LTableRow>
                  {openTable === d.id && <SchemaPanel dataset={d} />}
                </div>
              ))}
            </LTableBody>
          </LTableScroll>
        </div>
      </LCard>

      {/* 5) 비용 — 보관은 실측 용량에서 계산하고, 나머지는 문서의 실측값 */}
      <LCard pad={0}>
        <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadY }}>
          <div style={{ paddingBottom: t.density.panelPadY }}>
            <LSectionHead
              title="비용"
              meta="IAM 사용자에게 비용 조회 권한이 없다. 보관비는 실측 용량에 단가를 곱해 내고, 쿼리는 스캔량으로 본다"
              mb={0}
            />
          </div>
          <FigureGrid items={costFigures} cols={mobile ? 2 : 4} />
        </div>
      </LCard>

      {/* 6) 결정이 필요한 것 — 문서에서 옮겨 온 판단거리 */}
      <LCard pad={0}>
        <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadY }}>
          <LSectionHead
            title="결정이 필요한 것"
            meta="설계 문서에서 옮겨 왔다. 값이 아니라 판단이라 AWS 에서 읽어 올 수 없다"
            mb={0}
          />
        </div>
        <div style={{
          padding: `0 ${t.density.cardPad}px ${t.density.gapSm}px`,
          display: 'flex', flexDirection: 'column', gap: t.density.tableRowGap,
        }}>
          {DECISIONS.map(d => (
            <div key={d.item} style={{
              display: 'grid',
              gridTemplateColumns: mobile ? '1fr 64px' : '160px 1fr 64px',
              gap: t.density.tableColGap, alignItems: 'center',
              padding: `6px ${t.density.tableRowPadX}px`,
              background: t.neutrals.inner, borderRadius: t.radius.sm,
              fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`,
            }}>
              <span style={{ color: t.neutrals.text, fontWeight: t.weight.medium }}>{d.item}</span>
              {!mobile && (
                <span style={{ color: t.neutrals.muted, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={d.detail}>
                  {d.detail}
                </span>
              )}
              <LTableBadge tone={d.state === 'open' ? tonePalettes.pending : tonePalettes.done}>
                {d.state === 'open' ? '결정 필요' : '정해짐'}
              </LTableBadge>
            </div>
          ))}
        </div>
      </LCard>
    </div>
  )
}
