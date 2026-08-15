import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { classifyIndexGroup } from '../gsc-index'

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
