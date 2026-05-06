// 최근 N일치 iOS Sales Report를 다시 fetch & 캐시 갱신
// 사용: npx tsx scripts/backfill-voicecards-ios.ts [days=30] [end-date=today]

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import * as jose from 'jose'
import { gunzipSync } from 'zlib'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
)

interface Creds {
  ios_issuer_id: string
  ios_key_id: string
  ios_private_key: string
  ios_app_id: string
  ios_vendor_number: string | null
}

const DOWNLOAD_TYPES = new Set(['1', '1F', '1T', 'F1', 'FI1'])
const SUBSCRIPTION_TYPES = new Set(['IAC', 'IAY'])

interface IAPStats {
  platform: 'ios'
  date: string
  revenue: number
  currency: string
  activeSubscriptions: number
  newSubscriptions: number
  churnedSubscriptions: number
  renewedSubscriptions: number
  refundCount: number
  refundAmount: number
  newDownloads: number
}

async function getCreds(): Promise<Creds | null> {
  const { data } = await supabase
    .from('voicecards_credentials')
    .select('*')
    .not('ios_issuer_id', 'is', null)
    .limit(1)
    .maybeSingle()
  return (data as Creds) ?? null
}

async function genJWT(c: Creds): Promise<string> {
  const pk = await jose.importPKCS8(c.ios_private_key, 'ES256')
  return new jose.SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: c.ios_key_id, typ: 'JWT' })
    .setIssuer(c.ios_issuer_id)
    .setIssuedAt()
    .setExpirationTime('20m')
    .setAudience('appstoreconnect-v1')
    .sign(pk)
}

async function fetchSalesTSV(jwt: string, vendor: string, date: string): Promise<string | null> {
  const ep = `/v1/salesReports?filter[reportDate]=${date}&filter[reportType]=SALES&filter[reportSubType]=SUMMARY&filter[vendorNumber]=${vendor}&filter[frequency]=DAILY`
  const res = await fetch(`https://api.appstoreconnect.apple.com${ep}`, {
    headers: { 'Authorization': `Bearer ${jwt}` },
  })
  if (!res.ok) return null
  const buf = Buffer.from(await res.arrayBuffer())
  try { return gunzipSync(buf).toString('utf-8') } catch { return buf.toString('utf-8') }
}

function parseTSV(tsv: string, date: string): IAPStats {
  const stats: IAPStats = {
    platform: 'ios', date, revenue: 0, currency: 'KRW',
    activeSubscriptions: 0, newSubscriptions: 0, churnedSubscriptions: 0,
    renewedSubscriptions: 0, refundCount: 0, refundAmount: 0, newDownloads: 0,
  }
  const lines = tsv.split('\n')
  const header = lines[0]?.split('\t') || []
  const colIdx = (n: string) => header.findIndex(h => h.trim().toLowerCase().includes(n.toLowerCase()))
  const iType = colIdx('Product Type Identifier') !== -1 ? colIdx('Product Type Identifier') : 6
  const iUnits = colIdx('Units') !== -1 ? colIdx('Units') : 7
  const iProceeds = colIdx('Developer Proceeds') !== -1 ? colIdx('Developer Proceeds') : 8

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    const cols = line.split('\t')
    if (cols.length <= iType) continue
    const productType = cols[iType]?.trim()
    const units = parseInt(cols[iUnits]) || 0
    const proceeds = parseFloat(cols[iProceeds]) || 0
    stats.revenue += proceeds
    if (DOWNLOAD_TYPES.has(productType)) stats.newDownloads += Math.max(0, units)
    if (SUBSCRIPTION_TYPES.has(productType)) {
      if (units > 0) stats.newSubscriptions += units
      if (units < 0) stats.churnedSubscriptions += Math.abs(units)
    }
  }
  return stats
}

async function saveCache(stats: IAPStats): Promise<void> {
  await supabase.from('voicecards_stats_cache').upsert({
    platform: stats.platform, date: stats.date, revenue: stats.revenue, currency: stats.currency,
    active_subscriptions: stats.activeSubscriptions, new_subscriptions: stats.newSubscriptions,
    churned_subscriptions: stats.churnedSubscriptions, renewed_subscriptions: stats.renewedSubscriptions,
    refund_count: stats.refundCount, refund_amount: stats.refundAmount,
    new_downloads: stats.newDownloads, fetched_at: new Date().toISOString(),
  }, { onConflict: 'platform,date' })
}

async function main() {
  const days = parseInt(process.argv[2] || '30')
  const endStr = process.argv[3]
  const end = endStr ? new Date(endStr) : new Date()
  const creds = await getCreds()
  if (!creds) { console.error('NO CREDS'); process.exit(1) }
  const jwt = await genJWT(creds)
  const vendor = creds.ios_vendor_number || creds.ios_app_id || ''

  console.log(`Backfill ${days} days ending ${end.toISOString().slice(0, 10)} (vendor=${vendor})\n`)

  const results: Array<{ date: string; downloads: number; revenue: number; bytes: number }> = []
  let changed = 0
  for (let i = 0; i < days; i++) {
    const d = new Date(end)
    d.setDate(d.getDate() - i)
    const date = d.toISOString().slice(0, 10)
    const tsv = await fetchSalesTSV(jwt, vendor, date)
    if (tsv == null) {
      console.log(`${date}  ❌ HTTP error`)
      continue
    }
    if (tsv.length === 0) {
      console.log(`${date}  · empty (no data yet)`)
      continue
    }
    const stats = parseTSV(tsv, date)
    await saveCache(stats)
    if (stats.newDownloads > 0 || stats.revenue > 0) changed++
    results.push({ date, downloads: stats.newDownloads, revenue: stats.revenue, bytes: tsv.length })
    console.log(`${date}  dl=${stats.newDownloads.toString().padStart(3)}  rev=${stats.revenue.toFixed(2).padStart(7)}  bytes=${tsv.length}`)
    // small rate-limit cushion
    await new Promise(r => setTimeout(r, 200))
  }

  const totalDl = results.reduce((s, r) => s + r.downloads, 0)
  const totalRev = results.reduce((s, r) => s + r.revenue, 0)
  console.log(`\nTotal: ${results.length} days fetched, ${totalDl} downloads, ${totalRev.toFixed(2)} revenue, ${changed} non-zero days`)
}

main().catch(e => { console.error(e); process.exit(1) })
