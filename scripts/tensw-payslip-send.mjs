#!/usr/bin/env node
// 급여명세서를 급여일 아침에 각자에게 보낸다.
//
//   node scripts/tensw-payslip-send.mjs --month 2026-08            # 초안만
//   node scripts/tensw-payslip-send.mjs --month 2026-08 --send     # 승인 뒤
//
// 첨부는 그 달 업무위키 노트에서 받아 온다. 로컬 폴더에 기대면 그 폴더가 사라진 달에
// 조용히 멈춘다. 명세서는 사람마다 다른 파일이라 한 통씩 따로 만든다.
//
// 기본은 초안까지만. 실제 발송은 --send 를 붙일 때만 한다.

import { config } from 'dotenv'
config({ path: '.env.local', quiet: true })
import path from 'node:path'
import process from 'node:process'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'wiki-attachments'
const SECTION = 'tensw-mgmt'
const USER_ID = 'dw.kim@willowinvt.com'
const CONTEXT = 'tensoftworks'          // dw.kim@tensoftworks.com 에서 보낸다
const CC = 'ch.kim@tsw.im'

// 메일 헤더에서 실제로 확인한 주소만 적는다. 규칙으로 지어내지 않는다 —
// 권지민은 jm.kwon 이 아니라 jimin.kwon 이고, 명세서를 엉뚱한 사람에게 보내면 끝이다.
// 박선영 이사는 사내 메일 계정이 없어 비워 둔다.
const PEOPLE = Object.freeze({
  '김철형': 'ch.kim@tensoftworks.com',
  '김의향': 'eh.kim@tensoftworks.com',
  '김경수': 'ks.kim@tensoftworks.com',
  '권지민': 'jimin.kwon@tensoftworks.com',
  '김정한': 'jh.kim@tensoftworks.com',
  '박선영': '',
  '조성민': 'sm.cho@tensoftworks.com',
  '이승무': 'sm.lee@tensoftworks.com',
  '전희나': 'hn.jeon@tensoftworks.com',
})

const args = process.argv.slice(2)
const has = flag => args.includes(flag)
const value = flag => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined }

const month = value('--month')
if (!/^\d{4}-\d{2}$/.test(month ?? '')) throw new Error('--month 2026-08 꼴로 주세요.')
const [year, mm] = month.split('-')
const label = `${year}${mm}`

function mime({ from, to, cc, subject, text, filename, content }) {
  const boundary = `b${Date.now().toString(36)}`
  const b64 = string => Buffer.from(string, 'utf8').toString('base64')
  const encoded = `=?UTF-8?B?${b64(filename)}?=`
  return [
    `From: ${from}`, `To: ${to}`, `Cc: ${cc}`,
    `Subject: =?UTF-8?B?${b64(subject)}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`, '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '',
    b64(text), '',
    `--${boundary}`,
    `Content-Type: application/pdf; name="${encoded}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${encoded}"`, '',
    content.toString('base64'), '',
    `--${boundary}--`, '',
  ].join('\r\n')
}

function body(name) {
  return [
    `${name} 님,`,
    '',
    `${Number(mm)}월 급여명세서를 첨부와 같이 보내드립니다.`,
    '문의사항이 있으면 알려주세요.',
    '',
    '감사합니다.',
    '',
    '',
    '김동욱 드림.',
    '',
  ].join('\n')
}

async function run() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY)

  const title = `텐소프트웍스 급여 ${year}년 ${mm}월`
  const { data: note } = await supabase.from('work_wiki')
    .select('attachments').eq('user_id', USER_ID).eq('section', SECTION).eq('title', title).maybeSingle()
  if (!note) throw new Error(`업무위키에 "${title}" 노트가 없어요. 먼저 tensw-payroll-wiki.mjs 를 돌려주세요.`)

  const { data: token } = await supabase.from('gmail_tokens').select('*')
    .eq('context', CONTEXT).order('updated_at', { ascending: false }).limit(1).single()
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID_TENSW, process.env.GOOGLE_CLIENT_SECRET_TENSW, process.env.GOOGLE_REDIRECT_URI)
  auth.setCredentials({
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expiry_date: token.token_expiry ? new Date(token.token_expiry).getTime() : undefined,
  })
  const gmail = google.gmail({ version: 'v1', auth })
  const from = (await gmail.users.getProfile({ userId: 'me' })).data.emailAddress

  const missing = []
  const made = []
  for (const [name, to] of Object.entries(PEOPLE)) {
    const filename = `급여명세서_${label}_${name}.pdf`
    const attachment = (note.attachments ?? []).find(item => item.name === filename)
    if (!attachment) { missing.push(`${name}(명세서 없음)`); continue }
    if (!to) { missing.push(`${name}(주소 없음)`); continue }

    const key = decodeURIComponent(attachment.url.replace(`/api/files/${BUCKET}/`, ''))
    const { data: file, error } = await supabase.storage.from(BUCKET).download(key)
    if (error) throw new Error(`${filename} 을 받지 못했어요: ${error.message}`)
    const content = Buffer.from(await file.arrayBuffer())

    const raw = Buffer.from(mime({
      from, to, cc: CC,
      subject: `[텐소프트웍스] ${year}년 ${Number(mm)}월 급여명세서`,
      text: body(name), filename, content,
    })).toString('base64url')

    if (has('--send')) {
      await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
      made.push(`${name} → ${to} 발송`)
    } else {
      await gmail.users.drafts.create({ userId: 'me', requestBody: { message: { raw } } })
      made.push(`${name} → ${to} 초안`)
    }
  }

  console.log(`${year}년 ${Number(mm)}월 급여명세서 · ${has('--send') ? '발송' : '초안'} ${made.length}통`)
  for (const line of made) console.log(`  ${line}`)
  if (missing.length) console.log(`\n못 만든 사람: ${missing.join(', ')}`)
  if (!has('--send')) console.log('\n초안까지만 만들었어요. 확인하고 --send 를 붙이세요.')
}

run().catch(error => {
  console.error(`[payslip-send] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
