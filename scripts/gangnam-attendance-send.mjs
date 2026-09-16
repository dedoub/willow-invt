/**
 * 강남구 인턴십 출근부를 인턴 각자에게 보낸다.
 *
 *   node scripts/gangnam-attendance-send.mjs                 # 이번 달, 초안만
 *   node scripts/gangnam-attendance-send.mjs --month 2026-09 # 달 지정
 *   node scripts/gangnam-attendance-send.mjs --send          # 실제 발송
 *   node scripts/gangnam-attendance-send.mjs --on-send-date  # 마지막 영업일이 아니면 그냥 끝냄
 *
 * 매달 마지막 영업일에 보내고 다음 달 5일까지 회신받는다(5일이 쉬는 날이면 다음 영업일).
 * 예약은 launchd 가 매일 부르고, --on-send-date 가 그날인지 가린다 — launchd 로는
 * "마지막 영업일"을 표현할 수 없다.
 *
 * 기본은 초안까지만 만든다. 실제 발송은 --send 를 붙일 때만 한다(CEO 승인 뒤).
 */
import { config } from 'dotenv'
config({ path: '.env.local', quiet: true })
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

const INTERNS = [
  { name: '조성민', email: 'sm.cho@tensoftworks.com' },
  { name: '이승무', email: 'sm.lee@tensoftworks.com' },
  { name: '전희나', email: 'hn.jeon@tensoftworks.com' },
]
const CC = 'ch.kim@tsw.im'
const CONTEXT = 'tensoftworks'          // dw.kim@tensoftworks.com 에서 보내고 여기로 회신받는다
const DOCS = path.join(os.homedir(), 'Documents', '강남구인턴십_출근부_2026', 'PDF_담당서명')

const args = process.argv.slice(2)
const has = (f) => args.includes(f)
const value = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }

const now = new Date()
const [year, month] = (value('--month') ?? `${now.getFullYear()}-${now.getMonth() + 1}`)
  .split('-').map(Number)

const python = process.env.GANGNAM_PYTHON || 'python3'
const facts = JSON.parse(execFileSync(python, ['scripts/lib/kr_workdays.py', String(year), String(month)], { encoding: 'utf8' }))

// 로컬 날짜로 본다. toISOString 은 UTC 라 한국 시간 새벽에 하루 어긋난다.
const local = new Date()
const today = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`
if (has('--on-send-date') && today !== facts.sendDate) {
  console.log(`오늘(${today})은 ${year}년 ${month}월의 마지막 영업일(${facts.sendDate})이 아니에요. 아무것도 하지 않습니다.`)
  process.exit(0)
}

const d = (iso) => { const [y, m, dd] = iso.split('-').map(Number); return { y, m, dd, dow: '월화수목금토일'[new Date(y, m - 1, dd).getDay() === 0 ? 6 : new Date(y, m - 1, dd).getDay() - 1] } }
const due = d(facts.replyDue)
const skipped = facts.skippedHolidays.map(h => `${month}/${h.day} ${h.label}`).join(', ')

function body(name) {
  return `${name} 님,

${year}년 ${month}월 강남구 인턴십 출근부를 첨부합니다.

출근부를 인쇄하신 뒤 출근·결근 표시와 인턴 확인란에 직접 서명해 주시고, 스캔해서 ${due.m}월 ${due.dd}일(${due.dow})까지 회신 부탁드립니다. 상단의 출근일·결근일·유급휴일 수도 함께 적어 주세요.

- 근무기간: ${year}.${String(month).padStart(2,'0')}.01 ~ ${String(month).padStart(2,'0')}.${facts.lastDay}
- 기재된 근무일: ${facts.workdayCount}일${skipped ? ` (${skipped} 제외)` : ''}

담당 확인란은 이미 서명되어 있습니다. 회신 주신 출근부는 강남구 인턴십 지원금 신청서에 첨부됩니다.

김동욱 드림
`
}

function mime({ from, to, cc, subject, text, file }) {
  const boundary = `b${Date.now().toString(36)}`
  const b64 = (s) => Buffer.from(s, 'utf8').toString('base64')
  const name = path.basename(file)
  const encodedName = `=?UTF-8?B?${b64(name)}?=`
  return [
    `From: ${from}`, `To: ${to}`, `Cc: ${cc}`,
    `Subject: =?UTF-8?B?${b64(subject)}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`, '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '',
    b64(text), '',
    `--${boundary}`,
    `Content-Type: application/pdf; name="${encodedName}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${encodedName}"`, '',
    fs.readFileSync(file).toString('base64'), '',
    `--${boundary}--`, '',
  ].join('\r\n')
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY)
const { data: token, error } = await sb.from('gmail_tokens').select('*').eq('context', CONTEXT)
  .order('updated_at', { ascending: false }).limit(1).single()
if (error || !token) throw new Error(error?.message || `${CONTEXT} Gmail 토큰이 없어요`)
const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID_TENSW, process.env.GOOGLE_CLIENT_SECRET_TENSW, process.env.GOOGLE_REDIRECT_URI)
auth.setCredentials({ access_token: token.access_token, refresh_token: token.refresh_token, expiry_date: token.token_expiry ? new Date(token.token_expiry).getTime() : undefined })
const gmail = google.gmail({ version: 'v1', auth })
const from = (await gmail.users.getProfile({ userId: 'me' })).data.emailAddress

console.log(`${year}년 ${month}월분 · 근무 ${facts.workdayCount}일 · 발송일 ${facts.sendDate} · 회신기한 ${facts.replyDue}`)
console.log(`보내는 계정 ${from}, 참조 ${CC}, ${has('--send') ? '실제 발송' : '초안만'}\n`)

for (const intern of INTERNS) {
  const file = path.join(DOCS, `${year}년 ${String(month).padStart(2, '0')}월 출근부_${intern.name}_서명.pdf`)
  if (!fs.existsSync(file)) throw new Error(`첨부가 없어요: ${file}`)
  const subject = `[텐소프트웍스] ${year}년 ${month}월 출근부 확인 요청 (회신기한 ${due.m}/${due.dd})`
  const raw = Buffer.from(mime({ from, to: intern.email, cc: CC, subject, text: body(intern.name), file }))
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
  const res = has('--send')
    ? await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
    : await gmail.users.drafts.create({ userId: 'me', requestBody: { message: { raw } } })
  console.log(`  ${intern.name} <${intern.email}>  ${has('--send') ? '발송' : '초안'} ${res.data.id}  (${path.basename(file)})`)
}
