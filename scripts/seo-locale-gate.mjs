#!/usr/bin/env node
/**
 * 로케일 게이트 — "지금 이 콘텐츠에 로케일 변형을 붙여도 되나"를 판정한다.
 *
 * 권위가 낮은 도메인에서 발견(discovery) 예산은 하루 몇 건이다. 보이스카드는
 * 2026-08-04 기준 GSC 크롤 요청의 7%만 discovery라 하루 약 2.65건이었다.
 * 이 예산 안에서 로케일 변형은 단가를 통째로 곱한다 — civics 덱 하나가 13 URL,
 * 성경 덱 하나가 1 URL이다. 그래서 규칙은 "영어 먼저, 로케일은 후속"이고,
 * 이 스크립트가 그 규칙을 지켰는지 사후에 잰다.
 *
 * 판정: 로케일 변형의 영어 원본이 아직 색인되지 않았다면 그 변형은 조기 발행이다.
 * 원본이 못 받은 발견 예산을 번역본이 나눠 쓰고 있다는 뜻이라서다.
 *
 * 사용법:
 *   node scripts/seo-locale-gate.mjs                     # voicecards
 *   node scripts/seo-locale-gate.mjs reviewnotes reviewnotes.app
 *   node scripts/seo-locale-gate.mjs voicecards voicecards.quest --strict
 *
 * --strict 를 주면 조기 발행이 하나라도 있을 때 종료코드 1. 기본은 리포트만.
 */

import fs from 'node:fs'

// 셸에서 준 값이 파일보다 우선한다 (geo-measure.mjs와 같은 관례).
const env = {
  ...Object.fromEntries(
    fs.readFileSync('.env.local', 'utf8').split('\n')
      .filter(l => l.includes('=') && !l.trim().startsWith('#'))
      .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  ),
  ...process.env,
}

const argv = process.argv.slice(2).filter(a => !a.startsWith('--'))
const STRICT = process.argv.includes('--strict')
const siteKey = argv[0] || 'voicecards'
const domain = argv[1] || (siteKey === 'reviewnotes' ? 'reviewnotes.app' : 'voicecards.quest')

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = env.SUPABASE_SECRET_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY 가 없습니다')
  process.exit(2)
}

const NON_PAGE_EXT = /\.(md|json|txt|xml|svg|png|jpe?g|gif|webp|ico|css|js|pdf|zip|rss|atom)$/i

async function sitemapPaths() {
  const xml = await (await fetch(`https://${domain}/sitemap.xml`)).text()
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map(m => new URL(m[1]).pathname.replace(/\/$/, '') || '/')
    .filter(p => !NON_PAGE_EXT.test(p))
}

/**
 * 로케일 프리픽스를 사이트맵에서 귀납한다. 2글자라고 다 로케일이 아니다 —
 * 보이스카드의 `/vs/anki`가 그 예다. 프리픽스를 떼었을 때 실제로 존재하는
 * 경로가 되는 비율이 높은 세그먼트만 로케일로 본다.
 */
function detectLocales(paths) {
  const set = new Set(paths)
  const byFirst = new Map()
  for (const p of paths) {
    const seg = p.split('/')[1] ?? ''
    if (!/^[a-z]{2}$/.test(seg)) continue
    if (!byFirst.has(seg)) byFirst.set(seg, [])
    byFirst.get(seg).push(p)
  }
  const locales = new Set()
  for (const [seg, group] of byFirst) {
    const hits = group.filter(p => set.has(p.slice(seg.length + 1) || '/')).length
    if (hits / group.length >= 0.5) locales.add(seg)
  }
  return locales
}

async function indexStatus() {
  const q = (params) =>
    fetch(`${SUPABASE_URL}/rest/v1/seo_index_status?${params}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    }).then(r => r.json())

  const latest = await q(`site_key=eq.${siteKey}&select=checked_on&order=checked_on.desc&limit=1`)
  if (!latest.length) return { checkedOn: null, byPath: new Map() }
  const checkedOn = latest[0].checked_on
  const rows = await q(
    `site_key=eq.${siteKey}&checked_on=eq.${checkedOn}&select=path,is_indexed,coverage_state&limit=5000`,
  )
  return { checkedOn, byPath: new Map(rows.map(r => [r.path, r])) }
}

const paths = await sitemapPaths()
const locales = detectLocales(paths)
const { checkedOn, byPath } = await indexStatus()

if (!checkedOn) {
  console.error(`seo_index_status에 ${siteKey} 스냅샷이 없습니다`)
  process.exit(2)
}

// 로케일 변형을 영어 원본별로 묶는다.
const sectionOf = p => '/' + (p.split('/')[1] ?? '')
const buckets = { ok: [], premature: [], untracked: [] }

for (const p of paths) {
  const seg = p.split('/')[1] ?? ''
  if (!locales.has(seg)) continue
  const canonical = p.slice(seg.length + 1) || '/'
  const row = byPath.get(canonical)
  if (!row) buckets.untracked.push({ p, canonical })
  else if (row.is_indexed) buckets.ok.push({ p, canonical })
  else buckets.premature.push({ p, canonical, state: row.coverage_state })
}

const localized = buckets.ok.length + buckets.premature.length + buckets.untracked.length
console.log(`${domain}  스냅샷 ${checkedOn}`)
console.log(`사이트맵 ${paths.length}쪽 · 로케일 ${[...locales].sort().join(' ')} · 로컬라이즈 URL ${localized}쪽\n`)
console.log(`  원본 색인됨 (정상)      ${buckets.ok.length}`)
console.log(`  원본 미색인 (조기 발행) ${buckets.premature.length}`)
console.log(`  원본 미추적 (판정 불가) ${buckets.untracked.length}`)

if (buckets.premature.length) {
  const bySection = new Map()
  for (const it of buckets.premature) {
    const s = sectionOf(it.canonical)
    if (!bySection.has(s)) bySection.set(s, { n: 0, canon: new Set(), state: new Map() })
    const e = bySection.get(s)
    e.n++
    e.canon.add(it.canonical)
    e.state.set(it.state, (e.state.get(it.state) ?? 0) + 1)
  }
  console.log('\n조기 발행 — 영어 원본이 색인되기 전에 로케일이 붙은 곳:')
  for (const [s, e] of [...bySection].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  ${s.padEnd(14)} 로컬라이즈 ${String(e.n).padStart(4)}쪽  원본 ${e.canon.size}개`)
    for (const [st, n] of [...e.state].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${''.padEnd(14)}   └ ${st}: ${n}`)
    }
  }
  console.log('\n권고: 이 원본들이 색인될 때까지 새 로케일 변형을 늘리지 않는다.')
  console.log('     발견 예산을 원본이 먼저 받아야 번역본도 따라 색인된다.')
}

if (buckets.untracked.length) {
  const sample = [...new Set(buckets.untracked.map(x => x.canonical))].slice(0, 5)
  console.log(`\n주의: 원본 ${new Set(buckets.untracked.map(x => x.canonical)).size}개가 추적 범위 밖입니다 (예: ${sample.join(', ')})`)
  console.log('     GscSiteConfig.scanLocales 와 스캔 상한을 확인하세요.')
}

process.exit(STRICT && buckets.premature.length ? 1 : 0)
