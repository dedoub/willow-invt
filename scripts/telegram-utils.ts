export function markdownToTelegramHtml(text: string): string {
  const phs: string[] = []
  const ph = (s: string) => { phs.push(s); return `\x00${phs.length - 1}\x00` }
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  let html = text

  // Phase 1: Protect content from HTML escaping & markdown processing
  html = html.replace(/```(?:\w*)\n?([\s\S]*?)```/g, (_, c) => ph(`<pre>${esc(c)}</pre>`))
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
  html = html.replace(/^\|[-\s|:]+\|$/gm, '')
  html = html.replace(/^\|(.+)\|$/gm, (_, row: string) =>
    row.split('|').map((c: string) => c.trim()).filter(Boolean).join(' · ')
  )
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
