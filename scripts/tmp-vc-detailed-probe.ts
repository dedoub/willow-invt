import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const vc = createClient(process.env.VOICECARDS_SUPABASE_URL!, process.env.VOICECARDS_SUPABASE_KEY!)

function pickTopic(props: any): string | null {
  if (!props || typeof props !== 'object') return null
  const cand = [
    props.sheet_title,
    props.sheet_name,
    props.deck_title,
    props.deck_name,
    props.topic,
    props.category,
    props.title,
    props.problem_title,
    props.card_title,
    props.question,
    props.text,
    props.problem_text,
    props.card_text,
  ]
  for (const c of cand) {
    if (typeof c === 'string' && c.trim()) return c.trim().replace(/\s+/g, ' ').slice(0, 100)
  }
  return null
}

function shortId(id: string) {
  return `${id.slice(0, 6)}...${id.slice(-4)}`
}

async function main() {
  const { data: users, error: uerr } = await vc
    .from('users')
    .select('user_id,nickname,created_at')
    .order('created_at', { ascending: true })
  if (uerr) throw uerr

  const excluded = new Set(['류하아빠', '큐트도넛'])
  const extUsers = (users || []).filter((u: any) => !excluded.has(u.nickname || ''))
  const ids = extUsers.map((u: any) => u.user_id)

  const { data: events, error: eerr } = await vc
    .from('anonymous_events_real_users')
    .select('user_id,event_name,properties,created_at,session_id,platform,locale')
    .in('user_id', ids)
    .order('created_at', { ascending: true })
    .limit(300000)
  if (eerr) throw eerr

  const byUser = new Map<string, any[]>()
  for (const e of events || []) {
    if (!byUser.has(e.user_id)) byUser.set(e.user_id, [])
    byUser.get(e.user_id)!.push(e as any)
  }

  const report: any[] = []

  for (const u of extUsers) {
    const evs = byUser.get(u.user_id) || []
    const cnt: Record<string, number> = {}
    const topicCnt: Record<string, number> = {}
    const localeCnt: Record<string, number> = {}
    const platformCnt: Record<string, number> = {}
    const sessionSet = new Set<string>()

    for (const e of evs) {
      cnt[e.event_name] = (cnt[e.event_name] || 0) + 1
      if (e.session_id) sessionSet.add(e.session_id)
      if (e.locale) localeCnt[e.locale] = (localeCnt[e.locale] || 0) + 1
      if (e.platform) platformCnt[e.platform] = (platformCnt[e.platform] || 0) + 1

      const topic = pickTopic(e.properties)
      if (topic) topicCnt[topic] = (topicCnt[topic] || 0) + 1
    }

    const learned = cnt['card_learned'] || cnt['problem_learned'] || 0
    const attempted = cnt['card_attempted'] || cnt['problem_attempted'] || 0
    const viewed = cnt['card_viewed'] || cnt['problem_viewed'] || 0
    const listened = (cnt['tts_played'] || 0) + (cnt['audio_played'] || 0) + (cnt['voice_played'] || 0)
    const exams = (cnt['exam_started'] || 0) + (cnt['exam_submitted'] || 0)

    const engagement = learned + attempted + viewed + listened

    let style = '이탈형'
    if (evs.length === 0) style = '미진입형'
    else if (learned >= 100 || (attempted >= 300 && learned >= 20)) style = '코어 반복학습형'
    else if (learned >= 20 || attempted >= 80) style = '반복학습형'
    else if (viewed >= 50 && learned === 0 && attempted > 0) style = '완료마찰형'
    else if (listened > learned && listened >= attempted && listened >= 10) style = '청취형'
    else if (evs.length >= 200 && learned <= 2 && attempted <= 5) style = '탐색형'
    else if (engagement > 0 && learned > 0) style = '초기학습형'

    const topEvents = Object.entries(cnt)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)

    const topTopics = Object.entries(topicCnt)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k, v]) => ({ topic: k, n: v }))

    const topLocales = Object.entries(localeCnt).sort((a, b) => b[1] - a[1]).slice(0, 3)
    const topPlatforms = Object.entries(platformCnt).sort((a, b) => b[1] - a[1]).slice(0, 2)

    report.push({
      user_id: u.user_id,
      user_short: shortId(u.user_id),
      nickname: u.nickname,
      created_at: u.created_at,
      locale_profile: topLocales,
      platform_profile: topPlatforms,
      event_total: evs.length,
      sessions: sessionSet.size,
      learned,
      attempted,
      viewed,
      listened,
      exams,
      style,
      top_events: topEvents,
      top_topics: topTopics,
      last_event_at: evs.length ? evs[evs.length - 1].created_at : null,
    })
  }

  report.sort((a, b) => b.event_total - a.event_total)

  const totalEvents = report.reduce((s, r) => s + r.event_total, 0)
  const styleDist: Record<string, number> = {}
  for (const r of report) styleDist[r.style] = (styleDist[r.style] || 0) + 1

  console.log(JSON.stringify({
    generated_at: new Date().toISOString(),
    users: report.length,
    total_events: totalEvents,
    style_dist: styleDist,
    report,
  }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
