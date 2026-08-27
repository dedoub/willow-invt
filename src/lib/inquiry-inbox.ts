// 네 앱 문의함 — 서버 전용. 클라이언트 컴포넌트가 import 하면 빌드가 깨지도록 잠근다.
// 순수 로직(대응표·변환·정렬·권한)은 inquiry-inbox-core.ts 에 있다.
import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { portleSupabase } from '@/lib/portle-supabase'
import { scriptaSupabase } from '@/lib/scripta-supabase'
import { reviewnotesSupabase } from '@/lib/reviewnotes-supabase'
import {
  INQUIRY_APPS, loadAppThreads, loadThreadMessages,
  type InquiryAppKey, type InquiryAppResult, type InquiryAppSpec,
  type InquiryMessageDto, type SelectPage,
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

/** 네 앱 전부. 한 앱이 깨져도 나머지는 나온다 — 깨진 앱은 error 로 표시된다. */
export async function loadInquiryInbox(): Promise<InquiryAppResult[]> {
  return Promise.all(INQUIRY_APPS.map(spec => {
    const db = CLIENTS[spec.key]
    if (!db) return Promise.resolve(missingClient(spec))
    return loadAppThreads(spec, selectPageVia(spec.key, db))
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
  return { channel: typeof data === 'string' ? data : null }
}
