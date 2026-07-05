#!/usr/bin/env node
// 워크스테이션 이주 스크립트 — 새 컴퓨터에서 "배선"만 다시 연결한다.
//
// 원칙: 맥락(데이터)은 Supabase 클라우드(ws_threads/events/sessions)에 있으므로 이동이 필요 없다.
//       이 스크립트가 고치는 건 로컬 배관뿐 — 절대경로, SessionStart 훅, launchd, 메모리 폴더명.
//
// 모든 경로가 `<볼륨>/app-dev/willow-invt` 구조이므로, 볼륨 경로 하나만 치환하면
// 훅 · plist(19) · run-*.sh(16) · 전역 CLAUDE.md · ws-context.mjs 기본값이 전부 정합하게 맞춰진다.
//
// 사용:
//   node scripts/migrate-workstation.mjs            # 점검(read-only): 뭐가 바뀌는지 + DB 연결 확인
//   node scripts/migrate-workstation.mjs --apply    # 실제 적용 (경로 치환 → launchd 재등록 → 스모크 테스트)
//
// 옵션:
//   --from <old-project-dir>   옛 프로젝트 루트 (미지정 시 settings.json 훅에서 자동 감지)
//   --yes                      확인 프롬프트 없이 진행 (--apply와 함께)
//   --no-launchd               launchd 재등록 건너뜀 (경로 치환만)

import { readFileSync, writeFileSync, existsSync, readdirSync, cpSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

// ─── 인자 ───
const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const opt = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined }
const APPLY = has('--apply')
const YES = has('--yes')
const DO_LAUNCHD = !has('--no-launchd')

const HOME = homedir()
const REL = '/app-dev/willow-invt'   // 볼륨 이후 고정 레이아웃

// ─── 경로 해석 ───
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const NEW_ROOT = path.resolve(__dirname, '..')        // 이 스크립트가 있는 레포의 루트 = 새 위치

// 옛 루트: 인자 > settings.json 훅에서 감지 > 하드코딩 폴백
const SETTINGS = path.join(HOME, '.claude', 'settings.json')
function detectOldRoot() {
  if (opt('--from')) return opt('--from').replace(/\/$/, '')
  try {
    const raw = readFileSync(SETTINGS, 'utf-8')
    const m = raw.match(/([^\s"']+)\/scripts\/ws-context\.mjs/)
    if (m) return m[1]
  } catch { /* noop */ }
  return '/Volumes/PRO-G40/app-dev/willow-invt'
}
const OLD_ROOT = detectOldRoot()

// 볼륨(레이아웃 접두) 도출 — OLD_ROOT/NEW_ROOT가 REL로 끝나야 볼륨 치환이 성립
const OLD_VOL = OLD_ROOT.endsWith(REL) ? OLD_ROOT.slice(0, -REL.length) : null
const NEW_VOL = NEW_ROOT.endsWith(REL) ? NEW_ROOT.slice(0, -REL.length) : null

const c = { g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' }
const log = (s = '') => console.log(s)
const ok = (s) => log(`  ${c.g}✓${c.x} ${s}`)
const warn = (s) => log(`  ${c.y}⚠${c.x}  ${s}`)
const bad = (s) => log(`  ${c.r}✗${c.x} ${s}`)

log(`\n${c.b}🚚 워크스테이션 이주${c.x}  ${APPLY ? c.r + '[적용 모드]' + c.x : c.d + '[점검 모드 — 변경 없음]' + c.x}`)
log(`${c.d}   옛 위치: ${OLD_ROOT}${c.x}`)
log(`${c.d}   새 위치: ${NEW_ROOT}${c.x}\n`)

if (OLD_ROOT === NEW_ROOT) {
  ok('옛/새 경로가 동일합니다 (같은 외장 드라이브를 그대로 사용). 경로 치환은 불필요.')
  log(`${c.d}   → launchd 재등록과 DB 연결 확인만 하면 됩니다.${c.x}\n`)
}
if (!OLD_VOL || !NEW_VOL) {
  warn(`레이아웃이 '<볼륨>${REL}'와 다릅니다. 볼륨 단위 치환 대신 전체 경로(${OLD_ROOT}→${NEW_ROOT})만 치환합니다.`)
  warn(`run-*.sh의 VOLUME_PATH/PROJECT_DIR 조립식 경로는 수동 검토가 필요할 수 있습니다.\n`)
}

// 치환 규칙: 볼륨이 성립하면 볼륨 치환(모든 하위경로 정합), 아니면 전체경로 치환
const SUBS = (OLD_VOL && NEW_VOL && OLD_VOL !== NEW_VOL)
  ? [[OLD_VOL, NEW_VOL]]
  : (OLD_ROOT !== NEW_ROOT ? [[OLD_ROOT, NEW_ROOT]] : [])

// ─── 1. 프리플라이트: 필수 도구 + .env.local + DB 연결 ───
log(`${c.b}1. 프리플라이트${c.x}`)
let preflightOk = true

for (const [tool, hint] of [['node', ''], ['npx', ''], ['claude', '(봇 AI 응답에 필요)']]) {
  try { execSync(`command -v ${tool}`, { stdio: 'ignore' }); ok(`${tool} 설치됨`) }
  catch { (tool === 'claude' ? warn : (preflightOk = false, bad))(`${tool} 없음 ${hint}`) }
}

const ENV_PATH = path.join(NEW_ROOT, '.env.local')
const env = {}
if (existsSync(ENV_PATH)) {
  ok('.env.local 존재')
  for (const line of readFileSync(ENV_PATH, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    env[m[1]] = v
  }
  for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'TELEGRAM_BOT_TOKEN']) {
    env[k] ? ok(`${k} 있음`) : (k === 'TELEGRAM_BOT_TOKEN' ? warn : (preflightOk = false, bad))(`${k} 없음`)
  }
} else {
  bad(`.env.local 없음 → 옛 컴퓨터에서 복사해야 합니다: ${ENV_PATH}`)
  preflightOk = false
}

// DB 연결 확인 (ws_threads 카운트)
if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SECRET_KEY) {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 5000)
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/ws_threads?select=id&limit=1`, {
      headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`, Prefer: 'count=exact' },
      signal: ctrl.signal,
    })
    clearTimeout(t)
    if (res.ok) ok(`클라우드 맥락 DB 연결됨 (ws_threads · ${res.headers.get('content-range') || '?'})`)
    else { bad(`DB 응답 오류: ${res.status}`); preflightOk = false }
  } catch (e) { bad(`DB 연결 실패: ${e.message}`); preflightOk = false }
}
log()

// ─── 2. 치환 대상 스캔 ───
log(`${c.b}2. 경로 참조 스캔${c.x}`)
const LA_DIR = path.join(HOME, 'Library', 'LaunchAgents')
const targets = []
const pushIf = (file, label) => { if (existsSync(file)) targets.push({ file, label }) }

pushIf(SETTINGS, 'SessionStart 훅')
pushIf(path.join(HOME, '.claude', 'CLAUDE.md'), '전역 CLAUDE.md')
pushIf(path.join(NEW_ROOT, 'scripts', 'ws-context.mjs'), 'ws-context.mjs 기본값')
if (existsSync(LA_DIR)) for (const f of readdirSync(LA_DIR).filter((n) => n.endsWith('.plist'))) pushIf(path.join(LA_DIR, f), `plist: ${f}`)
const scriptsDir = path.join(NEW_ROOT, 'scripts')
if (existsSync(scriptsDir)) for (const f of readdirSync(scriptsDir).filter((n) => n.endsWith('.sh'))) pushIf(path.join(scriptsDir, f), `run: ${f}`)

const needle = OLD_VOL && NEW_VOL ? OLD_VOL : OLD_ROOT
let totalHits = 0, changedFiles = 0
const plan = []
for (const { file, label } of targets) {
  let text
  try { text = readFileSync(file, 'utf-8') } catch { continue }
  const hits = SUBS.length ? (text.split(needle).length - 1) : 0
  if (hits > 0) { totalHits += hits; changedFiles++; plan.push({ file, label, hits, text }) }
}
if (!SUBS.length) ok('치환할 경로 없음 (경로 동일)')
else if (!totalHits) ok('옛 경로 참조가 발견되지 않음 (이미 이주됨?)')
else {
  log(`  ${c.y}${changedFiles}개 파일 · ${totalHits}곳${c.x}에서 ${c.d}${needle}${c.x} → ${c.d}${OLD_VOL ? NEW_VOL : NEW_ROOT}${c.x}`)
  for (const p of plan) log(`    ${c.d}·${c.x} ${p.label} ${c.d}(${p.hits})${c.x}`)
}
log()

// ─── 3. Claude 메모리 폴더 (경로 기반 폴더명) ───
log(`${c.b}3. Claude 자동 메모리 폴더${c.x}`)
const slug = (p) => p.replace(/\//g, '-')
const OLD_MEM = path.join(HOME, '.claude', 'projects', slug(OLD_ROOT), 'memory')
const NEW_MEM = path.join(HOME, '.claude', 'projects', slug(NEW_ROOT), 'memory')
let memPlan = null
if (OLD_ROOT === NEW_ROOT) ok('경로 동일 → 메모리 폴더 그대로')
else if (existsSync(NEW_MEM)) ok(`새 경로 메모리 폴더 이미 존재: ${NEW_MEM}`)
else if (existsSync(OLD_MEM)) { memPlan = [OLD_MEM, NEW_MEM]; warn(`메모리(캐시)를 새 폴더명으로 복사 필요:\n       ${OLD_MEM}\n     → ${NEW_MEM}`) }
else warn(`옛 메모리 폴더 없음. (캐시라 DB에서 복원 가능 — 치명적 아님)`)
log()

// ─── 적용 ───
if (!APPLY) {
  log(`${c.b}다음 단계${c.x}`)
  log(`  ${preflightOk ? c.g + '프리플라이트 통과.' + c.x : c.r + '프리플라이트 실패 — 위 ✗ 항목을 먼저 해결하세요.' + c.x}`)
  log(`  적용하려면: ${c.b}node scripts/migrate-workstation.mjs --apply${c.x}\n`)
  printManual()
  process.exit(preflightOk ? 0 : 1)
}

if (!preflightOk) { bad('\n프리플라이트 실패 상태에서는 --apply를 중단합니다. 위 항목 해결 후 재실행하세요.\n'); process.exit(1) }
if (!YES && (totalHits > 0 || memPlan)) {
  log(`${c.y}위 변경을 적용합니다. 계속하려면 --yes 를 붙여 재실행하세요.${c.x}`)
  log(`  node scripts/migrate-workstation.mjs --apply --yes\n`)
  process.exit(0)
}

log(`${c.b}▶ 적용${c.x}`)
// 3-1. 경로 치환
for (const p of plan) {
  const [[from, to]] = SUBS
  writeFileSync(p.file, p.text.split(from).join(to))
  ok(`치환: ${p.label}`)
}
// 3-2. 메모리 폴더 복사
if (memPlan) { cpSync(memPlan[0], memPlan[1], { recursive: true }); ok(`메모리 복사 → ${memPlan[1]}`) }

// 3-3. launchd 재등록
if (DO_LAUNCHD && existsSync(LA_DIR)) {
  const uid = process.getuid?.() ?? ''
  let n = 0
  for (const f of readdirSync(LA_DIR).filter((x) => x.startsWith('com.willow') || x.startsWith('com.tensw') || x.startsWith('com.ryuha') || x.startsWith('com.voicecards'))) {
    const plist = path.join(LA_DIR, f)
    const label = f.replace(/\.plist$/, '')
    try {
      execSync(`launchctl bootout gui/${uid}/${label}`, { stdio: 'ignore' })
    } catch { /* 안 떠 있으면 무시 */ }
    try {
      execSync(`launchctl bootstrap gui/${uid} ${JSON.stringify(plist)}`, { stdio: 'ignore' })
      n++
    } catch (e) { warn(`launchd 재등록 실패: ${label}`) }
  }
  ok(`launchd 재등록: ${n}개`)
} else if (!DO_LAUNCHD) warn('launchd 재등록 건너뜀 (--no-launchd)')

// 3-4. 스모크 테스트 — 새 경로에서 부팅 맥락 로드
log(`\n${c.b}▶ 스모크 테스트${c.x}`)
try {
  const out = execSync(`node ${JSON.stringify(path.join(NEW_ROOT, 'scripts', 'ws-context.mjs'))} load`, { encoding: 'utf-8', timeout: 8000 })
  if (out.includes('워크스테이션 공유 맥락')) ok('ws-context.mjs load 정상 — 공유 맥락 출력 확인')
  else warn('ws-context.mjs가 출력은 됐으나 맥락 헤더 미확인 (DB 비었거나 크레덴셜 확인)')
} catch (e) { bad(`스모크 테스트 실패: ${e.message}`) }

log(`\n${c.g}${c.b}✅ 배선 이주 완료.${c.x} 새 세션을 시작하면 상단에 "🗂️ 워크스테이션 공유 맥락"이 떠야 합니다.\n`)
printManual()

// ─── 스크립트로 자동화 안 되는(=사람이 직접) 단계 안내 ───
function printManual() {
  log(`${c.b}📋 스크립트가 대신 못 하는 수동 단계${c.x} ${c.d}(이 스크립트 실행 전 완료돼 있어야 함)${c.x}`)
  const items = [
    'node / npx / (선택)claude CLI 설치 — homebrew 등',
    `레포를 새 위치로 복제/복사: ${NEW_ROOT}`,
    `.env.local 을 옛 컴퓨터에서 복사 (git에 없음): ${path.join(NEW_ROOT, '.env.local')}`,
    '~/.claude/CLAUDE.md · ~/.claude/settings.json 을 옛 컴퓨터에서 이동 (없으면 이 스크립트의 훅 치환이 대상 없음)',
    'Gmail/토큰 등 OAuth 재인증이 필요한 통합은 별도 (봇 첫 실행 시 안내됨)',
  ]
  items.forEach((s, i) => log(`  ${c.d}${i + 1}.${c.x} ${s}`))
  log(`\n${c.d}맥락 데이터(스레드·결정·세션)는 클라우드 DB에 있어 이동 대상이 아닙니다.${c.x}\n`)
}
