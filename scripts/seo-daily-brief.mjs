#!/usr/bin/env node
/**
 * 일일 색인 브리프 — 오늘 무엇을 요청할지 한 화면에 낸다.
 *
 * 매일 하는 판단은 셋이다. (1) 어제 요청분이 움직였나 (2) 전체 색인율이
 * 나아졌나 (3) 오늘 한도 안에서 무엇을 넣나. 그동안 SQL을 손으로 쳐서
 * 답했는데, 매일 같은 질문이라 스크립트로 굳힌다.
 *
 * 색인 요청 자체는 GSC UI(URL Inspection → Request indexing)로만 되고
 * 자동화 경로가 없다. 이 스크립트는 "무엇을 넣을지"까지만 정한다.
 *
 * 사용법:
 *   node scripts/seo-daily-brief.mjs            # 두 사이트 (기본 11건 배분)
 *   node scripts/seo-daily-brief.mjs --budget 8
 *   node scripts/seo-daily-brief.mjs voicecards
 */

import fs from 'node:fs'

const env = {
  ...Object.fromEntries(
    fs.readFileSync('.env.local', 'utf8').split('\n')
      .filter(l => l.includes('=') && !l.trim().startsWith('#'))
      .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  ),
  ...process.env,
}

const argv = process.argv.slice(2)
const flagIdx = argv.indexOf('--budget')
// 계정 합산 한도다. 프로퍼티를 나눠도 늘지 않는다(2026-08-03 실측: 11건째까지 성공).
const BUDGET = flagIdx >= 0 ? Number(argv[flagIdx + 1]) : 11
const only = argv.find(a => !a.startsWith('--') && a !== String(BUDGET))
const SITES = only ? [only] : ['voicecards', 'reviewnotes']

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = env.SUPABASE_SECRET_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY 가 없습니다')
  process.exit(2)
}

const rest = (params) =>
  fetch(`${SUPABASE_URL}/rest/v1/seo_index_status?${params}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  }).then(r => r.json())

/** 최근 스냅샷 두 개의 날짜. 하나뿐이면 비교는 건너뛴다. */
async function recentDays(site) {
  const rows = await rest(`site_key=eq.${site}&select=checked_on&order=checked_on.desc&limit=400`)
  return [...new Set(rows.map(r => r.checked_on))].slice(0, 2)
}

async function snapshot(site, day) {
  const rows = await rest(
    `site_key=eq.${site}&checked_on=eq.${day}&select=path,coverage_state,is_indexed&limit=5000`,
  )
  return new Map(rows.map(r => [r.path, r]))
}

/** Discovered 정체가 언제부터인지 — 오래 묵은 것부터 넣기 위해. */
async function stuckSince(site) {
  const rows = await rest(
    `site_key=eq.${site}&coverage_state=like.Discovered*&select=path,checked_on&order=checked_on.asc&limit=20000`,
  )
  const first = new Map()
  for (const r of rows) if (!first.has(r.path)) first.set(r.path, r.checked_on)
  return first
}

const depth = p => p.split('/').filter(Boolean).length

/**
 * 허브가 색인되면 그 하위 개별 페이지는 요청하지 않는다 — 허브 크롤로 따라온다.
 * 시민권 클러스터에서 확인된 패턴이고(허브 색인 → 하위 자연 유입, 2026-07-30),
 * 한도를 하위 페이지에 태우면 정작 크롤 경로가 없는 URL이 뒤로 밀린다.
 * 허브가 아직 색인 전이면 하위도 후보로 남긴다 — 기댈 크롤 경로가 없어서다.
 */
const COVERED_BY_HUB = {
  voicecards: [
    [/^\/templates\/memorize-surah-/, '/templates/quran'],
    [/^\/templates\/memorize-/, '/templates/bible'],
    [/^\/templates\/(civics|naturalization-)/, '/templates/civics'],
    [/^\/templates\/cdl-/, '/templates/cdl'],
    [/^\/templates\/einbuergerungstest-/, '/templates/einbuergerungstest'],
    [/^\/templates\/deutsch-a1-/, '/templates/deutsch-a1'],
  ],
  reviewnotes: [],
}

/** [남길 후보, 허브가 덮어서 제외한 건수] */
function dropHubCovered(site, rows, cur) {
  const rules = COVERED_BY_HUB[site] ?? []
  const covered = new Map()
  const kept = rows.filter(r => {
    const hit = rules.find(([re]) => re.test(r.path))
    if (!hit) return true
    const hub = hit[1]
    if (hub === r.path) return true            // 허브 자신은 후보다
    if (!cur.get(hub)?.is_indexed) return true // 허브가 아직이면 하위도 후보
    covered.set(hub, (covered.get(hub) ?? 0) + 1)
    return false
  })
  return [kept, covered]
}

/**
 * 우선순위: ① 얕은 경로(허브 — 하위의 크롤 경로가 된다) ② unknown(구글이 아예 모름)
 * ③ Discovered 오래 묵은 순. 'Crawled - not indexed'는 요청해도 안 풀리므로 뺀다.
 */
function rank(pending, stuck) {
  const bucket = r =>
    /unknown/i.test(r.coverage_state) ? 1 : /Discovered/i.test(r.coverage_state) ? 2 : 9
  return pending
    .filter(r => bucket(r) < 9)
    .sort((a, b) =>
      depth(a.path) - depth(b.path) ||
      bucket(a) - bucket(b) ||
      String(stuck.get(a.path) ?? '9999').localeCompare(String(stuck.get(b.path) ?? '9999')) ||
      a.path.localeCompare(b.path))
}

const plans = []

for (const site of SITES) {
  const [today, prev] = await recentDays(site)
  if (!today) { console.log(`\n${site}: 스냅샷 없음`); continue }
  const cur = await snapshot(site, today)
  const before = prev ? await snapshot(site, prev) : new Map()
  const stuck = await stuckSince(site)

  const count = (m, re) => [...m.values()].filter(r => re.test(r.coverage_state)).length
  const idx = m => [...m.values()].filter(r => r.is_indexed).length
  const delta = prev ? idx(cur) - idx(before) : null

  console.log(`\n━━ ${site}  ${today}${prev ? `  (전일 ${prev} 대비)` : ''}`)
  console.log(`   색인 ${idx(cur)} / 추적 ${cur.size}` +
    (delta === null ? '' : `   ${delta >= 0 ? '+' : ''}${delta}`))
  console.log(`   unknown ${count(cur, /unknown/i)} · discovered ${count(cur, /Discovered/i)} · crawled-not-indexed ${count(cur, /Crawled/i)}`)

  // 어제 요청분이 실제로 넘어갔는지 — 배치가 효과 있었다는 유일한 증거다.
  const newlyIndexed = [...cur.values()]
    .filter(r => r.is_indexed && before.size && !before.get(r.path)?.is_indexed)
    .map(r => r.path)
  if (newlyIndexed.length) {
    console.log(`   신규 색인: ${newlyIndexed.slice(0, 12).join(', ')}${newlyIndexed.length > 12 ? ` 외 ${newlyIndexed.length - 12}` : ''}`)
  } else if (prev) {
    console.log('   신규 색인: 없음')
  }

  const [candidates, covered] = dropHubCovered(site, [...cur.values()], cur)
  for (const [hub, n] of covered) {
    console.log(`   ${hub} 색인됨 → 하위 ${n}건은 요청하지 않고 허브 크롤을 기다린다`)
  }
  plans.push({ site, ranked: rank(candidates, stuck), stuck })
}

// 한도는 계정 합산이라 사이트끼리 나눠 써야 한다. 색인율이 낮은 쪽에 더 준다.
console.log(`\n━━ 오늘 배치 (한도 ${BUDGET}건, 계정 합산)`)
if (plans.length === 2) {
  const share = Math.max(1, Math.round(BUDGET / 2))
  plans[0].take = BUDGET - share
  plans[1].take = share
} else if (plans.length === 1) {
  plans[0].take = BUDGET
}
for (const p of plans) {
  console.log(`\n  ${p.site} — ${Math.min(p.take, p.ranked.length)}건`)
  if (!p.ranked.length) { console.log('    대기열 비어 있음'); continue }
  p.ranked.slice(0, p.take).forEach((r, i) => {
    const since = p.stuck.get(r.path)
    console.log(`    ${String(i + 1).padStart(2)}. ${r.path}` +
      `  [${r.coverage_state}${since ? `, ${since}부터` : ''}]`)
  })
}

console.log(`
요청은 GSC UI에서만 된다 — URL Inspection → Request indexing → "Indexing requested" 확인.
프로퍼티: 보이스카드 sc-domain:voicecards.quest · 리뷰노트 https://reviewnotes.app/ (URL-prefix)
Quota Exceeded가 뜨면 그날은 중단하고 실행 시각을 앞당긴다.
끝나면 docs/seo-indexing-plan.md 의 로그·대기열을 갱신한다.`)
