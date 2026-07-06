/**
 * VoiceCards 국가 백필 — anonymous_events.country 를 ip_address 로부터 채운다.
 *
 * A(기본): geoip-lite 로컬 GeoLite2 조회 (오프라인, IP 외부전송 없음)
 * B(폴백): geoip-lite 가 못 푸는 IP만 ip-api.com 배치 (무료·키없음, 100/req, 15 req/min)
 *
 * real_users/deduped 는 anonymous_events 뷰라 base 테이블만 UPDATE 하면 반영됨.
 * 실행:  npx tsx scripts/voicecards-country-backfill.ts [--dry]
 * 스케줄: launchd 일 1회 (crontab 금지)
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import geoip from 'geoip-lite'

const DRY = process.argv.includes('--dry')

// UPDATE 는 anonymous_events RLS(anon: INSERT/SELECT만)로 막히므로 service_role 키 필요.
const url = process.env.VOICECARDS_SUPABASE_URL
const key = process.env.VOICECARDS_SUPABASE_SERVICE_KEY
if (!url || !key) {
  console.error('VOICECARDS_SUPABASE_URL / VOICECARDS_SUPABASE_SERVICE_KEY 미설정 (anon 키는 RLS로 country UPDATE 불가)')
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// 1) country IS NULL 인 이벤트의 distinct ip_address 수집 (페이지네이션)
async function collectNullIps(): Promise<string[]> {
  const ips = new Set<string>()
  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data, error } = await sb
      .from('anonymous_events')
      .select('ip_address')
      .is('country', null)
      .not('ip_address', 'is', null)
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data?.length) break
    for (const r of data as Array<{ ip_address: string | null }>) {
      if (r.ip_address) ips.add(String(r.ip_address))
    }
    if (data.length < PAGE) break
    from += PAGE
  }
  return [...ips]
}

// 2-B) ip-api.com 배치 폴백
async function ipApiBatch(ips: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const CHUNK = 100
  for (let i = 0; i < ips.length; i += CHUNK) {
    const chunk = ips.slice(i, i + CHUNK)
    try {
      const res = await fetch('http://ip-api.com/batch?fields=query,countryCode,status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk),
      })
      if (!res.ok) { console.warn(`ip-api ${res.status}, chunk skip`); continue }
      const arr = (await res.json()) as Array<{ query: string; countryCode?: string; status: string }>
      for (const it of arr) {
        if (it.status === 'success' && it.countryCode) out.set(it.query, it.countryCode)
      }
    } catch (e) {
      console.warn('ip-api chunk 실패:', e)
    }
    if (i + CHUNK < ips.length) await sleep(4500) // 15 req/min 여유
  }
  return out
}

async function main() {
  const t0 = Date.now()
  const ips = await collectNullIps()
  console.log(`country NULL 이벤트의 distinct IP: ${ips.length}개`)
  if (ips.length === 0) { console.log('채울 것 없음. 종료.'); return }

  // A) geoip-lite 로컬 조회
  const resolved = new Map<string, string>()
  const misses: string[] = []
  for (const ip of ips) {
    const cc = geoip.lookup(ip)?.country
    if (cc) resolved.set(ip, cc)
    else misses.push(ip)
  }
  console.log(`A(geoip-lite) 해결: ${resolved.size} · 미해결: ${misses.length}`)

  // B) 폴백 — geoip-lite 실패분만 ip-api.com
  if (misses.length > 0) {
    const fb = await ipApiBatch(misses)
    for (const [ip, cc] of fb) resolved.set(ip, cc)
    console.log(`B(ip-api) 추가 해결: ${fb.size} · 최종 미해결: ${misses.length - fb.size}`)
  }

  if (DRY) {
    const sample = [...resolved.entries()].slice(0, 10).map(([ip, cc]) => `${ip}→${cc}`).join(', ')
    console.log(`[DRY] 업데이트 예정 IP ${resolved.size}개. 샘플: ${sample}`)
    return
  }

  // 3) IP별 UPDATE (country IS NULL 인 행만)
  let updatedIps = 0
  let failed = 0
  for (const [ip, cc] of resolved) {
    const { error } = await sb
      .from('anonymous_events')
      .update({ country: cc })
      .eq('ip_address', ip)
      .is('country', null)
    if (error) { failed++; if (failed <= 5) console.warn(`UPDATE 실패 ${ip}:`, error.message) }
    else updatedIps++
  }
  console.log(`완료: IP ${updatedIps}개 업데이트, 실패 ${failed}개, ${(Date.now() - t0) / 1000}s`)
}

main().catch(e => { console.error(e); process.exit(1) })
