import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const vc = createClient(process.env.VOICECARDS_SUPABASE_URL!, process.env.VOICECARDS_SUPABASE_KEY!)

async function main() {
  const tables = [
    'anonymous_events_real_users',
    'anonymous_events',
    'time_series_analytics',
    'user_daily_stats',
    'voicecards_stats_cache',
  ]

  for (const t of tables) {
    const { data, error } = await vc.from(t).select('*').limit(1)
    if (error) {
      console.log(t, 'ERR', error.message)
    } else {
      console.log(t, 'OK', data?.[0] ? Object.keys(data[0]) : 'no-row')
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
