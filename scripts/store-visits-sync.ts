/**
 * 스토어 방문 지표 일일 수집 — 앱별 store_visits 테이블 upsert
 *   - voicecards: voicecards DB store_visits
 *   - portle:     port-ledger DB portle_store_visits
 *
 * 소스 2개 (앱×소스 각각 독립적으로 실패 허용 — 한쪽이 막혀도 다른 쪽은 수집):
 *  - android: 플레이 콘솔 통계 export (GCS pubsite 버킷 stats/store_performance/*.csv, UTF-16 월별 파일)
 *  - ios: App Store Connect Analytics Reports API (ONGOING 리포트, 일별 TSV.gz)
 *
 * 플레이 버킷은 개발자 계정 단위다 — VoiceCards(MonoR 계정)와 Portle(윌로우 계정)은 버킷이 다르다.
 * Portle 안드로이드는 PLAY_STATS_BUCKET_PORTLE 이 설정되면 수집을 시작한다 (그 전엔 스킵 로그만).
 * 애플은 두 앱이 같은 개발자 계정이라 키 하나로 앱 ID만 바꿔 조회한다.
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
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const LOG = '[store-visits-sync]'
// 플레이 export 가 이 일수 이상 갱신되지 않으면 "트래픽 0" 이 아니라 "수집 정지" 로 본다.
const PLAY_STALE_DAYS = 3

type Row = { date: string; platform: 'android' | 'ios'; visitors: number; impressions: number | null }

interface AppConfig {
  key: string
  label: string
  db: SupabaseClient | null
  table: string
  // 플레이 export 버킷 (개발자 계정 단위) — 미설정이면 안드로이드 수집 스킵
  play: { bucket: string; saKeyPath: string; pkg: string } | null
  asc: { appId: string } | null
  // 플레이 export 정지 감시 알림 대상 여부 (수집이 자리 잡은 앱만 — 신규 앱은 파일이 없는 게 정상)
  watchPlayStale: boolean
}

const mkClient = (url?: string, key?: string) =>
  url && key ? createClient(url, key, { auth: { persistSession: false } }) : null

const APPS: AppConfig[] = [
  {
    key: 'voicecards',
    label: '보이스카드',
    db: mkClient(process.env.VOICECARDS_SUPABASE_URL, process.env.VOICECARDS_SUPABASE_SERVICE_KEY),
    table: 'store_visits',
    play: process.env.PLAY_STATS_BUCKET && process.env.PLAY_STATS_SA_KEY_PATH
      ? { bucket: process.env.PLAY_STATS_BUCKET, saKeyPath: process.env.PLAY_STATS_SA_KEY_PATH, pkg: 'com.monor.voicecards' }
      : null,
    asc: process.env.APPSTORE_APP_ID ? { appId: process.env.APPSTORE_APP_ID } : null,
    watchPlayStale: true,
  },
  {
    key: 'portle',
    label: 'Portle',
    db: mkClient(process.env.PORTLE_SUPABASE_URL, process.env.PORTLE_SUPABASE_SECRET_KEY),
    table: 'portle_store_visits',
    // 윌로우 Play 계정의 pubsite 버킷 — 설정 전까지 안드로이드는 스킵 (SA 키는 공용 폴백)
    play: process.env.PLAY_STATS_BUCKET_PORTLE
      ? {
          bucket: process.env.PLAY_STATS_BUCKET_PORTLE,
          saKeyPath: process.env.PLAY_STATS_SA_KEY_PATH_PORTLE || process.env.PLAY_STATS_SA_KEY_PATH!,
          pkg: 'com.willowinvt.portle',
        }
      : null,
    asc: process.env.APPSTORE_APP_ID_PORTLE ? { appId: process.env.APPSTORE_APP_ID_PORTLE } : null,
    watchPlayStale: false,
  },
]

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
async function collectPlay(app: AppConfig): Promise<Row[]> {
  const play = app.play!
  const auth = new GoogleAuth({
    keyFile: play.saKeyPath,
    scopes: ['https://www.googleapis.com/auth/devstorage.read_only'],
  })
  const token = (await (await auth.getClient()).getAccessToken()).token
  const H = { Authorization: `Bearer ${token}` }

  const listRes = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${play.bucket}/o?prefix=${encodeURIComponent('stats/store_performance/')}&maxResults=500`,
    { headers: H }
  )
  if (!listRes.ok) throw new Error(`GCS list ${listRes.status}: ${JSON.stringify((await listRes.json())?.error?.message ?? '')}`)
  const items = ((await listRes.json()).items ?? []) as Array<{ name: string; updated?: string }>
  // 최근 2개월치만 재파싱 (과거는 이미 확정)
  const now = new Date()
  const months: string[] = []
  for (const back of [0, 1]) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1)
    months.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  // country 분해 파일 하나만 사용 — country/traffic_source 를 둘 다 합치면 같은 날이 이중집계됨
  // (total_* 파일은 acquisitions만 있어 제외). 2026-07-14 이중집계 발견 후 고정.
  // 패키지명까지 필터 — 한 버킷(=개발자 계정)에 앱이 여러 개면 남의 앱 수치가 섞인다.
  const isCountryFile = (n: string) =>
    n.includes(`/store_performance_${play.pkg}_`) && n.endsWith('_country.csv') && !n.includes('/total_')
  const targets = items.filter(o => isCountryFile(o.name) && months.some(m => o.name.includes(m)))
  // 첫 실행: 전체 히스토리 백필 (테이블이 비어 있을 때)
  const { count } = await app.db!.from(app.table).select('*', { count: 'exact', head: true }).eq('platform', 'android')
  const files = (count ?? 0) === 0 ? items.filter(o => isCountryFile(o.name)) : targets

  // 신선도 감시: 플레이 export 가 멈추면 행이 안 늘 뿐 에러가 나지 않는다 →
  // "트래픽이 0" 과 "파일이 안 온다" 가 DB 에서 똑같이 보인다. 여기서 구분해 둔다.
  // (2026-08-04: store_performance 가 7/29 이후 갱신 정지, ratings 는 정상인 상태를 겪음)
  const newest = targets.map(o => o.updated ?? '').filter(Boolean).sort().pop()
  if (newest) {
    const staleDays = Math.floor((Date.now() - Date.parse(newest)) / 86_400_000)
    console.log(`${LOG} ${app.key}/play: 최신 store_performance 파일 갱신 ${newest.slice(0, 10)} (${staleDays}일 전)`)
    if (app.watchPlayStale && staleDays >= PLAY_STALE_DAYS) {
      await notifyCeo(`⚠️ ${app.label} 플레이 스토어 통계 export 정지 의심\nstore_performance 파일이 ${staleDays}일째(${newest.slice(0, 10)}) 갱신되지 않았습니다.\n안드로이드 스토어 방문 수치는 그 이후로 "0" 이 아니라 "미상"으로 보셔야 합니다.`)
    }
  } else {
    console.error(`${LOG} ${app.key}/play: 대상 월(${months.join(', ')}) 파일이 하나도 없습니다`)
  }
  console.log(`${LOG} ${app.key}/play: ${files.length} file(s) to parse (backfill=${(count ?? 0) === 0})`)

  const byDate = new Map<string, { visitors: number; impressions: number }>()
  for (const f of files) {
    const res = await fetch(`https://storage.googleapis.com/storage/v1/b/${play.bucket}/o/${encodeURIComponent(f.name)}?alt=media`, { headers: H })
    if (!res.ok) { console.error(`${LOG} ${app.key}/play: download failed ${f.name} (${res.status})`); continue }
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
      console.log(`${LOG} ${app.key}/play: header not matched in ${f.name}: ${rows[0].join(' | ')}`)
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
  // 노출(impressions)은 항상 null 이다 — 버그가 아니라 플레이가 안 준다.
  // store_performance CSV 의 컬럼은 acquisitions / visitors / conversion rate 뿐이고
  // (traffic_source, total_* 파일도 동일) 노출 지표는 export 에 존재하지 않는다.
  // 안드로이드 노출은 Play Console 화면에서만 볼 수 있다. (2026-08-04 전 파일 헤더 확인)
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

async function collectAppStore(app: AppConfig): Promise<Row[]> {
  const jwt = await ascToken()
  const H = { Authorization: `Bearer ${jwt}` }
  const appId = app.asc!.appId
  const api = 'https://api.appstoreconnect.apple.com'

  // ONGOING(일별 증분) + ONE_TIME_SNAPSHOT(과거 백필) 모두 순회 — upsert라 겹쳐도 안전
  const reqs = await (await fetch(`${api}/v1/apps/${appId}/analyticsReportRequests`, { headers: H })).json()
  const reqIds: string[] = (reqs.data ?? []).map((r: { id: string }) => r.id)
  if (reqIds.length === 0) throw new Error('no analyticsReportRequest')

  // 스토어 방문 = "App Store Discovery and Engagement" 리포트 (노출·제품 페이지 조회)
  const reportIds: string[] = []
  const seenNames: string[] = []
  for (const reqId of reqIds) {
    const reports = await (await fetch(`${api}/v1/analyticsReportRequests/${reqId}/reports?limit=200`, { headers: H })).json()
    for (const r of reports.data ?? []) {
      seenNames.push(r.attributes.name)
      // 정확히 메인 스토어 퍼널 리포트만 — Web Preview/Notification 'Engagement' 류 오매칭과
      // Standard+Detailed 이중집계 방지 (2026-07-14 리포트 목록 확인 후 고정)
      if (/^app store discovery and engagement standard$/i.test(r.attributes.name.trim())) reportIds.push(r.id)
    }
  }
  if (reportIds.length === 0) {
    throw new Error(`discovery report not ready yet (available: ${[...new Set(seenNames)].slice(0, 5).join(', ') || 'none'})`)
  }

  const instanceIds: string[] = []
  for (const reportId of reportIds) {
    const instances = await (await fetch(`${api}/v1/analyticsReports/${reportId}/instances?filter[granularity]=DAILY&limit=200`, { headers: H })).json()
    instanceIds.push(...(instances.data ?? []).map((i: { id: string }) => i.id))
  }
  const byDate = new Map<string, { visitors: number; impressions: number }>()
  for (const instId of instanceIds) {
    const inst = { id: instId }
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
async function syncApp(app: AppConfig) {
  if (!app.db) { console.log(`${LOG} ${app.key}: DB 미설정 — 스킵`); return }
  const all: Row[] = []
  const sources: Array<['play' | 'appstore', () => Promise<Row[]>]> = []
  if (app.play) sources.push(['play', () => collectPlay(app)])
  else console.log(`${LOG} ${app.key}/play: 버킷 미설정 — 스킵`)
  if (app.asc) sources.push(['appstore', () => collectAppStore(app)])
  else console.log(`${LOG} ${app.key}/appstore: 앱 ID 미설정 — 스킵`)

  for (const [name, fn] of sources) {
    try {
      const rows = await fn()
      console.log(`${LOG} ${app.key}/${name}: ${rows.length} day-rows`)
      all.push(...rows)
    } catch (e) {
      console.error(`${LOG} ${app.key}/${name} skipped: ${e instanceof Error ? e.message : e}`)
    }
  }
  if (all.length === 0) { console.log(`${LOG} ${app.key}: nothing to upsert`); return }
  // iOS 첫 유입 감지 (upsert 전 기준) → CEO 텔레그램 원샷 알림
  const { count: iosBefore } = await app.db.from(app.table).select('*', { count: 'exact', head: true }).eq('platform', 'ios')
  const CHUNK = 500
  for (let i = 0; i < all.length; i += CHUNK) {
    const { error } = await app.db.from(app.table).upsert(all.slice(i, i + CHUNK), { onConflict: 'date,platform' })
    if (error) throw new Error(`${app.key} upsert failed: ${error.message}`)
  }
  console.log(`${LOG} ${app.key}: upserted ${all.length} rows`)
  const iosRows = all.filter(r => r.platform === 'ios')
  if ((iosBefore ?? 0) === 0 && iosRows.length > 0) {
    await notifyCeo(`🍎 ${app.label} 애플 스토어 방문 데이터 수집 시작\n${iosRows.length}일치 백필 완료 (페이지뷰 합계 ${iosRows.reduce((s2, r) => s2 + r.visitors, 0).toLocaleString()}건)\n대시보드 '스토어 방문' 카드와 설치율 분모가 완성됐습니다.`)
  }
}

async function main() {
  console.log(`${LOG} start ${new Date().toISOString()}`)
  for (const app of APPS) {
    try {
      await syncApp(app)
    } catch (e) {
      console.error(`${LOG} ${app.key} FAILED: ${e instanceof Error ? e.message : e}`)
    }
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
