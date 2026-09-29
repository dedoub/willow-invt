#!/usr/bin/env node
/**
 * 강남구 인턴십 지원금 서류를 만든다 — 신청서(서식 13)와 출근부(서식 9).
 *
 *   node scripts/gangnam-subsidy-build.mjs application --month 2026-09
 *        → tmp/tensw-internship-subsidy/2026/2026-09/07-final-submission/1_…신청_202609.{hwp,pdf} (인감 포함)
 *   node scripts/gangnam-subsidy-build.mjs attendance --month 2026-09 [--key-suffix _form9]
 *        → 사람마다 서식 9 출근부(담당 서명만) → 비공개 버킷 tensw-attendance/2026/{source,plain,signed}/…
 *          메일은 gangnam-attendance-send.mjs 가 보낸다.
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
import { fill, toPdf, colors } from './hwp/hwp.mjs'

const args = process.argv.slice(2)
const cmd = args[0]
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
const month = flag('--month')
if (!['application', 'attendance'].includes(cmd) || !/^\d{4}-\d{2}$/.test(month ?? '')) {
  console.error('usage: gangnam-subsidy-build.mjs application|attendance --month YYYY-MM [--key-suffix _form9]')
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
for (const p of roster.people) {
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
  const days = facts.workdays
  const leftRows = Array.from({ length: 10 }, (_, i) => 22 + i)
  const rightRows = [4, 5, 7, 9, 11, 13, 14, 15, 16, 18, ...Array.from({ length: 11 }, (_, i) => 21 + i)]
  const left = days.slice(0, 10), right = days.slice(10)
  const suffix = flag('--key-suffix') ?? ''
  for (const p of roster.people) {
    const v = {
      r0c10p0: `근무기간 : ${Y}.${MM}.01 – ${MM}.${String(facts.lastDay).padStart(2, '0')}  (1개월)`,
      r4c5p0: `( ${M} )월`,
      r8c1p0: `성    명 : ${p.name}`, r8c1p1: '인턴 업체 : ㈜텐소프트웍스', r8c1p2: `- 위 인턴업체에서 ( ${M} )월에`,
      r8c1p3: '(정규직)으로 근무하였습니다.', r8c1p5: '근무지역 :', r8c1p6: '강남구 봉은사로105길54-5, 402호',
      r22c6p0: '', r32c13p1: '인턴(정규직)',                              // 빨간 "자필서명" 안내는 지운다(CEO)
      r32c3p0: `지급일 :${facts.payDate.replaceAll('-', '.')}`, r32c8p0: `지급액 : ${net[p.code]}원`,
    }
    left.forEach((d, i) => { v[`r${leftRows[i]}c0p0`] = i === 0 ? `${M}    ${d}` : `     ${d}` })   // 서식 8 과 같은 날짜 표기
    right.forEach((d, i) => { v[`r${rightRows[i]}c10p0`] = i === 0 ? `${M}    ${d}` : `     ${d}` })
    const tsv = path.join(work, `${p.code}.tsv`); writeValues(tsv, v)
    const hwp = path.join(work, `${p.code}.hwp`)
    console.log(fill(form, hwp, tsv, { form: '서식 9', noAlign: true }).trim())
    const plain = path.join(work, `${p.code}.pdf`)
    const { pages } = await toPdf(hwp, plain)
    if (pages !== 1) throw new Error(`${p.name} 출근부 PDF 가 ${pages}쪽이에요`)
    const signed = path.join(work, `${p.code}_signed.pdf`)
    console.log(execFileSync(PY, [path.join(ROOT, 'scripts/gangnam_attendance_sign.py'), plain, signed,
      String(left.length), String(right.length), `${p.name}|${month}`, sigDir], { cwd: ROOT, encoding: 'utf8' }).trim())
    await upload(`${Y}/source/${month}_form9_${p.code}.hwp`, hwp, 'application/x-hwp')
    await upload(`${Y}/plain/${month}_${p.code}${suffix}.pdf`, plain, 'application/pdf')
    await upload(`${Y}/signed/${month}_${p.code}${suffix}.pdf`, signed, 'application/pdf')
    console.log(`  ${p.name}: 지급액 ${net[p.code]}원 → ${BUCKET}/${Y}/signed/${month}_${p.code}${suffix}.pdf`)
  }
  console.log(`출근부 ${roster.people.length}장. 메일: node scripts/gangnam-attendance-send.mjs --month ${month}${suffix ? ` --key-suffix ${suffix}` : ''}`)
}
fs.rmSync(work, { recursive: true, force: true })
