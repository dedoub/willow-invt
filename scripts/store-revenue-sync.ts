/**
 * 스토어 실판매 일일 수집 — voicecards store_revenue 테이블 upsert
 *
 *  - ios: ASC Sales and Trends 일별 리포트 (유료 행만: Developer Proceeds > 0). 1~2일 지연.
 *         첫 실행 시 2026-05-01부터 백필, 이후 최근 7일 재수집(확정치 갱신).
 *  - android: 플레이 GCS sales/ 월별 zip — 파일이 생성되면 자동 합류 (현재 미생성, graceful skip).
 *
 * 통화는 원본 보존 (customer currency 단위 units, proceeds는 proceeds_currency).
 * launchd: com.willow.store-visits-sync 러너에서 방문 수집 후 이어서 실행.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import fs from 'fs'
import zlib from 'zlib'
import * as jose from 'jose'
import { GoogleAuth } from 'google-auth-library'
import { createClient } from '@supabase/supabase-js'

const LOG = '[store-revenue-sync]'
const supabase = createClient(
  process.env.VOICECARDS_SUPABASE_URL!,
  process.env.VOICECARDS_SUPABASE_SERVICE_KEY!,
  { auth: { persistSession: false } }
)

type Row = {
  date: string; platform: 'android' | 'ios'; product_id: string
  currency: string; units: number; proceeds: number; proceeds_currency: string | null
}

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
    const lines = text.split('\n').filter(Boolean)
    if (lines.length < 2) continue
    const header = lines[0].split('\t').map(h => h.trim().toLowerCase())
    const idx = (name: string) => header.findIndex(h => h === name)
    const iSku = idx('sku'), iUnits = idx('units'), iProceeds = idx('developer proceeds')
    const iCur = idx('customer currency'), iPCur = idx('currency of proceeds'), iType = idx('product type identifier')
    for (const line of lines.slice(1)) {
      const c = line.split('\t')
      const proceeds = Number(c[iProceeds]) || 0
      if (proceeds <= 0) continue // 무료 다운로드/업데이트 행 제외 — 매출만
      rows.push({
        date: d, platform: 'ios',
        product_id: `${c[iSku] ?? ''}${iType >= 0 ? `:${c[iType]}` : ''}`,
        currency: c[iCur] ?? 'USD',
        units: Number(c[iUnits]) || 0,
        proceeds,
        proceeds_currency: iPCur >= 0 ? (c[iPCur] || null) : null,
      })
    }
  }
  console.log(`${LOG} ios: ${rows.length} paid rows (no-sales days: ${missing})`)
  return rows
}

// ── 플레이: sales/ 월별 zip — 생성되면 파싱, 지금은 존재 확인만 ──────────────────
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
  // TODO: 첫 파일이 생기면 zip 내부 CSV 스키마 확인 후 파싱 구현 (Transaction Date / Product ID /
  //       Buyer Currency / Amount ... — 실물 확인 전 추측 구현은 하지 않음)
  console.log(`${LOG} play: ${items.length}개 sales 파일 발견 — 파서 미구현, 파일명: ${items.map(i => i.name).join(', ')}`)
  return []
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
  // 신규 행 감지 (upsert 전 존재 여부) — 확정 실액 후속 알림용
  const fresh: Row[] = []
  for (const r of all) {
    const { count } = await supabase.from('store_revenue').select('*', { count: 'exact', head: true })
      .eq('date', r.date).eq('platform', r.platform).eq('product_id', r.product_id).eq('currency', r.currency)
    if ((count ?? 0) === 0) fresh.push(r)
  }
  for (let i = 0; i < all.length; i += 500) {
    const { error } = await supabase.from('store_revenue').upsert(all.slice(i, i + 500), { onConflict: 'date,platform,product_id,currency' })
    if (error) throw new Error(`upsert failed: ${error.message}`)
  }
  console.log(`${LOG} upserted ${all.length} rows (${fresh.length} new)`)
  if (fresh.length > 0) {
    const lines = fresh.map(r =>
      `${r.date} ${r.platform === 'ios' ? 'iOS' : 'Android'} · ${r.product_id} × ${r.units} · 결제통화 ${r.currency} → 실수령 ${r.proceeds}${r.proceeds_currency ? ` ${r.proceeds_currency}` : ''}`
    )
    await notifyCeo(`💵 스토어 정산 확정 (실제 금액)\n${lines.slice(0, 8).join('\n')}`)
  }
}

// CEO 텔레그램 알림 (메인 DB telegram_conversations에서 chat_id 조회, 실패해도 수집엔 영향 없음)
async function notifyCeo(text: string) {
  try {
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
    console.log(`${LOG} CEO notified`)
  } catch (e) {
    console.error(`${LOG} notify failed:`, e instanceof Error ? e.message : e)
  }
}

main().catch(e => { console.error(`${LOG} FATAL`, e); process.exit(1) })
