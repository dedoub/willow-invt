import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ADMIN_GATE_STATUS, DRAFT_DTO_KEYS, INQUIRY_APPS, MAX_PAGES, PAGE_SIZE, THREAD_DTO_KEYS,
  adminGate, appSpec, draftColumns, loadAppThreads, loadThreadDraft, loadThreadMessages,
  messageColumns, publishGuard, selectAllPages, shouldSeedDraft, sortThreads, toDraftDto,
  toInstant, toMessageDto, toThreadDto,
  type InquiryRow, type SelectPageArgs, type InquiryThreadDto, type InquiryMessageDto,
} from '../inquiry-inbox-core'

const spec = (key: string) => {
  const s = appSpec(key)
  assert.ok(s, `${key} spec 이 없다`)
  return s
}

/**
 * 조회를 흉내내는 가짜. **받은 인자를 전부 기록한다** — 이게 없으면 "리뷰노트를
 * 대문자 컬럼으로 조회했는가", "1000행 뒤 다음 페이지를 요청했는가" 같은 주장이
 * 전부 공허해진다(가짜가 무엇을 받든 같은 걸 돌려주므로).
 */
function recordingSelect(pages: (rows: InquiryRow[], call: SelectPageArgs) => InquiryRow[]) {
  const calls: SelectPageArgs[] = []
  const select = async (args: SelectPageArgs) => {
    calls.push(args)
    return pages([], args)
  }
  return { select, calls }
}

// ─── 컬럼 대응표 ───────────────────────────────────────────────────────────────

test('리뷰노트는 Prisma 대소문자 컬럼으로 조회한다 — 스네이크로 물으면 없는 컬럼이다', async () => {
  const rn = spec('reviewnotes')
  const { select, calls } = recordingSelect(() => [])
  await loadAppThreads(rn, select)

  assert.equal(calls.length, 1)
  assert.equal(calls[0].table, 'InquiryThread')
  // 주장은 철자 나열이 아니라 "요청한 컬럼 집합"이다.
  assert.deepEqual(
    calls[0].columns.split(','),
    ['id', 'userId', 'createdAt', 'lastMessageAt', 'unreadForAdmin', 'unreadForUser'],
  )
  assert.equal(calls[0].orderBy, 'lastMessageAt')
})

test('보이스카드·포틀·스크립타는 스네이크 컬럼으로 조회한다', async () => {
  for (const key of ['voicecards', 'portle', 'scripta']) {
    const { select, calls } = recordingSelect(() => [])
    await loadAppThreads(spec(key), select)
    assert.equal(calls[0].orderBy, 'last_message_at', key)
    assert.ok(calls[0].columns.includes('unread_for_admin'), key)
  }
})

test('포틀의 신원 컬럼은 subject 다 — account_id 는 이 앱에 없다', async () => {
  const { select, calls } = recordingSelect(() => [])
  await loadAppThreads(spec('portle'), select)
  const cols = calls[0].columns.split(',')
  assert.ok(cols.includes('subject'), '포틀은 subject 를 물어야 한다')
  assert.ok(!cols.includes('account_id'), '포틀에는 account_id 컬럼이 없다 (42703)')
})

test('메시지 컬럼도 앱마다 갈린다', () => {
  assert.equal(messageColumns(spec('voicecards')), 'id,thread_id,sender,body,created_at')
  assert.equal(messageColumns(spec('reviewnotes')), 'id,threadId,sender,body,createdAt')
})

test('어떤 앱도 access_token / draft 를 조회하지 않는다', async () => {
  for (const s of INQUIRY_APPS) {
    const { select, calls } = recordingSelect(() => [])
    await loadAppThreads(s, select)
    for (const col of calls[0].columns.split(',')) {
      assert.ok(!/token/i.test(col), `${s.key}: ${col}`)
      assert.ok(!/draft/i.test(col), `${s.key}: ${col}`)
    }
  }
})

// ─── DTO ──────────────────────────────────────────────────────────────────────

const VC_ROW: InquiryRow = {
  id: 'a1', account_id: '107821687966181028778', channel: 'app',
  created_at: '2026-08-27T01:00:00+00:00', last_message_at: '2026-08-28T02:00:00+00:00',
  unread_for_admin: true, unread_for_user: false,
  app_version: '1.1.146', platform: 'ios', locale: 'ko',
  // 아래 셋은 브라우저로 나가면 안 되는 값들. 행에는 실제로 붙어 올 수 있다.
  access_token: 'SECRET-TOKEN-abc123',
  draft_body: '아직 안 보낸 초안', draft_at: '2026-08-28T01:00:00+00:00', drafted_by: 'telegram',
}

test('스레드 DTO 는 행을 펼치지 않는다 — 토큰도 초안도 따라오지 않는다', () => {
  const dto = toThreadDto(spec('voicecards'), VC_ROW)
  assert.deepEqual(Object.keys(dto).sort(), [...THREAD_DTO_KEYS].sort())
  // 철자뿐 아니라 **값**도 확인한다. 키 이름만 보면 다른 칸에 담아 내보내도 통과한다.
  const serialized = JSON.stringify(dto)
  assert.ok(!serialized.includes('SECRET-TOKEN-abc123'))
  assert.ok(!serialized.includes('아직 안 보낸 초안'))
  assert.ok(!serialized.includes('telegram'))
})

test('스레드 DTO 가 각 칸을 제 자리에 옮긴다', () => {
  const dto = toThreadDto(spec('voicecards'), VC_ROW)
  assert.equal(dto.app, 'voicecards')
  assert.equal(dto.id, 'a1')
  assert.equal(dto.personId, '107821687966181028778')
  assert.equal(dto.channel, 'app')
  assert.equal(dto.unreadForAdmin, true)
  assert.equal(dto.unreadForUser, false)
  assert.equal(dto.appVersion, '1.1.146')
})

test('포틀 스레드의 personId 는 subject 에서 온다', () => {
  const dto = toThreadDto(spec('portle'), {
    id: 'p1', subject: 'google:100644446554227652222', channel: 'app',
    created_at: '2026-08-27T01:00:00+00:00', last_message_at: '2026-08-27T02:00:00+00:00',
    unread_for_admin: false, unread_for_user: false,
    app_version: null, platform: 'android', locale: 'ko',
  })
  assert.equal(dto.personId, 'google:100644446554227652222')
})

test('채널이 없는 앱은 channel 이 null 이다 — 없는 컬럼을 지어내지 않는다', () => {
  for (const key of ['scripta', 'reviewnotes']) {
    const s = spec(key)
    const c = s.thread
    const dto = toThreadDto(s, {
      [c.id]: 'x', [c.person]: 'u1',
      [c.createdAt]: '2026-08-27T01:00:00+00:00', [c.lastMessageAt]: '2026-08-27T01:00:00+00:00',
      [c.unreadForAdmin]: false, [c.unreadForUser]: false,
    })
    assert.equal(dto.channel, null, key)
  }
})

// ─── sender ───────────────────────────────────────────────────────────────────

test('리뷰노트 sender 는 대문자다 — 소문자로 읽으면 발신자가 뒤바뀐다', () => {
  const rn = spec('reviewnotes')
  const fromUser = toMessageDto(rn, {
    id: 'm1', threadId: 't1', sender: 'USER', body: '질문', createdAt: '2026-08-27T01:00:00+00:00',
  })
  const fromUs = toMessageDto(rn, {
    id: 'm2', threadId: 't1', sender: 'SUPPORT', body: '답변', createdAt: '2026-08-27T02:00:00+00:00',
  })
  assert.equal(fromUser.sender, 'user')
  assert.equal(fromUs.sender, 'support')
})

test('세 앱의 sender 는 소문자다', () => {
  for (const key of ['voicecards', 'portle', 'scripta']) {
    const s = spec(key)
    assert.equal(toMessageDto(s, {
      id: 'm', thread_id: 't', sender: 'support', body: 'b', created_at: '2026-08-27T01:00:00+00:00',
    }).sender, 'support', key)
  }
})

test('모르는 sender 는 기본값으로 접지 않고 던진다', () => {
  // 접었다면 고객이 쓴 말이 우리 답변으로(또는 반대로) 보인다.
  assert.throws(
    () => toMessageDto(spec('reviewnotes'), {
      id: 'm', threadId: 't', sender: 'user', body: 'b', createdAt: '2026-08-27T01:00:00+00:00',
    }),
    /sender 값을 모른다/,
  )
  assert.throws(
    () => toMessageDto(spec('voicecards'), {
      id: 'm', thread_id: 't', sender: 'admin', body: 'b', created_at: '2026-08-27T01:00:00+00:00',
    }),
    /sender 값을 모른다/,
  )
})

// ─── 정렬 ─────────────────────────────────────────────────────────────────────

const th = (id: string, unread: boolean, at: string): InquiryThreadDto => ({
  app: 'voicecards', id, personId: 'p', channel: 'app',
  createdAt: at, lastMessageAt: at,
  unreadForAdmin: unread, unreadForUser: false,
  appVersion: null, platform: null, locale: null,
})

test('미답변이 먼저, 그 안에서 최근 순', () => {
  const sorted = sortThreads([
    th('old-unread', true, '2026-08-20T00:00:00+00:00'),
    th('new-answered', false, '2026-08-28T00:00:00+00:00'),
    th('new-unread', true, '2026-08-27T00:00:00+00:00'),
    th('old-answered', false, '2026-08-19T00:00:00+00:00'),
  ])
  assert.deepEqual(sorted.map(x => x.id), ['new-unread', 'old-unread', 'new-answered', 'old-answered'])
})

test('오프셋 없는 시각은 UTC 로 읽는다 — 리뷰노트만 아홉 시간 어긋나지 않게', () => {
  // 라이브에서 실제로 오는 두 모양이다(2026-08-28 확인):
  //   리뷰노트  '2025-10-12T15:49:12.129'          (Prisma DateTime, 오프셋 없음)
  //   나머지 셋 '2026-06-22T16:00:06.776496+00:00'
  // 오프셋이 없으면 JS 는 로컬 시각으로 읽는다. KST 기기에서 그대로 두면 리뷰노트
  // 문의만 아홉 시간 일찍 서서, 방금 온 문의가 목록 아래로 내려간다.
  assert.equal(toInstant('2025-10-12T15:49:12.129'), '2025-10-12T15:49:12.129Z')
  assert.equal(toInstant('2026-06-22T16:00:06.776496+00:00'), '2026-06-22T16:00:06.776496+00:00')
  assert.equal(toInstant('2026-06-22T16:00:06Z'), '2026-06-22T16:00:06Z')

  const rn = spec('reviewnotes')
  const c = rn.thread
  const dto = toThreadDto(rn, {
    [c.id]: 'rn1', [c.person]: 'u1',
    [c.createdAt]: '2026-08-28T05:00:00.129',
    [c.lastMessageAt]: '2026-08-28T05:00:00.129',
    [c.unreadForAdmin]: false, [c.unreadForUser]: false,
  })
  // 05:00Z 로 읽혀야 한다. 로컬(KST)로 읽히면 이 값은 2026-08-27T20:00Z 가 된다.
  // 앞줄은 실행 기기의 시간대와 무관하게 실패한다 — UTC 로 도는 곳에서도 잡히도록.
  assert.ok(dto.lastMessageAt.endsWith('Z'), `시간대가 안 붙었다: ${dto.lastMessageAt}`)
  assert.ok(dto.createdAt.endsWith('Z'), `시간대가 안 붙었다: ${dto.createdAt}`)
  assert.equal(Date.parse(dto.lastMessageAt), Date.parse('2026-08-28T05:00:00.129Z'))

  // 그래야 04:00Z 인 보이스카드 문의보다 위에 선다.
  const sorted = sortThreads([
    th('voicecards-earlier', false, '2026-08-28T04:00:00.000000+00:00'),
    dto,
  ])
  assert.deepEqual(sorted.map(x => x.id), ['rn1', 'voicecards-earlier'])
})

// ─── 페이지 ───────────────────────────────────────────────────────────────────

function rows(n: number, offset = 0): InquiryRow[] {
  return Array.from({ length: n }, (_, i) => ({ id: `r${offset + i}` }))
}

test('1000행에서 멈추지 않는다 — 짧은 페이지가 나올 때까지 이어 읽는다', async () => {
  const calls: SelectPageArgs[] = []
  const select = async (args: SelectPageArgs) => {
    calls.push(args)
    return args.from === 0 ? rows(PAGE_SIZE) : rows(7, PAGE_SIZE)
  }
  const got = await selectAllPages(select, {
    table: 'inquiry_threads', columns: 'id', orderBy: 'last_message_at', ascending: false,
  })

  assert.equal(got.length, PAGE_SIZE + 7, '두 페이지를 합쳐야 한다')
  assert.equal(calls.length, 2)
  // 가짜가 **무엇을 받았는지** 확인한다 — 두 번째 요청이 진짜 다음 구간이어야 한다.
  assert.deepEqual([calls[0].from, calls[0].to], [0, 999])
  assert.deepEqual([calls[1].from, calls[1].to], [1000, 1999])
})

test('한 페이지로 끝나면 한 번만 부른다', async () => {
  const { calls } = await (async () => {
    const calls: SelectPageArgs[] = []
    await selectAllPages(async a => { calls.push(a); return rows(3) }, {
      table: 'x', columns: 'id', orderBy: 'created_at', ascending: true,
    })
    return { calls }
  })()
  assert.equal(calls.length, 1)
})

test('상한에 닿으면 잘라서 돌려주지 않고 던진다', async () => {
  await assert.rejects(
    selectAllPages(async () => rows(PAGE_SIZE), {
      table: 'inquiry_threads', columns: 'id', orderBy: 'created_at', ascending: true,
    }),
    new RegExp(`${MAX_PAGES}페이지`),
  )
})

test('메시지 조회는 그 스레드로 좁힌다', async () => {
  const calls: SelectPageArgs[] = []
  await loadThreadMessages(spec('reviewnotes'), 'thread-42', async a => { calls.push(a); return [] })
  assert.equal(calls[0].table, 'InquiryMessage')
  assert.equal(calls[0].filterColumn, 'threadId')
  assert.equal(calls[0].filterValue, 'thread-42')
  assert.equal(calls[0].ascending, true, '대화는 오래된 것부터')
})

// ─── 실패는 0건이 아니다 ───────────────────────────────────────────────────────

test('조회가 깨지면 error 로 나간다 — 빈 목록으로 접지 않는다', async () => {
  const result = await loadAppThreads(spec('reviewnotes'), async () => {
    throw new Error('relation "public.inquiry_threads" does not exist')
  })
  assert.equal(result.status, 'error')
  assert.ok(result.status === 'error' && /does not exist/.test(result.message))
  // "threads: []" 로 새어 나가면 화면이 "기다리는 문의 없음"으로 그린다.
  assert.ok(!('threads' in result))
})

test('sender 하나가 이상해도 통째로 실패로 나간다', async () => {
  const s = spec('voicecards')
  const result = await loadAppThreads(s, async () => [{ id: 'x' }])   // 필수 칸이 없다
  assert.equal(result.status, 'error')
})

test('성공은 ok 로, 정렬까지 마쳐서 나간다', async () => {
  const s = spec('voicecards')
  const mk = (id: string, unread: boolean, at: string) => ({
    id, account_id: 'p', channel: 'app', created_at: at, last_message_at: at,
    unread_for_admin: unread, unread_for_user: false,
    app_version: null, platform: null, locale: null,
  })
  const result = await loadAppThreads(s, async () => [
    mk('answered-new', false, '2026-08-28T00:00:00+00:00'),
    mk('unread-old', true, '2026-08-20T00:00:00+00:00'),
  ])
  assert.equal(result.status, 'ok')
  assert.ok(result.status === 'ok')
  assert.deepEqual(result.threads.map(x => x.id), ['unread-old', 'answered-new'])
})

// ─── 권한 ─────────────────────────────────────────────────────────────────────

test('세션 없음은 401, 관리자 아님은 403 — 서로 다른 사실이다', () => {
  assert.equal(adminGate(null), 'unauthenticated')
  assert.equal(adminGate(undefined), 'unauthenticated')
  assert.equal(adminGate({ role: 'admin' }), 'ok')
  assert.equal(adminGate({ role: 'editor' }), 'forbidden')
  assert.equal(adminGate({ role: 'viewer' }), 'forbidden')
  assert.equal(ADMIN_GATE_STATUS.unauthenticated, 401)
  assert.equal(ADMIN_GATE_STATUS.forbidden, 403)
})

test('role 이 비어 있으면 관리자가 아니다', () => {
  // 빈 값이 통과하면 게이트가 없는 것과 같다.
  assert.equal(adminGate({}), 'forbidden')
  assert.equal(adminGate({ role: '' }), 'forbidden')
  assert.equal(adminGate({ role: undefined }), 'forbidden')
  assert.equal(adminGate({ role: null }), 'forbidden')
})

// ─── 발행 판정 ─────────────────────────────────────────────────────────────────

test('자체 관리자 화면이 있는 앱에는 여기서 쓰지 않는다', () => {
  assert.equal(publishGuard(spec('scripta'), { channel: null }, '답변'), 'read-only-app')
  assert.equal(publishGuard(spec('reviewnotes'), { channel: null }, '답변'), 'read-only-app')
  assert.equal(publishGuard(spec('voicecards'), { channel: 'app' }, '답변'), 'ok')
  assert.equal(publishGuard(spec('portle'), { channel: 'app' }, '답변'), 'ok')
})

test('spec 목록이 쓰기 권한을 그대로 들고 있다', () => {
  assert.deepEqual(
    INQUIRY_APPS.map(a => [a.key, a.writable]),
    [['voicecards', true], ['portle', true], ['scripta', false], ['reviewnotes', false]],
  )
  // 읽기 전용 앱에는 나가는 길이 반드시 있어야 한다 — 없으면 답할 곳이 사라진다.
  for (const a of INQUIRY_APPS) {
    if (!a.writable) assert.ok(a.adminUrl && a.adminUrl.startsWith('https://'), a.key)
  }
})

test('구버전 이메일 스레드에는 쓰지 않는다 — 써도 고객이 못 본다', () => {
  assert.equal(publishGuard(spec('voicecards'), { channel: 'email' }, '답변'), 'legacy-email')
  assert.equal(publishGuard(spec('portle'), { channel: 'email' }, '답변'), 'legacy-email')
})

test('빈 답변은 보내지 않는다', () => {
  assert.equal(publishGuard(spec('voicecards'), { channel: 'app' }, '   \n '), 'empty-body')
})

test('모르는 앱은 400', () => {
  assert.equal(publishGuard(null, { channel: 'app' }, '답변'), 'unknown-app')
  assert.equal(appSpec('willow'), null)
})

// ─── 봇 초안 ──────────────────────────────────────────────────────────────────
//
// 초안은 대화 화면에서만 나간다. 목록에 실리면 스레드 한 줄마다 초안 본문이
// 브라우저로 나가고, 그건 "큐"인 목록에 아무 쓸모가 없다.

const DRAFT_ROW: InquiryRow = {
  draft_body: '확인하고 내일 중으로 다시 알려 드리겠습니다.',
  draft_at: '2026-08-28T05:00:00+00:00',
  // 초안 칸 바로 옆에 있는 값들. 행을 펼치면 이것들이 같이 나간다.
  access_token: 'SECRET-TOKEN-abc123',
  drafted_by: 'ceo-bot',
  account_id: '107821687966181028778',
}

test('목록 조회는 초안 칸을 아예 요청하지 않는다', async () => {
  // 나가지 않는 가장 확실한 방법은 묻지 않는 것이다. 네 앱 전부 확인한다.
  for (const app of INQUIRY_APPS) {
    const { select, calls } = recordingSelect(() => [])
    await loadAppThreads(app, select)
    const cols = calls[0].columns.split(',')
    assert.ok(!cols.includes(app.draft.body), `${app.key} 목록이 ${app.draft.body} 를 물었다`)
    assert.ok(!cols.includes(app.draft.at), `${app.key} 목록이 ${app.draft.at} 를 물었다`)
  }
})

test('초안 DTO 는 행을 펼치지 않는다 — 토큰도 작성자도 신원도 따라오지 않는다', () => {
  const dto = toDraftDto(spec('voicecards'), DRAFT_ROW)
  assert.ok(dto)
  assert.deepEqual(Object.keys(dto).sort(), [...DRAFT_DTO_KEYS].sort())
  // 키 이름만 보면 다른 칸에 담아 내보내도 통과한다. 값도 확인한다.
  const serialized = JSON.stringify(dto)
  assert.ok(!serialized.includes('SECRET-TOKEN-abc123'))
  assert.ok(!serialized.includes('ceo-bot'))
  assert.ok(!serialized.includes('107821687966181028778'))
})

test('초안 DTO 가 본문과 작성 시각을 제 자리에 옮긴다', () => {
  const dto = toDraftDto(spec('voicecards'), DRAFT_ROW)
  assert.equal(dto?.body, '확인하고 내일 중으로 다시 알려 드리겠습니다.')
  assert.equal(dto?.at, '2026-08-28T05:00:00+00:00')
})

test('초안이 없거나 빈 글이면 null — 빈 칸을 초안이라고 부르지 않는다', () => {
  const vc = spec('voicecards')
  assert.equal(toDraftDto(vc, null), null)
  assert.equal(toDraftDto(vc, undefined), null)
  assert.equal(toDraftDto(vc, { draft_body: null, draft_at: null }), null)
  assert.equal(toDraftDto(vc, { draft_body: '   \n ', draft_at: null }), null)
})

test('리뷰노트 초안은 Prisma 대소문자 칸으로 조회하고 시간대를 붙여 돌려준다', async () => {
  const rn = spec('reviewnotes')
  assert.deepEqual(draftColumns(rn).split(','), ['draftBody', 'draftAt'])

  const { select, calls } = recordingSelect(() => [{
    draftBody: '초안입니다',
    // Prisma DateTime 은 timestamp(3) 라 오프셋 없이 온다. 그대로 두면 KST 기기가
    // 로컬 시각으로 읽어 아홉 시간 어긋난다.
    draftAt: '2026-08-28T05:00:00',
  }])
  const dto = await loadThreadDraft(rn, 'cmtc94mbc0007jp04lvopybea', select)

  assert.equal(calls.length, 1)
  assert.equal(calls[0].table, 'InquiryThread')
  assert.deepEqual(calls[0].columns.split(','), ['draftBody', 'draftAt'])
  assert.equal(calls[0].filterColumn, 'id')
  assert.equal(calls[0].filterValue, 'cmtc94mbc0007jp04lvopybea')
  assert.equal(dto?.at, '2026-08-28T05:00:00Z')
})

test('세 앱의 초안 칸은 스네이크다', () => {
  for (const key of ['voicecards', 'portle', 'scripta']) {
    assert.deepEqual(draftColumns(spec(key)).split(','), ['draft_body', 'draft_at'], key)
  }
})

test('초안 조회는 그 스레드 한 줄만 가져온다', async () => {
  const { select, calls } = recordingSelect(() => [])
  await loadThreadDraft(spec('voicecards'), 'thread-1', select)
  assert.equal(calls[0].from, 0)
  assert.equal(calls[0].to, 0)
})

// ─── 채울 것인가 ──────────────────────────────────────────────────────────────

const msg = (sender: 'user' | 'support', at: string): InquiryMessageDto =>
  ({ id: `${sender}-${at}`, sender, body: 'x', createdAt: at })

test('우리가 마지막으로 답한 뒤에 쓰인 초안만 채운다', () => {
  const draft = { body: '초안', at: '2026-08-28T05:00:00+00:00' }
  assert.equal(shouldSeedDraft(draft, [
    msg('user', '2026-08-28T01:00:00+00:00'),
    msg('support', '2026-08-28T02:00:00+00:00'),
    msg('user', '2026-08-28T03:00:00+00:00'),
  ]), true)
})

test('발행한 뒤에는 같은 초안이 다시 채워지지 않는다 — 두 번 보내기 방지', () => {
  // 발행해도 draft_body 는 DB 에 남는다. 그 뒤 대화를 다시 불러오면 우리 답변이
  // 초안보다 나중이므로 낡은 것으로 판정돼야 한다.
  const draft = { body: '초안', at: '2026-08-28T05:00:00+00:00' }
  assert.equal(shouldSeedDraft(draft, [
    msg('user', '2026-08-28T03:00:00+00:00'),
    msg('support', '2026-08-28T06:00:00+00:00'),
  ]), false)
})

test('고객이 답장을 더 보내도, 우리 답이 초안보다 나중이면 여전히 낡았다', () => {
  const draft = { body: '초안', at: '2026-08-28T05:00:00+00:00' }
  assert.equal(shouldSeedDraft(draft, [
    msg('support', '2026-08-28T06:00:00+00:00'),
    msg('user', '2026-08-28T07:00:00+00:00'),
  ]), false)
})

test('초안이 없으면 채우지 않는다', () => {
  assert.equal(shouldSeedDraft(null, []), false)
  assert.equal(shouldSeedDraft({ body: '  ', at: null }, []), false)
})

test('작성 시각을 모르면 채운다 — 낡았다고 단정할 근거가 없다', () => {
  assert.equal(shouldSeedDraft({ body: '초안', at: null }, [
    msg('support', '2026-08-28T06:00:00+00:00'),
  ]), true)
  assert.equal(shouldSeedDraft({ body: '초안', at: '말이 안 되는 값' }, []), true)
})
