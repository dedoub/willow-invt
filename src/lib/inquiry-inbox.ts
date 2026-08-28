// 네 앱 문의함 — 서버 전용. 클라이언트 컴포넌트가 import 하면 빌드가 깨지도록 잠근다.
// 순수 로직(대응표·변환·정렬·권한)은 inquiry-inbox-core.ts 에 있다.
import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { portleSupabase } from '@/lib/portle-supabase'
import { scriptaSupabase } from '@/lib/scripta-supabase'
import { reviewnotesSupabase } from '@/lib/reviewnotes-supabase'
import {
  INQUIRY_APPS, attachPeople, loadAppThreads, loadThreadDraft, loadThreadMessages,
  type PersonInfo,
  type InquiryAppKey, type InquiryAppResult, type InquiryAppSpec,
  type InquiryDraftDto, type InquiryMessageDto, type SelectPage,
  clearDraft,
  type DraftClearClient,
} from '@/lib/inquiry-inbox-core'

export * from '@/lib/inquiry-inbox-core'

// 보이스카드만 공용 클라이언트가 없다(voicecards-server.ts 가 모듈 안에 감춰 둔다).
// 다른 셋은 각 앱 모듈이 내보내는 것을 그대로 쓴다 — 키가 갈라지면 안 된다.
const voicecardsSupabase = process.env.VOICECARDS_SUPABASE_URL && process.env.VOICECARDS_SUPABASE_SERVICE_KEY
  ? createClient(
      process.env.VOICECARDS_SUPABASE_URL,
      process.env.VOICECARDS_SUPABASE_SERVICE_KEY,
      { auth: { persistSession: false } },
    )
  : null

const CLIENTS: Record<InquiryAppKey, SupabaseClient | null> = {
  voicecards: voicecardsSupabase,
  portle: portleSupabase,
  scripta: scriptaSupabase,
  reviewnotes: reviewnotesSupabase,
}

const ENV_HINT: Record<InquiryAppKey, string> = {
  voicecards: 'VOICECARDS_SUPABASE_URL / VOICECARDS_SUPABASE_SERVICE_KEY',
  portle: 'PORTLE_SUPABASE_URL / PORTLE_SUPABASE_SECRET_KEY',
  scripta: 'SCRIPTA_SUPABASE_URL / SCRIPTA_SUPABASE_SERVICE_KEY',
  reviewnotes: 'REVIEWNOTES_SUPABASE_URL / REVIEWNOTES_SUPABASE_SERVICE_KEY',
}

export function clientFor(app: InquiryAppKey): SupabaseClient | null {
  return CLIENTS[app]
}

/**
 * SelectPage 어댑터. 조회가 실패하면 **던진다** — 여기서 빈 배열을 돌려주면
 * 위층이 그걸 "문의 없음"으로 그린다.
 */
export function selectPageVia(app: InquiryAppKey, db: SupabaseClient): SelectPage {
  return async ({ table, columns, orderBy, ascending, from, to, filterColumn, filterValue }) => {
    let q = db.from(table).select(columns).order(orderBy, { ascending })
    if (filterColumn !== undefined && filterValue !== undefined) q = q.eq(filterColumn, filterValue)
    const { data, error } = await q.range(from, to)
    if (error) throw new Error(`${app} ${table} 조회 실패 (${error.code ?? '?'}): ${error.message}`)
    // 컬럼 목록이 리터럴이 아니라 변수라 supabase-js 가 행 타입을 못 세운다
    // (GenericStringError). 실제 모양은 컬럼→값 맵이 맞다.
    return (data ?? []) as unknown as Record<string, unknown>[]
  }
}

function missingClient(spec: InquiryAppSpec): InquiryAppResult {
  return { app: spec.key, status: 'error', message: `${spec.label} Supabase 미설정 (${ENV_HINT[spec.key]})` }
}

/**
 * 문의자의 이름·이메일. 스레드에는 id 만 있어 화면에 짧은 해시가 뜨는데, 그것만
 * 보고는 누구에게 답하는지 알 수 없다.
 *
 * <b>실패해도 던지지 않는다.</b> 신원을 못 읽은 것과 문의를 못 읽은 것은 무게가
 * 다르다 — 여기서 던지면 이름을 못 찾았다는 이유로 문의함 전체가 빈다.
 */
async function loadPeople(
  spec: InquiryAppSpec,
  db: SupabaseClient,
  ids: readonly string[],
): Promise<Map<string, PersonInfo>> {
  const found = new Map<string, PersonInfo>()
  if (!spec.people || ids.length === 0) return found

  try {
    if (spec.people === 'auth') {
      // 인증 사용자는 표가 아니라 관리 API 로 읽는다(auth 스키마는 PostgREST 에
      // 열려 있지 않다). 한 명씩 부르지만 문의를 연 사람 수만큼이라 몇 건이다.
      const users = await Promise.all(ids.map(id => db.auth.admin.getUserById(id)))
      users.forEach(({ data, error }, i) => {
        if (error || !data?.user) return
        const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>
        const name = meta.full_name ?? meta.name
        found.set(ids[i], {
          name: typeof name === 'string' ? name : null,
          email: data.user.email ?? null,
        })
      })
      return found
    }

    const { table, idColumn, emailColumn, nameColumn } = spec.people
    const columns = [idColumn, emailColumn, nameColumn].filter(Boolean).join(',')
    const { data, error } = await db.from(table).select(columns).in(idColumn, [...ids])
    if (error) throw new Error(`${error.code ?? '?'}: ${error.message}`)
    for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
      const id = row[idColumn]
      if (typeof id !== 'string') continue
      const name = nameColumn ? row[nameColumn] : null
      const email = row[emailColumn]
      found.set(id, {
        name: typeof name === 'string' ? name : null,
        email: typeof email === 'string' ? email : null,
      })
    }
  } catch (err) {
    console.error(`[inquiry] ${spec.key} 문의자 신원을 못 읽었다:`, err)
  }
  return found
}

/** 네 앱 전부. 한 앱이 깨져도 나머지는 나온다 — 깨진 앱은 error 로 표시된다. */
export async function loadInquiryInbox(): Promise<InquiryAppResult[]> {
  return Promise.all(INQUIRY_APPS.map(async spec => {
    const db = CLIENTS[spec.key]
    if (!db) return missingClient(spec)
    const result = await loadAppThreads(spec, selectPageVia(spec.key, db))
    if (result.status !== 'ok') return result
    const ids = [...new Set(result.threads.map(t => t.personId).filter((v): v is string => !!v))]
    return { ...result, threads: attachPeople(result.threads, await loadPeople(spec, db, ids)) }
  }))
}

/** 한 스레드의 대화 전량. 실패는 던진다(라우트가 500 으로 옮긴다). */
export async function loadInquiryConversation(
  spec: InquiryAppSpec,
  threadId: string,
): Promise<InquiryMessageDto[]> {
  const db = CLIENTS[spec.key]
  if (!db) throw new Error(`${spec.label} Supabase 미설정 (${ENV_HINT[spec.key]})`)
  return loadThreadMessages(spec, threadId, selectPageVia(spec.key, db))
}

/**
 * 한 스레드의 봇 초안. 실패는 던진다(라우트가 draftError 로 옮긴다 — 못 읽은 것을
 * "초안 없음"으로 그리면 사람이 빈 칸 앞에서 처음부터 다시 쓴다).
 */
export async function loadInquiryDraft(
  spec: InquiryAppSpec,
  threadId: string,
): Promise<InquiryDraftDto | null> {
  const db = CLIENTS[spec.key]
  if (!db) throw new Error(`${spec.label} Supabase 미설정 (${ENV_HINT[spec.key]})`)
  return loadThreadDraft(spec, threadId, selectPageVia(spec.key, db))
}

/** 발행 전 채널 확인용 — 스레드 한 줄. 없으면 null. */
export async function readThreadChannel(
  spec: InquiryAppSpec,
  threadId: string,
): Promise<{ channel: string | null } | null> {
  const db = CLIENTS[spec.key]
  if (!db) throw new Error(`${spec.label} Supabase 미설정 (${ENV_HINT[spec.key]})`)
  const col = spec.thread.channel
  const { data, error } = await db
    .from(spec.threadTable)
    .select(col ? `${spec.thread.id},${col}` : spec.thread.id)
    .eq(spec.thread.id, threadId)
    .limit(1)
  if (error) throw new Error(`${spec.key} 스레드 조회 실패 (${error.code ?? '?'}): ${error.message}`)
  const row = (data ?? [])[0] as unknown as Record<string, unknown> | undefined
  if (!row) return null
  return { channel: col ? (typeof row[col] === 'string' ? (row[col] as string) : null) : null }
}

/**
 * 답변 발행.
 *
 * 두 번 쓰지 않는다 — 두 앱 모두 `publish_inquiry_reply(uuid, text, text)` 를 갖고
 * 있고, 그 함수 하나가 한 트랜잭션 안에서 메시지를 넣고 플래그(unread_for_user=true,
 * unread_for_admin=false, last_message_at=now())를 세운다. 앱의 마이그레이션 주석이
 * 그렇게 못박아 뒀다: "발행의 유일한 정문. 텔레그램 답장도 대시보드도 이 함수만 부른다."
 *
 * 덕분에 "메시지는 들어갔는데 플래그가 안 섰다"는 중간 상태가 존재할 수 없다.
 * 함수가 던지면 삽입도 함께 되돌아가므로, 실패는 언제나 통째로 실패다.
 *
 * 돌려주는 값은 스레드의 channel — 'app' 이면 끝이다. 'email' 은 여기 오기 전에
 * publishGuard 가 막지만, 그 사이에 바뀌었을 경우를 위해 호출자에게도 알려준다.
 */
export async function publishInquiryReply(
  spec: InquiryAppSpec,
  threadId: string,
  body: string,
): Promise<{ channel: string | null }> {
  const db = CLIENTS[spec.key]
  if (!db) throw new Error(`${spec.label} Supabase 미설정 (${ENV_HINT[spec.key]})`)
  const { data, error } = await db.rpc('publish_inquiry_reply', {
    p_thread_id: threadId,
    p_body: body,
    p_source: 'willow-dashboard',
  })
  if (error) throw new Error(`${spec.key} 답변 발행 실패 (${error.code ?? '?'}): ${error.message}`)

  // 발행한 뒤 초안 칸을 비운다. `publish_inquiry_reply` 는 초안을 건드리지
  // 않아서, 운영자가 <b>초안을 고쳐</b> 보내면 고치기 전 원본이 DB 에 그대로
  // 남는다. 텔레그램에 승인 버튼이 붙는 순간(`publish_inquiry_draft` 는 이미
  // DB 에 있고 부르는 곳만 없다) 그 낡은 원본이 <b>두 번째 메시지로</b>
  // 고객에게 간다 — 고친 이유가 있어서 고쳤는데.
  //
  // 실패해도 <b>던지지 않는다.</b> 답변은 이미 고객에게 갔고, 초안을 못
  // 지웠다고 성공을 실패로 보고하면 운영자가 같은 답을 한 번 더 보낸다.
  // 크게 로그만 남긴다 — 안 보이는 고장을 만들지 않는다.
  const cleared = await clearDraft(spec, threadId, CLIENTS[spec.key] as DraftClearClient | null)
  if (!cleared) {
    console.error(`[inquiry] ${spec.key} ${threadId}: 발행은 됐는데 초안을 못 지웠다`)
  }

  return { channel: typeof data === 'string' ? data : null }
}


