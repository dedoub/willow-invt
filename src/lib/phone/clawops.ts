// ClawOps(AI 전화비서) 연동 — 웹훅 확인, 통화 다시 읽기, 구글챗 문장.
// 웹훅 본문 형식은 공개 문서에 없어서 callId 만 뽑고, 내용은 항상 ClawOps API 에서 다시 읽는다.
import { createHmac, timingSafeEqual } from 'node:crypto'

const API = 'https://api.claw-ops.com/v1'

export type CallInfo = {
  callId: string
  from: string | null
  to: string | null
  startedAt: string | null
  durationSec: number | null
  status: string | null
  transfer: unknown
  raw: unknown
}
export type CallSummary = { coreSummary?: string; decisions?: string[]; followUps?: string[]; sentiment?: string } & Record<string, unknown>

/** 서명 — SDK 와 같은 방식(url + 정렬한 key·value, HMAC-SHA256, base64). 폼 본문 상태 콜백용 */
export function computeSignature(url: string, params: Record<string, string>, key: string) {
  const data = url + Object.keys(params).sort().map(k => `${k}${params[k]}`).join('')
  return createHmac('sha256', key).update(data, 'utf-8').digest('base64')
}
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** 본문(폼이든 JSON 이든)에서 callId 와 이벤트 이름을 뽑는다 */
export function pickEvent(body: Record<string, unknown>): { callId: string | null; event: string | null } {
  const data = (body.data ?? body.payload ?? {}) as Record<string, unknown>
  const s = (v: unknown) => (typeof v === 'string' && v ? v : null)
  return {
    callId: s(body.CallId) ?? s(body.callId) ?? s(data.callId) ?? s(data.CallId) ?? s(body.call_id) ?? s(data.call_id),
    event: s(body.type) ?? s(body.event) ?? s(body.eventType) ?? s(body.CallStatus) ?? null,
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T | null> {
  const acc = process.env.CLAWOPS_ACCOUNT_ID, key = process.env.CLAWOPS_API_KEY
  if (!acc || !key) throw new Error('CLAWOPS_ACCOUNT_ID / CLAWOPS_API_KEY 가 없어요')
  const res = await fetch(`${API}/accounts/${acc}${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init?.headers } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`ClawOps ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json() as Promise<T>
}

export async function fetchCall(callId: string): Promise<CallInfo | null> {
  const c = await api<Record<string, unknown>>(`/calls/${callId}`)
  if (!c) return null
  const g = (...ks: string[]) => { for (const k of ks) if (c[k] != null && c[k] !== '') return c[k]; return null }
  return {
    callId,
    from: (g('from', 'From', 'fromNumber') as string) ?? null,
    to: (g('to', 'To', 'toNumber') as string) ?? null,
    startedAt: (g('dateCreated', 'startTime') as string) ?? null,
    durationSec: Number(g('duration')) || null,
    status: (g('status') as string) ?? null,
    transfer: g('transfers', 'transferStatus'),
    raw: c,
  }
}
export async function fetchSummary(callId: string): Promise<CallSummary | null> {
  const s = await api<{ status?: string; resultJson?: CallSummary }>(`/calls/${callId}/summary`)
  return s?.status === 'completed' ? s.resultJson ?? null : null
}
export async function fetchTranscript(callId: string): Promise<string | null> {
  const t = await api<{ status?: string; segments?: { speaker?: string; text?: string }[] }>(`/calls/${callId}/transcript`)
  if (t?.status !== 'completed') return null
  // 화자 이름(speaker_0…, 예전엔 AGENT/CUSTOMER)과 역할의 연결은 보장되지 않는다. AI 비서가 먼저 인사하므로
  // 첫 발화의 화자를 AI 로 본다.
  const segs = t.segments ?? []
  const ai = segs.find(x => x.speaker === 'AGENT')?.speaker ?? segs[0]?.speaker
  return segs.map(x => `[${x.speaker === ai ? 'AI' : '발신자'}] ${x.text ?? ''}`).join('\n')
}

// AI 비서는 메모를 받으면 발신자에게 이렇게 복창한다(지침 scripts/clawops-agent.mjs):
//   "확인하겠습니다. 성함 홍길동, 소속 서울시체육회, 회신 번호 010-1234-5678, 용건 유지보수 견적 문의 맞으신가요?"
// 광고·영업이면 "광고 전화로 확인되어" 로 마무리한다. 녹취의 AI 줄에서 이 둘을 읽는다.
const AD_WORDS = /광고|영업 ?전화|대출|보험 ?상품|설문|이벤트 ?당첨|홍보 ?제안|카드 ?발급/
const URGENT_WORDS = /급(합|한|히)|긴급|오늘 ?중|당장|마감/
export function parseRecord(text: string | null) {
  const lines = (text ?? '').split('\n')
  const ai = lines.filter(l => l.startsWith('[AI]')).map(l => l.slice(4).trim())
  const confirm = [...ai].reverse().find(l => l.includes('확인하겠습니다') && /성함|회신/.test(l)) ?? ''
  const field = (k: string) => confirm.match(new RegExp(`${k}(?:은|는)?\\s*([^,.?]+)`))?.[1]?.replace(/\s*맞으신가요$/, '').trim() || null
  const isAd = ai.some(l => l.includes('광고 전화로 확인'))
  const callbackNumber = field('회신 ?번호')?.replace(/[^\d-]/g, '') || null
  const purpose = field('용건')
  const callerText = lines.filter(l => l.startsWith('[발신자]')).join(' ')
  return {
    category: isAd ? '광고' : (purpose ? (AD_WORDS.test(purpose) ? '광고' : '문의') : null),
    urgent: !isAd && URGENT_WORDS.test(`${purpose ?? ''} ${callerText}`),
    needsCallback: !isAd && !!(callbackNumber || field('성함')),
    name: field('성함'),
    org: field('소속'),
    callbackNumber,
    purpose,
  }
}

export function chatText(c: { from: string | null; startedAt: string | null; durationSec: number | null }, rec: ReturnType<typeof parseRecord>, summary: CallSummary | null) {
  const when = c.startedAt ? new Date(c.startedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
  const who = [rec.name, rec.org].filter(Boolean).join(' · ') || '이름 미상'
  const head = `${rec.urgent ? '🔴 ' : ''}📞 대표번호 부재중 — ${who} (${rec.callbackNumber ?? c.from ?? '번호 미상'})`
  const lines = [head, `${when} · ${c.durationSec ?? '?'}초 · ${rec.category ?? '분류 없음'}${rec.needsCallback ? ' · 회신 필요' : ''}`]
  if (rec.purpose) lines.push(`용건: ${rec.purpose}`)
  if (summary?.coreSummary) lines.push(`요약: ${summary.coreSummary}`)
  for (const f of summary?.followUps ?? []) lines.push(`• ${f}`)
  return lines.join('\n')
}

export async function postChat(text: string) {
  const url = process.env.TENSW_PHONE_CHAT_WEBHOOK
  if (!url) return false
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify({ text }) })
  return res.ok
}
