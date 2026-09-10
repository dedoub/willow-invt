/**
 * 스토어 실판매 일일 수집 — voicecards store_revenue 테이블 upsert
 *
 *  - ios: ASC Sales and Trends 일별 리포트 (유료 행만: Developer Proceeds > 0). 1~2일 지연.
 *         첫 실행 시 2026-05-01부터 백필, 이후 최근 7일 재수집(확정치 갱신).
 *  - android: 플레이 GCS 월별 Estimated Sales zip — 구매자 결제액을 일자·상품·통화별로 합산.
 *
 * 통화는 원본 보존 (customer_price는 customer currency, proceeds는 proceeds_currency의 행 합계).
 * launchd: com.willow.store-visits-sync 러너에서 방문 수집 후 이어서 실행.
 *
 * CEO 알림은 여기서 보내지 않는다. 새 정산 행은 telegram-bot 의
 * monitorVoicecardsStoreRevenue 가 created_at 으로 잡아 결제 알림과 같은 형식·같은
 * 월 누적 블록으로 내보낸다. 이 스크립트는 수집·적재만 한다.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import fs from 'fs'
import zlib from 'zlib'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as jose from 'jose'
import { GoogleAuth } from 'google-auth-library'
import { createClient } from '@supabase/supabase-js'
import {
  parseVoicecardsAppStoreSalesReport,
  parseVoicecardsGooglePlaySalesReport,
  type VoicecardsStoreRevenueRow,
} from '../src/lib/voicecards-store-revenue'

const LOG = '[store-revenue-sync]'
const supabase = createClient(
  process.env.VOICECARDS_SUPABASE_URL!,
  process.env.VOICECARDS_SUPABASE_SERVICE_KEY!,
  { auth: { persistSession: false } }
)

type Row = VoicecardsStoreRevenueRow

async function ascToken(): Promise<string> {
  const pk = await jose.importPKCS8(fs.readFileSync(process.env.APPSTORE_PRIVATE_KEY_PATH!, 'utf8'), 'ES256')
  return await new jose.SignJWT({ aud: 'appstoreconnect-v1' })
    .setProtectedHeader({ alg: 'ES256', kid: process.env.APPSTORE_KEY_ID!, typ: 'JWT' })
    .setIssuer(process.env.APPSTORE_ISSUER_ID!).setIssuedAt().setExpirationTime('15m').sign(pk)
}

const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10)

// ── 애플: 일별 SALES 리포트 (유료 행만) ─────────────────────────────────────────
async function collectAppStore(): Promise<Row[]> {
  const jwt = await ascToken()
  const vendor = process.env.APPSTORE_VENDOR_NUMBER!
  // 백필 범위: 테이블에 ios 행이 없으면 2026-05-01(첫 결제 시기)부터, 있으면 최근 7일
  const { count } = await supabase.from('store_revenue').select('*', { count: 'exact', head: true }).eq('platform', 'ios')
  const start = (count ?? 0) === 0 ? new Date('2026-05-01').getTime() : Date.now() - 7 * 86400000
  const end = Date.now() - 1 * 86400000 // 전일까지 (당일 리포트는 미생성)
  const rows: Row[] = []
  let missing = 0
  for (let t = start; t <= end; t += 86400000) {
    const d = dayKey(t)
    const url = `https://api.appstoreconnect.apple.com/v1/salesReports?filter[frequency]=DAILY&filter[reportDate]=${d}&filter[reportSubType]=SUMMARY&filter[reportType]=SALES&filter[vendorNumber]=${vendor}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/a-gzip' } })
    if (res.status === 404) { missing++; continue } // 판매 없는 날은 리포트 자체가 없음
    if (!res.ok) { console.error(`${LOG} ios ${d}: ${res.status}`); continue }
    const text = zlib.gunzipSync(Buffer.from(await res.arrayBuffer())).toString('utf8')
    rows.push(...parseVoicecardsAppStoreSalesReport(text, d))
  }
  console.log(`${LOG} ios: ${rows.length} paid rows (no-sales days: ${missing})`)
  return rows
}

// ── 플레이: sales/ 월별 zip ────────────────────────────────────────────────────
async function collectPlay(): Promise<Row[]> {
  const auth = new GoogleAuth({
    keyFile: process.env.PLAY_STATS_SA_KEY_PATH!,
    scopes: ['https://www.googleapis.com/auth/devstorage.read_only'],
  })
  const token = (await (await auth.getClient()).getAccessToken()).token
  const res = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${process.env.PLAY_STATS_BUCKET}/o?prefix=${encodeURIComponent('sales/')}&maxResults=50`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) throw new Error(`GCS sales list ${res.status}`)
  const items = ((await res.json()).items ?? []) as Array<{ name: string }>
  if (items.length === 0) {
    console.log(`${LOG} play: sales/ 리포트 미생성 (첫 정산 사이클 대기) — skip`)
    return []
  }

  const rows: Row[] = []
  const directory = fs.mkdtempSync(join(tmpdir(), 'voicecards-play-sales-'))
  try {
    for (const item of items) {
      const response = await fetch(
        `https://storage.googleapis.com/download/storage/v1/b/${process.env.PLAY_STATS_BUCKET}/o/${encodeURIComponent(item.name)}?alt=media`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!response.ok) {
        console.error(`${LOG} play ${item.name}: ${response.status}`)
        continue
      }

      const zipPath = join(directory, item.name.replaceAll('/', '_'))
      fs.writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()))
      const csvNames = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' })
        .split('\n')
        .map(name => name.trim())
        .filter(name => name.toLowerCase().endsWith('.csv'))
      for (const csvName of csvNames) {
        const csv = execFileSync('unzip', ['-p', zipPath, csvName], {
          encoding: 'utf8',
          maxBuffer: 50 * 1024 * 1024,
        })
        rows.push(...parseVoicecardsGooglePlaySalesReport(
          csv,
          process.env.VOICECARDS_ANDROID_PACKAGE_ID || 'com.monor.voicecards',
        ))
      }
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
  console.log(`${LOG} play: ${rows.length} paid rows from ${items.length} report files`)
  return rows
}

async function main() {
  console.log(`${LOG} start ${new Date().toISOString()}`)
  const all: Row[] = []
  for (const [name, fn] of [['appstore', collectAppStore], ['play', collectPlay]] as const) {
    try {
      all.push(...await fn())
    } catch (e) {
      console.error(`${LOG} ${name} skipped: ${e instanceof Error ? e.message : e}`)
    }
  }
  if (all.length === 0) { console.log(`${LOG} nothing to upsert`); return }
  // 신규 행 판별은 telegram-bot 이 store_revenue.created_at 으로 한다. 여기서 행마다
  // 존재 여부를 미리 세던 조회는 알림을 옮기면서 쓸 데가 없어져 걷어냈다.
  for (let i = 0; i < all.length; i += 500) {
    const { error } = await supabase.from('store_revenue').upsert(all.slice(i, i + 500), { onConflict: 'date,platform,product_id,currency' })
    if (error) throw new Error(`upsert failed: ${error.message}`)
  }
  console.log(`${LOG} upserted ${all.length} rows`)
}

main().catch(e => { console.error(`${LOG} FATAL`, e); process.exit(1) })
