// sources.mjs — 텐소·윌로우 메일과 텐소 스페이스를 커서 이후만 읽는다.
import { google } from 'googleapis'

export const SKIP_SPACES = /^(VS Code|Todo - )/
const header = (m, n) => m.payload?.headers?.find(h => h.name.toLowerCase() === n.toLowerCase())?.value ?? ''
function plainText(part) {
  if (!part) return ''
  if (part.mimeType === 'text/plain' && part.body?.data) return Buffer.from(part.body.data, 'base64url').toString('utf8')
  for (const p of part.parts ?? []) { const t = plainText(p); if (t) return t }
  return ''
}

// 초안은 사실이 아니다 — 아직 안 보낸 메일을 "제출했다·신청 완료"로 읽는 사고가 있었다(2026-10-02, SMINFO·LG U+ 초안).
export const isDraftMail = m => (m?.labelIds ?? []).includes('DRAFT')

const fileNames = part => !part ? [] : [...(part.filename ? [part.filename] : []), ...(part.parts ?? []).flatMap(fileNames)]
export function normalizeGmail(m, context) {
  return {
    source: 'mail', company: context === 'default' ? 'willow' : 'tensw', context,
    ref: m.id, thread: m.threadId, from: header(m, 'From'), to: header(m, 'To'), subject: header(m, 'Subject'),
    text: plainText(m.payload).slice(0, 4000), at: new Date(Number(m.internalDate)).toISOString(),
    direction: (m.labelIds ?? []).includes('SENT') ? 'out' : 'in',
    attachments: fileNames(m.payload).filter(n => !/^image\d*\.(png|jpe?g|gif)$/i.test(n)),
  }
}

export function normalizeChat(m, space) {
  return {
    source: 'chat', company: 'tensw', ref: m.name, thread: m.thread?.name ?? null, space: space.displayName ?? '(DM)',
    from: m.sender?.displayName ?? m.sender?.name ?? '', text: (m.text ?? m.formattedText ?? '').slice(0, 4000),
    attachments: (m.attachment ?? []).map(a => a.contentName).filter(Boolean), at: m.createTime, direction: 'in',
  }
}

export function isRecordedSpace(space, lastMessageAt, now = new Date()) {
  if (SKIP_SPACES.test(space.displayName ?? '')) return false
  if (!lastMessageAt) return false
  return (now - new Date(lastMessageAt)) / 86_400_000 <= 60
}

// 시각은 문자열이 아니라 순간으로 비교한다 — DB 는 '+00:00', Gmail·Chat 은 'Z' 로 돌려준다.
export const instant = at => Date.parse(String(at ?? ''))
export const byInstant = (a, b) => instant(a.at) - instant(b.at)

export function newerThan(items, cursor) {
  if (!cursor) return items
  const c = instant(cursor.last_seen_at)
  return items.filter(x => { const t = instant(x.at); return t > c || (t === c && x.ref !== cursor.last_ref) })
}

// DB 의 last_seen_at('…+00:00')을 'Z' ISO 로 맞춘다.
export function normalizeCursor(row) {
  const t = instant(row.last_seen_at)
  return Number.isNaN(t) ? row : { ...row, last_seen_at: new Date(t).toISOString() }
}

// 페이지 상한에 걸려 커서 경계에 닿기 전에 멈췄는가 — 그렇다면 중간의 오래된 메시지를 건너뛴 것.
export function hitCap({ pages, maxPages, reachedCursor }) {
  return pages >= maxPages && !reachedCursor
}

async function oauthFor(sb, context) {
  const { data } = await sb.from('gmail_tokens').select('*').eq('context', context).order('updated_at', { ascending: false }).limit(1)
  const t = data?.[0]
  if (!t) throw new Error(`${context} 토큰 없음`)
  const id = context === 'tensoftworks' ? process.env.GOOGLE_CLIENT_ID_TENSW : process.env.GOOGLE_CLIENT_ID
  const secret = context === 'tensoftworks' ? process.env.GOOGLE_CLIENT_SECRET_TENSW : process.env.GOOGLE_CLIENT_SECRET
  const o = new google.auth.OAuth2(id, secret, process.env.GOOGLE_REDIRECT_URI)
  o.setCredentials({ access_token: t.access_token, refresh_token: t.refresh_token, expiry_date: t.token_expiry ? new Date(t.token_expiry).getTime() : undefined })
  return o
}

// 처음 보는 소스(새 스페이스 등)는 14일 전부터 읽는다. 하루만 보면 가동 직전 올라온 회의 공지를 놓친다
// (2026-09-29 업무보고의 10/2 독립기념관 회의를 놓침).
export const FIRST_READ_DAYS = 14
const defaultSince = () => new Date(Date.now() - FIRST_READ_DAYS * 86_400_000).toISOString()

// 읽기 오류는 던진다 — 조용히 24시간 전으로 돌아가면 그 사이 메시지를 다시 판단한다. 기본값은 행이 없을 때만.
export async function getCursor(sb, source) {
  const { data, error } = await sb.from('mgmt_cursors').select('*').eq('source', source).maybeSingle()
  if (error) throw new Error(`mgmt_cursors ${source}: ${error.message}`)
  return data ? normalizeCursor(data) : { source, last_seen_at: defaultSince(), last_ref: null }
}

export async function saveCursor(sb, source, items, { dryRun = false } = {}) {
  if (!items.length || dryRun) return
  const last = [...items].sort(byInstant).at(-1)
  const { error } = await sb.from('mgmt_cursors').upsert({ source, last_seen_at: last.at, last_ref: last.ref, updated_at: new Date().toISOString() })
  if (error) throw error
}

// format='metadata' 는 제목·보낸이·받는이만 받는다(본문 없음) — 증빙·추론용으로 가볍게 읽을 때.
export async function readMail(sb, context, cursor, { limit = 100, maxPages = 20, format = 'full' } = {}) {
  const gmail = google.gmail({ version: 'v1', auth: await oauthFor(sb, context) })
  const after = Math.floor(new Date(cursor.last_seen_at).getTime() / 1000)
  const out = []
  let pageToken, pages = 0
  do {
    pages++
    const list = await gmail.users.messages.list({ userId: 'me', q: `after:${after} -in:chats -in:drafts`, maxResults: limit, pageToken })
    for (const { id } of list.data.messages ?? []) {
      const { data } = await gmail.users.messages.get({ userId: 'me', id, format, ...(format === 'metadata' ? { metadataHeaders: ['From', 'To', 'Subject'] } : {}) })
      if (isDraftMail(data)) continue
      out.push(normalizeGmail(data, context))
    }
    pageToken = list.data.nextPageToken
  } while (pageToken && pages < maxPages)
  if (hitCap({ pages, maxPages, reachedCursor: !pageToken })) {
    console.warn(`[mgmt] mail:${context} 백로그가 상한을 넘었어요 — 오래된 메시지 일부를 건너뛸 수 있어요`)
  }
  return newerThan(out, cursor).sort(byInstant)
}

export async function readChat(sb, cursorFor, { now = new Date(), maxPages = 50 } = {}) {
  const chat = google.chat({ version: 'v1', auth: await oauthFor(sb, 'tensoftworks') })
  const spaces = []
  let pageToken
  do { const r = await chat.spaces.list({ pageSize: 100, pageToken }); spaces.push(...(r.data.spaces ?? [])); pageToken = r.data.nextPageToken } while (pageToken)
  const result = new Map()
  for (const space of spaces) {
    const cursor = await cursorFor(`chat:${space.name}`)
    const items = []
    let token, pages = 0, done = false
    while (!done && pages++ < maxPages) {
      const r = await chat.spaces.messages.list({ parent: space.name, pageSize: 100, orderBy: 'createTime desc', pageToken: token })
      for (const m of r.data.messages ?? []) {
        if (instant(m.createTime) < instant(cursor.last_seen_at)) { done = true; break }
        items.push(normalizeChat(m, space))
      }
      token = r.data.nextPageToken
      if (!token) done = true
    }
    if (hitCap({ pages, maxPages, reachedCursor: done })) {
      console.warn(`[mgmt] chat:${space.name} 백로그가 상한을 넘었어요 — 오래된 메시지 일부를 건너뛸 수 있어요`)
    }
    const latest = items[0]?.at ?? null
    if (!isRecordedSpace(space, latest ?? cursor.last_seen_at, now)) continue
    const fresh = newerThan(items, cursor).sort(byInstant)
    if (fresh.length) result.set(space.name, fresh)
  }
  return result
}
