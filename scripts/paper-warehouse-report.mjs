#!/usr/bin/env node
// 논문 데이터 웨어하우스 적재 현황을 대시보드(/papers)에 적는다.
//
//   node scripts/paper-warehouse-report.mjs --stage load --status running
//   node scripts/paper-warehouse-report.mjs --stage kci --status todo --note "OAI 화이트리스트 요청 보냄"
//   node scripts/paper-warehouse-report.mjs --table oa_work_topic --status done \
//     --rows 6070000000 --scan-gb 88.4 --seconds 512 --cost 0.43
//   node scripts/paper-warehouse-report.mjs --json status.json
//   node scripts/paper-warehouse-report.mjs --show
//
// 왜 이게 있나: 진짜 상태는 AWS 에 있는데 대시보드에는 자격증명이 없다(브라우저 로그인이
// 필요해 에이전트가 대신 못 돌린다). 그렇다고 웨어하우스 세션에 화면을 붙일 수도 없다.
// 그래서 AWS 를 실제로 돌린 쪽이 끝날 때마다 한 줄 적어 두고, 대시보드는 그걸 읽는다.
// athena.sh 가 찍어 주는 스캔량·소요·비용을 그대로 옮기면 된다.
//
// --json 은 여러 줄을 한 번에 적는다. 모양은 이렇다:
//   { "stages": [{ "key": "load", "status": "running" }],
//     "tables": [{ "table_name": "oa_work_topic", "status": "done", "cost_usd": 0.43 }] }
//
// 값은 손대지 않은 것만 남는다 — 안 준 칸은 지우지 않고 그대로 둔다.
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const ROOT = path.resolve(import.meta.dirname, '..')
const STAGE_STATUS = new Set(['done', 'running', 'todo', 'blocked'])
const LOAD_STATUS = new Set(['done', 'running', 'todo', 'failed'])

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

function arg(name) {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : undefined
}
function num(name) {
  const v = arg(name)
  return v === undefined ? undefined : Number(v)
}

const supabase = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SECRET_KEY'), {
  auth: { persistSession: false },
})

function clean(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))
}

async function writeStage(row) {
  const { key, ...rest } = row
  if (!key) throw new Error('stage 에는 key 가 있어야 해요')
  if (rest.status && !STAGE_STATUS.has(rest.status)) throw new Error(`단계 상태가 이상해요: ${rest.status}`)
  const patch = clean({ ...rest, updated_at: new Date().toISOString() })
  const { error } = await supabase.from('paper_warehouse_stages').update(patch).eq('key', key)
  if (error) throw error
  console.log(`단계 ${key} ← ${JSON.stringify(clean(rest))}`)
}

async function writeTable(row) {
  const { table_name, source = 'openalex', ...rest } = row
  if (!table_name) throw new Error('table 에는 table_name 이 있어야 해요')
  if (rest.status && !LOAD_STATUS.has(rest.status)) throw new Error(`적재 상태가 이상해요: ${rest.status}`)
  const patch = clean({ ...rest, updated_at: new Date().toISOString() })
  // 새 테이블(KCI 등)이면 만들고, 있으면 준 칸만 덮는다.
  const { data, error } = await supabase.from('paper_warehouse_loads')
    .update(patch).eq('source', source).eq('table_name', table_name).select('id')
  if (error) throw error
  if (!data?.length) {
    const { error: insErr } = await supabase.from('paper_warehouse_loads')
      .insert({ source, table_name, ...patch })
    if (insErr) throw insErr
    console.log(`적재 ${source}/${table_name} 새로 적음`)
    return
  }
  console.log(`적재 ${source}/${table_name} ← ${JSON.stringify(clean(rest))}`)
}

async function show() {
  const [stages, loads] = await Promise.all([
    supabase.from('paper_warehouse_stages').select('*').order('seq'),
    supabase.from('paper_warehouse_loads').select('*').order('sort_order'),
  ])
  for (const s of stages.data ?? []) console.log(`${s.seq}. ${s.title.padEnd(24)} ${s.status}${s.note ? ` — ${s.note}` : ''}`)
  console.log('')
  let cost = 0
  for (const l of loads.data ?? []) {
    cost += Number(l.cost_usd ?? 0)
    console.log(`${l.table_name.padEnd(28)} ${String(l.status).padEnd(8)} ${l.row_count ?? '-'} 행 · ${l.scanned_gb ?? '-'} GB · $${l.cost_usd ?? '-'}`)
  }
  console.log(`\n누적 비용 $${cost.toFixed(2)}`)
}

const jsonPath = arg('json')
if (process.argv.includes('--show')) {
  await show()
} else if (jsonPath) {
  const doc = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
  for (const row of doc.stages ?? []) await writeStage(row)
  for (const row of doc.tables ?? []) await writeTable(row)
} else if (arg('stage')) {
  await writeStage({ key: arg('stage'), status: arg('status'), note: arg('note') })
} else if (arg('table')) {
  await writeTable({
    table_name: arg('table'),
    source: arg('source'),
    status: arg('status'),
    label: arg('label'),
    snapshot: arg('snapshot'),
    row_count: num('rows'),
    scanned_gb: num('scan-gb'),
    seconds: num('seconds'),
    cost_usd: num('cost'),
    note: arg('note'),
  })
} else {
  console.error('쓸 것을 정해 주세요: --stage · --table · --json · --show (파일 맨 위에 예시가 있어요)')
  process.exitCode = 2
}
