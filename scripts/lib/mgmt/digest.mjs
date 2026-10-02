// digest.mjs — 저녁 요약을 윌리(텔레그램 HTML)로 보기 좋게. 2026-10-02 대표 요청("보기 좋게 스타일링").
// 회사별로 묶고, 같은 이름 일정은 한 줄로 합쳐 날짜만 나열하고, 긴 메일 제목은 줄인다.

const DOW = ['일', '월', '화', '수', '목', '금', '토']
const md = key => { const d = new Date(`${key}T00:00:00Z`); return Number.isNaN(d.getTime()) ? '' : `${d.getUTCMonth() + 1}/${d.getUTCDate()}` }
const mdw = key => { const d = new Date(`${key}T00:00:00Z`); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${DOW[d.getUTCDay()]})` }
export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const CO = { tensw: '텐소', willow: '윌로우' }

// 메일 제목에서 온 긴 이름을 줄인다(뜻은 남긴다).
export function tidy(title) {
  let t = String(title ?? '').trim()
  t = t.replace(/^Google Workspace:\s*(\S+)\s*인보이스가 발행되었습니다$/, 'Google Workspace 인보이스($1)')
  t = t.replace(/^\[전자세금계산서 정발행\]\s*(.+?)\s*▶\s*.+$/, '세금계산서 수신 — $1')
  t = t.replace(/^\[GS네오텍:사용내역서\].*$/, 'GS네오텍 AWS 사용내역서')
  t = t.replace(/[（(]주[）)]/g, '').replace(/\s{2,}/g, ' ')
  return t.length > 46 ? `${t.slice(0, 45)}…` : t
}

// rows: [{ company, title, schedule_date? }] → 회사별 [{ title, dates[] }]
export function groupRows(rows) {
  const by = new Map()
  for (const r of rows) {
    const co = r.company ?? 'tensw', title = tidy(r.title)
    if (!by.has(co)) by.set(co, new Map())
    const g = by.get(co)
    if (!g.has(title)) g.set(title, [])
    if (r.schedule_date) g.get(title).push(r.schedule_date)
  }
  return [...by.entries()].sort(([a], [b]) => (a === 'tensw' ? -1 : b === 'tensw' ? 1 : 0)).map(([co, g]) => ({
    company: co,
    items: [...g.entries()].map(([title, dates]) => ({ title, dates: [...new Set(dates)].sort() }))
      .sort((a, b) => (a.dates[0] ?? '9999').localeCompare(b.dates[0] ?? '9999')),
  }))
}

const itemLine = it => {
  const when = it.dates.length ? `<code>${it.dates.map(md).join(' · ')}</code> ` : ''
  return `• ${when}${esc(it.title)}${it.dates.length > 1 ? ` <i>×${it.dates.length}</i>` : ''}`
}
function section(icon, label, rows, { maxPerCo = 12 } = {}) {
  if (!rows.length) return []
  const groups = groupRows(rows)
  const multi = groups.length > 1
  const out = [`${icon} <b>${label} ${rows.length}</b>`]
  for (const g of groups) {
    if (multi) out.push(`<u>${CO[g.company] ?? g.company}</u>`)
    out.push(...g.items.slice(0, maxPerCo).map(itemLine))
    if (g.items.length > maxPerCo) out.push(`<i>… 외 ${g.items.length - maxPerCo}건</i>`)
  }
  return ['', ...out]
}

// done/created/missed: [{ company, title, schedule_date }]. inferred: [{ title, day }]. reused/failures: string[].
export function richDigest({ date, done = [], created = [], inferred = [], missed = [], openDecisions = 0, failures = [], reused = [] }) {
  if (!done.length && !created.length && !inferred.length && !missed.length && !openDecisions && !failures.length && !reused.length) return null
  const out = [`📋 <b>경영관리 저녁 요약</b> · ${mdw(date)}`]
  const counts = [done.length && `완료 ${done.length}`, created.length && `새 일정 ${created.length}`, missed.length && `빠짐 ${missed.length}`, openDecisions && `결정 대기 ${openDecisions}`].filter(Boolean)
  if (counts.length) out.push(`<i>${counts.join(' · ')}</i>`)
  out.push(...section('✅', '완료', done))
  out.push(...section('⚠️', '빠짐', missed))
  out.push(...section('🗓', '새 일정', created))
  if (inferred.length) {
    out.push('', `🔁 <b>새 반복 규칙(추정) ${inferred.length}</b>`)
    out.push(...inferred.map(r => `• ${esc(tidy(r.title))} — 매월 ${r.day}일`))
    out.push('<i>빼려면 "규칙 빼 &lt;이름&gt;"</i>')
  }
  if (reused.length) out.push('', `♻️ <b>지난 판단 재사용 ${reused.length}</b>`, ...reused.map(r => `• ${esc(r)}`))
  if (openDecisions) out.push('', `⚖️ <b>대기 중인 결정 ${openDecisions}건</b> — 위 결정 메시지의 버튼으로 답해 주세요`)
  if (failures.length) out.push('', `🚨 <b>실패·재시도 예정</b>`, ...failures.map(f => `• ${esc(f)}`))
  return out.join('\n')
}
