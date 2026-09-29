#!/usr/bin/env node
/**
 * HWP 문서 도구 — 한컴 화면을 조작해 글자를 고치지 않는다. 파일을 직접 고치고, 한컴은 PDF 저장에만 쓴다.
 *
 *   node scripts/hwp/hwp.mjs dump  <파일.hwp>                         # 표 칸 주소(r행c열)와 글자
 *   node scripts/hwp/hwp.mjs fill  <양식.hwp> <출력.hwp> <값.tsv> [옵션]  # 칸 채우기(아래 옵션)
 *   node scripts/hwp/hwp.mjs colors <파일.hwp>                        # 검정이 아닌 글자 찾기(양식 예시 글자 흔적)
 *   node scripts/hwp/hwp.mjs pdf   <파일.hwp> <출력.pdf>               # 한컴 "PDF로 저장하기"
 *
 * fill 옵션(Fill.java 의 -D 값):
 *   --form "서식 13"          이 제목의 서식 한 장만 남긴다(다른 서식은 지운다)
 *   --money r10c12,r12c9      금액 칸 — 오른쪽 정렬. 나머지 입력 칸은 가운데 정렬·줄 간격 100%
 *   --skip r0c0,r18c0         정렬을 건드리지 않을 칸(제목·서명 칸처럼 양식 배치가 있는 곳)
 *   --heading-ps 22           서식 제목 문단 모양 번호(22 = 오른쪽 정렬)
 *   --sign-right-margin 12600 서명 줄 오른쪽 여백을 늘려 인감 자리를 만든다(HWP 단위, 12600 ≈ 63pt 이동)
 *   --no-align                정렬·줄 간격을 손대지 않는다(출근부처럼 빈칸으로 자리를 맞춘 양식)
 * 값.tsv: 한 줄에 `r행c열p문단<TAB>값`. 칸에 문단이 모자라면 복제해 늘린다.
 *
 * 왜 이렇게 하나(2026-09-30): 맥용 한컴은 AppleScript 로 문서를 조작할 수 없다. 화면 조작으로 고치려던 에이전트는
 * 빈 양식을 "정본"으로 복사하거나 PDF 위에 글자를 덮어써 엉터리 서류를 만들었다. hwplib 로 파일을 고치면 서식·표가
 * 그대로 남는다. 한컴은 메뉴 "PDF로 저장하기"만 누른다 — 메뉴 이름으로 누르므로 좌표에 기대지 않는다.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CACHE = path.join(os.homedir(), '.cache', 'hwplib')
const JAR = path.join(CACHE, 'hwplib-1.1.9.jar')
const JAR_URL = 'https://repo1.maven.org/maven2/kr/dogfoot/hwplib/1.1.9/hwplib-1.1.9.jar'
const SOURCES = ['Fill.java', 'Dump.java', 'Colors.java']
const EXPORT_DIR = path.join(os.homedir(), 'hwp-export')

const sleep = ms => new Promise(r => setTimeout(r, ms))

/** hwplib 를 받아 두고 소스가 바뀌었으면 다시 컴파일한다. 클래스 폴더 경로를 돌려준다. */
export function ensureTools() {
  fs.mkdirSync(CACHE, { recursive: true })
  if (!fs.existsSync(JAR)) execFileSync('curl', ['-sfL', '-m', '60', '-o', JAR, JAR_URL])
  const hash = crypto.createHash('sha1')
  for (const s of SOURCES) hash.update(fs.readFileSync(path.join(HERE, s)))
  const classes = path.join(CACHE, `classes-${hash.digest('hex').slice(0, 10)}`)
  if (!fs.existsSync(path.join(classes, 'Fill.class'))) {
    fs.mkdirSync(classes, { recursive: true })
    execFileSync('javac', ['-encoding', 'UTF-8', '-cp', JAR, '-d', classes, ...SOURCES.map(s => path.join(HERE, s))], { stdio: 'inherit' })
  }
  return classes
}

function java(main, args, props = {}) {
  const classes = ensureTools()
  const d = Object.entries(props).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `-D${k}=${v}`)
  const r = spawnSync('java', [...d, '-cp', `${JAR}:${classes}`, main, ...args], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`${main} 실패: ${r.stderr || r.stdout}`)
  return r.stdout
}

export const dump = file => java('Dump', [file])
export const colors = file => java('Colors', [file])

export function fill(form, out, values, opt = {}) {
  return java('Fill', [form, out, values], {
    form: opt.form, money: opt.money, skipAlign: opt.skip, psHeading: opt.headingPs, signRightMargin: opt.signRightMargin, noAlign: opt.noAlign ? 'true' : undefined,
  })
}

function osa(lines) {
  return execFileSync('osascript', lines.flatMap(l => ['-e', l]), { encoding: 'utf8' }).trim()
}

/**
 * 한컴에서 열어 "PDF로 저장하기"로 저장한다. 저장 창의 위치는 늘 ~/hwp-export 로 옮긴다(이동 경로는 붙여넣기 —
 * 한글 입력 상태에서 타이핑하면 글자가 깨진다). 파일 이름은 아스키로 바꿔 두고, 끝나면 원하는 곳으로 옮긴다.
 */
export async function toPdf(hwp, outPdf) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true })
  const base = `hwp-${Date.now().toString(36)}`
  const staged = path.join(EXPORT_DIR, `${base}.hwp`)
  const made = path.join(EXPORT_DIR, `${base}.pdf`)
  fs.copyFileSync(hwp, staged)
  execFileSync('open', ['-a', 'Hancom Office HWP', staged])
  for (let i = 0; i < 20; i++) {
    await sleep(1000)
    const title = osa(['tell application "System Events" to tell process "Hancom Office HWP" to get name of front window'])
    if (title.includes(base)) break
    if (i === 19) throw new Error(`한컴 창이 열리지 않았어요(${title})`)
  }
  osa(['tell application "System Events" to tell process "Hancom Office HWP"', 'set frontmost to true',
    'click menu item "PDF로 저장하기..." of menu 1 of menu bar item "파일" of menu bar 1', 'end tell'])
  await sleep(2000)
  // 폴더 이동: Cmd+Shift+G → 경로 붙여넣기 → Return
  execFileSync('bash', ['-c', `printf %s ${JSON.stringify(EXPORT_DIR)} | pbcopy`])
  osa(['tell application "System Events" to keystroke "g" using {command down, shift down}'])
  await sleep(1200)
  osa(['tell application "System Events" to keystroke "v" using {command down}'])
  await sleep(600)
  osa(['tell application "System Events" to key code 36'])
  await sleep(1200)
  osa(['tell application "System Events" to key code 36'])
  for (let i = 0; i < 30 && !fs.existsSync(made); i++) await sleep(1000)
  if (!fs.existsSync(made)) throw new Error(`PDF 가 만들어지지 않았어요: ${made}`)
  await sleep(1000)
  // 열어 둔 문서 창은 닫는다(다음 저장 때 같은 이름의 "되돌림" 창이 뜨지 않게)
  try { osa(['tell application "System Events" to tell process "Hancom Office HWP" to keystroke "w" using {command down}']) } catch {}
  fs.mkdirSync(path.dirname(outPdf), { recursive: true })
  fs.renameSync(made, outPdf)
  fs.rmSync(staged, { force: true })
  const pages = execFileSync('pdfinfo', [outPdf], { encoding: 'utf8' }).match(/Pages:\s+(\d+)/)?.[1]
  return { pdf: outPdf, pages: Number(pages) }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2)
  const flag = n => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : undefined }
  const pos = rest.filter((a, i) => !a.startsWith('--') && !(i > 0 && rest[i - 1].startsWith('--')))
  if (cmd === 'dump') process.stdout.write(dump(pos[0]))
  else if (cmd === 'colors') process.stdout.write(colors(pos[0]))
  else if (cmd === 'fill') process.stdout.write(fill(pos[0], pos[1], pos[2], {
    form: flag('--form'), money: flag('--money'), skip: flag('--skip'), headingPs: flag('--heading-ps'), signRightMargin: flag('--sign-right-margin'), noAlign: rest.includes('--no-align'),
  }))
  else if (cmd === 'pdf') console.log(await toPdf(pos[0], pos[1]))
  else { console.error('usage: hwp.mjs dump|colors|fill|pdf …'); process.exit(1) }
}
