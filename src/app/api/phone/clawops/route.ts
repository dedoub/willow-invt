// ClawOps(AI 전화비서) 웹훅. 대표번호 부재중 → AI 비서가 받은 통화가 끝나면 여기로 온다.
// 본문은 믿지 않는다: callId 만 꺼내고 통화·요약·녹취는 ClawOps API 에서 다시 읽는다.
// 인증: URL 의 ?t= 가 CLAWOPS_WEBHOOK_TOKEN 과 같거나, 폼 상태콜백의 X-Signature 가 맞아야 한다.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  chatCard, computeSignature, fetchCall, fetchSummary, fetchTranscript, parseRecord, pickEvent, postChat, safeEqual,
} from '@/lib/phone/clawops'

export const maxDuration = 60

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } })

function authorized(req: NextRequest, form: Record<string, string> | null) {
  const token = process.env.CLAWOPS_WEBHOOK_TOKEN
  const t = req.nextUrl.searchParams.get('t')
  if (token && t && safeEqual(t, token)) return true
  const key = process.env.CLAWOPS_SIGNING_KEY, sig = req.headers.get('x-signature')
  return !!(key && sig && form && safeEqual(computeSignature(req.url, form, key), sig))
}

export async function POST(req: NextRequest) {
  const raw = await req.text()
  let body: Record<string, unknown> = {}
  let form: Record<string, string> | null = null
  if ((req.headers.get('content-type') ?? '').includes('application/x-www-form-urlencoded')) {
    form = Object.fromEntries(new URLSearchParams(raw)); body = form
  } else {
    try { body = JSON.parse(raw || '{}') } catch { return NextResponse.json({ error: 'bad body' }, { status: 400 }) }
  }
  if (!authorized(req, form)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { callId, event } = pickEvent(body)
  if (!callId) return NextResponse.json({ ok: true, skipped: 'no callId', event })

  const call = await fetchCall(callId)
  if (!call) return NextResponse.json({ ok: true, skipped: 'unknown call' })
  const [summary, transcript] = await Promise.all([fetchSummary(callId), fetchTranscript(callId)])
  const rec = parseRecord(transcript)

  const sb = db()
  const { data: prev } = await sb.from('tensw_phone_calls').select('chat_notified_at, schedule_id').eq('call_id', callId).maybeSingle()
  const row = {
    call_id: callId, from_number: call.from, to_number: call.to, started_at: call.startedAt, duration_sec: call.durationSec,
    status: call.status, category: rec.category, urgent: rec.urgent, needs_callback: rec.needsCallback,
    caller_name: rec.name, caller_org: rec.org, summary: summary?.coreSummary ?? null,
    follow_ups: summary?.followUps ?? [], transcript, transfer: call.transfer ?? null, raw: call.raw,
    updated_at: new Date().toISOString(),
  }
  const { error } = await sb.from('tensw_phone_calls').upsert(row)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 요약이 나온 뒤 한 번만 알린다. 광고는 알리지 않고 기록만 남긴다.
  const ready = !!summary
  const spam = rec.category === '광고'
  if (ready && !prev?.chat_notified_at && !spam) {
    if (await postChat(chatCard(call, rec, summary, transcript))) {
      await sb.from('tensw_phone_calls').update({ chat_notified_at: new Date().toISOString() }).eq('call_id', callId)
    }
  }
  // 회신이 필요하면 경영관리 원장에 오늘 할 일로 넣는다(회신 자체는 사람이 한다).
  if (ready && rec.needsCallback && !spam && !prev?.schedule_id) {
    const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
    const who = [rec.name, rec.org].filter(Boolean).join(' · ') || (rec.callbackNumber ?? call.from ?? '번호 미상')
    // source_key 유일 색인이 부분 색인(where not null)이라 upsert onConflict 를 못 쓴다 — 찾고 없으면 넣는다
    const key = `mgmt:tensw:phone:${callId}`
    const { data: found } = await sb.from('tensw_mgmt_schedules').select('id').eq('source_key', key).maybeSingle()
    const { data: s, error: se } = found ? { data: found, error: null } : await sb.from('tensw_mgmt_schedules').insert({
      source_key: key, schedule_date: today, type: 'deadline', category: 'other',
      title: `회신 전화: ${who}`, description: `${summary?.coreSummary ?? ''}\n회신번호 ${rec.callbackNumber ?? call.from ?? '미상'}`.trim(),
      origin: 'manual', agent_state: 'planned', evidence: [{ kind: 'phone', ref: callId }], is_completed: false,
    }).select('id').single()
    if (se) console.error('[phone] 회신 일정 저장 실패', se.message)
    if (s) await sb.from('tensw_phone_calls').update({ schedule_id: s.id }).eq('call_id', callId)
  }
  return NextResponse.json({ ok: true, callId, event, summarized: ready })
}
