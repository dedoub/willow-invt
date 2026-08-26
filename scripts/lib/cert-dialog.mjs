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

// The certificate list shows one row per certificate. Rows are matched by owner
// so a reordered or newly imported certificate cannot silently select another
// company's key.
export function certificateRowPoint(items, ownerKeyword, options = {}) {
  const owner = normalizeOcrText(ownerKeyword)
  const rows = items
    .filter(item => withinRect(item, options.within))
    .filter(item => normalizeOcrText(item.text).includes(owner))

  if (rows.length === 0) {
    throw new Error(`인증서 목록에서 "${ownerKeyword}" 인증서를 찾지 못했어요.`)
  }
  if (rows.length > 1) {
    throw new Error(`"${ownerKeyword}" 인증서가 ${rows.length}건 보여서 어느 것인지 확정하지 못했어요.`)
  }

  const row = rows[0]
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

export function maskedLengthMatches(expected, actual) {
  return Number.isInteger(actual) && actual === expected
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
