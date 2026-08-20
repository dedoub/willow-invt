#!/usr/bin/env npx tsx
/**
 * tensw-sync-notify.ts
 *
 * 08:00 동기화 로그를 읽어 실패가 있으면 CEO에게 텔레그램으로 알린다.
 *
 * 왜 필요한가: 잡이 조용히 실패하면 며칠이 지나도 아무도 모른다. 실제로 2026-08-20에
 * 데모 일일 한도에 걸려 신한 계좌·세금계산서·카드가 통째로 안 돌았는데, CEO가 직접
 * 물어보기 전까지 드러나지 않았다. 성공했을 때는 조용히 있는다.
 *
 *   npx tsx scripts/tensw-sync-notify.ts <로그파일>
 */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const LOG = process.argv[2]
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY!

async function ceoChatId(): Promise<number | null> {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data } = await sb
    .from('telegram_conversations')
    .select('chat_id')
    .eq('bot_type', 'ceo')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.chat_id ?? null
}

async function main() {
  if (!LOG || !fs.existsSync(LOG)) return
  const raw = fs.readFileSync(LOG, 'utf8')

  // 이번 실행 구간만 본다. 로그는 계속 이어 붙으므로 마지막 start 이후를 자른다.
  const lastStart = raw.lastIndexOf('tensw sync start')
  const run = lastStart >= 0 ? raw.slice(lastStart) : raw

  const failures = run.split('\n').filter(l => l.includes('✗') || l.includes('⚠') || l.includes('failed'))
  if (!failures.length) return

  const quota = run.includes('CF-00012')
  const lines = [
    '텐소프트웍스 08:00 동기화에서 실패가 있었어요.',
    '',
    ...failures.slice(0, 8).map(l => `· ${l.trim().replace(/^[✗⚠]\s*/, '')}`),
  ]
  if (failures.length > 8) lines.push(`· 외 ${failures.length - 8}건`)
  if (quota) {
    lines.push('', 'CODEF 데모 일일 한도(100건)에 걸렸어요. 정식버전 전환을 검토해야 해요.')
  }
  const text = lines.join('\n')

  if (!BOT_TOKEN) { console.error(text); return }
  const chatId = await ceoChatId()
  if (!chatId) { console.error(text); return }

  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
  console.log(`[notify] 실패 ${failures.length}건 알림 전송`)
}

main().catch(err => { console.error(err instanceof Error ? err.message : err) })
