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

/**
 * PostgREST는 한 응답을 1,000행에서 자른다. `limit=20000`을 붙여도 소용없다 —
 * 상한이 서버 쪽이라 요청 limit이 그보다 크면 그냥 무시된다. 잘려도 에러가 아니라
 * 짧은 배열이 와서, 여기 있던 세 질의가 전부 조용히 부분 데이터로 돌고 있었다:
 * recentDays는 하루 669행짜리 사이트에서 400행을 받아 날짜가 늘 하나뿐이라
 * 전일 대비 비교가 매번 건너뛰어졌고, stuckSince는 2,796행 중 1,000행만 봤다.
 * Range 헤더로 끝까지 넘긴다.
 */
const PAGE = 1000
async function restAll(params) {
  const out = []
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/seo_index_status?${params}`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Range: `${from}-${from + PAGE - 1}`,
      },
    })
    const page = await res.json()
    if (!Array.isArray(page)) throw new Error(`색인 조회 실패: ${JSON.stringify(page).slice(0, 200)}`)
    out.push(...page)
    if (page.length < PAGE) return out
  }
}

/** 최근 스냅샷 두 개의 날짜. 하나뿐이면 비교는 건너뛴다. */
async function recentDays(site) {
  // 날짜만 distinct로 받으면 사이트 규모와 무관하게 한 응답에 들어온다.
  const rows = await rest(`site_key=eq.${site}&select=checked_on&order=checked_on.desc&limit=1`)
  if (rows.length === 0) return []
  const prev = await rest(
    `site_key=eq.${site}&checked_on=lt.${rows[0].checked_on}&select=checked_on&order=checked_on.desc&limit=1`,
  )
  return prev.length > 0 ? [rows[0].checked_on, prev[0].checked_on] : [rows[0].checked_on]
}

async function snapshot(site, day) {
  const rows = await restAll(
    `site_key=eq.${site}&checked_on=eq.${day}&select=path,coverage_state,is_indexed&order=path.asc`,
  )
  return new Map(rows.map(r => [r.path, r]))
}

/** Discovered 정체가 언제부터인지 — 오래 묵은 것부터 넣기 위해. */
async function stuckSince(site) {
  const rows = await restAll(
    `site_key=eq.${site}&coverage_state=like.Discovered*&select=path,checked_on&order=checked_on.asc,path.asc`,
  )
  const first = new Map()
  for (const r of rows) if (!first.has(r.path)) first.set(r.path, r.checked_on)
  return first
}

const depth = p => p.split('/').filter(Boolean).length

// 경로 앞의 로케일 세그먼트. src/lib/umami.ts의 canonicalPath와 같은 규칙이다.
const LOCALES = new Set([
  'ko', 'en', 'ja', 'zh', 'es', 'fr', 'de', 'pt', 'it', 'ru', 'ar', 'hi', 'id', 'vi',
  'th', 'tr', 'pl', 'nl', 'sv', 'da', 'fi', 'no', 'cs', 'uk', 'he', 'ms', 'fa', 'ro',
  'hu', 'el', 'bn', 'ta', 'ur', 'tl', 'sw', 'ca', 'sk', 'bg', 'hr', 'sr', 'lt', 'lv', 'et',
])
/** ['/es', '/templates/bible'] — 로케일 프리픽스와 그걸 뗀 콘텐츠 경로 */
const splitLocale = p => {
  const m = p.match(/^\/([a-z]{2})(?:-[a-zA-Z]{2})?(\/|$)/)
  if (!m || !LOCALES.has(m[1])) return ['', p]
  return [`/${m[1]}`, p.slice(m[0].length - (m[2] === '/' ? 1 : 0)) || '/']
}

/**
 * 기본 로케일의 프리픽스. src/lib/gsc.ts의 GscSiteConfig.defaultLocale과 같은 값을
 * 들고 있어야 한다 — 한쪽만 고치면 브리프와 대시보드가 다른 숫자를 낸다.
 * 리뷰노트는 원본도 `/en/`을 달아서, 프리픽스 유무로 원본을 판정하면 34쪽 전부가
 * 로케일이 되고 원본이 0쪽으로 찍힌다.
 */
const DEFAULT_LOCALE = { voicecards: null, reviewnotes: 'en' }
/** 그 사이트에서 이 경로가 로케일 변형인지 */
const isLocaleOf = (site, p) => {
  const prefix = splitLocale(p)[0]
  if (prefix === '') return false
  const base = DEFAULT_LOCALE[site] ?? null
  return prefix !== (base ? `/${base}` : null)
}

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

/**
 * [남길 후보, 허브가 덮어서 제외한 건수]
 *
 * 규칙은 로케일을 뗀 경로로 맞춰 보고, 덮는 허브는 **같은 로케일의 허브**로 찾는다.
 * 규칙이 `/templates/memorize-` 모양이라 `/es/templates/memorize-surah-1`은 하나도
 * 안 걸렸고, 로케일 하위 페이지가 허브에 덮이고도 대기열에 그대로 남았다(2026-08-05).
 * 영어 허브가 색인됐다고 스페인어 하위가 따라오지는 않으므로 로케일별로 따로 본다.
 */
function dropHubCovered(site, rows, cur) {
  const rules = COVERED_BY_HUB[site] ?? []
  const covered = new Map()
  const kept = rows.filter(r => {
    const [prefix, content] = splitLocale(r.path)
    const hit = rules.find(([re]) => re.test(content))
    if (!hit) return true
    const hub = `${prefix}${hit[1]}`
    if (hub === r.path) return true            // 허브 자신은 후보다
    if (!cur.get(hub)?.is_indexed) return true // 허브가 아직이면 하위도 후보
    covered.set(hub, (covered.get(hub) ?? 0) + 1)
    return false
  })
  return [kept, covered]
}

/**
 * 우선순위: ① 영어 원본 ② 허브(하위의 크롤 경로가 된다) ③ 얕은 경로
 * ④ unknown(구글이 아예 모름) ⑤ Discovered 오래 묵은 순.
 * 'Crawled - not indexed'는 요청해도 안 풀리므로 뺀다.
 *
 * 원본이 로케일보다 먼저인 게 depth·상태보다 앞선다. 로케일 트리가 추적에 들어온
 * 2026-08-05에 이 순서가 없어서 배치 11건이 전부 로케일로 찼다 — 루트만 내려 봐도
 * `/de/faq` 같은 depth 1 로케일 코어가 그 자리를 물려받았다. 로케일을 통째로 뒤에
 * 두는 근거는 둘이다. 원본이 색인 안 된 채로 번역본을 밀면 구글이 정본을 못 잡고,
 * 원본 허브가 잡히면 hreflang으로 번역본에 길이 생긴다 — 허브 색인 → 하위 자연
 * 크롤은 bible·quran·civics·cdl에서 네 번 재현된 패턴이다. 원본 229쪽 중 185쪽이
 * 미색인이라 로케일 436쪽은 아직 한도를 태울 자리가 아니다.
 *
 * depth는 로케일을 뗀 경로로 잰다. 원본에는 영향이 없고, 로케일 차례가 왔을 때
 * `/de/templates/x`가 프리픽스 한 칸 때문에 하위 페이지 취급받는 것만 막는다.
 */
function rank(site, pending, stuck) {
  const bucket = r =>
    /unknown/i.test(r.coverage_state) ? 1 : /Discovered/i.test(r.coverage_state) ? 2 : 9
  const contentOf = r => splitLocale(r.path)[1]
  const localeRank = r => (isLocaleOf(site, r.path) ? 1 : 0)
  // 허브가 아직 색인 전이면 하위도 후보로 남지만(dropHubCovered) 허브보다는 뒤다.
  // 허브와 하위는 depth가 같아서(둘 다 /templates/x 꼴) depth로는 안 갈리고, 알파벳순에
  // 하위 덱이 끼어 다른 허브를 배치 밖으로 밀어냈다 — deutsch-a1 하위 3건이
  // einbuergerungstest 허브 자리를 먹은 게 그 예다(2026-08-05). 허브를 다 넣고 나서
  // 하위를 넣어야 허브 크롤로 따라올 기회부터 준다.
  const rules = COVERED_BY_HUB[site] ?? []
  const hubRank = r => {
    const [prefix, content] = splitLocale(r.path)
    const hit = rules.find(([re]) => re.test(content))
    return hit && `${prefix}${hit[1]}` !== r.path ? 1 : 0
  }
  return pending
    .filter(r => bucket(r) < 9)
    .sort((a, b) =>
      localeRank(a) - localeRank(b) ||
      hubRank(a) - hubRank(b) ||
      depth(contentOf(a)) - depth(contentOf(b)) ||
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
  const isLocale = r => isLocaleOf(site, r.path)
  const idx = m => [...m.values()].filter(r => r.is_indexed).length
  // 증감은 원본 계열로만 잰다. 전체로 재면 로케일 전수 스캔을 켠 날 관측 범위가 늘어난
  // 것뿐인데 +41쪽으로 찍힌다(2026-08-05, 실제 신규는 5쪽). 대시보드도 같은 기준이다.
  const baseIdx = m => [...m.values()].filter(r => r.is_indexed && !isLocale(r)).length
  const delta = prev ? baseIdx(cur) - baseIdx(before) : null
  const locTotal = [...cur.values()].filter(isLocale).length

  console.log(`\n━━ ${site}  ${today}${prev ? `  (전일 ${prev} 대비)` : ''}`)
  console.log(`   원본 색인 ${baseIdx(cur)} / 추적 ${cur.size - locTotal}` +
    (delta === null ? '' : `   ${delta >= 0 ? '+' : ''}${delta}`))
  if (locTotal) {
    console.log(`   로케일 색인 ${idx(cur) - baseIdx(cur)} / 추적 ${locTotal}`)
  }
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
  plans.push({ site, ranked: rank(site, candidates, stuck), stuck })
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
