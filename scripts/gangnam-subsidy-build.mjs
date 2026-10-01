#!/usr/bin/env node
/**
 * 강남구 인턴십 지원금 서류를 만든다 — 신청서(서식 13)와 출근부(서식 9).
 *
 *   node scripts/gangnam-subsidy-build.mjs application --month 2026-09
 *        → tmp/tensw-internship-subsidy/2026/2026-09/07-final-submission/1_…신청_202609.{hwp,pdf} (인감 포함)
 *   node scripts/gangnam-subsidy-build.mjs attendance --month 2026-09 [--key-suffix _form9]
 *        → 사람마다 서식 9 출근부(담당 서명만) → 비공개 버킷 tensw-attendance/2026/{source,plain,signed}/…
 *          메일은 gangnam-attendance-send.mjs 가 보낸다.
 *   node scripts/gangnam-subsidy-build.mjs status  --month 2026-09   # 기관 요청 5종 대비 준비 현황(윌리 보고용)
 *   node scripts/gangnam-subsidy-build.mjs collect --month 2026-09   # 인턴 회신(서명본)을 03-attendance-received 로
 *   node scripts/gangnam-subsidy-build.mjs submit  --month 2026-09   # 5종 교차검증 → 07 폴더 → 기관 제출 Gmail 초안
 *        submit --send 는 CEO 승인 뒤에만. 검증이 하나라도 틀리면 초안을 만들지 않는다.
 *
 * 값은 손으로 옮기지 않는다:
 *   대상자·주민번호·전환일·기본급  비공개 버킷 tensw-attendance/config/subsidy-roster.json
 *   기관 양식(서식 9·12·13)        tensw-attendance/forms/2026-gangnam-internship-forms.hwp
 *   근무일·지급일·말일              scripts/lib/kr_workdays.py
 *   실지급액(출근부 지급액)          월 폴더의 우리은행 급여이체확인 PDF (이름별 이체금액)
 *   기본급 대조                      월 폴더의 급여명세서 PDF — 명부와 다르면 멈춘다
 *
 * 규칙(2026-09-30, CEO):
 *   - 한컴 화면을 조작해 글자를 고치지 않는다. scripts/hwp/hwp.mjs 로 파일을 고치고 한컴은 PDF 저장만.
 *   - 남이 서명한 칸을 다른 서식에 옮겨 붙이지 않는다. 서식이 바뀌면 다시 서명받는다.
 *   - 인감은 HWP 가 아니라 PDF 로 바꾼 뒤 얹는다(scripts/hwp/stamp_seal.py).
 *   - 출근부의 출근 표시·일수·인턴 확인·수령확인은 비워 둔다. 인턴이 자필로 쓴다.
 *   - 입력 값은 가운데, 금액은 오른쪽. 두 줄 칸은 줄 간격을 맞춘다. 소재지는 8월 제출본과 같게.
 */
import { config } from 'dotenv'
config({ path: '.env.local', quiet: true })
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import { fill, toPdf, colors } from './hwp/hwp.mjs'
import { assertSendAllowed } from './lib/send-guard.mjs'

const args = process.argv.slice(2)
if (args.includes('--send')) assertSendAllowed('gangnam-subsidy-build.mjs')
const cmd = args[0]
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
const month = flag('--month')
if (!['application', 'attendance', 'status', 'collect', 'submit', 'correction'].includes(cmd) || !/^\d{4}-\d{2}$/.test(month ?? '')) {
  console.error('usage: gangnam-subsidy-build.mjs application|attendance|status|collect|submit|correction --month YYYY-MM')
  process.exit(1)
}
const [Y, M] = month.split('-').map(Number)
const MM = String(M).padStart(2, '0')
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const DIR = path.join(ROOT, 'tmp', 'tensw-internship-subsidy', String(Y), month)
const BUCKET = 'tensw-attendance'
const PY = fs.existsSync(path.join(os.homedir(), '.willow/venv/bin/python')) ? path.join(os.homedir(), '.willow/venv/bin/python') : 'python3'
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'gangnam-subsidy-'))
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY)

const facts = JSON.parse(execFileSync('python3', [path.join(ROOT, 'scripts/lib/kr_workdays.py'), String(Y), String(M)], { encoding: 'utf8' }))
const won = (n) => n.toLocaleString('en-US')
const manwon = (n) => `${n / 10000}만원`

async function download(key, to, bucket = BUCKET) {
  const { data, error } = await sb.storage.from(bucket).download(key)
  if (error || !data) throw new Error(`${bucket}/${key} 를 받지 못했어요: ${error?.message}`)
  fs.writeFileSync(to, Buffer.from(await data.arrayBuffer()))
  return to
}
async function upload(key, file, type) {
  const { error } = await sb.storage.from(BUCKET).upload(key, fs.readFileSync(file), { upsert: true, contentType: type })
  if (error) throw new Error(`${key} 올리기 실패: ${error.message}`)
}
const writeValues = (file, v) => fs.writeFileSync(file, Object.entries(v).map(([k, x]) => `${k}\t${x}\n`).join(''))
const pdfText = (file) => execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' })
function findIn(dir, re) {
  if (!fs.existsSync(dir)) return null
  for (const sub of ['', ...fs.readdirSync(dir)]) {
    const d = path.join(dir, sub)
    if (!fs.statSync(d).isDirectory()) continue
    // 외장 exFAT 볼륨은 파일마다 ._ 짝(AppleDouble)을 만든다 — PDF 가 아니니 뺀다
    const hit = fs.readdirSync(d).find(f => !f.startsWith('._') && re.test(f.normalize('NFC')))
    if (hit) return path.join(d, hit)
  }
  return null
}

const roster = JSON.parse(fs.readFileSync(await download('config/subsidy-roster.json', path.join(work, 'roster.json')), 'utf8'))
const form = await download('forms/2026-gangnam-internship-forms.hwp', path.join(work, 'form.hwp'))

// 기본급은 그 달 급여명세서와 대조한다(명부만 믿으면 급여가 바뀐 달에 틀린 신청서가 나간다)
for (const p of (cmd === 'application' ? roster.people : [])) {
  const slip = findIn(path.join(DIR, '04-payslips'), new RegExp(`급여명세서_${Y}${MM}_${p.name}\\.pdf$`))
  if (!slip) { console.log(`  ! ${p.name} 급여명세서가 없어 기본급을 대조하지 못했어요(명부 ${won(p.basePay)})`); continue }
  const got = Number((pdfText(slip).match(/기본급\s+([\d,]+)원/) ?? [])[1]?.replace(/,/g, ''))
  if (got !== p.basePay) throw new Error(`${p.name} 기본급이 명부(${won(p.basePay)})와 명세서(${won(got)})가 달라요 — 명부를 먼저 고치세요`)
}

if (cmd === 'application') {
  const total = roster.subsidyPerPerson * roster.people.length
  const korean = { 1: '일', 2: '이', 3: '삼', 4: '사', 5: '오', 6: '육', 7: '칠', 8: '팔', 9: '구' }
  const man = total / 10000                                   // 450 → 사백오십
  const hangul = [[1000, '천'], [100, '백'], [10, '십'], [1, '']].reduce((s, [u, n]) => {
    const d = Math.floor((man % (u * 10)) / u); return d ? s + korean[d] + n : s   // 서식 예시처럼 "일백오십만원"
  }, '')
  const v = {
    r0c0p0: `( ${M} )월 정규직 전환 지원금 신청서`,
    r2c1p0: '㈜텐소프트웍스', r2c11p0: '김 철 형', r4c3p0: '828-88-00992',
    r6c1p0: '서울특별시 강남구', r6c1p1: '봉은사로105길54-5, 402호',          // 8월 제출본과 같게(CEO 2026-09-30)
    r6c11p0: roster.contact.phone, r6c11p1: `(${roster.contact.name})`,   // 담당자 연락처는 비공개 명부에
    r8c1p0: '계좌번호 140-013-150883(신한은행 테헤란로금융센터 지점)', r8c1p1: '(예금주 : 주식회사 텐소프트웍스)',
    r10c2p0: `${Y}.${MM}.01. ~`, r10c2p1: `${Y}.${MM}.${String(facts.lastDay).padStart(2, '0')}.`,
    r10c12p0: `일금 ${hangul}만원`, r10c12p1: `(￦${won(total)})`,
    r18c0p2: `             ${Y}년   ${M}월   ${facts.lastDay}일`,
    r18c0p3: '          회사   대표        김 철 형',
  }
  const rows = [12, 13, 14, 15]
  if (roster.people.length > rows.length) throw new Error('서식 13 은 네 명까지 들어가요')
  roster.people.forEach((p, i) => Object.assign(v, {
    [`r${rows[i]}c0p0`]: p.name, [`r${rows[i]}c2p0`]: p.rrn, [`r${rows[i]}c6p0`]: p.convertedOn,
    [`r${rows[i]}c9p0`]: manwon(p.basePay), [`r${rows[i]}c13p0`]: won(roster.subsidyPerPerson),
  }))
  for (let i = roster.people.length; i < rows.length; i++) Object.assign(v, { [`r${rows[i]}c9p0`]: '', [`r${rows[i]}c13p0`]: '' })
  const tsv = path.join(work, 'application.tsv'); writeValues(tsv, v)
  const out = path.join(DIR, '07-final-submission'); fs.mkdirSync(out, { recursive: true })
  const name = `1_강남구_중소기업_정규직전환_지원금_신청_${Y}${MM}`
  const hwp = path.join(out, `${name}.hwp`)
  console.log(fill(form, hwp, tsv, {
    form: '서식 13', headingPs: '22', signRightMargin: '12600', skip: 'r0c0,r18c0',
    money: ['r10c12', ...rows.flatMap(r => [`r${r}c9`, `r${r}c13`])].join(','),
  }).trim())
  const grey = colors(hwp).split('\n').filter(l => l.startsWith('NOT BLACK') && !/고용보험 피보험자격내역서/.test(l))
  if (grey.length) throw new Error(`검정이 아닌 입력 글자가 남았어요:\n${grey.join('\n')}`)
  const plain = path.join(work, `${name}.pdf`)
  const { pages } = await toPdf(hwp, plain)
  if (pages !== 1) throw new Error(`신청서 PDF 가 ${pages}쪽이에요(한 장이어야 함)`)
  const sealUrl = execFileSync('npx', ['tsx', 'scripts/corp-records.ts', 'doc', 'url', 'TS-DOC-2026-003', '--company', 'tensw'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').pop().replace(/"/g, '')
  const seal = path.join(work, 'seal.png'); fs.writeFileSync(seal, Buffer.from(await (await fetch(sealUrl)).arrayBuffer()))
  const pdf = path.join(out, `${name}.pdf`)
  console.log(execFileSync(PY, [path.join(ROOT, 'scripts/hwp/stamp_seal.py'), plain, seal, pdf], { encoding: 'utf8' }).trim())
  console.log(`신청서: ${hwp}\n        ${pdf}\n신청금액 ${won(total)}원 · ${roster.people.map(p => p.name).join('·')}`)
}

if (cmd === 'attendance') {
  const transfer = findIn(DIR, new RegExp(`급여이체확인_${Y}${MM}.*\\.pdf$`))
  if (!transfer) throw new Error(`${month} 우리은행 급여이체확인 PDF 가 월 폴더에 없어요 — 실지급액을 알 수 없어요`)
  const t = pdfText(transfer)
  const net = {}
  // 이체확인증: 금액 줄 바로 아래 줄에 받는 사람 이름이 온다
  const lines = t.split('\n')
  lines.forEach((l, i) => {
    const amount = l.match(/^\s+([\d,]{7,})\s/)?.[1]
    const who = roster.people.find(p => (lines[i + 1] ?? '').includes(p.name))
    if (amount && who) net[who.code] = amount
  })
  for (const p of roster.people) if (!net[p.code]) throw new Error(`${p.name} 의 이체금액을 이체확인증에서 찾지 못했어요`)
  const sigDir = path.join(work, 'sig'); fs.mkdirSync(sigDir)
  // 담당 칸 서명 표본 21장(비공개 버킷 signatures) — 출근부 스킬과 같은 표본
  for (let i = 1; i <= 21; i++) {
    const n = String(i).padStart(2, '0')
    await download(`dw.kim/attendance/sig_${n}.png`, path.join(sigDir, `sig_${n}.png`), 'signatures')
  }
  // 달력의 모든 날을 적는다(CEO 2026-10-01): 날마다 근무·연차·공휴일 이름·토요일·주휴무일(일요일)을 적고,
  // 상단 출근·결근·유급휴일 합계도 채운다. 인턴 서명 칸은 비워 본인이 서명하고, 담당 서명은 근무일 줄에만 찍는다.
  // 연차: --leave lee:14,jeon:10 (인턴 회신 원본에서 확인한 날)
  const leave = Object.fromEntries((flag('--leave') ?? '').split(',').filter(Boolean).map(x => {
    const [code, ds] = x.split(':'); return [code, ds.split('+').map(Number)]
  }))
  const holidayName = Object.fromEntries((facts.holidays ?? []).map(h => [h.day, h.label]))
  const dow = d => new Date(Date.UTC(Y, M - 1, d)).getUTCDay()
  // 토요일은 원래 쉬는 무급휴무일 — 공휴일과 겹치면 "토요일(추석)"처럼 적고 유급휴일에 넣지 않는다(CEO 2026-10-01).
  const kindOf = d => dow(d) === 6 ? (holidayName[d] ? `토요일(${holidayName[d]})` : '토요일휴무') : holidayName[d] ? holidayName[d] : dow(d) === 0 ? '주휴무일' : ''
  const days = Array.from({ length: facts.lastDay }, (_, i) => i + 1)
  const leftRows = Array.from({ length: 10 }, (_, i) => 22 + i)
  const rightRows = [4, 5, 7, 9, 11, 13, 14, 15, 16, 18, ...Array.from({ length: 11 }, (_, i) => 21 + i)]
  const left = days.slice(0, 10), right = days.slice(10)
  const suffix = flag('--key-suffix') ?? ''
  const sundays = days.filter(d => dow(d) === 0 && !holidayName[d]).length
  const legal = days.filter(d => holidayName[d] && dow(d) !== 6).length     // 법정공휴일(토요일 겹침은 빼고, 일요일 겹침은 한 번만)
  for (const p of roster.people) {
    const myLeave = leave[p.code] ?? []
    const workDays = days.filter(d => !kindOf(d))
    const counts = { 출근: workDays.length - myLeave.length, 결근: 0, 유급휴일: sundays + legal + myLeave.length }
    const v = {
      r0c10p0: `근무기간 : ${Y}.${MM}.01 – ${MM}.${String(facts.lastDay).padStart(2, '0')}  (1개월)`,
      r4c5p0: `( ${M} )월`,
      r8c1p0: `성    명 : ${p.name}`, r8c1p1: '인턴 업체 : ㈜텐소프트웍스', r8c1p2: `- 위 인턴업체에서 ( ${M} )월에`,
      r8c1p3: '(정규직)으로 근무하였습니다.', r8c1p5: '근무지역 :', r8c1p6: '강남구 봉은사로105길54-5, 402호',
      r1c10p0: `출근 : ${counts.출근}일, 결근 : ${counts.결근}일, 유급휴일 : ${counts.유급휴일}일`,
      r22c6p0: '', r32c13p1: '인턴(정규직)',                              // 빨간 "자필서명" 안내는 지운다(CEO)
      r32c3p0: `지급일 :${facts.payDate.replaceAll('-', '.')}`, r32c8p0: `지급액 : ${net[p.code]}원`,
    }
    const mark = d => myLeave.includes(d) ? '연차' : kindOf(d) || '○'
    // 한 줄로 적는다(CEO: "토요일(추석)"이 칸을 조금 넘쳐도 괜찮다).
    const put = (key, text) => { v[`${key}p0`] = text }
    left.forEach((d, i) => {                                                                     // 서식 8 과 같은 날짜 표기
      v[`r${leftRows[i]}c0p0`] = i === 0 ? `${M}    ${d}` : `     ${d}`
      if (mark(d)) put(`r${leftRows[i]}c2`, mark(d))
    })
    right.forEach((d, i) => {
      v[`r${rightRows[i]}c10p0`] = i === 0 ? `${M}    ${d}` : `     ${d}`
      if (mark(d)) put(`r${rightRows[i]}c11`, mark(d))
    })
    const stampMask = list => 'm:' + list.map(d => kindOf(d) ? '0' : '1').join('')
    const tsv = path.join(work, `${p.code}.tsv`); writeValues(tsv, v)
    const hwp = path.join(work, `${p.code}.hwp`)
    // 출근 칸 표시(○·연차·휴무·추석)만 가운데 정렬한다. 날짜·머리글·서명 칸은 양식 배치(빈칸으로 맞춘 자리)를 그대로 둔다.
    const markCells = new Set([...leftRows.map(r => `r${r}c2`), ...rightRows.map(r => `r${r}c11`)])
    const keep = [...new Set(Object.keys(v).map(k => k.slice(0, k.indexOf('p'))))].filter(k => !markCells.has(k))
    console.log(fill(form, hwp, tsv, { form: '서식 9', skip: keep.join(',') }).trim())
    const plain = path.join(work, `${p.code}.pdf`)
    const { pages } = await toPdf(hwp, plain)
    if (pages !== 1) throw new Error(`${p.name} 출근부 PDF 가 ${pages}쪽이에요`)
    const signed = path.join(work, `${p.code}_signed.pdf`)
    console.log(execFileSync(PY, [path.join(ROOT, 'scripts/gangnam_attendance_sign.py'), plain, signed,
      stampMask(left), stampMask(right), `${p.name}|${month}`, sigDir], { cwd: ROOT, encoding: 'utf8' }).trim())
    fs.copyFileSync(signed, path.join(DIR, '03-attendance', `출근부_${Y}${MM}_${p.name}_전체날짜${suffix}.pdf`))
    console.log(`  ${p.name}: 출근 ${counts.출근} · 결근 ${counts.결근} · 유급휴일 ${counts.유급휴일} (연차 ${myLeave.join(',') || '없음'})`)
    await upload(`${Y}/source/${month}_form9_${p.code}.hwp`, hwp, 'application/x-hwp')
    await upload(`${Y}/plain/${month}_${p.code}${suffix}.pdf`, plain, 'application/pdf')
    await upload(`${Y}/signed/${month}_${p.code}${suffix}.pdf`, signed, 'application/pdf')
    console.log(`  ${p.name}: 지급액 ${net[p.code]}원 → ${BUCKET}/${Y}/signed/${month}_${p.code}${suffix}.pdf`)
  }
  console.log(`출근부 ${roster.people.length}장. 메일: node scripts/gangnam-attendance-send.mjs --month ${month}${suffix ? ` --key-suffix ${suffix}` : ''}`)
}

// ─── 인턴 회신·제출 ─────────────────────────────────────────────────────────
async function gmailClient() {
  const { data: token, error } = await sb.from('gmail_tokens').select('*').eq('context', 'tensoftworks')
    .order('updated_at', { ascending: false }).limit(1).single()
  if (error || !token) throw new Error(`tensoftworks Gmail 토큰이 없어요: ${error?.message}`)
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID_TENSW, process.env.GOOGLE_CLIENT_SECRET_TENSW, process.env.GOOGLE_REDIRECT_URI)
  auth.setCredentials({ access_token: token.access_token, refresh_token: token.refresh_token })
  return google.gmail({ version: 'v1', auth })
}
const attachmentParts = (part) => !part ? [] : [
  ...(part.filename && part.body?.attachmentId ? [{ filename: part.filename, mimeType: part.mimeType, id: part.body.attachmentId }] : []),
  ...(part.parts ?? []).flatMap(attachmentParts),
]
const RECEIVED = path.join(DIR, '03-attendance-received')
/** 그 사람의 서명본: 우리가 그 스레드에 마지막으로 보낸 메일 뒤에 온, 첨부 있는 회신(재서명 요청 뒤엔 새 서명본만 잡힌다) */
const receivedFile = (p) => fs.existsSync(RECEIVED)
  ? fs.readdirSync(RECEIVED).filter(f => !f.startsWith('._') && f.normalize('NFC').startsWith(`${month}_${p.name}_signed_`)).sort().pop() : null

async function collect() {
  const gmail = await gmailClient()
  const me = (await gmail.users.getProfile({ userId: 'me' })).data.emailAddress
  fs.mkdirSync(RECEIVED, { recursive: true })
  for (const p of roster.people) {
    const q = `from:${p.email} subject:"${Y}년 ${M}월 출근부" has:attachment`
    const hit = (await gmail.users.messages.list({ userId: 'me', q, maxResults: 1 })).data.messages?.[0]
    if (!hit) { console.log(`  ${p.name}: 회신 없음`); continue }
    const thread = (await gmail.users.threads.get({ userId: 'me', id: hit.threadId, format: 'full' })).data.messages
    const from = (m) => (m.payload.headers.find(h => h.name === 'From')?.value ?? '')
    const lastOurs = thread.map((m, i) => ({ m, i })).filter(({ m }) => from(m).includes(me) && !(m.labelIds ?? []).includes('DRAFT')).pop()?.i ?? -1
    const reply = thread.slice(lastOurs + 1).filter(m => from(m).includes(p.email) && attachmentParts(m.payload).length).pop()
    if (!reply) { console.log(`  ${p.name}: 마지막 요청(${lastOurs >= 0 ? '보냄' : '없음'}) 뒤 회신 없음 — 기다림`); continue }
    const parts = attachmentParts(reply.payload).filter(a => /pdf|image/.test(a.mimeType))
    if (parts.length !== 1) { console.log(`  ${p.name}: 첨부가 ${parts.length}개 — 사람이 확인해야 해요 (메일 ${reply.id})`); continue }
    const ext = parts[0].mimeType === 'application/pdf' ? '.pdf' : parts[0].mimeType === 'image/png' ? '.png' : '.jpg'
    const out = path.join(RECEIVED, `${month}_${p.name}_signed_${reply.id}${ext}`)
    if (!fs.existsSync(out)) {
      const data = (await gmail.users.messages.attachments.get({ userId: 'me', messageId: reply.id, id: parts[0].id })).data.data
      fs.writeFileSync(out, Buffer.from(data, 'base64url'), { mode: 0o600 })
    }
    console.log(`  ${p.name}: ${path.basename(out)} (${new Date(Number(reply.internalDate)).toLocaleString('ko-KR')})`)
  }
}

/** 제출 5종의 자리. 없으면 null */
function documents() {
  const d6 = path.join(DIR, '06-draft-submission'), d7 = path.join(DIR, '07-final-submission')
  const pick = (dir, re) => fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => !f.startsWith('._') && re.test(f.normalize('NFC'))).sort().map(f => path.join(dir, f)).pop() ?? null : null
  return {
    application: pick(d7, new RegExp(`^1_.*신청_${Y}${MM}\\.pdf$`)),
    attendance: roster.people.map(p => receivedFile(p) && path.join(RECEIVED, receivedFile(p))),
    payslips: pick(d6, new RegExp(`^3_급여명세서_${Y}${MM}.*\\.pdf$`)),
    roster: pick(d6, /^4_4대사회보험_사업장가입자명부_\d{8}\.pdf$/),
    transfer: pick(d6, new RegExp(`^5_.*급여이체확인_${Y}${MM}.*\\.pdf$`)),
  }
}
const pages = (f) => Number(execFileSync('pdfinfo', [f], { encoding: 'utf8' }).match(/Pages:\s+(\d+)/)?.[1] ?? 0)
const namesIn = (f) => roster.people.filter(p => pdfText(f).includes(p.name)).map(p => p.name)

/** 교차검증. 틀린 것 목록을 돌려준다(빈 배열 = 통과) */
function verify(doc) {
  const bad = [], all = roster.people.map(p => p.name)
  const need = (ok, msg) => { if (!ok) bad.push(msg) }
  const total = won(roster.subsidyPerPerson * roster.people.length)
  need(doc.application, '1 신청서가 없어요 (application 먼저)')
  if (doc.application) {
    const t = pdfText(doc.application)
    need(pages(doc.application) === 1, '1 신청서가 한 장이 아니에요')
    need(all.every(n => t.includes(n)), `1 신청서에 대상자가 빠졌어요 (${namesIn(doc.application).join('·')})`)
    need(t.includes(total), `1 신청서 신청금액이 ${total}원이 아니에요`)
    // 제목의 "( 9 )"는 PDF 글자로 뽑히지 않는다 — 대상 기간으로 월을 본다
    need(t.includes(`${Y}.${MM}.01.`) && t.includes(`${Y}.${MM}.${String(facts.lastDay).padStart(2, '0')}.`), '1 신청서의 대상 기간이 그 달이 아니에요')
  }
  roster.people.forEach((p, i) => need(doc.attendance[i], `2 ${p.name} 출근부 서명본이 아직 없어요 (collect)`))
  need(doc.payslips && all.every(n => namesIn(doc.payslips).includes(n)), '3 급여명세서에 대상자가 다 있지 않아요')
  need(doc.roster && all.every(n => namesIn(doc.roster).includes(n)), '4 가입자 명부에 대상자가 다 있지 않아요')
  if (doc.transfer) {
    const t = pdfText(doc.transfer)
    need(all.every(n => t.includes(n)), '5 이체확인증에 대상자가 다 있지 않아요')
  } else bad.push('5 급여이체확인증이 없어요')
  return bad
}

async function status() {
  const doc = documents()
  const line = (n, label, f, extra = '') => console.log(`${f ? '✅' : '⏳'} ${n}. ${label}${f ? ` — ${Array.isArray(f) ? f.filter(Boolean).length + '/' + f.length + '명' : path.basename(f) + ` (${pages(f)}쪽)`}` : ' — 없음'}${extra}`)
  console.log(`${month}분 강남구 인턴십 지원금 — 제출 ${facts.replyDue ? '' : ''}마감 ${Y}-${String(M + 1 > 12 ? 1 : M + 1).padStart(2, '0')}-15, gnk@gngucci.or.kr`)
  line(1, '[서식13] 정규직 전환 지원금 신청서', doc.application)
  line(2, '[서식9] 출근부 인턴 서명본(지급액=실지급액)', doc.attendance.some(Boolean) ? doc.attendance : null,
    doc.attendance.every(Boolean) ? '' : ` — 기다림: ${roster.people.filter((p, i) => !doc.attendance[i]).map(p => p.name).join('·')}`)
  line(3, '임금대장(급여명세서) 사본', doc.payslips)
  line(4, '4대 사회보험 사업장 가입자 명부', doc.roster)
  line(5, '계좌이체 내역(은행 발급 이체확인증)', doc.transfer)
  const bad = verify(doc)
  console.log(bad.length ? `\n남은 것:\n${bad.map(b => '  - ' + b).join('\n')}` : '\n5종 교차검증 통과 — submit 로 제출 초안을 만들 수 있어요')
}

async function submit() {
  const doc = documents()
  const bad = verify(doc)
  if (bad.length) throw new Error(`교차검증 실패 — 제출 초안을 만들지 않았어요:\n${bad.join('\n')}`)
  const out = path.join(DIR, '07-final-submission')
  // 출근부 3장을 명부 순서대로 한 PDF 로(사진 회신은 PDF 로 바꿔 넣는다)
  const merged = path.join(out, `2_출근부_${Y}${MM}_${roster.people.length}명_서식9.pdf`)
  execFileSync(PY, ['-c', `
import sys
from pypdf import PdfReader, PdfWriter
from PIL import Image
import io
w = PdfWriter()
for f in sys.argv[2:]:
    if f.lower().endswith('.pdf'):
        for pg in PdfReader(f).pages: w.add_page(pg)
    else:
        buf = io.BytesIO(); Image.open(f).convert('RGB').save(buf, 'PDF', resolution=150); buf.seek(0)
        for pg in PdfReader(buf).pages: w.add_page(pg)
w.write(open(sys.argv[1], 'wb'))
`, merged, ...doc.attendance])
  const files = [
    doc.application, merged,
    ...[[doc.payslips, `3_급여명세서_${Y}${MM}_${roster.people.length}명.pdf`], [doc.roster, path.basename(doc.roster)],
      [doc.transfer, `5_우리은행_급여이체확인_${Y}${MM}_${roster.people.length}명.pdf`]].map(([src, name]) => {
      const dst = path.join(out, name); if (src !== dst) fs.copyFileSync(src, dst); return dst
    }),
  ]
  const total = won(roster.subsidyPerPerson * roster.people.length)
  const subject = `[텐소프트웍스] ${Y}년 ${M}월 강남구 인턴십 지원금 신청`
  const text = `안녕하세요, 텐소프트웍스입니다.

${Y}년 ${M}월 강남구 중소기업 인턴십 정규직 전환 지원금 신청 서류를 제출합니다.
- 대상: ${roster.people.map(p => p.name).join('·')} ${roster.people.length}명
- 신청금액: ${total}원
- 첨부: 신청서(서식13), 출근부(서식9), 급여명세서, 4대 사회보험 사업장 가입자 명부, 급여이체확인증

접수 확인 부탁드립니다.

${roster.contact.name} 드림 (${roster.contact.phone})
`
  const gmail = await gmailClient()
  const from = (await gmail.users.getProfile({ userId: 'me' })).data.emailAddress
  const b64 = (x) => Buffer.from(x, 'utf8').toString('base64')
  const bd = `b${Date.now().toString(36)}`
  const raw = [`From: ${from}`, 'To: gnk@gngucci.or.kr', `Subject: =?UTF-8?B?${b64(subject)}?=`, 'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${bd}"`, '', `--${bd}`, 'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64', '', b64(text), '',
    ...files.flatMap(f => { const n = `=?UTF-8?B?${b64(path.basename(f))}?=`; return [`--${bd}`, `Content-Type: application/pdf; name="${n}"`,
      'Content-Transfer-Encoding: base64', `Content-Disposition: attachment; filename="${n}"`, '', fs.readFileSync(f).toString('base64'), ''] }),
    `--${bd}--`, ''].join('\r\n')
  const body = { raw: Buffer.from(raw).toString('base64url') }
  const res = args.includes('--send')
    ? await gmail.users.messages.send({ userId: 'me', requestBody: body })
    : await gmail.users.drafts.create({ userId: 'me', requestBody: { message: body } })
  console.log(`${args.includes('--send') ? '발송' : '초안'} ${res.data.id} — ${from} → gnk@gngucci.or.kr\n제목 ${subject}\n첨부:\n${files.map(f => '  ' + path.basename(f) + ` (${pages(f)}쪽)`).join('\n')}`)
}

// 기관 보완요청에 답한다(2026-10-01). 인턴이 다시 보낸 서명본을 합쳐, 상공회의 최신 "보완" 메일 스레드에 답장 초안을 만든다.
// node scripts/gangnam-subsidy-build.mjs correction --month 2026-09   (먼저 collect 로 새 서명본을 받는다)
async function correction() {
  const doc = documents()
  const missing = roster.people.filter((p, i) => !doc.attendance[i]).map(p => p.name)
  if (missing.length) throw new Error(`서명본이 없어요: ${missing.join('·')} — collect 먼저`)
  const out = path.join(DIR, '07-final-submission'); fs.mkdirSync(out, { recursive: true })
  const merged = path.join(out, `2_출근부_${Y}${MM}_${roster.people.length}명_서식9_보완.pdf`)
  execFileSync(PY, ['-c', `
import sys, io
from pypdf import PdfReader, PdfWriter
from PIL import Image
w = PdfWriter()
for f in sys.argv[2:]:
    if f.lower().endswith('.pdf'):
        for pg in PdfReader(f).pages: w.add_page(pg)
    else:
        buf = io.BytesIO(); Image.open(f).convert('RGB').save(buf, 'PDF', resolution=150); buf.seek(0)
        for pg in PdfReader(buf).pages: w.add_page(pg)
w.write(open(sys.argv[1], 'wb'))
`, merged, ...doc.attendance])
  const gmail = await gmailClient()
  const from = (await gmail.users.getProfile({ userId: 'me' })).data.emailAddress
  const hit = (await gmail.users.messages.list({ userId: 'me', q: `from:gnk@gngucci.or.kr subject:보완 subject:"${Y}년 ${M}월" newer_than:30d`, maxResults: 1 })).data.messages?.[0]
  if (!hit) throw new Error(`상공회의 ${Y}년 ${M}월 보완요청 메일을 찾지 못했어요`)
  const src = (await gmail.users.messages.get({ userId: 'me', id: hit.id, format: 'metadata', metadataHeaders: ['Subject', 'Message-Id', 'References'] })).data
  const h = Object.fromEntries(src.payload.headers.map(x => [x.name.toLowerCase(), x.value]))
  const subject = /^re:/i.test(h.subject) ? h.subject : `Re: ${h.subject}`
  // 보완 회신에도 제출 5종을 모두 다시 붙인다(CEO 2026-10-01). 출근부만 새 서명본 병합으로 바꾼다.
  const files = [doc.application, merged, doc.payslips, doc.roster, doc.transfer]
  const lost = ['1 신청서', '2 출근부', '3 급여명세서', '4 가입자 명부', '5 이체확인증'].filter((_, i) => !files[i])
  if (lost.length) throw new Error(`다시 붙일 서류가 없어요: ${lost.join(', ')}`)
  const text = `안녕하세요, 텐소프트웍스입니다.

보완 요청하신 ${M}월 출근부를 수정해, 신청 서류 전체와 함께 다시 보내드립니다.

첨부(5종)
1. 지원금 신청서(서식 13)
2. 출근부(서식 9) ${roster.people.length}명 — 수정본
3. 급여명세서
4. 4대 사회보험 사업장 가입자 명부
5. 급여이체확인증

감사합니다.
${roster.contact.name} 드림 (${roster.contact.phone})
`
  const b64 = (x) => Buffer.from(x, 'utf8').toString('base64')
  const bd = `b${Date.now().toString(36)}`
  const raw = [`From: ${from}`, 'To: gnk@gngucci.or.kr', `Subject: =?UTF-8?B?${b64(subject)}?=`,
    `In-Reply-To: ${h['message-id']}`, `References: ${[h.references, h['message-id']].filter(Boolean).join(' ')}`, 'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${bd}"`, '', `--${bd}`, 'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64', '', b64(text), '',
    ...files.flatMap(f => { const n = `=?UTF-8?B?${b64(path.basename(f))}?=`; return [`--${bd}`, `Content-Type: application/pdf; name="${n}"`,
      'Content-Transfer-Encoding: base64', `Content-Disposition: attachment; filename="${n}"`, '', fs.readFileSync(f).toString('base64'), ''] }),
    `--${bd}--`, ''].join('\r\n')
  const res = await gmail.users.drafts.create({ userId: 'me', requestBody: { message: { raw: Buffer.from(raw).toString('base64url'), threadId: src.threadId } } })
  console.log(`초안 ${res.data.id} — 상공회 보완요청 스레드에 답장(${subject})\n첨부:\n${files.map(f => '  ' + path.basename(f) + ` (${pages(f)}쪽)`).join('\n')}\n발송은 대표가 Gmail 에서 확인 후`)
}

if (cmd === 'status') await status()
if (cmd === 'correction') await correction()
if (cmd === 'collect') { await collect(); await status() }
if (cmd === 'submit') await submit()
fs.rmSync(work, { recursive: true, force: true })
