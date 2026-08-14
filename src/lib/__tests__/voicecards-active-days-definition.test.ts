import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const ROOT = process.cwd()

test('7-day user activity includes completed Drive and local deck creation', async () => {
  const sql = await readFile(`${ROOT}/supabase/voicecards/vc_user_activity_deltas.sql`, 'utf8')

  assert.match(sql, /'deck_created'/)
  assert.match(sql, /'pending_local_sheet_created'/)
})

test('device journeys expose a distinct KST 7-day core activity count', async () => {
  const sql = await readFile(`${ROOT}/supabase/voicecards/vc_device_journeys.sql`, 'utf8')

  assert.match(sql, /with \(security_invoker = true\)/)
  assert.match(sql, /active_days_7d/)
  assert.match(sql, /count\(distinct \(created_at at time zone 'Asia\/Seoul'\)::date\) filter/)
  assert.match(sql, /'deck_created'/)
  assert.match(sql, /'pending_local_sheet_created'/)
})
