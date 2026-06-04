import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const vc = createClient(process.env.VOICECARDS_SUPABASE_URL!, process.env.VOICECARDS_SUPABASE_KEY!)

const EXCLUDED = new Set(['류하아빠', '큐트도넛'])

function short(uid: string) {
  return `${uid.slice(0, 6)}...${uid.slice(-4)}`
}

function toKstDate(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  const k = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  return k.toISOString().slice(0, 10)
}

function inferTopicBucket(sheetNames: string[]): string[] {
  const buckets = new Set<string>()
  for (const n of sheetNames) {
    const s = n.toLowerCase()
    if (/french|spanish|korean|vocabulary|phrases|count|slova|глаг|характер|движ|văn/.test(s)) buckets.add('언어/어휘')
    if (/interview|exam|cdl|eis|sho/.test(s)) buckets.add('시험/면접')
    if (/science/.test(s)) buckets.add('학과목')
  }
  if (buckets.size === 0 && sheetNames.length > 0) buckets.add('기타')
  return [...buckets]
}

function classifyStyle(params: {
  eventTotal: number
  cards: number
  attempts: number
  viewed: number
  tts: number
  loginCount: number
  learnStart: number
  sessions: number
}) {
  const { eventTotal, cards, attempts, viewed, tts, loginCount, learnStart, sessions } = params
  if (eventTotal === 0 && cards === 0 && attempts === 0) return '미진입형'
  if (cards === 0 && attempts === 0 && loginCount > 0) return '가입/로그인형'
  if (cards === 0 && viewed >= 30 && attempts >= 10) return '완료마찰형'
  if (cards > 0 && attempts / Math.max(cards, 1) >= 2.5) return '반복학습형'
  if (tts >= attempts * 0.4 && tts >= 5) return '청취보조형'
  if (eventTotal >= 100 && cards <= 1 && attempts <= 5) return '탐색형'
  if (cards > 0) return '초기학습형'
  if (learnStart > 0 || sessions > 0) return '탐색형'
  return '이탈형'
}

async function fetchAll<T>(
  fn: (from: number, to: number) => Promise<{ data: T[] | null; error: any }>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = []
  let from = 0
  while (true) {
    const { data, error } = await fn(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return out
}

async function main() {
  const { data: users, error: ue } = await vc
    .from('users')
    .select('user_id,nickname,created_at,sheet_ids')
  if (ue) throw ue

  const extUsers = (users || []).filter((u: any) => !EXCLUDED.has(u.nickname || ''))
  const ids = extUsers.map((u: any) => u.user_id)

  const ua = await fetchAll<any>((from, to) =>
    vc
      .from('user_analytics')
      .select('user_id,sheet_id,sheet_name,total_cards,cards_learned,total_attempts,correct_answers,last_updated,times_attempted')
      .in('user_id', ids)
      .order('created_at', { ascending: true })
      .range(from, to),
  )

  const ev = await fetchAll<any>((from, to) =>
    vc
      .from('anonymous_events_real_users')
      .select('user_id,event_name,created_at,session_id')
      .in('user_id', ids)
      .order('created_at', { ascending: true })
      .range(from, to),
  )

  const uaByUser = new Map<string, any[]>()
  for (const r of ua) {
    if (!uaByUser.has(r.user_id)) uaByUser.set(r.user_id, [])
    uaByUser.get(r.user_id)!.push(r)
  }

  const evByUser = new Map<string, any[]>()
  for (const e of ev) {
    if (!evByUser.has(e.user_id)) evByUser.set(e.user_id, [])
    evByUser.get(e.user_id)!.push(e)
  }

  const profiles: any[] = []

  for (const u of extUsers) {
    const urs = uaByUser.get(u.user_id) || []
    const evs = evByUser.get(u.user_id) || []

    let cards = 0
    let attempts = 0
    let correct = 0
    let latestUa: string | null = null
    const sheetRows = urs
      .map(r => {
        const l = Number(r.cards_learned) || 0
        const a = Number(r.total_attempts) || 0
        cards += l
        attempts += a
        correct += Number(r.correct_answers) || 0
        if (r.last_updated && (!latestUa || r.last_updated > latestUa)) latestUa = r.last_updated
        return {
          sheet_id: r.sheet_id,
          sheet_name: r.sheet_name,
          learned: l,
          attempts: a,
          accuracy: a > 0 ? Number(((Number(r.correct_answers) || 0) / a * 100).toFixed(1)) : null,
        }
      })
      .sort((a, b) => b.learned - a.learned || b.attempts - a.attempts)

    const cnt: Record<string, number> = {}
    const sess = new Set<string>()
    let lastEv: string | null = null
    for (const e of evs) {
      cnt[e.event_name] = (cnt[e.event_name] || 0) + 1
      if (e.session_id) sess.add(e.session_id)
      if (!lastEv || e.created_at > lastEv) lastEv = e.created_at
    }

    const loginCount = cnt['signin_completed'] || 0
    const viewed = cnt['card_viewed'] || 0
    const attemptedEv = cnt['card_attempted'] || 0
    const tts = cnt['tts_played'] || 0
    const stt = cnt['stt_recording_started'] || 0
    const learnStart = cnt['learning_started'] || 0

    const style = classifyStyle({
      eventTotal: evs.length,
      cards,
      attempts: attempts || attemptedEv,
      viewed,
      tts,
      loginCount,
      learnStart,
      sessions: sess.size,
    })

    const topSheets = sheetRows.slice(0, 3)
    const topicBuckets = inferTopicBucket(topSheets.map(s => s.sheet_name || ''))

    const lastActive = latestUa && lastEv ? (latestUa > lastEv ? latestUa : lastEv) : (latestUa || lastEv)

    profiles.push({
      user_id: u.user_id,
      user_short: short(u.user_id),
      nickname: u.nickname,
      joined_kst: toKstDate(u.created_at),
      last_active_kst: toKstDate(lastActive),
      total_events: evs.length,
      sessions: sess.size,
      total_learned: cards,
      total_attempts: attempts,
      accuracy: attempts > 0 ? Number((correct / attempts * 100).toFixed(1)) : null,
      viewed,
      tts,
      stt,
      style,
      topic_buckets: topicBuckets,
      top_sheets: topSheets,
      event_mix_top5: Object.entries(cnt).sort((a,b)=>b[1]-a[1]).slice(0,5),
    })
  }

  profiles.sort((a,b)=> (b.total_learned + b.total_attempts*0.2 + b.total_events*0.05) - (a.total_learned + a.total_attempts*0.2 + a.total_events*0.05))

  const totals = {
    users: profiles.length,
    users_with_learning: profiles.filter(p=>p.total_learned>0).length,
    users_with_attempts: profiles.filter(p=>p.total_attempts>0).length,
    users_no_activity: profiles.filter(p=>p.total_events===0 && p.total_attempts===0).length,
    total_learned: profiles.reduce((s,p)=>s+p.total_learned,0),
    total_attempts: profiles.reduce((s,p)=>s+p.total_attempts,0),
    total_events: profiles.reduce((s,p)=>s+p.total_events,0),
    style_dist: profiles.reduce((m:Record<string,number>,p)=>{m[p.style]=(m[p.style]||0)+1;return m},{}),
  }

  console.log(JSON.stringify({ generated_at: new Date().toISOString(), totals, profiles }, null, 2))
}

main().catch((e)=>{ console.error(e); process.exit(1) })
