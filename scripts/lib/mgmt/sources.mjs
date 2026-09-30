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

export function normalizeGmail(m, context) {
  return {
    source: 'mail', company: context === 'default' ? 'willow' : 'tensw', context,
    ref: m.id, thread: m.threadId, from: header(m, 'From'), to: header(m, 'To'), subject: header(m, 'Subject'),
    text: plainText(m.payload).slice(0, 4000), at: new Date(Number(m.internalDate)).toISOString(),
    direction: (m.labelIds ?? []).includes('SENT') ? 'out' : 'in',
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

export function newerThan(items, cursor) {
  if (!cursor) return items
  return items.filter(x => x.at > cursor.last_seen_at || (x.at === cursor.last_seen_at && x.ref !== cursor.last_ref))
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

const defaultSince = () => new Date(Date.now() - 86_400_000).toISOString()

export async function getCursor(sb, source) {
  const { data } = await sb.from('mgmt_cursors').select('*').eq('source', source).maybeSingle()
  return data ?? { source, last_seen_at: defaultSince(), last_ref: null }
}

export async function saveCursor(sb, source, items, { dryRun = false } = {}) {
  if (!items.length || dryRun) return
  const last = [...items].sort((a, b) => a.at.localeCompare(b.at)).at(-1)
  const { error } = await sb.from('mgmt_cursors').upsert({ source, last_seen_at: last.at, last_ref: last.ref, updated_at: new Date().toISOString() })
  if (error) throw error
}

export async function readMail(sb, context, cursor, { limit = 100, maxPages = 20 } = {}) {
  const gmail = google.gmail({ version: 'v1', auth: await oauthFor(sb, context) })
  const after = Math.floor(new Date(cursor.last_seen_at).getTime() / 1000)
  const out = []
  let pageToken, pages = 0
  do {
    pages++
    const list = await gmail.users.messages.list({ userId: 'me', q: `after:${after} -in:chats`, maxResults: limit, pageToken })
    for (const { id } of list.data.messages ?? []) {
      const { data } = await gmail.users.messages.get({ userId: 'me', id, format: 'full' })
      out.push(normalizeGmail(data, context))
    }
    pageToken = list.data.nextPageToken
  } while (pageToken && pages < maxPages)
  if (hitCap({ pages, maxPages, reachedCursor: !pageToken })) {
    console.warn(`[mgmt] mail:${context} 백로그가 상한을 넘었어요 — 오래된 메시지 일부를 건너뛸 수 있어요`)
  }
  return newerThan(out, cursor).sort((a, b) => a.at.localeCompare(b.at))
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
        if (m.createTime < cursor.last_seen_at) { done = true; break }
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
    const fresh = newerThan(items, cursor).sort((a, b) => a.at.localeCompare(b.at))
    if (fresh.length) result.set(space.name, fresh)
  }
  return result
}
