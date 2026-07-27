/**
 * IndexNow — 발행 즉시 색인 엔진에 통보.
 *
 * 구글은 크롤 시점을 자기가 정하지만 Bing·Yandex·Seznam·Naver는 IndexNow 핑을 받으면
 * 바로 가지러 온다. 우리 병목이 색인 거부가 아니라 발견 지연이라 이쪽이 직접 듣는다.
 *
 * 같은 URL을 반복해서 쏘면 스팸 취급이라, 이미 보낸 URL은 seo_indexnow_submitted에
 * 적어두고 사이트맵과 비교해 새로 생긴 것만 보낸다.
 *
 * 키는 각 사이트가 자기 도메인 루트에 <key>.txt로 호스팅한다(그게 소유 증명이다).
 * HTML·URL에 그대로 실려 나가는 공개값이라 env로 숨길 이유가 없다.
 */

import { supabase } from './supabase'

export interface IndexNowSite {
  key: string
  host: string
  /** https://<host>/<indexKey>.txt 로 접근 가능해야 한다 */
  indexKey: string
}

export const INDEXNOW_SITES: IndexNowSite[] = [
  { key: 'voicecards', host: 'voicecards.quest', indexKey: '753d1cd9057ce620b226c0552e889eb6' },
  { key: 'reviewnotes', host: 'reviewnotes.app', indexKey: '9c11942ff47a213900b9169cae503395' },
  { key: 'valuechain', host: 'valuechain.wiki', indexKey: 'debb10663e050e40fcaa238c9fc589b5' },
]

/** 한 번에 보낼 수 있는 상한은 10,000. 그보다 잘게 끊어 실패 반경을 줄인다 */
const BATCH = 2_000

/** 사이트맵의 <loc>를 원문 그대로 모은다. 색인 요청은 정규화 전 URL이어야 한다 */
async function fetchSitemapUrls(host: string, depth = 0, url?: string): Promise<string[]> {
  const target = url ?? `https://${host}/sitemap.xml`
  const res = await fetch(target, {
    headers: { 'User-Agent': 'WillowDashboard/1.0 (+indexnow)' },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`sitemap ${res.status} ${target}`)
  const xml = await res.text()
  const locs = Array.from(xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)).map(m => m[1])

  if (/<sitemapindex/i.test(xml)) {
    if (depth >= 2) return []
    const out: string[] = []
    for (const child of locs.slice(0, 20)) out.push(...await fetchSitemapUrls(host, depth + 1, child))
    return out
  }
  // 다른 호스트가 섞여 들어오면 IndexNow가 통째로 422를 낸다
  return locs.filter(u => { try { return new URL(u).host === host } catch { return false } })
}

export interface IndexNowResult {
  siteKey: string
  sitemapUrls: number
  newUrls: number
  submitted: number
  status: number | null
  error?: string
}

/**
 * 사이트맵에서 아직 안 보낸 URL만 골라 제출한다.
 * 성공(2xx)한 것만 기록에 남겨, 실패한 배치는 다음 실행에서 다시 시도된다.
 */
export async function submitNewUrls(site: IndexNowSite): Promise<IndexNowResult> {
  const base: IndexNowResult = { siteKey: site.key, sitemapUrls: 0, newUrls: 0, submitted: 0, status: null }
  let urls: string[]
  try {
    urls = await fetchSitemapUrls(site.host)
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : String(err) }
  }
  base.sitemapUrls = urls.length
  if (urls.length === 0) return base

  const { data, error } = await supabase
    .from('seo_indexnow_submitted')
    .select('url')
    .eq('site_key', site.key)
  if (error) return { ...base, error: `기록 조회 실패: ${error.message}` }

  const known = new Set((data ?? []).map(r => r.url as string))
  const fresh = urls.filter(u => !known.has(u))
  base.newUrls = fresh.length
  if (fresh.length === 0) return base

  let lastStatus: number | null = null
  for (let i = 0; i < fresh.length; i += BATCH) {
    const chunk = fresh.slice(i, i + BATCH)
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: site.host,
        key: site.indexKey,
        keyLocation: `https://${site.host}/${site.indexKey}.txt`,
        urlList: chunk,
      }),
    })
    lastStatus = res.status
    // 403은 키 파일 미검증, 422는 host/URL 불일치. 둘 다 기록을 남기면 안 된다
    if (res.status >= 300) {
      const body = await res.text().catch(() => '')
      return { ...base, status: res.status, error: `IndexNow ${res.status} ${body.slice(0, 160)}` }
    }
    const rows = chunk.map(url => ({ site_key: site.key, url }))
    const { error: insErr } = await supabase.from('seo_indexnow_submitted').upsert(rows, { onConflict: 'site_key,url' })
    if (insErr) return { ...base, status: res.status, submitted: base.submitted, error: `기록 저장 실패: ${insErr.message}` }
    base.submitted += chunk.length
  }
  return { ...base, status: lastStatus }
}
