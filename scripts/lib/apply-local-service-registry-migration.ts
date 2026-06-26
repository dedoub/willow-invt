import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

async function main() {
  const migrationPath = join(process.cwd(), 'supabase', 'migrations', '20260626_local_service_registry.sql')
  const sql = readFileSync(migrationPath, 'utf-8')

  console.log('=== local_service_registry migration start ===')
  const { error } = await supabase.rpc('exec_sql', { query: sql })
  if (error) {
    console.log(`rpc exec_sql 사용 불가: ${error.message}`)
    console.log('테이블이 이미 적용돼 있는지 확인합니다...')

    const check = await verifyRegistry()
    if (check.ok) {
      console.log('이미 local_service_registry가 적용되어 있어요. 추가 작업 없이 종료합니다.')
      printRows(check.rows)
      console.log('=== migration done ===')
      return
    }

    console.error('Migration failed: exec_sql RPC가 없고, local_service_registry 테이블도 아직 없습니다.')
    console.error('Supabase SQL Editor 또는 MCP apply_migration으로 다음 파일을 적용해 주세요:')
    console.error(`- ${migrationPath}`)
    process.exit(1)
  }

  const check = await verifyRegistry()
  if (!check.ok) {
    console.error('Migration applied but verification failed:', check.error)
    process.exit(1)
  }

  printRows(check.rows)
  console.log('=== migration done ===')
}

async function verifyRegistry() {
  const { data, error } = await supabase
    .from('local_service_registry')
    .select('service_key, display_name, is_enabled, is_protected')
    .order('service_key')

  if (error) {
    return {
      ok: false as const,
      error: error.message,
      rows: [] as Array<{
        service_key: string
        display_name: string
        is_enabled: boolean
        is_protected: boolean
      }>,
    }
  }

  return {
    ok: true as const,
    rows: data || [],
  }
}

function printRows(rows: Array<{
  service_key: string
  display_name: string
  is_enabled: boolean
  is_protected: boolean
}>) {
  console.log(`Seeded ${rows.length} services:`)
  for (const row of rows) {
    const flags = [
      row.is_enabled ? null : 'disabled',
      row.is_protected ? 'protected' : null,
    ].filter(Boolean)
    console.log(`- ${row.service_key} (${row.display_name})${flags.length ? ` [${flags.join(', ')}]` : ''}`)
  }
}

main().catch(err => {
  console.error('Unexpected migration error:', err)
  process.exit(1)
})
