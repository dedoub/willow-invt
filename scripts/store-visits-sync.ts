/**
 * 스토어 방문 지표 일일 수집 — voicecards store_visits 테이블 upsert
 *
 * 소스 2개 (각각 독립적으로 실패 허용 — 한쪽이 막혀도 다른 쪽은 수집):
 *  - android: 플레이 콘솔 통계 export (GCS pubsite 버킷 stats/store_performance/*.csv, UTF-16 월별 파일)
 *  - ios: App Store Connect Analytics Reports API (ONGOING 리포트, 일별 TSV.gz)
 *
 * 스토어 리포트는 1~2일 지연되므로 매일 아침 최근 파일을 통째로 재파싱해 upsert(멱등).
 * launchd: com.willow.store-visits-sync (매일 09:10)
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import fs from 'fs'
import zlib from 'zlib'
import * as jose from 'jose'
import { GoogleAuth } from 'google-auth-library'
import { createClient } from '@supabase/supabase-js'

const LOG = '[store-visits-sync]'
const supabase = createClient(
  process.env.VOICECARDS_SUPABASE_URL!,
  process.env.VOICECARDS_SUPABASE_SERVICE_KEY!,
  { auth: { persistSession: false } }
)

type Row = { date: string; platform: 'android' | 'ios'; visitors: number; impressions: number | null }

// ── 공통: 따옴표 지원 단순 CSV/TSV 파서 ─────────────────────────────────────────
function parseDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const cells: string[] = []
    let cur = ''
    let inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
        else if (ch === '"') inQ = false
        else cur += ch
      } else if (ch === '"') inQ = true
      else if (ch === delim) { cells.push(cur); cur = '' }
      else cur += ch
    }
    cells.push(cur)
    rows.push(cells.map(c => c.trim()))
  }
  return rows
}

const normDate = (s: string): string | null => {
  const m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null
}

// ── 플레이: GCS store_performance 월별 CSV ──────────────────────────────────────
async function collectPlay(): Promise<Row[]> {
  const auth = new GoogleAuth({
    keyFile: process.env.PLAY_STATS_SA_KEY_PATH!,
    scopes: ['https://www.googleapis.com/auth/devstorage.read_only'],
  })
  const token = (await (await auth.getClient()).getAccessToken()).token
  const bucket = process.env.PLAY_STATS_BUCKET!
  const H = { Authorization: `Bearer ${token}` }

  const listRes = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${bucket}/o?prefix=${encodeURIComponent('stats/store_performance/')}&maxResults=500`,
    { headers: H }
  )
  if (!listRes.ok) throw new Error(`GCS list ${listRes.status}: ${JSON.stringify((await listRes.json())?.error?.message ?? '')}`)
  const items = ((await listRes.json()).items ?? []) as Array<{ name: string }>
  // 최근 2개월치만 재파싱 (과거는 이미 확정)
  const now = new Date()
  const months: string[] = []
  for (const back of [0, 1]) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1)
    months.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const targets = items.filter(o => o.name.endsWith('.csv') && months.some(m => o.name.includes(m)))
  // 첫 실행: 전체 히스토리 백필 (테이블이 비어 있을 때)
  const { count } = await supabase.from('store_visits').select('*', { count: 'exact', head: true }).eq('platform', 'android')
  const files = (count ?? 0) === 0 ? items.filter(o => o.name.endsWith('.csv')) : targets
  console.log(`${LOG} play: ${files.length} file(s) to parse (backfill=${(count ?? 0) === 0})`)

  const byDate = new Map<string, { visitors: number; impressions: number }>()
  for (const f of files) {
    const res = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(f.name)}?alt=media`, { headers: H })
    if (!res.ok) { console.error(`${LOG} play: download failed ${f.name} (${res.status})`); continue }
    const buf = Buffer.from(await res.arrayBuffer())
    // 플레이 통계 CSV는 UTF-16LE(BOM) — BOM 감지 후 디코딩
    const text = buf[0] === 0xff && buf[1] === 0xfe ? buf.toString('utf16le') : buf.toString('utf8')
    const rows = parseDelimited(text, ',')
    if (rows.length < 2) continue
    const header = rows[0].map(h => h.toLowerCase().replace(/^﻿/, ''))
    const dateIdx = header.findIndex(h => h === 'date' || h === '날짜')
    const visIdx = header.findIndex(h => /visitor|방문/.test(h))
    const impIdx = header.findIndex(h => /impression|노출/.test(h))
    if (dateIdx < 0 || visIdx < 0) {
      console.log(`${LOG} play: header not matched in ${f.name}: ${rows[0].join(' | ')}`)
      continue
    }
    for (const r of rows.slice(1)) {
      const date = normDate(r[dateIdx] ?? '')
      if (!date) continue
      const cur = byDate.get(date) ?? { visitors: 0, impressions: 0 }
      cur.visitors += Number(r[visIdx]?.replace(/,/g, '')) || 0
      if (impIdx >= 0) cur.impressions += Number(r[impIdx]?.replace(/,/g, '')) || 0
      byDate.set(date, cur)
    }
  }
  return Array.from(byDate.entries()).map(([date, v]) => ({
    date, platform: 'android' as const, visitors: v.visitors, impressions: v.impressions || null,
  }))
}

// ── 앱스토어: Analytics Reports API (ONGOING) ──────────────────────────────────
async function ascToken(): Promise<string> {
  const pk = await jose.importPKCS8(fs.readFileSync(process.env.APPSTORE_PRIVATE_KEY_PATH!, 'utf8'), 'ES256')
  return await new jose.SignJWT({ aud: 'appstoreconnect-v1' })
    .setProtectedHeader({ alg: 'ES256', kid: process.env.APPSTORE_KEY_ID!, typ: 'JWT' })
    .setIssuer(process.env.APPSTORE_ISSUER_ID!).setIssuedAt().setExpirationTime('15m').sign(pk)
}

async function collectAppStore(): Promise<Row[]> {
  const jwt = await ascToken()
  const H = { Authorization: `Bearer ${jwt}` }
  const appId = process.env.APPSTORE_APP_ID!
  const api = 'https://api.appstoreconnect.apple.com'

  const reqs = await (await fetch(`${api}/v1/apps/${appId}/analyticsReportRequests?filter[accessType]=ONGOING`, { headers: H })).json()
  const reqId = reqs.data?.[0]?.id
  if (!reqId) throw new Error('no ONGOING analyticsReportRequest')

  // 스토어 방문 = "App Store Discovery and Engagement" 리포트 (노출·제품 페이지 조회)
  const reports = await (await fetch(`${api}/v1/analyticsReportRequests/${reqId}/reports?limit=200`, { headers: H })).json()
  const report = (reports.data ?? []).find((r: { attributes: { name: string } }) => /discovery|engagement/i.test(r.attributes.name))
  if (!report) {
    const names = (reports.data ?? []).map((r: { attributes: { name: string } }) => r.attributes.name)
    throw new Error(`discovery report not ready yet (available: ${names.slice(0, 5).join(', ') || 'none'})`)
  }

  const instances = await (await fetch(`${api}/v1/analyticsReports/${report.id}/instances?filter[granularity]=DAILY&limit=200`, { headers: H })).json()
  const byDate = new Map<string, { visitors: number; impressions: number }>()
  for (const inst of instances.data ?? []) {
    const segs = await (await fetch(`${api}/v1/analyticsReportInstances/${inst.id}/segments`, { headers: H })).json()
    for (const seg of segs.data ?? []) {
      const gz = await fetch(seg.attributes.url)
      if (!gz.ok) continue
      const text = zlib.gunzipSync(Buffer.from(await gz.arrayBuffer())).toString('utf8')
      const rows = parseDelimited(text, '\t')
      if (rows.length < 2) continue
      const header = rows[0].map(h => h.toLowerCase())
      const dateIdx = header.findIndex(h => h === 'date')
      const eventIdx = header.findIndex(h => h === 'event')
      const cntIdx = header.findIndex(h => /unique.*(count|device)/.test(h))
      const cntIdx2 = header.findIndex(h => h === 'counts' || h === 'count')
      if (dateIdx < 0) continue
      for (const r of rows.slice(1)) {
        const date = normDate(r[dateIdx] ?? '')
        if (!date) continue
        const event = eventIdx >= 0 ? (r[eventIdx] ?? '').toLowerCase() : ''
        const n = Number(r[cntIdx >= 0 ? cntIdx : cntIdx2]?.replace(/,/g, '')) || 0
        const cur = byDate.get(date) ?? { visitors: 0, impressions: 0 }
        if (/page view/.test(event)) cur.visitors += n
        else if (/impression/.test(event)) cur.impressions += n
        byDate.set(date, cur)
      }
    }
  }
  return Array.from(byDate.entries())
    .filter(([, v]) => v.visitors > 0 || v.impressions > 0)
    .map(([date, v]) => ({ date, platform: 'ios' as const, visitors: v.visitors, impressions: v.impressions || null }))
}

// ── main ────────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`${LOG} start ${new Date().toISOString()}`)
  const all: Row[] = []
  for (const [name, fn] of [['play', collectPlay], ['appstore', collectAppStore]] as const) {
    try {
      const rows = await fn()
      console.log(`${LOG} ${name}: ${rows.length} day-rows`)
      all.push(...rows)
    } catch (e) {
      console.error(`${LOG} ${name} skipped: ${e instanceof Error ? e.message : e}`)
    }
  }
  if (all.length === 0) { console.log(`${LOG} nothing to upsert`); return }
  const CHUNK = 500
  for (let i = 0; i < all.length; i += CHUNK) {
    const { error } = await supabase.from('store_visits').upsert(all.slice(i, i + CHUNK), { onConflict: 'date,platform' })
    if (error) throw new Error(`upsert failed: ${error.message}`)
  }
  console.log(`${LOG} upserted ${all.length} rows`)
}

main().catch(e => { console.error(`${LOG} FATAL`, e); process.exit(1) })
