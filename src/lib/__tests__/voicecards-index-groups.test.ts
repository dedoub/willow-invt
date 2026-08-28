import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { classifyIndexGroup } from '../gsc-index'
import { getGscSite } from '../gsc'

const ROOT = process.cwd()

test('Japanese audience decks have a named dashboard index group', () => {
  const paths = [
    '/templates/english-japanese',
    '/templates/daily-english-chunks-ja',
    '/templates/instant-response-english-phrases-ja',
    '/templates/korean-kpop-fan-phrases-ja',
    '/templates/korean-travel-phrases-ja',
    '/ja/templates/korean-travel-phrases-ja',
  ]

  for (const path of paths) {
    assert.deepEqual(classifyIndexGroup('voicecards', path), {
      key: 'japanese-audience',
      label: '일본 사용자 덱',
    })
  }
})

test('Japanese audience child decks use the English-Japanese hub', async () => {
  const source = await readFile(`${ROOT}/scripts/seo-daily-brief.mjs`, 'utf8')

  assert.match(
    source,
    /daily-english-chunks-ja\|instant-response-english-phrases-ja\|korean-kpop-fan-phrases-ja\|korean-travel-phrases-ja/,
  )
  assert.match(source, /'\/templates\/english-japanese'/)
})

test('Portle is registered for the shared SEO indexing workflow', async () => {
  const site = getGscSite('portle')

  assert.equal(site?.name, 'Portle')
  assert.equal(site?.domain, 'portle.quest')
  assert.equal(site?.property, 'sc-domain:portle.quest')
  assert.equal(site?.scanLocales, true)
  assert.equal(site?.defaultLocale, null)

  const routeSource = await readFile(`${ROOT}/src/app/api/cron/seo-index-scan/route.ts`, 'utf8')
  assert.match(routeSource, /SCHEDULED_SITES\s*=\s*\[[\s\S]*'voicecards'[\s\S]*'reviewnotes'[\s\S]*'portle'/)

  const briefSource = await readFile(`${ROOT}/scripts/seo-daily-brief.mjs`, 'utf8')
  assert.match(briefSource, /const SITES = only \? \[only\] : \[[\s\S]*'voicecards'[\s\S]*'reviewnotes'[\s\S]*'portle'/)
  assert.match(briefSource, /portle:\s*null/)
})

test('Scripta is registered for the shared SEO indexing workflow', async () => {
  const site = getGscSite('scripta')

  assert.equal(site?.name, 'Scripta')
  assert.equal(site?.domain, 'scripta.quest')
  assert.equal(site?.property, 'sc-domain:scripta.quest')
  assert.equal(site?.scanLocales, true)
  assert.equal(site?.defaultLocale, 'en')

  const routeSource = await readFile(`${ROOT}/src/app/api/cron/seo-index-scan/route.ts`, 'utf8')
  assert.match(routeSource, /SCHEDULED_SITES\s*=\s*\[[\s\S]*'scripta'/)

  const briefSource = await readFile(`${ROOT}/scripts/seo-daily-brief.mjs`, 'utf8')
  assert.match(briefSource, /const SITES = only \? \[only\] : \[[\s\S]*'scripta'/)
  assert.match(briefSource, /scripta:\s*'en'/)
})

test('manual indexing candidates exclude privacy and terms pages', async () => {
  const source = await readFile(`${ROOT}/scripts/seo-daily-brief.mjs`, 'utf8')

  assert.match(source, /new Set\(\['\/privacy', '\/terms'\]\)/)
  assert.match(source, /bucket\(r\) < 9 && isManualRequestCandidate\(r\)/)
})

test('daily SEO indexing dispatch requires the structured completion report', async () => {
  const dispatchSource = await readFile(`${ROOT}/scripts/seo-index-dispatch.ts`, 'utf8')
  const briefSource = await readFile(`${ROOT}/scripts/seo-daily-brief.mjs`, 'utf8')
  const planSource = await readFile(`${ROOT}/docs/seo-indexing-plan.md`, 'utf8')

  for (const source of [dispatchSource, briefSource, planSource]) {
    assert.match(source, /전체 결과[\s\S]*서비스별 요청 URL[\s\S]*이전 요청 추적[\s\S]*이상 여부/)
    assert.match(source, /VoiceCards n건, ReviewNotes n건, Portle n건, Scripta n건/)
    assert.match(source, /Quota Exceeded, 막힌 URL <url>/)
  }

  assert.match(dispatchSource, /실제 수치와 실제 URL/)
  assert.match(planSource, /실제 성공\/실패 수치와[\s\S]*실제 요청·추적 URL/)
  assert.match(dispatchSource, /VoiceCards 3건, ReviewNotes 3건, Portle 3건, Scripta 2건/)
  assert.match(dispatchSource, /25 \* 60 \* 60 \* 1000/)
})

test('Portle index groups separate guides and legal pages', () => {
  assert.deepEqual(classifyIndexGroup('portle', '/guides/google-sheets-investment-ledger'), {
    key: 'guides',
    label: '가이드',
  })
  assert.deepEqual(classifyIndexGroup('portle', '/ko/guides/tax-country-portfolio-tracking'), {
    key: 'guides',
    label: '가이드',
  })
  assert.deepEqual(classifyIndexGroup('portle', '/privacy'), {
    key: 'legal',
    label: '약관·정책',
  })
})

test('Scripta index groups separate pricing and legal pages', () => {
  assert.deepEqual(classifyIndexGroup('scripta', '/en/pricing'), {
    key: 'pricing',
    label: '요금',
  })
  assert.deepEqual(classifyIndexGroup('scripta', '/ko/privacy'), {
    key: 'legal',
    label: '약관·정책',
  })
})
