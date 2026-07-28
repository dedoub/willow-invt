import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getGscSite } from '@/lib/gsc'

export const dynamic = 'force-dynamic'

// 개선 액션·실험 이력 등록/갱신.
// baseline_top3는 조치 직전 회차의 Top3를 사람이 적는 게 아니라 서버가 채운다.
// 손으로 적으면 기준이 흔들려 실험 결론이 안 남는다.

async function currentTop3(site: string, questionId: string | null): Promise<number | null> {
  const q = supabase.from('geo_answer_measurements').select('top3, measured_on').eq('site', site)
  const { data } = questionId ? await q.eq('question_id', questionId).order('measured_on', { ascending: false }).limit(200)
                              : await q.order('measured_on', { ascending: false }).limit(2000)
  const rows = (data ?? []) as Array<{ top3: boolean; measured_on: string }>
  if (rows.length === 0) return null
  const latestDay = rows[0].measured_on
  const scoped = rows.filter(r => r.measured_on === latestDay)
  return Math.round((scoped.filter(r => r.top3).length / scoped.length) * 1000) / 10
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  const site = String(body.site ?? '')
  if (!getGscSite(site)) {
    return NextResponse.json({ error: 'unknown_site', message: `알 수 없는 사이트: ${site}` }, { status: 400 })
  }
  if (!body.title) return NextResponse.json({ error: 'bad_request', message: 'title 필요' }, { status: 400 })

  const questionId = body.question_id ? String(body.question_id) : null
  const row = {
    site,
    question_id: questionId,
    cause: body.cause ? String(body.cause) : null,
    action_type: String(body.action_type ?? 'other'),
    title: String(body.title),
    hypothesis: body.hypothesis ? String(body.hypothesis) : null,
    status: String(body.status ?? 'planned'),
    shipped_on: body.shipped_on ? String(body.shipped_on) : null,
    baseline_top3: await currentTop3(site, questionId),
    links: Array.isArray(body.links) ? body.links.map(String) : [],
    note: body.note ? String(body.note) : null,
  }

  const { data, error } = await supabase.from('geo_actions').insert(row).select('id').single()
  if (error) return NextResponse.json({ error: 'insert_failed', message: error.message }, { status: 502 })
  return NextResponse.json({ ok: true, id: data.id, baseline_top3: row.baseline_top3 })
}

/**
 * 상태 갱신. status를 verifying → done으로 옮길 때 result_top3를 현재 회차로 채우고
 * baseline과 비교해 verdict를 자동 판정한다. 사람이 눈대중으로 결론 내리지 않게 한다.
 */
export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body?.id) return NextResponse.json({ error: 'bad_request', message: 'id 필요' }, { status: 400 })

  const { data: existing, error: readErr } = await supabase
    .from('geo_actions').select('site, question_id, baseline_top3').eq('id', Number(body.id)).single()
  if (readErr || !existing) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.status) patch.status = String(body.status)
  if (body.shipped_on) patch.shipped_on = String(body.shipped_on)
  if (body.note) patch.note = String(body.note)

  if (body.status === 'done' || body.measure === true) {
    const now = await currentTop3(existing.site as string, (existing.question_id as string) ?? null)
    patch.result_top3 = now
    const base = existing.baseline_top3 == null ? null : Number(existing.baseline_top3)
    if (now == null || base == null) patch.verdict = 'inconclusive'
    else if (now > base) patch.verdict = 'worked'
    else if (now < base) patch.verdict = 'worse'
    else patch.verdict = 'no_effect'
  }

  const { error } = await supabase.from('geo_actions').update(patch).eq('id', Number(body.id))
  if (error) return NextResponse.json({ error: 'update_failed', message: error.message }, { status: 502 })
  return NextResponse.json({ ok: true, ...patch })
}
