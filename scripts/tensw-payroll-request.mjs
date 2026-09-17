/**
 * 세무법인형운에 급여대장을 요청한다.
 *
 *   node scripts/tensw-payroll-request.mjs --month 2026-09 --file 급여내역.xlsx
 *   node scripts/tensw-payroll-request.mjs --month 2026-09 --file … --send
 *
 * 우리가 보내는 것은 계산서가 아니라 입력이다. 사회보험 사이트 숫자를 서식에 담아 보내면
 * 세무법인이 확정 급여대장 PDF 를 회신한다. 8월에는 요청 10분 만에 회신이 왔다.
 *
 * 기본은 초안까지만. 실제 발송은 --send 를 붙일 때만 한다.
 */
import { config } from 'dotenv'
config({ path: '.env.local', quiet: true })
import fs from 'node:fs'
import path from 'node:path'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

const TO = 'jjtaxro@daum.net'        // 세무법인형운 세무자료
const CC = 'admin@tensoftworks.com'
const CONTEXT = 'tensoftworks'

const args = process.argv.slice(2)
const has = (f) => args.includes(f)
const value = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }

const now = new Date()
const [year, month] = (value('--month') ?? `${now.getFullYear()}-${now.getMonth() + 1}`).split('-').map(Number)
const file = value('--file')
if (!file || !fs.existsSync(file)) throw new Error(`첨부할 급여내역 파일이 없어요: ${file}`)
const note = value('--note')         // 예: 4대보험 일부가 아직 조회되지 않을 때 덧붙이는 한 줄

const subject = `[텐소프트웍스] ${month}월 급여대장 요청`
const body = [
  '안녕하세요.',
  '',
  `당사 ${month}월 급여내역을 첨부와 같이 보내드립니다. 급여대장 부탁드립니다.`,
  ...(note ? ['', note] : []),
  '',
  '감사합니다.',
  '',
  '',
  '김동욱 드림.',
  '',
].join('\n')

function mime({ from, to, cc, subject, text, file }) {
  const boundary = `b${Date.now().toString(36)}`
  const b64 = (s) => Buffer.from(s, 'utf8').toString('base64')
  const encoded = `=?UTF-8?B?${b64(path.basename(file))}?=`
  return [
    `From: ${from}`, `To: ${to}`, `Cc: ${cc}`,
    `Subject: =?UTF-8?B?${b64(subject)}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`, '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '',
    b64(text), '',
    `--${boundary}`,
    `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; name="${encoded}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${encoded}"`, '',
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

const raw = Buffer.from(mime({ from, to: TO, cc: CC, subject, text: body, file }))
  .toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
const res = has('--send')
  ? await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
  : await gmail.users.drafts.create({ userId: 'me', requestBody: { message: { raw } } })

console.log(`${has('--send') ? '발송' : '초안'} ${res.data.id}`)
console.log(`  ${from} → ${TO} (참조 ${CC})`)
console.log(`  제목: ${subject}`)
console.log(`  첨부: ${path.basename(file)}`)
console.log(`\n${body}`)
