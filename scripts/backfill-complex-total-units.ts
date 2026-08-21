/**
 * 단지 총세대수 + 평형별 세대수 백필
 * - 네이버 부동산 단지 페이지를 Playwright로 방문해
 *   complexPyeongDetailList(평형별 면적/세대수)와 총세대수를 수집
 * - re_complexes.total_units 업데이트 + re_complex_pyeongs upsert
 * - 합산 시가총액 차트(평형별 세대수 × 공급면적 × 평당가)의 기반 데이터
 *
 * 사용법:
 *   npx tsx scripts/backfill-complex-total-units.ts          # 수집 + DB 업데이트
 *   npx tsx scripts/backfill-complex-total-units.ts --dry    # 수집만 (DB 미변경)
 *   npx tsx scripts/backfill-complex-total-units.ts --headed # 브라우저 표시
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

const dry = process.argv.includes('--dry')
const headed = process.argv.includes('--headed')
// --only 단지명1,단지명2 : 특정 단지만 재수집
const onlyArg = process.argv.find(a => a.startsWith('--only='))
const only = onlyArg ? onlyArg.slice('--only='.length).split(',').map(s => s.trim()).filter(Boolean) : null

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const randomDelay = () => 4000 + Math.random() * 4000

type PyeongRow = {
  pyeong_name: string
  supply_sqm: number | null
  exclusive_sqm: number | null
  household_count: number
}

// JSON 응답 어디에 있든 세대수 키를 찾는다 (API 스키마 변화에 견디게)
const HOUSEHOLD_KEYS = ['totalHouseholdCount', 'totalHouseholdNumber', 'totalHouseHoldCount']
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findHouseholdCount(obj: any, depth = 0): number | null {
  if (!obj || typeof obj !== 'object' || depth > 6) return null
  for (const key of HOUSEHOLD_KEYS) {
    const v = Number(obj[key])
    if (Number.isFinite(v) && v > 0) return v
  }
  for (const v of Object.values(obj)) {
    const found = findHouseholdCount(v, depth + 1)
    if (found) return found
  }
  return null
}

// complexPyeongDetailList 배열을 깊이 탐색으로 찾는다
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findPyeongList(obj: any, depth = 0): any[] | null {
  if (!obj || typeof obj !== 'object' || depth > 6) return null
  if (Array.isArray(obj.complexPyeongDetailList) && obj.complexPyeongDetailList.length > 0) {
    return obj.complexPyeongDetailList
  }
  for (const v of Object.values(obj)) {
    const found = findPyeongList(v, depth + 1)
    if (found) return found
  }
  return null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPyeongRows(list: any[]): PyeongRow[] {
  const rows: PyeongRow[] = []
  const seen = new Set<string>()
  for (const p of list) {
    let name = String(p.pyeongName2 || p.pyeongName || p.pyeongNo || '').trim()
    if (!name) continue
    // 같은 평형명이 여러 타입으로 나뉘는 단지가 있다 — pyeongNo로 유니크 보장
    if (seen.has(name)) name = `${name}#${p.pyeongNo}`
    seen.add(name)
    const supply = Number(p.supplyArea ?? p.supplyAreaDouble)
    const exclusive = Number(p.exclusiveArea ?? p.exclusiveAreaDouble)
    const households = Number(p.householdCountByPyeong ?? p.householdCount)
    rows.push({
      pyeong_name: name,
      supply_sqm: Number.isFinite(supply) && supply > 0 ? supply : null,
      exclusive_sqm: Number.isFinite(exclusive) && exclusive > 0 ? exclusive : null,
      household_count: Number.isFinite(households) && households > 0 ? Math.round(households) : 0,
    })
  }
  return rows
}

async function main() {
  // 추적 단지 + 네이버 단지번호 (스냅샷 데이터에서 역참조)
  const { data: tracked } = await supabase
    .from('re_complexes').select('name').eq('is_tracked', true)
  const names = tracked?.map(c => c.name) || []

  // 단지별로 1행씩 조회 (테이블이 커서 일괄 조회로는 일부 단지만 잡힌다)
  const complexNo: Record<string, string> = {}
  for (const name of names) {
    const { data } = await supabase
      .from('re_naver_listings')
      .select('complex_no')
      .eq('complex_name', name)
      .not('complex_no', 'is', null)
      .limit(1)
    if (data?.[0]?.complex_no) complexNo[name] = data[0].complex_no
  }

  const targets = names.filter(n => complexNo[n] && (!only || only.includes(n)))
  console.log(`🏢 대상 단지: ${targets.length}개 (dry=${dry})\n`)

  // 시스템 Chrome 사용 — Playwright 브라우저 다운로드 불필요
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: !headed,
    args: ['--disable-blink-features=AutomationControlled'],
  })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'ko-KR',
  })
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
  })

  const results: { name: string; units: number | null; pyeongs: number }[] = []

  try {
    const warm = await context.newPage()
    await warm.goto('https://new.land.naver.com/', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await sleep(2000)
    await warm.close()

    for (const name of targets) {
      const no = complexNo[name]
      const page = await context.newPage()
      let units: number | null = null
      let pyeongRows: PyeongRow[] = []

      // SPA가 API 호출에 쓰는 Bearer 토큰을 가로챈다 (상세 API 직접 호출용)
      let authToken = ''
      page.on('request', (req) => {
        const auth = req.headers()['authorization']
        if (auth && !authToken) authToken = auth
      })

      page.on('response', async (response) => {
        const url = response.url()
        if (!url.includes('/api/complexes/') || !url.includes(no)) return
        try {
          if (response.status() !== 200) return
          const data = await response.json()
          if (!units) {
            const found = findHouseholdCount(data)
            if (found) units = found
          }
          if (pyeongRows.length === 0) {
            const list = findPyeongList(data)
            if (list) pyeongRows = mapPyeongRows(list)
          }
        } catch {}
      })

      try {
        await page.goto(`https://new.land.naver.com/complexes/${no}?ms=a1&a=APT&e=OPST`, {
          waitUntil: 'networkidle', timeout: 20000,
        })
      } catch {}
      await sleep(2000)

      // 평형별 세대수는 상세 API에만 있다 — 가로챈 토큰으로 직접 호출
      if (pyeongRows.length === 0 && authToken) {
        try {
          const result = await page.evaluate(async ({ complexId, auth }: { complexId: string; auth: string }) => {
            const r = await fetch(`/api/complexes/${complexId}?sameAddressGroup=false`, {
              headers: { accept: 'application/json', authorization: auth },
            })
            return { status: r.status, body: await r.text() }
          }, { complexId: no, auth: authToken })
          if (result.status === 200) {
            const data = JSON.parse(result.body)
            const list = findPyeongList(data)
            if (list) pyeongRows = mapPyeongRows(list)
            if (!units) {
              const found = findHouseholdCount(data)
              if (found) units = found
            }
          }
        } catch {}
      }

      // 폴백: 페이지 텍스트에서 "N세대" 패턴
      if (!units) {
        try {
          const text = await page.evaluate(() => document.body.innerText)
          const m = text.match(/([\d,]+)\s*세대/)
          if (m) {
            const v = Number(m[1].replace(/,/g, ''))
            if (v > 0) units = v
          }
        } catch {}
      }
      // 평형별 세대수 합이 있으면 총세대수 교차검증/보완
      const pyeongSum = pyeongRows.reduce((s, r) => s + r.household_count, 0)
      if (!units && pyeongSum > 0) units = pyeongSum

      await page.close()
      results.push({ name, units, pyeongs: pyeongRows.length })
      console.log(`  ${units ? '✅' : '❌'} ${name}: ${units ? units.toLocaleString() + '세대' : '수집 실패'} · 평형 ${pyeongRows.length}개${pyeongSum ? ` (합 ${pyeongSum.toLocaleString()})` : ''}`)

      if (!dry) {
        if (units) {
          const { error } = await supabase
            .from('re_complexes')
            .update({ total_units: units, updated_at: new Date().toISOString() })
            .eq('name', name)
          if (error) console.error(`     ⚠️ total_units 업데이트 실패: ${error.message}`)
        }
        if (pyeongRows.length > 0) {
          const { error } = await supabase
            .from('re_complex_pyeongs')
            .upsert(
              pyeongRows.map(r => ({ complex_name: name, ...r, updated_at: new Date().toISOString() })),
              { onConflict: 'complex_name,pyeong_name' }
            )
          if (error) console.error(`     ⚠️ 평형 upsert 실패: ${error.message}`)
        }
      }

      await sleep(randomDelay())
    }
  } finally {
    await browser.close()
  }

  const ok = results.filter(r => r.units).length
  const okPy = results.filter(r => r.pyeongs > 0).length
  console.log(`\n완료: 세대수 ${ok}/${results.length} · 평형정보 ${okPy}/${results.length}${dry ? ' (dry — DB 미변경)' : ''}`)
}

main().catch(e => { console.error(e); process.exit(1) })
