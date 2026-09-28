/* ── 규칙: 카드 하나(DOM)를 보고 위반을 돌려준다. 브라우저 안에서 돈다. ── */
// 각 항목의 id 는 점검표 번호와 맞춘다. 새 지적 → 여기 한 줄.
export const RULES_SOURCE = String.raw`
(() => {
  const ROW_LIMIT = 15        // 이 행 수를 넘는 표는 페이지 이동이 있어야 한다(요약 표 10여 행은 예외)
  const MIN_TITLE_GAP = 16    // 제목 아래 → 첫 내용(글자·입력칸)까지 최소 px
  const out = []
  const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
  for (const card of document.querySelectorAll('[data-lcard]')) {
    if (!visible(card)) continue
    const head = card.querySelector('[data-section-head]')
    if (!head) continue
    const title = (head.innerText || '').split('\n')[0].trim()
    const add = (rule, detail) => out.push({ card: title, rule, detail })

    // 1. 제목: 붙여 쓴 4~5글자
    if (/\s/.test(title)) add('1-title-joined', '제목에 띄어쓰기: "' + title + '"')
    if ([...title].length > 5) add('1-title-length', '제목 ' + [...title].length + '글자(5 이하): "' + title + '"')

    // 2. 필터·세그먼트는 제목 줄 안. 차트 판(data-panel) 안의 판 전용 토글은 예외.
    for (const f of card.querySelectorAll('[data-filter-chips], [data-segment-group]')) {
      if (!visible(f) || head.contains(f) || f.closest('[data-panel]')) continue
      add('2-filter-in-head', '제목 줄 밖 필터: ' + (f.innerText || '').replace(/\s+/g, ' ').slice(0, 30))
    }

    // 5. 긴 표에는 페이지 이동
    const rows = [...card.querySelectorAll('[data-table-row]')].filter(visible).length
    if (rows > ROW_LIMIT && !card.querySelector('[data-page-size]')) add('5-pagination', '표 ' + rows + '행인데 페이지 이동 없음')

    // 6. 탭으로 가리지 않기 — 판 안에 전환 칩이 둘 이상이면 탭이다
    for (const panel of card.querySelectorAll('[data-panel]')) {
      const chips = panel.querySelectorAll('[data-filter-chip]').length
      if (chips >= 2) add('6-no-tabs', '탭 전환 ' + chips + '개: ' + (panel.querySelector('[data-panel-title]')?.innerText || '').trim())
    }

    // 7. 한 글자 배지 금지
    const letters = new Set()
    for (const b of card.querySelectorAll('[data-badge], [data-table-badge]')) {
      const txt = (b.innerText || '').trim()
      if (/^[A-Z]$/.test(txt) && visible(b)) letters.add(txt)
    }
    if (letters.size) add('7-word-badges', '한 글자 배지: ' + [...letters].join(', '))

    // 8. 제목 아래 간격
    const hb = head.getBoundingClientRect().bottom
    let first = null
    for (const el of card.querySelectorAll('*')) {
      if (head.contains(el) || !visible(el)) continue
      const isLeafText = el.children.length === 0 && (el.innerText || '').trim()
      if (!isLeafText && el.tagName !== 'INPUT') continue
      const top = el.getBoundingClientRect().top
      if (top >= hb - 0.5 && (first === null || top < first)) first = top
    }
    if (first !== null && first - hb < MIN_TITLE_GAP) add('8-title-gap', '제목 아래 ' + Math.round(first - hb) + 'px (' + MIN_TITLE_GAP + ' 이상)')
  }
  return out
})()
`

