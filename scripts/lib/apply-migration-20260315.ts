/**
 * re_listing_daily_summary 테이블 생성 + 데이터 마이그레이션 스크립트
 * 사용법: npx tsx scripts/lib/apply-migration-20260315.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

async function run() {
  console.log('=== re_listing_daily_summary 마이그레이션 시작 ===\n')

  // Step 1: 테이블 생성
  console.log('1. 테이블 생성...')
  const { error: createErr } = await supabase.rpc('exec_sql', {
    query: `
      CREATE TABLE IF NOT EXISTS re_listing_daily_summary (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        snapshot_date date NOT NULL,
        complex_name text NOT NULL,
        trade_type text NOT NULL CHECK (trade_type IN ('매매', '전세')),
        area_band int NOT NULL CHECK (area_band IN (20, 30, 40, 50, 60)),
        min_ppp int,
        max_ppp int,
        avg_ppp int,
        listing_count int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `
  })

  if (createErr) {
    // rpc exec_sql이 없을 수 있으므로 REST API 직접 사용 시도
    console.log('  rpc exec_sql 사용 불가 - Supabase Management API로 시도합니다.')
    console.log('  오류:', createErr.message)

    // Supabase Management API를 통한 SQL 실행
    const projectRef = 'axcfvieqsaphhvbkyzzv'

    // Management API에는 personal access token이 필요
    // 대신 psql 연결 정보를 출력
    console.log('\n=== 수동 실행이 필요합니다 ===')
    console.log('Supabase Dashboard > SQL Editor에서 다음 파일의 SQL을 실행해 주세요:')
    console.log('  supabase/migrations/20260315_create_re_listing_daily_summary.sql')
    console.log(`\n또는 다음 psql 명령어를 사용하세요:`)
    console.log(`  psql "postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres" \\`)
    console.log(`    -f supabase/migrations/20260315_create_re_listing_daily_summary.sql`)

    // 대안: supabase-js로 직접 데이터 조회 후 insert 방식으로 마이그레이션
    console.log('\n--- 대안: supabase-js를 통한 데이터 마이그레이션 ---')
    console.log('테이블이 이미 생성되어 있다면, 데이터만 마이그레이션합니다.\n')

    await migrateDataViaClient()
    return
  }

  console.log('  테이블 생성 완료')

  // Step 2: 인덱스 생성
  console.log('\n2. 인덱스 생성...')
  await supabase.rpc('exec_sql', {
    query: `
      CREATE UNIQUE INDEX IF NOT EXISTS uq_re_listing_daily_summary
        ON re_listing_daily_summary (snapshot_date, complex_name, trade_type, area_band);
      CREATE INDEX IF NOT EXISTS idx_re_listing_daily_summary_trend
        ON re_listing_daily_summary (complex_name, trade_type, snapshot_date);
    `
  })
  console.log('  인덱스 생성 완료')

  // Step 3: RLS
  console.log('\n3. RLS 설정...')
  await supabase.rpc('exec_sql', {
    query: `
      ALTER TABLE re_listing_daily_summary ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "allow_select_all" ON re_listing_daily_summary FOR SELECT USING (true);
      CREATE POLICY "allow_insert_service" ON re_listing_daily_summary FOR INSERT WITH CHECK (true);
      CREATE POLICY "allow_update_service" ON re_listing_daily_summary FOR UPDATE USING (true);
    `
  })
  console.log('  RLS 설정 완료')

  // Step 4: 데이터 마이그레이션
  await migrateDataViaClient()

  console.log('\n=== 마이그레이션 완료 ===')
}

async function migrateDataViaClient() {
  console.log('4. 기존 데이터에서 요약 테이블 채우기...')

  // 최근 4일의 스냅샷 날짜 가져오기
  const { data: snapDates, error: snapErr } = await supabase
    .from('re_naver_listings')
    .select('snapshot_date')
    .order('snapshot_date', { ascending: false })
    .limit(1)

  if (snapErr || !snapDates?.length) {
    console.log('  스냅샷 데이터 없음:', snapErr?.message)
    return
  }

  // distinct snapshot_date를 가져오기 위해 다른 접근
  const { data: allListings } = await supabase
    .from('re_naver_listings')
    .select('snapshot_date')
    .order('snapshot_date', { ascending: false })

  if (!allListings?.length) {
    console.log('  매물 데이터 없음')
    return
  }

  const uniqueDates = [...new Set(allListings.map(l => l.snapshot_date))].slice(0, 4)
  console.log(`  대상 스냅샷 날짜: ${uniqueDates.join(', ')}`)

  let totalInserted = 0

  for (const snapDate of uniqueDates) {
    console.log(`\n  --- ${snapDate} 처리 중 ---`)

    // 해당 날짜의 모든 매물 조회
    const allData: any[] = []
    let from = 0
    const pageSize = 1000
    while (true) {
      const { data } = await supabase
        .from('re_naver_listings')
        .select('complex_name, trade_type, price, area_supply_sqm')
        .eq('snapshot_date', snapDate)
        .not('area_supply_sqm', 'is', null)
        .gt('area_supply_sqm', '0')
        .gt('price', 0)
        .range(from, from + pageSize - 1)

      if (!data || data.length === 0) break
      allData.push(...data)
      if (data.length < pageSize) break
      from += pageSize
    }

    console.log(`    전체 매물: ${allData.length}건`)

    // 평형대별 집계
    const groups: Record<string, {
      snapshot_date: string
      complex_name: string
      trade_type: string
      area_band: number
      ppps: number[]
    }> = {}

    for (const l of allData) {
      const pyeong = Number(l.area_supply_sqm) / 3.3058
      if (pyeong < 20) continue

      const band = pyeong < 30 ? 20 : pyeong < 40 ? 30 : pyeong < 50 ? 40 : pyeong < 60 ? 50 : 60
      const ppp = Number(l.price) / pyeong
      if (ppp <= 0) continue

      const key = `${snapDate}|${l.complex_name}|${l.trade_type}|${band}`
      if (!groups[key]) {
        groups[key] = {
          snapshot_date: snapDate,
          complex_name: l.complex_name,
          trade_type: l.trade_type,
          area_band: band,
          ppps: [],
        }
      }
      groups[key].ppps.push(ppp)
    }

    // INSERT
    const records = Object.values(groups).map(g => ({
      snapshot_date: g.snapshot_date,
      complex_name: g.complex_name,
      trade_type: g.trade_type,
      area_band: g.area_band,
      min_ppp: Math.round(Math.min(...g.ppps)),
      max_ppp: Math.round(Math.max(...g.ppps)),
      avg_ppp: Math.round(g.ppps.reduce((s, v) => s + v, 0) / g.ppps.length),
      listing_count: g.ppps.length,
    }))

    if (records.length > 0) {
      const { error: insertErr, data: insertData } = await supabase
        .from('re_listing_daily_summary')
        .upsert(records, {
          onConflict: 'snapshot_date,complex_name,trade_type,area_band',
          ignoreDuplicates: true,
        })
        .select('id')

      if (insertErr) {
        console.log(`    INSERT 오류: ${insertErr.message}`)
      } else {
        const count = insertData?.length || 0
        totalInserted += count
        console.log(`    ${records.length}개 그룹 → ${count}건 저장`)
      }
    } else {
      console.log(`    집계 대상 없음`)
    }
  }

  console.log(`\n  총 ${totalInserted}건 저장 완료`)
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('마이그레이션 실패:', e)
    process.exit(1)
  })
