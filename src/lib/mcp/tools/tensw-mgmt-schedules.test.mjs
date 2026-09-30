import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./tensw-mgmt.ts', import.meta.url), 'utf8')

function toolBody(name) {
  const start = src.indexOf(`'${name}'`)
  assert.ok(start > 0, `${name} 도구가 없다`)
  const next = src.indexOf('server.registerTool(', start + 1)
  return src.slice(start, next === -1 ? undefined : next)
}

for (const name of ['tensw_create_schedule', 'tensw_list_schedules', 'tensw_update_schedule', 'tensw_delete_schedule', 'tensw_toggle_schedule_date']) {
  test(`${name} 은 텐소 일정 테이블만 쓴다`, () => {
    const body = toolBody(name)
    assert.match(body, /from\('tensw_mgmt_schedules'\)/)
    assert.doesNotMatch(body, /willow_mgmt_schedules/)
  })
}
