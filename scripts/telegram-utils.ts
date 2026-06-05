function isMarkdownTableSeparator(line: string): boolean {
  return /^\|(?:\s*:?-+:?\s*\|)+$/.test(line.trim())
}

function isMarkdownTableRow(line: string): boolean {
  const trimmed = line.trim()
  return trimmed.startsWith('|') && trimmed.endsWith('|')
}

function stripMarkdownForTableCell(text: string): string {
  return text
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1')
    .trim()
}

function displayWidth(text: string): number {
  let width = 0
  for (const ch of text) {
    const code = ch.codePointAt(0) || 0
    if (
      code >= 0x1100 &&
      (
        code <= 0x115f ||
        code === 0x2329 ||
        code === 0x232a ||
        (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
        (code >= 0xac00 && code <= 0xd7a3) ||
        (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0xfe10 && code <= 0xfe19) ||
        (code >= 0xfe30 && code <= 0xfe6f) ||
        (code >= 0xff00 && code <= 0xff60) ||
        (code >= 0xffe0 && code <= 0xffe6)
      )
    ) {
      width += 2
    } else {
      width += 1
    }
  }
  return width
}

function padDisplay(text: string, targetWidth: number): string {
  const padding = Math.max(0, targetWidth - displayWidth(text))
  return text + ' '.repeat(padding)
}

function formatMarkdownTableBlock(lines: string[]): string | null {
  if (lines.length < 2 || !isMarkdownTableSeparator(lines[1])) return null

  const rows = lines
    .filter((line, idx) => idx !== 1)
    .map(line =>
      line
        .trim()
        .slice(1, -1)
        .split('|')
        .map(cell => stripMarkdownForTableCell(cell))
    )

  if (rows.length === 0) return null

  const columnCount = Math.max(...rows.map(row => row.length))
  const normalizedRows = rows.map(row => {
    const next = [...row]
    while (next.length < columnCount) next.push('')
    return next
  })

  const widths = Array.from({ length: columnCount }, (_, col) =>
    Math.max(...normalizedRows.map(row => displayWidth(row[col])))
  )

  const formattedRows = normalizedRows.map((row, idx) => {
    const line = row
      .map((cell, col) => padDisplay(cell, widths[col]))
      .join(' | ')
      .trimEnd()
    if (idx === 0) {
      const divider = widths.map(w => '-'.repeat(Math.max(3, w))).join('-|-')
      return `${line}\n${divider}`
    }
    return line
  })

  return formattedRows.join('\n')
}

function replaceMarkdownTables(text: string, wrap: (content: string) => string): string {
  const lines = text.split('\n')
  const out: string[] = []

  for (let i = 0; i < lines.length; i++) {
    if (!isMarkdownTableRow(lines[i])) {
      out.push(lines[i])
      continue
    }

    const block: string[] = []
    let j = i
    while (j < lines.length && isMarkdownTableRow(lines[j])) {
      block.push(lines[j])
      j++
    }

    const formatted = formatMarkdownTableBlock(block)
    if (formatted) {
      out.push(wrap(formatted))
      i = j - 1
      continue
    }

    out.push(lines[i])
  }

  return out.join('\n')
}

export function markdownToTelegramHtml(text: string): string {
  const phs: string[] = []
  const ph = (s: string) => { phs.push(s); return `\x00${phs.length - 1}\x00` }
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  let html = text

  // Phase 1: Protect content from HTML escaping & markdown processing
  html = html.replace(/```(?:\w*)\n?([\s\S]*?)```/g, (_, c) => ph(`<pre>${esc(c)}</pre>`))
  html = replaceMarkdownTables(html, (table) => ph(`<pre>${esc(table)}</pre>`))
  html = html.replace(/`([^`\n]+)`/g, (_, c) => ph(`<code>${esc(c)}</code>`))
  html = html.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => ph(`<a href="${u}">${esc(t)}</a>`))
  html = html.replace(/(?:^> .+$\n?)+/gm, (m) => {
    const content = m.replace(/^> ?/gm, '').trim()
    return ph(`<blockquote>${esc(content)}</blockquote>`) + '\n'
  })

  // Phase 2: Escape HTML
  html = esc(html)

  // Phase 3: Markdown → HTML
  html = html.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>')
  html = html.replace(/^-{3,}$/gm, '━━━━━━━━━━')
  html = html.replace(/^\*{3,}$/gm, '━━━━━━━━━━')
  html = html.replace(/~~(.+?)~~/g, '<s>$1</s>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<i>$1</i>')

  // Phase 4: Restore & clean up
  html = html.replace(/\x00(\d+)\x00/g, (_, i) => phs[parseInt(i)])
  html = html.replace(/\n{3,}/g, '\n\n')

  return html
}
