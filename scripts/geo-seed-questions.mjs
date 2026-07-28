#!/usr/bin/env node
/**
 * scripts/geo-questions.json → geo_questions 레지스트리 적재 (1회성 시드 + 이후 동기화).
 *
 * 레지스트리가 단일 진실원이 된 뒤에도 이 스크립트는 남겨둔다.
 * 질문을 파일로 대량 추가한 뒤 한 번에 밀어 넣는 경로가 필요하기 때문이다.
 * 기존 행은 문구·질문군만 갱신하고 priority·active·note는 건드리지 않는다(사람이 정한 값이라).
 */

import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const SETS = JSON.parse(fs.readFileSync('scripts/geo-questions.json', 'utf8'))

/** id 접두사에서 질문군을 뽑는다: vc-quran-01 → quran */
const groupOf = id => id.split('-')[1] ?? 'etc'
/** 로케일은 id에 언어 코드가 박힌 경우만 표시하고 나머지는 영어로 본다 */
const localeOf = id => {
  const g = groupOf(id)
  return ['ko', 'ja', 'es', 'vi', 'pt'].includes(g) ? g : 'en'
}

const rows = []
for (const [site, set] of Object.entries(SETS)) {
  if (site.startsWith('_')) continue
  for (const { id, q } of set.questions) {
    rows.push({
      site,
      question_id: id,
      question: q,
      question_group: groupOf(id),
      locale: localeOf(id),
    })
  }
}

const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/geo_questions?on_conflict=site,question_id`, {
  method: 'POST',
  headers: {
    apikey: env.SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
    'Content-Type': 'application/json',
    // priority·active·note는 사람이 조정하는 값이라 덮어쓰지 않는다
    Prefer: 'resolution=merge-duplicates,return=minimal',
  },
  body: JSON.stringify(rows),
})
console.log(res.ok ? `레지스트리 동기화 ${rows.length}건` : `실패 ${res.status} ${(await res.text()).slice(0, 200)}`)
