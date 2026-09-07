import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const ROOT = process.cwd()
const SERVER = `${ROOT}/src/lib/voicecards-server.ts`

// 주석 속 예시 코드가 검사에 걸리지 않게 실제 코드만 남긴다.
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

// PostgREST 는 요청 limit 과 무관하게 한 응답을 1,000행에서 자른다. 잘려도 에러가 아니라
// 짧은 배열이 와서 조용히 부분 데이터로 돈다 (2026-09-07 실측: anonymous_events 를 limit
// 없이 요청 → content-range: 0-999/389832). 대시보드 조회가 이 한도를 넘는 순간
// 사용자 표의 듣기·크레딧이 0이 되고 퍼널 누적 지표가 줄어든다.

test('every multi-row VoiceCards fetch goes through the paging helper', async () => {
  const src = await readFile(SERVER, 'utf8')

  // 페이징 없이 여러 행을 읽는 select/rpc 가 남아 있으면 1,000행에서 잘린다.
  const unpagedTables = ['users', 'user_analytics', 'user_offers', 'vc_device_journeys', 'time_series_analytics']
  for (const table of unpagedTables) {
    const bare = new RegExp(`(?<!fetchAllPaged\\([^\\n]*)vc\\s*\\n?\\s*\\.from\\('${table}'\\)`, 'g')
    for (const m of src.matchAll(bare)) {
      const line = src.slice(0, m.index).split('\n').length
      const window = src.slice(Math.max(0, m.index! - 200), m.index! + 400)
      assert.ok(
        window.includes('fetchAllPaged'),
        `${table} at line ${line} is fetched without fetchAllPaged — it will silently truncate at 1000 rows`,
      )
    }
  }

  for (const rpc of ['vc_user_rollup', 'vc_user_latest_meta', 'vc_user_activity_deltas']) {
    const idx = src.indexOf(`vc.rpc('${rpc}')`)
    assert.ok(idx > 0, `${rpc} call not found`)
    const window = src.slice(Math.max(0, idx - 200), idx + 200)
    assert.ok(window.includes('fetchAllPaged'), `${rpc} must be paged`)
  }
})

test('paged queries carry a unique tiebreaker so pages cannot overlap or skip', async () => {
  const code = stripComments(await readFile(SERVER, 'utf8'))

  // 정렬이 불안정하면 페이지 경계에서 같은 행이 두 번 오거나 아예 빠진다.
  // 유니크 키: users/RPC → user_id, journeys → device_id, 그 외 → id(PK).
  for (const key of ["order('user_id'", "order('device_id'", "order('id'"]) {
    assert.ok(code.includes(key), `expected a unique-key tiebreaker ${key}`)
  }

  // created_at 은 유니크가 아니다. 이걸로 마지막 정렬을 끝내는 페이징이 남아 있으면 안 된다.
  // anonymous_events / mv_real_users 조회는 셋 다 뒤에 id 가 따라붙어야 한다.
  for (const table of ["from('anonymous_events')", "from('mv_real_users')"]) {
    let at = code.indexOf(table)
    while (at !== -1) {
      const window = code.slice(at, at + 900)
      if (window.includes("order('created_at'")) {
        assert.match(
          window,
          /order\('created_at'[\s\S]{0,200}?order\('id'/,
          `${table} paginates on created_at without a unique tiebreaker`,
        )
      }
      at = code.indexOf(table, at + 1)
    }
  }
})

test('the paging helper reports errors instead of returning a truncated page', async () => {
  const src = await readFile(SERVER, 'utf8')
  const start = src.indexOf('async function fetchAllPaged')
  assert.ok(start > 0, 'fetchAllPaged not found')
  const body = src.slice(start, src.indexOf('\n}', start))

  // 예전 구현은 error 시 break 해서 **부분 배열을 성공처럼** 돌려줬고, 그 값이 1시간 캐시에 박혔다.
  assert.match(body, /if \(error\) return \{ data: null, error \}/)
  assert.doesNotMatch(body, /if \(error \|\| !data\) break/)
})

test('no hard row cap and no hand-rolled paging loops remain', async () => {
  const code = stripComments(await readFile(SERVER, 'utf8'))

  // vc_device_journeys 에 걸려 있던 상한. 지우기만 하면 PostgREST 가 같은 자리에서 자르므로
  // fetchAllPaged 와 함께여야 의미가 있다(위 테스트가 그쪽을 본다).
  assert.doesNotMatch(code, /\.limit\(1000\)/)

  // 손으로 짠 range 루프는 tiebreaker·에러처리를 각자 놓친다. 실제로 매출·유료유저 조회
  // 두 곳이 그래서 created_at 단독 정렬 + error 무시로 돌고 있었다(2026-09-07).
  assert.doesNotMatch(code, /\.range\(from, from \+ PAGE - 1\)/)
})
