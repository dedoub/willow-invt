/**
 * 보이스카드 덱에 "문장 카드"를 끼워 넣는다.
 *
 * 덱에는 청크가 한 줄에 하나씩 들어 있다. 조각만 반복하면 조각은 익는데 문장이 안 익어서,
 * 한 문장이 끝날 때마다 그 문장의 청크를 한 장으로 모아 다음 문장이 시작되기 전에 끼운다
 * (CEO 2026-09-14, 기후 스피치 CSV에서 쓴 것과 같은 방식).
 *
 * 문장 경계는 **영어 청크의 끝 문장부호**로 잡는다. 마침표·물음표·느낌표·닫는 따옴표로
 * 끝나면 거기서 한 문장이 끝난 것이다. 시트에는 문장 번호가 없으므로 이것이 유일한 단서다.
 *
 * 모은 카드는 실제 줄바꿈으로 잇는다 — Question 과 Answer 의 줄 수가 1:1로 맞는다.
 * 청크가 하나뿐인 문장은 모으지 않는다. 방금 넘긴 카드와 글자 하나 다르지 않다.
 *
 * 사용법:
 *   npx tsx scripts/voicecards-sentence-cards.ts --dry    # 무엇이 끼워질지만 보여 준다
 *   npx tsx scripts/voicecards-sentence-cards.ts          # 시트에 쓴다
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { google } from 'googleapis'
import { DECKS } from '../src/lib/english'

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets'
const DECK = DECKS['ceo']

const norm = (v: string | undefined) => (v || '').replace(/\s+/g, ' ').trim()
/** 문장이 여기서 끝나는가. 닫는 따옴표가 뒤에 붙어도 끝으로 본다. */
const endsSentence = (en: string) => /[.?!]["'”’)\]]*\s*$/.test(norm(en))
/** 이미 모은 카드인가 — 줄바꿈이 들어 있으면 청크가 아니라 문장 카드다. */
const isCombined = (q: string, a: string) => q.includes('\n') || a.includes('\n')

interface Row { q: string; a: string; rest: string[] }

function group(rows: Row[]): Row[][] {
  const out: Row[][] = []
  let cur: Row[] = []
  for (const r of rows) {
    cur.push(r)
    if (endsSentence(r.a)) { out.push(cur); cur = [] }
  }
  // 마침표로 끝나지 않은 꼬리는 아직 끝나지 않은 문장이다. 모으지 않고 그대로 둔다.
  if (cur.length > 0) out.push(cur)
  return out
}

async function main() {
  const dry = process.argv.includes('--dry')
  const b64 = process.env.GOOGLE_SA_JSON_B64
  if (!b64) throw new Error('GOOGLE_SA_JSON_B64 없음')

  const credentials = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
  const auth = new google.auth.GoogleAuth({ credentials, scopes: [SHEETS_SCOPE] })
  const sheets = google.sheets({ version: 'v4', auth })

  const meta = await sheets.spreadsheets.get({ spreadsheetId: DECK.spreadsheetId })
  const tab = DECK.gid !== undefined
    ? (meta.data.sheets || []).find(s => s.properties?.sheetId === DECK.gid)?.properties?.title
    : (meta.data.sheets || []).find(s => s.properties?.title === DECK.tabTitle)?.properties?.title
  if (!tab) throw new Error(`탭을 찾지 못함 (${DECK.gid ?? DECK.tabTitle})`)
  const range = `'${tab.replace(/'/g, "''")}'!A:G`

  const read = await sheets.spreadsheets.values.get({ spreadsheetId: DECK.spreadsheetId, range })
  const all = (read.data.values || []) as string[][]
  const header = all[0] || []
  if (header[0] !== 'Question' || header[1] !== 'Answer') {
    throw new Error(`시트 머리가 예상과 다름: ${header.join(', ')}`)
  }

  const live = all.slice(1).filter(r => norm(r[0]) || norm(r[1]))

  // 이미 있는 문장 카드는 먼저 걷어낸다. 그런 다음 청크만으로 다시 묶어 카드를 새로 끼운다.
  // 걷어내지 않고 건너뛰려 하면, 문장 카드 자체가 마침표로 끝나므로 다음 묶음의 첫 줄로
  // 딸려 들어가 그 묶음이 한 줄짜리가 되고, 다음 문장에는 카드가 또 붙는다.
  // 결과를 매번 같은 모양으로 다시 계산하는 편이 예외를 세는 것보다 안전하다.
  const existingCards = live.filter(r => isCombined(r[0] ?? '', r[1] ?? '')).length
  const rows: Row[] = live
    .filter(r => !isCombined(r[0] ?? '', r[1] ?? ''))
    .map(r => ({ q: r[0] ?? '', a: r[1] ?? '', rest: r.slice(2) }))

  const groups = group(rows)
  const out: string[][] = []
  let cards = 0
  let skippedSingles = 0

  for (const g of groups) {
    for (const r of g) out.push([r.q, r.a, ...r.rest])
    if (g.length < 2) { skippedSingles += 1; continue }
    if (!endsSentence(g[g.length - 1].a)) continue
    out.push([g.map(r => r.q).join('\n'), g.map(r => r.a).join('\n'), '', '', '', '', ''])
    cards += 1
  }

  const added = cards - existingCards
  console.log(`청크 ${rows.length}행 · 문장 ${groups.length}개 · 이미 있던 문장 카드 ${existingCards}개`)
  console.log(`문장 카드 ${cards}개가 되도록 정리한다 (새로 ${Math.max(0, added)}개, 청크 1개짜리 ${skippedSingles}개는 모으지 않음)`)
  for (const g of groups) {
    if (g.length < 2) continue
    console.log(`  · ${g.map(r => r.a).join(' ').slice(0, 90)}…`)
  }
  if (cards === existingCards && out.length === live.length) {
    console.log('이미 정리돼 있다 — 쓸 것이 없다')
    return
  }
  if (dry) { console.log('--dry 라 쓰지 않았다'); return }

  const width = Math.max(...out.map(r => r.length), header.length)
  const padded = out.map(r => [...r, ...Array(width - r.length).fill('')])
  await sheets.spreadsheets.values.update({
    spreadsheetId: DECK.spreadsheetId,
    range: `'${tab.replace(/'/g, "''")}'!A2`,
    valueInputOption: 'RAW',
    requestBody: { values: padded },
  })
  console.log(`${out.length}행으로 다시 썼다 (문장 카드 ${added}개 추가)`)
}

main().catch(e => { console.error(e); process.exit(1) })
