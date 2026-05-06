// Apple App Store Connect API 직접 호출 진단
// 사용: npx tsx scripts/diagnose-voicecards-ios.ts [YYYY-MM-DD]
// 기본 날짜: 어제(KST 기준)

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

async function getCreds(): Promise<Creds | null> {
  const { data, error } = await supabase
    .from('voicecards_credentials')
    .select('*')
    .not('ios_issuer_id', 'is', null)
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('Supabase error:', error)
    return null
  }
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

async function fetchReport(
  jwt: string, vendor: string, date: string, reportType: string,
): Promise<{ ok: boolean; status?: number; tsv?: string; err?: string }> {
  const ep = `/v1/salesReports?filter[reportDate]=${date}&filter[reportType]=${reportType}&filter[reportSubType]=SUMMARY&filter[vendorNumber]=${vendor}&filter[frequency]=DAILY`
  const res = await fetch(`https://api.appstoreconnect.apple.com${ep}`, {
    headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    return { ok: false, status: res.status, err: t }
  }
  const buf = Buffer.from(await res.arrayBuffer())
  let tsv: string
  try { tsv = gunzipSync(buf).toString('utf-8') } catch { tsv = buf.toString('utf-8') }
  return { ok: true, tsv }
}

async function main() {
  const date = process.argv[2] || (() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d.toISOString().split('T')[0]
  })()

  const creds = await getCreds()
  if (!creds) { console.error('NO CREDS in voicecards_credentials'); process.exit(1) }
  console.log(`vendor=${creds.ios_vendor_number}, app_id=${creds.ios_app_id}, key_id=${creds.ios_key_id}`)

  const jwt = await genJWT(creds)
  const vendor = creds.ios_vendor_number || creds.ios_app_id || ''

  for (const t of ['SALES', 'SUBSCRIPTION', 'SUBSCRIPTION_EVENT'] as const) {
    console.log(`\n========== ${t} ${date} ==========`)
    const r = await fetchReport(jwt, vendor, date, t)
    if (!r.ok) {
      console.log(`HTTP ${r.status}\n${r.err?.substring(0, 800) ?? ''}`)
      continue
    }
    const tsv = r.tsv!
    console.log(`OK, bytes=${tsv.length}`)
    if (tsv.length === 0) {
      console.log('(empty body — Apple returned 200 with no rows)')
      continue
    }
    const preview = tsv.length > 3000 ? tsv.substring(0, 3000) + `\n... (truncated, total ${tsv.length})` : tsv
    console.log(`--- TSV ---\n${preview}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
