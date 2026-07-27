#!/usr/bin/env node
/**
 * 템플릿형 페이지 중복도 점검.
 *
 * 크롤 후 미색인(Crawled - currently not indexed)의 대표 원인은 "틀은 같고 알맹이만
 * 조금 다른 페이지"다. 색인이 안 풀릴 때 원인을 콘텐츠로 돌리기 전에, 실제로 중복인지
 * 숫자로 확인하려고 만들었다. 사이트맵에서 대상 경로를 뽑아 본문 5-gram 자카드 유사도와
 * 페이지 고유 비중을 낸다.
 *
 * 사용법:
 *   node scripts/seo-template-similarity.mjs voicecards.quest /templates/
 *   node scripts/seo-template-similarity.mjs reviewnotes.app /en/practice/
 *
 * 판정 기준(경험칙):
 *   형제 페이지 유사도 80%↑ 가 흔하면 근접 중복. 색인 거부 위험 높음
 *   50~60%대에 고유 비중 30%↑ 면 정상적인 카탈로그형 페이지
 *   300단어 미만이 많으면 유사도와 무관하게 빈약 판정 위험
 */

const domain = process.argv[2] || 'voicecards.quest'
const prefix = process.argv[3] || '/templates/'
const SAMPLE = Number(process.argv[4] || 12)

const sm = await (await fetch(`https://${domain}/sitemap.xml`)).text()
// 로케일 변형은 같은 콘텐츠라 하나만 본다. prefix가 이미 로케일로 시작하면
// (리뷰노트 /en/practice/) startsWith가 걸러주므로 추가 필터가 필요 없다.
const prefixHasLocale = /^\/[a-z]{2}(-[A-Z]{2})?\//.test(prefix)
const paths = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map(m => new URL(m[1]).pathname)
  .filter(p => p.startsWith(prefix) && (prefixHasLocale || !/^\/[a-z]{2}(-[A-Z]{2})?\//.test(p)))

if (paths.length < 2) {
  console.log(`${domain}${prefix} 경로가 ${paths.length}개뿐이라 비교할 게 없습니다`)
  process.exit(0)
}

const textOf = h => h
  .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim()
const tagOf = (h, re) => (h.match(re) || [])[1] || ''

async function load(p) {
  const html = await (await fetch(`https://${domain}${p}`, { headers: { 'User-Agent': 'willow-dash-check' } })).text()
  const words = textOf(html).toLowerCase().split(/[^a-z0-9가-힣]+/).filter(w => w.length > 1)
  const sh = new Set()
  for (let i = 0; i + 5 <= words.length; i++) sh.add(words.slice(i, i + 5).join(' '))
  return {
    p, sh, words: words.length,
    title: tagOf(html, /<title[^>]*>([^<]*)<\/title>/i),
    desc: tagOf(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i),
  }
}
const jac = (a, b) => { let n = 0; for (const s of a) if (b.has(s)) n++; return n / (a.size + b.size - n) }

// 고르게 표본 추출
const step = Math.max(1, Math.floor(paths.length / SAMPLE))
const picked = paths.filter((_, i) => i % step === 0).slice(0, SAMPLE)
const pages = []
for (const p of picked) pages.push(await load(p))

const sims = []
for (let i = 0; i < pages.length; i++)
  for (let j = i + 1; j < pages.length; j++)
    sims.push({ a: pages[i].p, b: pages[j].p, s: jac(pages[i].sh, pages[j].sh) })
sims.sort((x, y) => y.s - x.s)

// 형제 전부와 겹치지 않는 부분 = 이 페이지만의 몫
const uniq = pages.map(pg => {
  const others = pages.filter(o => o !== pg)
  let only = 0
  for (const s of pg.sh) if (!others.some(o => o.sh.has(s))) only++
  return only / pg.sh.size
})
const mean = a => a.reduce((t, v) => t + v, 0) / a.length
const dupCount = arr => {
  const m = new Map()
  for (const v of arr) m.set(v, (m.get(v) || 0) + 1)
  return [...m.values()].filter(n => n > 1).reduce((t, n) => t + n, 0)
}

console.log(`\n${domain}${prefix}  전체 ${paths.length}쪽 중 ${pages.length}쪽 표본\n`)
console.log(`유사도   평균 ${(mean(sims.map(x => x.s)) * 100).toFixed(1)}%   최대 ${(sims[0].s * 100).toFixed(1)}%`)
console.log(`         80%↑ ${sims.filter(x => x.s >= 0.8).length}쌍 / 전체 ${sims.length}쌍`)
console.log(`고유비중 평균 ${(mean(uniq) * 100).toFixed(1)}%   최저 ${(Math.min(...uniq) * 100).toFixed(1)}%`)
console.log(`분량     평균 ${Math.round(mean(pages.map(p => p.words)))}단어   300단어 미만 ${pages.filter(p => p.words < 300).length}쪽`)
console.log(`메타     중복 title ${dupCount(pages.map(p => p.title))}쪽 · 중복 desc ${dupCount(pages.map(p => p.desc))}쪽 · 빈 desc ${pages.filter(p => !p.desc).length}쪽`)
console.log(`\n가장 비슷한 3쌍:`)
for (const x of sims.slice(0, 3)) console.log(`  ${(x.s * 100).toFixed(1)}%  ${x.a} ↔ ${x.b}`)
