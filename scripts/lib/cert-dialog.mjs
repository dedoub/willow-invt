// Locates controls inside the Korean certificate dialogs by reading them with
// macOS Vision OCR instead of hard-coding screen coordinates. The dialogs move
// with the browser window and their row order changes when a certificate is
// added or expires, so every point is resolved per run.

const WHITESPACE = /\s+/g

export function normalizeOcrText(value) {
  return String(value ?? '').replace(WHITESPACE, '').trim()
}

export function textCenter(item) {
  return { x: Math.round(item.x + item.w / 2), y: Math.round(item.y + item.h / 2) }
}

export function withinRect(item, rect) {
  if (!rect) return true
  const center = textCenter(item)
  return center.x >= rect.x
    && center.x <= rect.x + rect.w
    && center.y >= rect.y
    && center.y <= rect.y + rect.h
}

export function findOcrText(items, keyword, options = {}) {
  const needle = normalizeOcrText(keyword)
  const matches = items
    .filter(item => withinRect(item, options.within))
    .filter(item => normalizeOcrText(item.text).includes(needle))

  if (matches.length === 0) return null
  // Prefer the tightest match so "인증서 암호" does not resolve to the longer
  // "인증서 암호를 입력하십시오." guidance line above the field.
  return matches.sort((a, b) => normalizeOcrText(a.text).length - normalizeOcrText(b.text).length)[0]
}

export function requireOcrText(items, keyword, options = {}) {
  const match = findOcrText(items, keyword, options)
  if (!match) throw new Error(`인증서 창에서 "${keyword}" 요소를 찾지 못했어요.`)
  return match
}

// A control that OCR cannot read (a bare text field) is addressed relative to
// the label next to it.
export function anchoredPoint(items, spec, options = {}) {
  const anchor = requireOcrText(items, spec.anchor, options)
  return {
    x: Math.round(anchor.x + (spec.dx ?? 0)),
    y: Math.round(anchor.y + (spec.dy ?? 0)),
  }
}

export function buttonPoint(items, label, options = {}) {
  return textCenter(requireOcrText(items, label, options))
}

// The certificate list shows one row per certificate. Rows are matched so a
// reordered or newly imported certificate cannot silently select another
// company's key.
//
// More than one keyword is accepted because no single one survives every
// dialog: 신한 truncates the owner name to "윌로우인베스...", Vision reads 윌 as 월,
// and 위택스 prints the name in full. The issuing CA (SignKorea vs TradeSign) is
// ASCII and never truncated, so it carries the match where the name cannot.
export function certificateRowPoint(items, keywords, options = {}) {
  const wanted = (Array.isArray(keywords) ? keywords : [keywords]).map(normalizeOcrText)
  const label = (Array.isArray(keywords) ? keywords : [keywords]).join(' / ')
  const rows = items
    .filter(item => withinRect(item, options.within))
    .filter(item => wanted.some(keyword => normalizeOcrText(item.text).includes(keyword)))

  if (rows.length === 0) {
    throw new Error(`인증서 목록에서 "${label}" 인증서를 찾지 못했어요.`)
  }
  // Several OCR fragments can land on one row — the name and the CA are separate
  // items — so rows on the same line are one row, not an ambiguity.
  const lines = [...new Map(rows.map(row => [Math.round(row.y / 6), row])).values()]
  if (lines.length > 1) {
    throw new Error(`"${label}" 인증서가 ${lines.length}건 보여서 어느 것인지 확정하지 못했어요.`)
  }

  const row = lines[0]
  return { x: Math.round(row.x + row.w / 2), y: Math.round(row.y + row.h / 2) }
}

export function windowRect(window) {
  return { x: window.x, y: window.y, w: window.w, h: window.h }
}

export function parseNativeWindows(output) {
  return String(output ?? '')
    .split('\n')
    // Only the line ending is stripped: an alert panel has an empty name, and
    // trimming the leading tab would shift every field along by one.
    .map(line => line.replace(/\r$/, ''))
    .filter(line => line.includes('\t'))
    .map(line => {
      const [name, x, y, w, h] = line.split('\t')
      return { name, x: Number(x), y: Number(y), w: Number(w), h: Number(h) }
    })
    .filter(window => [window.x, window.y, window.w, window.h].every(Number.isFinite))
}

// The certificate modules draw plain NSWindows with no accessibility tree, so a
// click that arrives while the window is not key only raises it. Every entry
// into such a window therefore spends one throwaway click.
export function clickPlan(point, { windowIsKey }) {
  return windowIsKey ? [point] : [point, point]
}

/**
 * 입력된 마스크 점 개수가 기대한 비밀번호 길이와 맞는지 본다.
 *
 * 일부 인증창은 칸 폭만큼만 점을 그리고 나머지는 넘겨버린다(신한 INISAFE 는 10개).
 * 그런 칸에서는 그 이상을 눈으로 확인할 방법이 없으므로, 칸이 가득 찬 경우에 한해
 * 통과시킨다. 모자란 입력은 여전히 막힌다 — 짧은 비밀번호를 제출하면 인증서가
 * 잠기는 횟수를 한 번 쓰기 때문이다.
 */
export function maskedLengthMatches(expected, actual, capacity = null) {
  if (!Number.isInteger(actual)) return false
  if (actual === expected) return true
  return Number.isInteger(capacity) && expected > capacity && actual === capacity
}

// Counts the masking glyphs in a password field. A typed keystroke can be
// dropped when the dialog steals focus, and submitting a short password spends
// one of the few attempts before the certificate is locked out, so the count is
// checked before every submit.
export function countMaskGlyphs(rgb, rect, width = 1920) {
  const columns = []
  for (let x = rect.x; x < rect.x + rect.w; x += 1) {
    let dark = 0
    for (let y = rect.y; y < rect.y + rect.h; y += 1) {
      const offset = (y * width + x) * 3
      if (rgb[offset] < 110 && rgb[offset + 1] < 110 && rgb[offset + 2] < 110) dark += 1
    }
    if (dark >= 2) columns.push(x)
  }
  return countColumnClusters(columns)
}

export function countColumnClusters(columns) {
  let clusters = 0
  let previous = -Infinity
  for (const column of columns) {
    if (column > previous + 1) clusters += 1
    previous = column
  }
  return clusters
}
