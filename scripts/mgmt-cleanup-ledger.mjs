#!/usr/bin/env node
// 경영관리 에이전트를 켜기 전에 원장을 한 번 정리한다. --apply 가 없으면 계획만 보여준다.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { scheduleKey } from './lib/mgmt/ledger.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })
const apply = process.argv.includes('--apply')
const log = [], say = m => { console.log(m); log.push(m) }
const PERSONAL = /류하|가족|여행|진료|병원|생일|테슬라|틴팅|수리|학원|개인/
const ADOPT = [
  [/(\d+)월분 강남구 인턴십 지원금 신청/, () => ['subsidy', 'submit', 'subsidy-submit']],
  [/(\d+)월 급여대장 요청/, () => ['payroll', 'request', 'payroll-request']],
  [/(\d+)월 급여이체 및 급여명세서/, () => ['payroll', 'payday', 'payroll-payday']],
]

// category='personal' 행은 읽지도 쓰지도 않는다(전역 제약). null 은 아직 미분류라 포함한다.
const { data: willow } = await sb.from('willow_mgmt_schedules').select('*').or('category.is.null,category.neq.personal')
const { data: tensw } = await sb.from('tensw_mgmt_schedules').select('*').or('category.is.null,category.neq.personal')

// 3(먼저 실행). 지난 공휴일 표시 — 이동보다 먼저 닫아야 텐소-분류 공휴일 행이 옮겨갈 때
// 이미 닫힌 상태(is_completed/agent_state/evidence)를 그대로 들고 간다. 같은 행 객체를 참조로
// 들고 있으므로(배열에서 filter 는 복사하지 않는다), 여기서 Object.assign 한 값을 아래 이동 단계가 그대로 본다.
for (const [table, rows] of [['tensw_mgmt_schedules', tensw], ['willow_mgmt_schedules', willow]]) {
  for (const r of rows.filter(r => !r.is_completed && /설 연휴|추석 연휴/.test(r.title ?? '') && r.schedule_date < '2026-09-30')) {
    say(`닫기(${table}): ${r.schedule_date} ${r.title}`)
    const patch = { is_completed: true, agent_state: 'done', evidence: [{ kind: 'cleanup', note: '지난 공휴일 표시' }] }
    if (apply) {
      const { error } = await sb.from(table).update(patch).eq('id', r.id)
      if (error) throw error
    }
    Object.assign(r, patch)
  }
}
// 1. 윌로우 테이블의 텐소 행 이동 — r 은 위 3번에서 이미 닫혔으면 그 상태를 그대로 복사한다.
for (const r of willow.filter(r => r.category === 'tensw-mgmt')) {
  say(`이동 → 텐소: ${r.schedule_date} ${r.title}`)
  if (apply) {
    const { id, ...rest } = r
    const { error } = await sb.from('tensw_mgmt_schedules').insert({ ...rest, category: 'other' })
    if (error) throw error
    const { error: e2 } = await sb.from('willow_mgmt_schedules').delete().eq('id', id)
    if (e2) throw e2
  }
}
// 2. 개인 일정
for (const r of willow.filter(r => r.category !== 'personal' && r.category !== 'tensw-mgmt' && !r.source_key && PERSONAL.test(r.title ?? ''))) {
  say(`개인으로: ${r.schedule_date} ${r.title}`)
  if (apply) {
    const { error } = await sb.from('willow_mgmt_schedules').update({ category: 'personal' }).eq('id', r.id)
    if (error) throw error
  }
}
// 4. 선등록 행 입양
for (const r of tensw.filter(r => !r.source_key && !r.is_completed)) {
  for (const [re, pick] of ADOPT) {
    const m = (r.title ?? '').match(re)
    if (!m) continue
    const [task, step, recipe] = pick(m[1])
    const period = `2026-${String(m[1]).padStart(2, '0')}`
    const key = scheduleKey('tensw', task, period, step)
    say(`입양: ${r.title} → ${key}`)
    if (apply) {
      const { error } = await sb.from('tensw_mgmt_schedules').update({ source_key: key, origin: 'seed', agent_state: 'planned', recipe }).eq('id', r.id)
      if (error) throw error
    }
  }
}
// 5. 7/27 상환 행은 결정함으로(여기서는 id 만) — 이 테이블엔 transaction_date 가 없다.
// 실 컬럼: payment_date(주로 이 값 사용) / issue_date(payment_date 가 비면 대신 씀).
const CASH_COLS = 'id, type, issue_date, payment_date, transaction_time, counterparty, amount, description'
const { data: cashByPayment } = await sb.from('willow_mgmt_cash').select(CASH_COLS).gte('payment_date', '2026-07-26').lte('payment_date', '2026-07-28')
const { data: cashByIssueFallback } = await sb.from('willow_mgmt_cash').select(CASH_COLS).is('payment_date', null).gte('issue_date', '2026-07-26').lte('issue_date', '2026-07-28')
for (const c of [...(cashByPayment ?? []), ...(cashByIssueFallback ?? [])]) {
  say(`확인 대상 현금 행: ${c.id} ${c.payment_date ?? c.issue_date} ${c.type} ${c.amount} ${c.description ?? ''}`)
}

// 로그 산출물은 일정 제목·날짜가 들어가므로 깃에 올리지 않는다 (scripts/logs/ 는 .gitignore 에 이미 있음).
fs.mkdirSync(path.join(ROOT, 'scripts/logs'), { recursive: true })
fs.writeFileSync(path.join(ROOT, `scripts/logs/mgmt-cleanup-${new Date().toISOString().slice(0, 10)}${apply ? '' : '-plan'}.json`), JSON.stringify(log, null, 2))
console.log(apply ? '반영 완료' : '계획만 봤어요. --apply 로 반영')
