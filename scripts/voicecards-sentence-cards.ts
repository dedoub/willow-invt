/**
 * 보이스카드 덱에 "문장 카드"를 끼워 넣는다.
 *
 * 한 문장에 대해 **청크를 세 바퀴 돌린 뒤 그 문장을 한 장으로 모아** 넣고, 다음 문장으로
 * 넘어간다. 조각만 반복하면 조각은 익는데 문장이 안 익고, 한 바퀴만 돌리면 조각이 덜 익는다
 * (CEO 2026-09-14).
 *
 *   c1 c2 c3 · c1 c2 c3 · c1 c2 c3 · [문장] · d1 d2 · d1 d2 · d1 d2 · [문장] · …
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
/** 문장 카드를 놓기 전에 청크를 몇 바퀴 돌릴지. */
const REPEATS = 3

const norm = (v: string | undefined) => (v || '').replace(/\s+/g, ' ').trim()
/** 문장이 여기서 끝나는가. 닫는 따옴표가 뒤에 붙어도 끝으로 본다. */
const endsSentence = (en: string) => /[.?!]["'”’)\]]*\s*$/.test(norm(en))
/** 이미 모은 카드인가 — 줄바꿈이 들어 있으면 청크가 아니라 문장 카드다. */
const isCombined = (q: string, a: string) => q.includes('\n') || a.includes('\n')

interface Row { q: string; a: string; rest: string[] }

/**
 * 같은 줄이 몇 바퀴 돌고 있는 구간에서 한 바퀴만 돌려준다.
 *
 * 반복 횟수를 바꿔도(3→5) 다시 돌릴 수 있어야 해서, 몇 바퀴인지 세지 않고 최소 주기를 찾는다.
 * 나누어떨어지는 가장 짧은 주기를 쓴다 — 청크 여섯 개짜리 문장을 두 바퀴 돌린 열두 줄과
 * 청크 열두 개짜리 문장 한 바퀴는 겉이 같지만, 앞쪽이 실제로 일어나는 일이다.
 */
function basePeriod(seg: string[][]): string[][] {
  const key = (r: string[]) => `${norm(r[0])}\u0000${norm(r[1])}`
  for (let k = 1; k <= seg.length; k++) {
    if (seg.length % k !== 0) continue
    if (seg.every((r, i) => key(r) === key(seg[i % k]))) return seg.slice(0, k)
  }
  return seg
}

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

  // 매번 바닥에서 다시 세운다 — 이미 놓인 것을 세어 예외로 넘기려 하면 반복 횟수가
  // 달라질 때마다 셈이 어긋난다. 먼저 원래의 청크 한 바퀴를 되찾는다:
  //   ① 문장 카드로 구간을 가른다. 카드 하나가 한 문장의 끝이다.
  //   ② 구간 안은 같은 청크가 여러 바퀴 돌고 있으므로 최소 주기만 남긴다.
  const segments: string[][][] = []
  let seg: string[][] = []
  for (const r of live) {
    if (isCombined(r[0] ?? '', r[1] ?? '')) { segments.push(seg); seg = []; continue }
    seg.push(r)
  }
  if (seg.length > 0) segments.push(seg)

  const rows: Row[] = segments
    .flatMap(basePeriod)
    .map(r => ({ q: r[0] ?? '', a: r[1] ?? '', rest: r.slice(2) }))

  const groups = group(rows)
  const out: string[][] = []
  let cards = 0
  let skippedSingles = 0

  for (const g of groups) {
    const complete = g.length >= 2 && endsSentence(g[g.length - 1].a)
    // 아직 끝나지 않은 꼬리는 반복하지 않는다 — 모을 문장이 없으니 돌릴 이유도 없다.
    const passes = complete ? REPEATS : 1
    for (let i = 0; i < passes; i++) {
      for (const r of g) out.push([r.q, r.a, ...r.rest])
    }
    if (g.length < 2) { skippedSingles += 1; continue }
    if (!complete) continue
    out.push([g.map(r => r.q).join('\n'), g.map(r => r.a).join('\n'), '', '', '', '', ''])
    cards += 1
  }

  console.log(`청크 ${rows.length}행(중복 제거 후) · 문장 ${groups.length}개`)
  console.log(`청크 ${REPEATS}바퀴 + 문장 카드 1장 · 문장 카드 ${cards}개 · 총 ${out.length}행 (청크 1개짜리 ${skippedSingles}개는 모으지 않음)`)
  for (const g of groups) {
    if (g.length < 2) continue
    console.log(`  · ${g.map(r => r.a).join(' ').slice(0, 90)}…`)
  }
  const same = out.length === live.length
    && out.every((r, i) => norm(r[0]) === norm(live[i][0]) && norm(r[1]) === norm(live[i][1]))
  if (same) {
    console.log('이미 이 모양이다 — 쓸 것이 없다')
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
  console.log(`${out.length}행으로 다시 썼다 (청크 ${REPEATS}바퀴 · 문장 카드 ${cards}장)`)
}

main().catch(e => { console.error(e); process.exit(1) })
