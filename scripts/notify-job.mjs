#!/usr/bin/env node
// 스케줄러 잡의 실패를 CEO 봇으로 보낸다.
//
//   node scripts/notify-job.mjs --job "네이버 호가 수집" --status fail --detail "..." --log path/to.log
//   node scripts/notify-job.mjs --job "네이버 호가 수집" --status fail --print
//
// 재무 러너에는 전용 알림(notify-local-finance.mjs)이 있지만 나머지 잡들은 조용히 죽는다.
// 부동산 호가 수집이 2026-08-21부터 이레 동안 실패했는데 아무도 몰랐다 — 대시보드를
// 눈으로 보고서야 알았다. 그래서 잡 이름과 로그 끝부분만 받아 보내는 얇은 통로를 둔다.
//
// --print 는 보내지 않고 메시지만 찍는다(배선 확인용).

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true })

function argument(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : null
}

/** CEO 봇 대화. 재무 알림과 같은 곳을 본다. */
async function ceoChatId(url, key) {
  const response = await fetch(
    `${url}/rest/v1/telegram_conversations?bot_type=eq.ceo&select=chat_id&order=updated_at.desc&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  )
  if (!response.ok) throw new Error(`CEO 대화를 찾지 못했어요: ${response.status}`)
  const rows = await response.json()
  return rows[0]?.chat_id ?? null
}

/** 로그 끝부분. 원인 줄이 대개 마지막에 있고, 텔레그램 한 통에 들어갈 만큼만 자른다. */
async function logTail(file, lines = 12) {
  if (!file) return null
  const text = await fs.readFile(file, 'utf8').catch(() => null)
  if (!text) return null
  const tail = text.trimEnd().split('\n').slice(-lines).join('\n')
  return tail.length > 1200 ? `…\n${tail.slice(-1200)}` : tail
}

function timestamp() {
  return new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false })
}

async function run() {
  const job = argument('job') || '이름 없는 잡'
  const status = argument('status') || 'fail'
  const detail = argument('detail')
  const tail = await logTail(argument('log'))

  const head = status === 'ok' ? `✅ ${job} 완료` : `🚨 ${job} 실패`
  const message = [
    head,
    timestamp(),
    detail ? `\n${detail}` : null,
    tail ? `\n${tail}` : null,
  ].filter(Boolean).join('\n')

  if (process.argv.includes('--print')) {
    console.log(message)
    return
  }

  const token = process.env.TELEGRAM_BOT_TOKEN
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!token || !url || !key) throw new Error('텔레그램·Supabase 환경변수가 없어요.')

  const chatId = await ceoChatId(url, key)
  if (!chatId) throw new Error('CEO 봇 대화가 없어 보낼 곳을 찾지 못했어요.')

  const sent = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message }),
  })
  if (!sent.ok) throw new Error(`텔레그램 전송 실패: ${sent.status} ${await sent.text()}`)
  console.log(`[job-notify] job=${job}, status=${status} 전송 완료`)
}

run().catch(error => {
  // 알림이 실패해도 잡의 결과까지 죽일 이유는 없다. 로그만 남긴다.
  console.error(`[job-notify] ${error instanceof Error ? error.message : String(error)}`)
})
