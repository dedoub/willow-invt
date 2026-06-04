import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const vc = createClient(process.env.VOICECARDS_SUPABASE_URL!, process.env.VOICECARDS_SUPABASE_KEY!)

async function main() {
  const { data: users } = await vc.from('users').select('user_id,nickname')
  const excluded = new Set(['류하아빠', '큐트도넛'])
  const ids = (users||[]).filter((u:any)=>!excluded.has(u.nickname||'')).map((u:any)=>u.user_id)

  const { data, error } = await vc
    .from('user_analytics')
    .select('user_id,sheet_id,sheet_name,total_cards,cards_learned,total_attempts,correct_answers,last_updated')
    .in('user_id', ids)
    .order('cards_learned', { ascending: false })

  if (error) throw error

  const names = new Map<string, number>()
  for (const r of data || []) {
    const name = r.sheet_name || '(no_name)'
    names.set(name, (names.get(name)||0) + 1)
  }

  const arr = [...names.entries()].sort((a,b)=>b[1]-a[1])
  console.log('rows', (data||[]).length)
  for (const [name, n] of arr) {
    console.log(n.toString().padStart(3), '|', name)
  }

  console.log('\n--- per user top sheets ---')
  const byUser = new Map<string, any[]>()
  for (const r of data || []) {
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, [])
    byUser.get(r.user_id)!.push(r)
  }
  const nickById = new Map((users||[]).map((u:any)=>[u.user_id, u.nickname]))

  for (const [uid, rows] of byUser.entries()) {
    rows.sort((a,b)=> (Number(b.cards_learned)||0) - (Number(a.cards_learned)||0) || (Number(b.total_attempts)||0)-(Number(a.total_attempts)||0))
    const top = rows.slice(0,5).map(r => `${r.sheet_name||'unnamed'} [L${r.cards_learned||0}/A${r.total_attempts||0}]`).join(' || ')
    console.log((nickById.get(uid) || uid.slice(0,8)+'...'), '=>', top)
  }
}

main().catch((e)=>{console.error(e); process.exit(1)})
