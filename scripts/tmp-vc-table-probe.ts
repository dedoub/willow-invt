import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const vc = createClient(process.env.VOICECARDS_SUPABASE_URL!, process.env.VOICECARDS_SUPABASE_KEY!)

async function probe(name: string) {
  const { data, error } = await vc.from(name as any).select('*').limit(1)
  if (error) {
    console.log(name, 'ERR', error.message)
    return
  }
  console.log(name, 'OK', data?.[0] ? Object.keys(data[0]).join(',') : 'no-row')
}

async function main() {
  const tables = [
    'sheets',
    'sheet_cards',
    'cards',
    'problems',
    'user_sheets',
    'user_sheet_progress',
    'sheet_templates',
    'sheet_stats',
    'learning_sessions',
    'learning_events',
    'exam_sessions',
    'users',
    'user_analytics',
  ]
  for (const t of tables) await probe(t)
}

main().catch((e)=>{console.error(e); process.exit(1)})
