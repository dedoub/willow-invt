#!/usr/bin/env node
// 그 달 급여 자료를 업무위키에 모은다.
//
//   node scripts/tensw-payroll-wiki.mjs --month 2026-08 --dir <그 달 폴더> [--nhis <4대보험 폴더>]
//
// 노트를 둘로 나눈다. 절차는 안 변하니 "텐소프트웍스 월 급여" 한 장에 두고(고정),
// 파일은 달마다 "텐소프트웍스 급여 2026년 08월" 을 새로 만들어 담는다.
// list_wiki_notes 는 섹션을 통째로 돌려줄 뿐 검색을 못 한다. 제목만 보고 그 달을 집어낼 수
// 있어야 해서 이렇게 나눈다 — 한 장에 쌓으면 첨부 이름 수백 개를 훑어야 한다.
//
// 첨부는 비공개 버킷에 올라가고 링크는 /api/files/… 로 적힌다 — 로그인해야 열린다.
// 파일 안에 주민번호·계좌번호가 있으니 공개 URL 로는 절대 적지 않는다.

import { config } from 'dotenv'
config({ path: '.env.local', quiet: true })
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

// 지급일 규칙(25일, 쉬는 날이면 직전 영업일)은 kr_workdays.py 하나만 안다.
function monthFacts(month) {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const [year, mm] = month.split('-')
  const out = execFileSync('python3', [path.join(here, 'lib', 'kr_workdays.py'), year, String(Number(mm))], { encoding: 'utf8' })
  return JSON.parse(out)
}

const BUCKET = 'wiki-attachments'
const SECTION = 'tensw-mgmt'
const CATEGORY = '재무'
const GUIDE_TITLE = '텐소프트웍스 월 급여'   // 절차. 한 장, 고정.
// 앱 로그인 계정. 세션 이메일과 다르다.
const USER_ID = 'dw.kim@willowinvt.com'

const MIME = {
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.csv': 'text/csv',
  '.json': 'application/json',
}

function value(flag) {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : undefined
}

// 스토리지 키는 ASCII 만 받는다. 보이는 이름은 attachments.name 에 한글로 남긴다.
//
// 한글을 떼어 내면 "급여명세서_202608_권지민" 같은 이름이 죄다 "_202608_" 로 뭉개져 아홉
// 사람이 한 파일을 덮어쓴다. 그래서 순번을 앞에 붙여 키가 겹치지 않게 한다.
function asciiKey(name, index) {
  const extension = path.extname(name).toLowerCase()
  const stem = path.basename(name, extension)
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_.-]/g, '')
    .replace(/^[_.-]+|[_.-]+$/g, '')
  return `${String(index + 1).padStart(2, '0')}${stem ? `_${stem}` : ''}${extension}`
}

async function collect(dir, prefix = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  const out = []
  for (const entry of entries) {
    if (entry.isDirectory() || entry.name.startsWith('.') || entry.name.startsWith('_')) continue
    out.push({ file: path.join(dir, entry.name), name: `${prefix}${entry.name}` })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}

async function run() {
  const month = value('--month')
  if (!/^\d{4}-\d{2}$/.test(month ?? '')) throw new Error('--month 2026-08 꼴로 주세요.')
  const label = month.replace('-', '')
  const dir = value('--dir')
  if (!dir) throw new Error('--dir 가 필요해요.')

  const files = [...await collect(dir), ...(value('--nhis') ? await collect(value('--nhis'), '4대보험_') : [])]
  if (!files.length) throw new Error(`올릴 파일이 없어요: ${dir}`)

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY)

  // 다시 올릴 때 순번이 바뀌면 옛 키가 주인 없이 남는다. 그 달 폴더를 먼저 비운다.
  const { data: stale } = await supabase.storage.from(BUCKET).list(`payroll/${label}`, { limit: 200 })
  if (stale?.length) {
    await supabase.storage.from(BUCKET).remove(stale.map(item => `payroll/${label}/${item.name}`))
    console.log(`  치움 ${stale.length}개 (지난 올림)`)
  }

  const attachments = []
  for (const [index, entry] of files.entries()) {
    const body = await fs.readFile(entry.file)
    const key = `payroll/${label}/${asciiKey(entry.name, index)}`
    const contentType = MIME[path.extname(entry.name).toLowerCase()] ?? 'application/octet-stream'
    const { error } = await supabase.storage.from(BUCKET).upload(key, body, { contentType, upsert: true })
    if (error) throw new Error(`${entry.name}: ${error.message}`)
    attachments.push({
      name: entry.name,
      url: `/api/files/${BUCKET}/${key.split('/').map(encodeURIComponent).join('/')}`,
      size: body.length,
      type: contentType,
    })
    console.log(`  올림 ${entry.name}  (${body.length.toLocaleString()}바이트)`)
  }

  const payDate = monthFacts(month).payDate

  // 절차 노트는 한 장. 없으면 만들고, 있으면 건드리지 않는다.
  const { data: guide } = await supabase.from('work_wiki')
    .select('id').eq('user_id', USER_ID).eq('section', SECTION).eq('title', GUIDE_TITLE).maybeSingle()
  if (!guide) {
    const here = path.dirname(fileURLToPath(import.meta.url))
    const content = await fs.readFile(path.join(here, 'templates', 'tensw-payroll-wiki.md'), 'utf8')
    const { error } = await supabase.from('work_wiki').insert({
      user_id: USER_ID, section: SECTION, category: CATEGORY,
      title: GUIDE_TITLE, content, attachments: null, is_pinned: true,
    })
    if (error) throw error
    console.log(`\n절차 노트 생성: ${GUIDE_TITLE}`)
  }

  // 그 달 노트. 다시 돌리면 그 달 것만 갈아 끼운다.
  const title = `텐소프트웍스 급여 ${month.slice(0, 4)}년 ${month.slice(5)}월`
  const total = attachments.length
  const content = [
    `${month.slice(0, 4)}년 ${Number(month.slice(5))}월 급여 자료. 지급일 ${payDate}.`,
    '',
    `첨부 ${total}개 — 확정 급여대장, 급여내역(세무법인 입력본), 우리은행 대량이체,`,
    '개인별 급여명세서(워드·PDF), 4대보험 개인별 산출내역.',
    '',
    `절차는 [${GUIDE_TITLE}] 노트에 있다.`,
  ].join('\n')

  const { data: existing } = await supabase.from('work_wiki')
    .select('id').eq('user_id', USER_ID).eq('section', SECTION).eq('title', title).maybeSingle()

  if (existing) {
    const { error } = await supabase.from('work_wiki')
      .update({ content, attachments, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) throw error
    console.log(`\n노트 갱신: ${title} (첨부 ${total}개)`)
  } else {
    const { error } = await supabase.from('work_wiki').insert({
      user_id: USER_ID, section: SECTION, category: CATEGORY,
      title, content, attachments, is_pinned: false,
    })
    if (error) throw error
    console.log(`\n노트 생성: ${title} (첨부 ${total}개)`)
  }
}

run().catch(error => {
  console.error(`[payroll-wiki] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
