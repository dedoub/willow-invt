#!/usr/bin/env node
// 논문 데이터 웨어하우스 현황을 AWS 에서 직접 읽어 대시보드(/papers)에 적는다.
//
//   node scripts/paper-warehouse-sync.mjs           # 확인하고 적는다
//   node scripts/paper-warehouse-sync.mjs --dry     # 적지 않고 보여만 준다
//
// 사람이 상태를 고르지 않는다. 표에 있는 것이 곧 현황이다 —
//   * 어떤 테이블이 있나 · 스키마가 무엇인가 → Glue 카탈로그
//   * 얼마나 쌓였나(용량·파일 수)          → S3 목록
//   * 몇 행인가                            → Athena count(*)
// count(*) 는 parquet 메타만 읽어 스캔이 0바이트다. 실측으로 확인했다(2026-09-18,
// 15개 테이블 한 번에 8.9초·0바이트). 그래서 자주 돌려도 Athena 비용이 붙지 않는다.
//
// 자격증명은 `aws login` 으로 받은 콘솔 세션을 그대로 쓴다. 만료되면 조용히 끝내고
// 마지막 확인 시각만 남긴다 — 화면이 "언제 기준"인지 말해 주므로 거짓말이 되지 않는다.
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createClient } from '@supabase/supabase-js'

const execFileAsync = promisify(execFile)
const ROOT = path.resolve(import.meta.dirname, '..')
const REGION = 'us-east-1'
const BUCKET = 'biblo-paper-data-warehouse'
const GLUE_DB = 'biblo_warehouse'
const WORKGROUP = 'biblo-warehouse-etl'
const OUTPUT = `s3://${BUCKET}/athena-results/etl/`
const DRY = process.argv.includes('--dry')

// 테이블 이름만으로는 무엇이 든 표인지 모른다. 아는 것은 여기 적고, 모르는 것은 비워 둔다.
const LABELS = {
  oa_work_core: '논문 기본',
  oa_work_abstract: '초록',
  oa_work_reference: '참고문헌',
  oa_work_topic: '논문 주제',
  oa_work_concept: '논문 개념',
  oa_work_location: '수록처',
  oa_authorship: '저자 표기',
  oa_authorship_institution: '저자 소속',
  oa_author_core: '저자 기본',
  oa_author_affiliation: '저자 소속 이력',
  oa_author_raw_name: '저자 이름 원문',
  oa_author_topic: '저자 주제',
  oa_author_yearly: '저자 연도별',
  institution: '기관',
  institution_alias: '기관 별칭',
  institution_alias_manual: '기관 별칭 수기',
  kci_article: '국문 논문 기본',
  kci_article_abstract: '국문 초록',
  kci_article_author: '국문 저자',
  kci_article_probe: '국문 논문 시험',
  kci_article_author_probe: '국문 저자 시험',
  kci_journal_metric: '국문 학술지 지표',
  kci_article_detail: '국문 논문 상세',
  kci_article_author_detail: '국문 저자 상세',
  kci_article_reference: '국문 참고문헌',
}

function env(key) {
  if (process.env[key]) return process.env[key]
  const file = path.join(ROOT, '.env.local')
  if (!fs.existsSync(file)) return undefined
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(new RegExp(`^${key}=(.*)$`))
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  return undefined
}

async function aws(args) {
  const { stdout } = await execFileAsync('aws', [...args, '--region', REGION], { maxBuffer: 64 * 1024 * 1024 })
  return stdout
}

/** Glue 카탈로그 — 무슨 테이블이 있고 스키마가 무엇인가. */
async function glueTables() {
  const out = JSON.parse(await aws(['glue', 'get-tables', '--database-name', GLUE_DB, '--output', 'json']))
  return (out.TableList ?? []).map(tb => ({
    table_name: tb.Name,
    location: tb.StorageDescriptor?.Location ?? null,
    columns: (tb.StorageDescriptor?.Columns ?? []).map(c => ({ name: c.Name, type: c.Type })),
  }))
}

/**
 * S3 — 프리픽스별 용량·파일 수. 버킷을 한 번만 훑고 여기서 접두사로 가른다.
 * 테이블마다 따로 부르면 같은 목록을 열다섯 번 읽는다.
 */
async function s3Sizes() {
  const stdout = await aws(['s3', 'ls', `s3://${BUCKET}/`, '--recursive'])
  const byPrefix = new Map()
  for (const line of stdout.split('\n')) {
    const m = line.match(/^\S+\s+\S+\s+(\d+)\s+(.+)$/)
    if (!m) continue
    const bytes = Number(m[1])
    const key = m[2]
    const prefix = key.slice(0, key.lastIndexOf('/') + 1)
    const cur = byPrefix.get(prefix) ?? { bytes: 0, objects: 0 }
    cur.bytes += bytes
    cur.objects += 1
    byPrefix.set(prefix, cur)
  }
  return byPrefix
}

/** Athena 로 전 테이블 행 수를 한 번에. 반환: { counts, scannedBytes, ms } */
async function rowCounts(tableNames) {
  if (!tableNames.length) return { counts: new Map(), scannedBytes: 0, ms: 0 }
  const sql = tableNames
    .map(n => `select '${n}' t, count(*) n from ${GLUE_DB}.${n}`)
    .join('\nunion all\n')
  const queryFile = path.join(process.env.TMPDIR ?? '/tmp', `paper-warehouse-count-${process.pid}.sql`)
  fs.writeFileSync(queryFile, sql)
  try {
    const id = (await aws([
      'athena', 'start-query-execution',
      '--work-group', WORKGROUP,
      '--query-string', `file://${queryFile}`,
      '--result-configuration', `OutputLocation=${OUTPUT}`,
      '--query', 'QueryExecutionId', '--output', 'text',
    ])).trim()

    let state = 'RUNNING'
    let stats = {}
    for (let i = 0; i < 120 && !['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(state); i += 1) {
      await new Promise(r => setTimeout(r, 3_000))
      const exec = JSON.parse(await aws([
        'athena', 'get-query-execution', '--query-execution-id', id, '--output', 'json',
      ])).QueryExecution
      state = exec.Status.State
      stats = exec.Statistics ?? {}
    }
    if (state !== 'SUCCEEDED') throw new Error(`Athena ${state}`)

    const res = JSON.parse(await aws([
      'athena', 'get-query-results', '--query-execution-id', id, '--output', 'json',
    ]))
    const counts = new Map()
    for (const row of res.ResultSet.Rows.slice(1)) {
      const [name, n] = row.Data.map(d => d.VarCharValue)
      counts.set(name, Number(n))
    }
    return {
      counts,
      scannedBytes: Number(stats.DataScannedInBytes ?? 0),
      ms: Number(stats.EngineExecutionTimeInMillis ?? 0),
    }
  } finally {
    fs.rmSync(queryFile, { force: true })
  }
}

/**
 * 원본(OpenAlex 공개 버킷)의 매니페스트. 갱신 파이프라인의 watch·validate 가 여기서 나온다 —
 * 새 스냅샷이 떴는지, 우리 행 수가 원본 레코드 수와 맞는지.
 * 공개 버킷이라 우리 계정 자격증명으로 그대로 읽힌다(사본 불필요, 2026-09-18 검증).
 */
async function upstreamManifests() {
  const out = {}
  for (const entity of ['works', 'authors']) {
    try {
      const raw = await aws(['s3', 'cp', `s3://openalex/data/parquet/${entity}/manifest.json`, '-', '--quiet'])
      const m = JSON.parse(raw)
      out[entity] = { snapshot: m.date, records: m.record_count, files: (m.files ?? []).length, bytes: m.content_length }
    } catch (error) {
      console.error(`[upstream] ${entity} 매니페스트를 못 읽었어요:`, error.message)
    }
  }
  return out
}

/** 원본을 읽을 수 있게 등록해 둔 외부 테이블(stage 단계). 없으면 변환을 시작할 수 없다. */
async function stagedTables() {
  try {
    const out = JSON.parse(await aws(['glue', 'get-tables', '--database-name', 'biblo_source', '--output', 'json']))
    return (out.TableList ?? []).map(tb => tb.Name)
  } catch {
    return []
  }
}

/** s3://bucket/warehouse/openalex/snapshot=2026-06-26/work_core/ → { source, snapshot, prefix } */
function parseLocation(location) {
  const prefix = location ? location.replace(`s3://${BUCKET}/`, '') : ''
  const snapshot = prefix.match(/snapshot=([^/]+)/)?.[1] ?? null
  const source = prefix.startsWith('warehouse/openalex/') ? 'openalex'
    // KCI 는 프리픽스가 셋이다 — kci(기본) · kci_detail(상세·참고문헌) · kci_journal(지표).
    // warehouse/kci/ 만 보면 2026-09-22 에 들어온 상세 세 표가 '기타'로 떨어진다.
    : /^warehouse\/kci(_|\/)/.test(prefix) ? 'kci'
      : prefix.startsWith('unified/') ? 'unified' : 'other'
  return { source, snapshot, prefix: prefix.endsWith('/') ? prefix : `${prefix}/` }
}

async function main() {
  const tables = await glueTables()
  const sizes = await s3Sizes()
  const [upstream, staged] = await Promise.all([upstreamManifests(), stagedTables()])
  const { counts, scannedBytes, ms } = await rowCounts(tables.map(t => t.table_name))
  const now = new Date().toISOString()

  const rows = tables.map(tb => {
    const { source, snapshot, prefix } = parseLocation(tb.location)
    const size = sizes.get(prefix) ?? { bytes: null, objects: null }
    const rowCount = counts.get(tb.table_name) ?? null
    return {
      source,
      snapshot,
      table_name: tb.table_name,
      label: LABELS[tb.table_name] ?? null,
      location: tb.location,
      row_count: rowCount,
      bytes: size.bytes,
      objects: size.objects,
      columns: tb.columns,
      // 표가 있고 행이 있으면 다 된 것이다. 있는데 비었으면 지금 채우는 중으로 본다 —
      // CTAS 는 다 쓴 뒤에 테이블을 세우므로, 빈 표가 오래 남아 있는 일은 없다.
      status: rowCount && rowCount > 0 ? 'done' : 'running',
      synced_at: now,
      updated_at: now,
    }
  })

  if (DRY) {
    for (const r of rows) {
      console.log(`${r.source}/${r.snapshot ?? '-'} ${r.table_name.padEnd(26)} ${String(r.row_count ?? '-').padStart(13)}행 ` +
        `${((r.bytes ?? 0) / 1e9).toFixed(1).padStart(7)}GB  열 ${String(r.columns.length).padStart(2)}  ${r.status}`)
    }
    console.log(`\n스캔 ${scannedBytes} 바이트 · ${(ms / 1000).toFixed(1)}초 · 적지 않았어요(--dry)`)
    return
  }

  const supabase = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false },
  })

  // 라벨과 메모는 사람이 적은 것이라 덮지 않는다. 있는 줄의 라벨이 비어 있을 때만 채운다.
  const { data: existing, error: readErr } = await supabase
    .from('paper_warehouse_datasets').select('id, source, table_name, snapshot, label, note')
  if (readErr) throw readErr
  // 같은 줄인지는 표 이름과 스냅샷으로만 가른다. 출처는 위치에서 뽑아 낸 분류라 규칙이
  // 바뀌면 값도 바뀌는데, 키에 넣어 두면 그때마다 같은 표가 두 줄로 갈라진다
  // (2026-09-22 kci_detail 세 표가 other → kci 로 바뀌며 실제로 갈라졌다).
  const keyOf = r => `${r.table_name}\n${r.snapshot ?? ''}`
  const known = new Map((existing ?? []).map(r => [keyOf(r), r]))

  for (const row of rows) {
    const prev = known.get(keyOf(row))
    const payload = { ...row, label: prev?.label ?? row.label }
    const { error } = prev
      ? await supabase.from('paper_warehouse_datasets').update(payload).eq('id', prev.id)
      : await supabase.from('paper_warehouse_datasets').insert(payload)
    if (error) throw error
  }

  // Glue 에서 사라진 표는 지우지 않는다 — 지난 스냅샷의 기록이 곧 갱신 이력이다.
  // 다만 이번 확인에서 안 보였다는 것은 남긴다.
  const seen = new Set(rows.map(keyOf))
  for (const prev of existing ?? []) {
    if (seen.has(keyOf(prev))) continue
    await supabase.from('paper_warehouse_datasets')
      .update({ status: 'todo', updated_at: now }).eq('id', prev.id)
  }

  // 갱신 파이프라인 — 설계 문서의 다섯 단계를 확인된 사실로만 채운다.
  //   watch     원본 매니페스트 날짜 vs 우리 최신 스냅샷
  //   stage     원본 외부 테이블 등록 여부
  //   transform 표가 몇 개나 섰나
  //   validate  우리 행 수 == 원본 레코드 수 (works·authors)
  //   publish   카탈로그에 올라와 조회되는가
  const ourSnapshot = rows.map(r => r.snapshot).filter(Boolean).sort().at(-1) ?? null
  const upstreamSnapshot = upstream.works?.snapshot ?? null
  const checks = [
    { table: 'oa_work_core', entity: 'works', expected: upstream.works?.records ?? null },
    { table: 'oa_author_core', entity: 'authors', expected: upstream.authors?.records ?? null },
  ].map(c => {
    const actual = counts.get(c.table) ?? null
    return { ...c, actual, ok: c.expected !== null && actual !== null && Number(c.expected) === Number(actual) }
  })
  const pipeline = {
    checked_at: now,
    upstream: { snapshot: upstreamSnapshot, works: upstream.works ?? null, authors: upstream.authors ?? null },
    our_snapshot: ourSnapshot,
    // 원본이 우리보다 새 스냅샷을 내놓았으면 이번 분기 갱신이 시작돼야 한다는 뜻이다.
    behind: !!(upstreamSnapshot && ourSnapshot && upstreamSnapshot > ourSnapshot),
    staged,
    tables_done: rows.filter(r => r.status === 'done').length,
    tables_total: rows.length,
    checks,
  }

  const meta = [
    { key: 'last_sync', value: { at: now, scanned_bytes: scannedBytes, ms, tables: rows.length }, updated_at: now },
    { key: 'pipeline', value: pipeline, updated_at: now },
  ]
  const { error: metaErr } = await supabase.from('paper_warehouse_meta').upsert(meta, { onConflict: 'key' })
  if (metaErr) throw metaErr

  const totalRows = rows.reduce((s, r) => s + Number(r.row_count ?? 0), 0)
  const totalBytes = rows.reduce((s, r) => s + Number(r.bytes ?? 0), 0)
  console.log(`테이블 ${rows.length}개 · ${totalRows.toLocaleString()}행 · ${(totalBytes / 1e9).toFixed(1)} GB 적었어요.`)
  console.log(`Athena 스캔 ${scannedBytes} 바이트 · ${(ms / 1000).toFixed(1)}초`)
  console.log(`원본 스냅샷 ${upstreamSnapshot ?? '?'} · 우리 ${ourSnapshot ?? '?'}` +
    `${pipeline.behind ? ' — 새 스냅샷이 떴어요' : ' — 최신'}`)
  for (const c of checks) {
    console.log(`  검증 ${c.table}: 원본 ${c.expected?.toLocaleString() ?? '?'} / 우리 ${c.actual?.toLocaleString() ?? '?'} ${c.ok ? '일치' : '불일치'}`)
  }
}

try {
  await main()
} catch (error) {
  // 자격증명 만료가 가장 흔하다. 화면은 "마지막 확인 시각"으로 낡음을 스스로 말한다.
  console.error('[paper-warehouse-sync] 확인하지 못했어요:', error.message)
  process.exitCode = 1
}
