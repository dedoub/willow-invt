import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const vc = createClient(process.env.VOICECARDS_SUPABASE_URL!, process.env.VOICECARDS_SUPABASE_KEY!)

async function main() {
  const { data, error } = await vc
    .from('anonymous_events_real_users')
    .select('event_name,properties')
    .limit(50000)
  if (error) throw error

  const keysByEvent = new Map<string, Map<string, number>>()
  for (const row of data || []) {
    const ev = row.event_name || 'unknown'
    if (!keysByEvent.has(ev)) keysByEvent.set(ev, new Map())
    const m = keysByEvent.get(ev)!
    const p = row.properties
    if (p && typeof p === 'object' && !Array.isArray(p)) {
      for (const k of Object.keys(p)) {
        m.set(k, (m.get(k) || 0) + 1)
      }
    }
  }

  const out: any[] = []
  for (const [ev, m] of keysByEvent.entries()) {
    const top = [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20)
    out.push({ event: ev, keys: top })
  }
  out.sort((a,b)=>a.event.localeCompare(b.event))
  console.log(JSON.stringify(out, null, 2))
}

main().catch((e)=>{ console.error(e); process.exit(1) })
