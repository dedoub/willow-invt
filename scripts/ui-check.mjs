#!/usr/bin/env node
/**
 * 대시보드 카드 UI 검사 — 점검표를 기억에 맡기지 않고 매번 돌린다.
 *
 *   node scripts/ui-check.mjs /invest                 # 결정적 검사 + Codex 화면 심사
 *   node scripts/ui-check.mjs /invest --no-judge      # 결정적 검사만
 *   node scripts/ui-check.mjs /invest --ref /mgmt     # 심사 때 나란히 볼 기준 화면(기본 /mgmt)
 *   node scripts/ui-check.mjs /invest --base https://dash.willowinvt.com
 *
 * 1) 결정적 검사: 페이지를 렌더해 카드마다 점검표 중 기계로 잴 수 있는 항목을 잰다
 *    (docs/design-system/dashboard-system.md "카드 점검표"). 규칙은 아래 RULES 에 쌓는다.
 * 2) 화면 심사: 대상·기준 화면 스크린샷을 Codex 에 넘겨 docs/design-system/ui-judge-rubric.md 로
 *    채점한다. 숫자로 잡기 어려운 것(좁아 보임, 카드 나눔, 위계)을 맡는다.
 * 둘 다 통과하면 .ui-check/last-pass.json 을 남긴다. 커밋 훅(scripts/hooks/ui-check-gate.mjs)이 이걸 본다.
 *
 * CEO 지적이 새로 나오면: 점검표에 항목을 더하고, 기계로 잴 수 있으면 RULES 에도 더한다.
 */
import { chromium } from 'playwright'
import { SignJWT } from 'jose'
import { createClient } from '@supabase/supabase-js'
import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const OUT_ROOT = path.join(ROOT, '.ui-check')
const RUBRIC = path.join(ROOT, 'docs/design-system/ui-judge-rubric.md')
const DEV_PORT = 3123

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const opt = (name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def }
const paths = argv.filter((a, i) => a.startsWith('/') && !['--ref', '--base'].includes(argv[i - 1]))
if (paths.length === 0) {
  console.error('사용법: node scripts/ui-check.mjs /invest [/mgmt ...] [--no-judge] [--ref /mgmt] [--base URL]')
  process.exit(2)
}
const refPath = opt('--ref', '/mgmt')
const judge = !flag('--no-judge')

/* ── 규칙: 카드 하나(DOM)를 보고 위반을 돌려준다. 브라우저 안에서 돈다. ── */
// 각 항목의 id 는 점검표 번호와 맞춘다. 새 지적 → 여기 한 줄.
const RULES_SOURCE = String.raw`
(() => {
  const ROW_LIMIT = 15        // 이 행 수를 넘는 표는 페이지 이동이 있어야 한다(요약 표 10여 행은 예외)
  const MIN_TITLE_GAP = 16    // 제목 아래 → 첫 내용(글자·입력칸)까지 최소 px
  const out = []
  const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
  for (const card of document.querySelectorAll('[data-lcard]')) {
    if (!visible(card)) continue
    const head = card.querySelector('[data-section-head]')
    if (!head) continue
    const title = (head.innerText || '').split('\n')[0].trim()
    const add = (rule, detail) => out.push({ card: title, rule, detail })

    // 1. 제목: 붙여 쓴 4~5글자
    if (/\s/.test(title)) add('1-title-joined', '제목에 띄어쓰기: "' + title + '"')
    if ([...title].length > 5) add('1-title-length', '제목 ' + [...title].length + '글자(5 이하): "' + title + '"')

    // 2. 필터·세그먼트는 제목 줄 안. 차트 판(data-panel) 안의 판 전용 토글은 예외.
    for (const f of card.querySelectorAll('[data-filter-chips], [data-segment-group]')) {
      if (!visible(f) || head.contains(f) || f.closest('[data-panel]')) continue
      add('2-filter-in-head', '제목 줄 밖 필터: ' + (f.innerText || '').replace(/\s+/g, ' ').slice(0, 30))
    }

    // 5. 긴 표에는 페이지 이동
    const rows = [...card.querySelectorAll('[data-table-row]')].filter(visible).length
    if (rows > ROW_LIMIT && !card.querySelector('[data-page-size]')) add('5-pagination', '표 ' + rows + '행인데 페이지 이동 없음')

    // 6. 탭으로 가리지 않기 — 판 안에 전환 칩이 둘 이상이면 탭이다
    for (const panel of card.querySelectorAll('[data-panel]')) {
      const chips = panel.querySelectorAll('[data-filter-chip]').length
      if (chips >= 2) add('6-no-tabs', '탭 전환 ' + chips + '개: ' + (panel.querySelector('[data-panel-title]')?.innerText || '').trim())
    }

    // 7. 한 글자 배지 금지
    const letters = new Set()
    for (const b of card.querySelectorAll('[data-badge], [data-table-badge]')) {
      const txt = (b.innerText || '').trim()
      if (/^[A-Z]$/.test(txt) && visible(b)) letters.add(txt)
    }
    if (letters.size) add('7-word-badges', '한 글자 배지: ' + [...letters].join(', '))

    // 8. 제목 아래 간격
    const hb = head.getBoundingClientRect().bottom
    let first = null
    for (const el of card.querySelectorAll('*')) {
      if (head.contains(el) || !visible(el)) continue
      const isLeafText = el.children.length === 0 && (el.innerText || '').trim()
      if (!isLeafText && el.tagName !== 'INPUT') continue
      const top = el.getBoundingClientRect().top
      if (top >= hb - 0.5 && (first === null || top < first)) first = top
    }
    if (first !== null && first - hb < MIN_TITLE_GAP) add('8-title-gap', '제목 아래 ' + Math.round(first - hb) + 'px (' + MIN_TITLE_GAP + ' 이상)')
  }
  return out
})()
`

/* ── 준비: 인증 쿠키, 개발 서버 ── */
function readEnv() {
  const txt = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
  return Object.fromEntries(txt.split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#')).map(l => {
    const i = l.indexOf('=')
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
  }))
}

async function authToken(env) {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY)
  const { data: u, error } = await sb.from('willow_users').select('id,email,name,role').eq('email', 'dw.kim@willowinvt.com').single()
  if (error) throw error
  return new SignJWT({ userId: u.id, email: u.email, name: u.name, role: u.role })
    .setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h').sign(new TextEncoder().encode(env.JWT_SECRET))
}

async function isUp(url) {
  try { await fetch(url, { redirect: 'manual' }); return true } catch { return false }
}

// .next 가 외장 exFAT 에서 커지면 turbopack 캐시가 깨진다 — webpack 으로 띄운다(메모리 reference_next_build_cache_exfat).
async function ensureDevServer() {
  const base = `http://localhost:${DEV_PORT}`
  if (await isUp(base)) return { base, stop: () => {} }
  console.log(`개발 서버를 띄웁니다 (:${DEV_PORT})…`)
  const child = spawn('npx', ['next', 'dev', '--webpack', '-p', String(DEV_PORT)], { cwd: ROOT, detached: true, stdio: 'ignore' })
  for (let i = 0; i < 90; i++) {
    if (await isUp(base)) return { base, stop: () => { try { process.kill(-child.pid) } catch {} } }
    await new Promise(r => setTimeout(r, 2000))
  }
  try { process.kill(-child.pid) } catch {}
  throw new Error('개발 서버가 3분 안에 뜨지 않았다')
}

async function capture(page, base, p, file) {
  await page.goto(base + p, { waitUntil: 'networkidle', timeout: 240000 })
  await page.waitForSelector('[data-section-head]', { timeout: 180000 })
  await page.waitForTimeout(5000) // 카드들이 두 번째 로드 단계까지 올라오게
  await page.screenshot({ path: file, fullPage: true })
}

/* ── 화면 심사 (Codex) ── */
function runJudge(targetPng, refPng, pagePath, violations, outDir) {
  const rubric = fs.readFileSync(RUBRIC, 'utf8')
  const schemaFile = path.join(outDir, 'judge-schema.json')
  fs.writeFileSync(schemaFile, JSON.stringify({
    type: 'object', additionalProperties: false, required: ['score', 'defects', 'summary'],
    properties: {
      score: { type: 'integer' },
      summary: { type: 'string' },
      defects: { type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['card', 'rule', 'severity', 'detail'],
        properties: {
          card: { type: 'string' }, rule: { type: 'string' },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] }, detail: { type: 'string' },
        },
      } },
    },
  }))
  const lastMsg = path.join(outDir, 'judge.json')
  const prompt = `${rubric}

---
첫 번째 이미지: 검사 대상 화면 ${pagePath}
두 번째 이미지: 기준 화면 ${refPath} (윌로우 사업관리)
결정적 검사가 이미 찾은 위반(중복 보고하지 말 것): ${JSON.stringify(violations)}
위 기준으로 채점하고 JSON 으로만 답하라.`
  try {
    execFileSync('codex', ['exec', '--skip-git-repo-check', '-s', 'read-only',
      '-i', targetPng, '-i', refPng, '--output-schema', schemaFile, '-o', lastMsg, prompt],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'], timeout: 15 * 60 * 1000 })
  } catch (e) {
    // codex 는 경고도 stderr 로 쏟는다 — 끝부분만 보여 준다. 모델 교체가 필요하면 메모리 feedback_codex_model_fix.
    const tail = String(e.stderr || e.message).split('\n').filter(l => /error|Error|fail/i.test(l)).slice(-6).join('\n')
    throw new Error(`Codex 화면 심사 실패:\n${tail}`)
  }
  return JSON.parse(fs.readFileSync(lastMsg, 'utf8'))
}

/* ── main ── */
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outDir = path.join(OUT_ROOT, stamp)
fs.mkdirSync(outDir, { recursive: true })

const env = readEnv()
const server = opt('--base') ? { base: opt('--base'), stop: () => {} } : await ensureDevServer()
const browser = await chromium.launch()
let failed = false
const report = { at: new Date().toISOString(), base: server.base, pages: [] }
try {
  // 대시보드는 안쪽 컨테이너가 스크롤해서 fullPage 로도 한 화면만 찍힌다 — 창을 길게 연다.
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 3400 } })
  await ctx.addCookies([{ name: 'auth_token', value: await authToken(env), url: server.base }])
  const page = await ctx.newPage()

  const refPng = path.join(outDir, 'ref.png')
  if (judge) await capture(page, server.base, refPath, refPng)

  for (const p of paths) {
    const png = path.join(outDir, p.replace(/\W+/g, '_') + '.png')
    await capture(page, server.base, p, png)
    const violations = await page.evaluate(RULES_SOURCE)
    const entry = { path: p, screenshot: png, violations, judge: null }
    console.log(`\n== ${p}`)
    if (violations.length === 0) console.log('  결정적 검사: 통과')
    for (const v of violations) console.log(`  ✗ [${v.rule}] ${v.card}: ${v.detail}`)
    if (violations.length) failed = true

    if (judge) {
      console.log('  화면 심사(Codex) 중…')
      const j = runJudge(png, refPng, p, violations, outDir)
      entry.judge = j
      const blocking = j.defects.filter(d => d.severity !== 'minor')
      console.log(`  화면 심사: ${j.score}점 — ${j.summary}`)
      for (const d of j.defects) console.log(`  ${d.severity === 'minor' ? '·' : '✗'} [${d.severity}] ${d.card}: ${d.detail}`)
      if (j.score < 85 || blocking.length) failed = true
    }
    report.pages.push(entry)
  }
} finally {
  await browser.close()
  server.stop()
}

fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2))
console.log(`\n보고서·스크린샷: ${path.relative(ROOT, outDir)}`)
if (failed) {
  console.log('결과: 실패 — 고친 뒤 다시 돌린다.')
  process.exit(1)
}
if (judge) {
  fs.writeFileSync(path.join(OUT_ROOT, 'last-pass.json'), JSON.stringify({ at: report.at, paths, report: path.relative(ROOT, outDir) }, null, 2))
  console.log('결과: 통과 — .ui-check/last-pass.json 기록')
} else {
  console.log('결과: 결정적 검사 통과 (--no-judge 라 커밋 통과 기록은 남기지 않는다)')
}
