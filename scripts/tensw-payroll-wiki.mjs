#!/usr/bin/env node
// 그 달 급여 자료를 업무위키 한 곳에 모은다.
//
//   node scripts/tensw-payroll-wiki.mjs --month 2026-08 --dir <그 달 폴더> [--nhis <4대보험 폴더>]
//
// 노트는 하나다("텐소프트웍스 월 급여"). 달마다 그 달 파일을 그 노트에 덧붙인다.
// 첨부는 비공개 버킷에 올라가고 링크는 /api/files/… 로 적힌다 — 로그인해야 열린다.
// 파일 안에 주민번호·계좌번호가 있으니 공개 URL 로는 절대 적지 않는다.

import { config } from 'dotenv'
config({ path: '.env.local', quiet: true })
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'wiki-attachments'
const SECTION = 'tensw-mgmt'
const CATEGORY = '재무'
const TITLE = '텐소프트웍스 월 급여'
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
      name: `[${month}] ${entry.name}`,
      url: `/api/files/${BUCKET}/${key.split('/').map(encodeURIComponent).join('/')}`,
      size: body.length,
      type: contentType,
    })
    console.log(`  올림 ${entry.name}  (${body.length.toLocaleString()}바이트)`)
  }

  const { data: existing } = await supabase
    .from('work_wiki')
    .select('id, attachments, content')
    .eq('user_id', USER_ID)
    .eq('section', SECTION)
    .eq('title', TITLE)
    .maybeSingle()

  // 같은 달을 다시 올리면 그 달 것만 갈아 끼운다.
  const kept = (existing?.attachments ?? []).filter(a => !String(a.name ?? '').startsWith(`[${month}]`))
  const merged = [...kept, ...attachments]

  if (existing) {
    const { error } = await supabase.from('work_wiki')
      .update({ attachments: merged, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) throw error
    console.log(`\n노트 갱신: ${TITLE} (첨부 ${merged.length}개)`)
  } else {
    const content = await fs.readFile(path.join(path.dirname(new URL(import.meta.url).pathname), 'templates', 'tensw-payroll-wiki.md'), 'utf8')
    const { error } = await supabase.from('work_wiki').insert({
      user_id: USER_ID, section: SECTION, category: CATEGORY,
      title: TITLE, content, attachments: merged, is_pinned: true,
    })
    if (error) throw error
    console.log(`\n노트 생성: ${TITLE} (첨부 ${merged.length}개)`)
  }
}

run().catch(error => {
  console.error(`[payroll-wiki] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
