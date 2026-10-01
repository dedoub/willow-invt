/**
 * 강남구 인턴십 출근부를 인턴 각자에게 보낸다.
 *
 *   node scripts/gangnam-attendance-send.mjs                 # 이번 달, 초안만
 *   node scripts/gangnam-attendance-send.mjs --month 2026-09 # 달 지정
 *   node scripts/gangnam-attendance-send.mjs --send          # 실제 발송
 *   node scripts/gangnam-attendance-send.mjs --on-send-date  # 마지막 영업일이 아니면 그냥 끝냄
 *   node scripts/gangnam-attendance-send.mjs --notify        # 초안 만들고 CEO 봇으로 물어봄
 *   node scripts/gangnam-attendance-send.mjs --month 2026-09 --key-suffix _form9 --resign --due 2026-10-01
 *        # 서식을 바꿔 다시 서명받을 때. 첨부 signed/…_form9.pdf, 인턴의 최신 회신 스레드에 답장으로 만든다.
 *        # 기한 표기를 바꾸려면 --due-label "오늘 10월 1일(목)"
 *
 * 매달 마지막 영업일에 보내고 다음 달 5일까지 회신받는다(5일이 쉬는 날이면 다음 영업일).
 * 예약은 launchd 가 매일 부르고, --on-send-date 가 그날인지 가린다 — launchd 로는
 * "마지막 영업일"을 표현할 수 없다.
 *
 * 기본은 초안까지만 만든다. 실제 발송은 --send 를 붙일 때만 한다(CEO 승인 뒤).
 * 예약 실행은 초안을 만들고 --notify 로 CEO 봇에 물어본다. 승인이 오면 그때 --send 로 부른다.
 */
import { config } from 'dotenv'
config({ path: '.env.local', quiet: true })
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { assertSendAllowed } from './lib/send-guard.mjs'

const INTERNS = [
  { name: '조성민', code: 'cho', email: 'sm.cho@tensoftworks.com' },
  { name: '이승무', code: 'lee', email: 'sm.lee@tensoftworks.com' },
  { name: '전희나', code: 'jeon', email: 'hn.jeon@tensoftworks.com' },
]
const CC = 'ch.kim@tsw.im'
const CONTEXT = 'tensoftworks'          // dw.kim@tensoftworks.com 에서 보내고 여기로 회신받는다

// 첨부는 서버에서 받는다. 로컬 폴더에 기대면 그 폴더가 사라진 달에 조용히 멈춘다.
// 서명이 든 파일이라 비공개 버킷에 둔다.
// 스토리지 키는 아스키만 받으므로 사람은 코드로, 파일명은 내려받을 때 한글로 되살린다.
const BUCKET = 'tensw-attendance'

const args = process.argv.slice(2)
const has = (f) => args.includes(f)
if (has('--send')) assertSendAllowed('gangnam-attendance-send.mjs')
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
// --due 2026-10-01: 회신기한을 따로 줄 때(다시 서명받기처럼 급할 때)
const due = d(value('--due') ?? facts.replyDue)
const skipped = facts.skippedHolidays.map(h => `${month}/${h.day} ${h.label}`).join(', ')

// 이미 보낸 출근부를 다른 서식으로 다시 서명받을 때(--resign). 2026-09: 기관이 서식 9 + 실지급액을 요구해
// 서식 8 로 받은 서명본을 쓸 수 없었다. 남이 서명한 칸을 새 서식에 옮겨 붙이지 않는다 — 다시 받는다.
const resign = has('--resign')
function resignBody() {
  // CEO 2026-09-30 이 정한 문구 그대로. 기한 표기는 --due-label 로 바꿀 수 있다(예: "오늘 10월 1일(목)").
  const label = value('--due-label') ?? `${due.m}월 ${due.dd}일(${due.dow})`
  return `강남구상공회가 이번 달 지원금 신청부터 출근부를 [서식 9]로 받고, 지급액은 실지급액(차인지급액)으로 적도록 안내해서 양식이 바뀌었습니다.

첨부한 [서식 9] 출근부를 인쇄하신 뒤 날짜별 인턴 확인란과 하단 수령확인란에 직접 서명해 주시고, 스캔해서 ${label}까지 이 메일에 회신 부탁드립니다.
`
}

function body(name) {
  if (resign) return resignBody(name)
  return `${name} 님,

${year}년 ${month}월 강남구 인턴십 출근부를 첨부합니다.

출근부를 인쇄하신 뒤 출근·결근 표시와 인턴 확인란에 직접 서명해 주시고, 스캔해서 ${due.m}월 ${due.dd}일(${due.dow})까지 회신 부탁드립니다. 상단의 출근일·결근일·유급휴일 수도 함께 적어 주세요.

- 근무기간: ${year}.${String(month).padStart(2,'0')}.01 ~ ${String(month).padStart(2,'0')}.${facts.lastDay}
- 기재된 근무일: ${facts.workdayCount}일${skipped ? ` (${skipped} 제외)` : ''}

담당 확인란은 이미 서명되어 있습니다. 회신 주신 출근부는 강남구 인턴십 지원금 신청서에 첨부됩니다.

김동욱 드림
`
}

function mime({ from, to, cc, subject, text, file, inReplyTo, references }) {
  const boundary = `b${Date.now().toString(36)}`
  const b64 = (s) => Buffer.from(s, 'utf8').toString('base64')
  const name = path.basename(file)
  const encodedName = `=?UTF-8?B?${b64(name)}?=`
  return [
    `From: ${from}`, `To: ${to}`, `Cc: ${cc}`,
    `Subject: =?UTF-8?B?${b64(subject)}?=`,
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${references || inReplyTo}`] : []),
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

/** CEO 봇(윌리) 대화로 보낸다. notify-job.mjs 와 같은 곳을 본다. */
async function tellCeo(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!token || !url || !key) throw new Error('텔레그램·Supabase 환경변수가 없어요.')
  const res = await fetch(`${url}/rest/v1/telegram_conversations?bot_type=eq.ceo&select=chat_id&order=updated_at.desc&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  if (!res.ok) throw new Error(`CEO 대화를 찾지 못했어요: ${res.status}`)
  const chatId = (await res.json())[0]?.chat_id
  if (!chatId) throw new Error('CEO 봇 대화가 없어 보낼 곳을 찾지 못했어요.')
  const sent = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  })
  if (!sent.ok) throw new Error(`텔레그램 전송 실패: ${sent.status} ${await sent.text()}`)
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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gangnam-'))
for (const intern of INTERNS) {
  const key = `${year}/signed/${year}-${String(month).padStart(2, '0')}_${intern.code}${value('--key-suffix') ?? ''}.pdf`
  const { data: blob, error: dl } = await sb.storage.from(BUCKET).download(key)
  if (dl || !blob) throw new Error(`첨부를 받지 못했어요: ${BUCKET}/${key} — ${dl?.message ?? '빈 응답'}`)
  const file = path.join(tmp, `${year}년 ${String(month).padStart(2, '0')}월 출근부_${intern.name}.pdf`)
  fs.writeFileSync(file, Buffer.from(await blob.arrayBuffer()))
  // 2026년 9월분부터 기관은 서식 9 만 받는다. 미리 만들어 둔 서식 8(10~12월분)이 그대로 나가지 않게 막는다.
  if (year * 100 + month >= 202609 && !has('--allow-form8')) {
    const text = execFileSync('pdftotext', [file, '-'], { encoding: 'utf8' })
    if (!/서식\s*9/.test(text)) {
      const msg = `${year}년 ${month}월 출근부가 아직 서식 8이에요(${BUCKET}/${key}). 급여 이체 뒤 ` +
        `node scripts/gangnam-subsidy-build.mjs attendance --month ${year}-${String(month).padStart(2, '0')} 로 서식 9 를 먼저 만들어야 해요.`
      if (has('--notify')) await tellCeo(`⚠️ ${msg}`)
      throw new Error(msg)
    }
  }
  let subject = `[텐소프트웍스] ${year}년 ${month}월 출근부 확인 요청 (회신기한 ${due.m}/${due.dd})`
  let thread = null
  if (resign) {
    // 다시 서명받을 땐 새 메일이 아니라 그 사람의 최신 회신에 답장한다(CEO 2026-09-30)
    const q = `from:${intern.email} subject:"${year}년 ${month}월 출근부"`
    const hit = (await gmail.users.messages.list({ userId: 'me', q, maxResults: 1 })).data.messages?.[0]
    if (!hit) throw new Error(`${intern.name} 의 ${month}월 출근부 회신을 찾지 못했어요 (${q})`)
    const m = (await gmail.users.messages.get({ userId: 'me', id: hit.id, format: 'metadata', metadataHeaders: ['Subject', 'Message-ID', 'References'] })).data
    const h = Object.fromEntries(m.payload.headers.map(x => [x.name.toLowerCase(), x.value]))
    subject = h.subject.startsWith('Re:') ? h.subject : `Re: ${h.subject}`
    thread = { id: m.threadId, inReplyTo: h['message-id'], references: [h.references, h['message-id']].filter(Boolean).join(' ') }
  }
  const raw = Buffer.from(mime({ from, to: intern.email, cc: CC, subject, text: body(intern.name), file, inReplyTo: thread?.inReplyTo, references: thread?.references }))
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
  const threadId = thread ? { threadId: thread.id } : {}
  const res = has('--send')
    ? await gmail.users.messages.send({ userId: 'me', requestBody: { raw, ...threadId } })
    : await gmail.users.drafts.create({ userId: 'me', requestBody: { message: { raw, ...threadId } } })
  console.log(`  ${intern.name} <${intern.email}>  ${has('--send') ? '발송' : '초안'} ${res.data.id}  (${BUCKET}/${key})`)
}
fs.rmSync(tmp, { recursive: true, force: true })

if (has('--notify') && !has('--send')) {
  await tellCeo([
    `📋 ${year}년 ${month}월 출근부 초안 ${INTERNS.length}통을 만들었습니다.`,
    `오늘이 ${month}월 마지막 영업일이라 보낼 차례입니다.`,
    '',
    `받는 사람: ${INTERNS.map(i => i.name).join(' · ')}`,
    `참조: ${CC}`,
    `회신기한: ${due.m}월 ${due.dd}일(${due.dow})`,
    `근무일: ${facts.workdayCount}일`,
    '',
    '보낼까요? "출근부 보내줘" 라고 하시면 발송합니다.',
    'Gmail 임시보관함에서 먼저 확인하실 수 있습니다.',
  ].join('\n'))
  console.log('\nCEO 봇에 발송 여부를 물었습니다.')
}
