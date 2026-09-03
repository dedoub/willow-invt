const RESIDENT_RE = /\b\d{6}-\d{7}\b/g
// 제1조(제목) · 제 1 조 [제목] · 제1조 (제목)
const ARTICLE_HEAD_RE = /^제\s*(\d+)\s*조\s*[\(\[]\s*([^\)\]]+?)\s*[\)\]]\s*/
const ATTACHMENT_HEAD_RE = /^별첨\s*(\d+)\s*$/
const ADDENDUM_RE = /^부\s*칙\s*$/

export function maskResidentNumbers(text) {
  return String(text ?? '').replace(RESIDENT_RE, 'XXXXXX-*******')
}

export function splitRegulationSections(text) {
  const lines = String(text ?? '').split('\n')
  const body = []
  const attachments = []
  let current = null
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    const m = ATTACHMENT_HEAD_RE.exec(line.trim())
    if (m) {
      current = { index: Number(m[1]), title: '', lines: [] }
      attachments.push(current)
      continue
    }
    if (!current) { body.push(line); continue }
    if (!current.title && line.trim()) { current.title = line.trim(); continue }
    current.lines.push(line)
  }
  return {
    body: body.join('\n'),
    attachments: attachments.map(a => ({ index: a.index, title: a.title, text: a.lines.join('\n') })),
  }
}

export function parseArticles(text) {
  const lines = String(text ?? '').split('\n')
  const out = []
  let current = null
  for (const raw of lines) {
    const line = raw.trim()
    if (ADDENDUM_RE.test(line)) { current = null; continue }
    const m = ARTICLE_HEAD_RE.exec(line)
    if (m) {
      current = { no: `제${m[1]}조`, title: m[2].trim(), lines: [line.slice(m[0].length)] }
      out.push(current)
      continue
    }
    if (current) current.lines.push(raw)
  }
  return out.map(a => ({ no: a.no, title: a.title, text: a.lines.join('\n').replace(/\s+$/, '').replace(/^\s*\n/, '') }))
}

export function replaceArticleBody(text, articleNo, newBody) {
  const lines = String(text ?? '').split('\n')
  const num = articleNo.replace(/[^0-9]/g, '')
  let start = -1
  let end = lines.length
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    const m = ARTICLE_HEAD_RE.exec(line)
    if (start === -1) {
      if (m && m[1] === num) start = i
      continue
    }
    if (m || ADDENDUM_RE.test(line)) { end = i; break }
  }
  if (start === -1) throw new Error(`article not found: ${articleNo}`)
  const head = ARTICLE_HEAD_RE.exec(lines[start].trim())
  const headText = `제${head[1]}조(${head[2].trim()}) `
  return [...lines.slice(0, start), headText + newBody, ...lines.slice(end)].join('\n')
}
