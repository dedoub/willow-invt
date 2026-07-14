/**
 * VoiceCards 결제 실시간 알림 — 새 purchase 이벤트 발생 시 CEO 텔레그램 알림.
 * 30분 간격 launchd (com.willow.purchase-alert). 상태 파일로 중복 발송 방지.
 * 스토어 리포트(1~2일 지연)보다 빠른 앱 이벤트 기반.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

const LOG = '[purchase-alert]'
const STATE_PATH = path.join(process.cwd(), 'scripts/logs/purchase-alert.state.json')

const vc = createClient(process.env.VOICECARDS_SUPABASE_URL!, process.env.VOICECARDS_SUPABASE_SERVICE_KEY!, { auth: { persistSession: false } })

const PRICES_USD: Record<string, number> = {
  'com.monor.voicecards.credits.1000': 9.99,
  'com.monor.voicecards.credits.5500': 49.99,
  'com.monor.voicecards.credits.12000': 99.99,
}

function loadState(): { lastTs: string } {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) } catch { return { lastTs: new Date().toISOString() } }
}

async function notifyCeo(text: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) return
  const mainDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })
  const { data } = await mainDb.from('telegram_conversations').select('chat_id').eq('bot_type', 'ceo')
    .order('updated_at', { ascending: false }).limit(1).maybeSingle()
  if (!data?.chat_id) return
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: data.chat_id, text }),
  })
}

async function main() {
  const state = loadState()
  // 관리자/봇 제외는 대시보드와 동일한 뷰(anonymous_events_real_users)가 이미 처리
  const { data, error } = await vc
    .from('anonymous_events_real_users')
    .select('created_at, user_id, platform, properties')
    .eq('event_name', 'credits_changed')
    .eq('is_likely_bot', false)
    .gt('created_at', state.lastTs)
    .order('created_at', { ascending: true })
    .limit(20)
  if (error) throw new Error(error.message)
  const purchases = (data ?? []).filter(e => (e.properties as Record<string, string>)?.reason === 'purchase')
  if (purchases.length === 0) { console.log(`${LOG} no new purchases (since ${state.lastTs})`); return }

  // 닉네임/이메일 매핑
  const ids = [...new Set(purchases.map(p => p.user_id).filter(Boolean))] as string[]
  const { data: users } = ids.length
    ? await vc.from('users').select('user_id, nickname, email').in('user_id', ids)
    : { data: [] }
  const userMap = new Map((users ?? []).map(u => [u.user_id, u]))

  for (const p of purchases) {
    const props = p.properties as Record<string, string>
    const product = props?.product_id ?? '?'
    const price = PRICES_USD[product]
    const u = p.user_id ? userMap.get(p.user_id) : null
    const who = u?.nickname || u?.email || '알 수 없는 사용자'
    const platform = p.platform === 'ios' ? 'iOS' : p.platform === 'android' ? 'Android' : (p.platform ?? '?')
    const kst = new Date(p.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    const credits = product.split('.').pop()
    await notifyCeo(`💳 VoiceCards 결제 발생\n${who} (${platform}) · 크레딧 ${credits}${price ? ` ($${price})` : ''}\n${kst} KST`)
    console.log(`${LOG} notified: ${who} ${product}`)
  }
  fs.writeFileSync(STATE_PATH, JSON.stringify({ lastTs: purchases[purchases.length - 1].created_at }))
}

main().catch(e => { console.error(`${LOG} FATAL`, e); process.exit(1) })
