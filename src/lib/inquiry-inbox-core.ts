// 네 앱의 앱 안 1:1 문의를 한 곳에서 읽고, 답할 곳이 없는 두 앱에만 답한다.
//
// 이 파일에는 네트워크가 없다 — 스키마 대응표, 행→DTO 변환, 정렬, 권한 판정만 있다.
// 실제 Supabase 클라이언트는 inquiry-inbox.ts(server-only)가 붙이고, 이 파일의
// 함수에 SelectPage 하나로 넘긴다. 그래야 "무엇을 어떤 컬럼으로 조회했는가"를
// 가짜 없이 시험할 수 있다.
//
// 스키마는 2026-08-28 라이브 조회로 확인했다. 브리핑과 다른 점 두 가지:
//   - 포틀 inquiry_threads 에는 account_id 가 없다. 신원 컬럼은 subject(UNIQUE)다.
//   - 리뷰노트 sender 는 Prisma enum "InquirySender" 라 값이 대문자('USER'/'SUPPORT')다.

export type InquiryAppKey = 'voicecards' | 'portle' | 'scripta' | 'reviewnotes'

export type InquirySender = 'user' | 'support'

/** 조회 한 페이지. PostgREST 가 응답당 1000행에서 자르므로 이 단위로 넘긴다. */
export const PAGE_SIZE = 1000

/**
 * 페이지 루프 상한. 상한에 닿으면 **잘라서 돌려주지 않고 던진다** — 조용히 잘린
 * 목록은 "오래된 문의가 사라진 것"과 화면에서 구별되지 않는다.
 */
export const MAX_PAGES = 500

export type InquiryRow = Record<string, unknown>

export interface SelectPageArgs {
  table: string
  columns: string
  orderBy: string
  ascending: boolean
  /** range 하한(포함) */
  from: number
  /** range 상한(포함) */
  to: number
  filterColumn?: string
  filterValue?: string
}

/** 한 페이지를 읽어 행을 돌려준다. 실패하면 **던진다** (빈 배열 금지). */
export type SelectPage = (args: SelectPageArgs) => Promise<InquiryRow[]>

interface ThreadColumns {
  id: string
  /** account_id / subject / user_id / userId — 스키마가 이미 들고 있는 신원 컬럼 */
  person: string
  channel: string | null
  createdAt: string
  lastMessageAt: string
  unreadForAdmin: string
  unreadForUser: string
  appVersion: string | null
  platform: string | null
  locale: string | null
}

interface MessageColumns {
  id: string
  threadId: string
  sender: string
  body: string
  createdAt: string
}

export interface InquiryAppSpec {
  key: InquiryAppKey
  label: string
  /** 사이드바 앱 행과 같은 색점 */
  dot: string
  threadTable: string
  messageTable: string
  /**
   * 여기서 답을 쓸 수 있는가. 자체 관리자 화면이 없는 앱(보이스카드·포틀)만 true.
   * 스크립타·리뷰노트는 이미 발행 경로가 하나 있고, 두 번째 필자는 언젠가 갈라진다.
   */
  writable: boolean
  /** 자체 관리자 화면 주소 — 읽기 전용 앱의 나가는 길 */
  adminUrl: string | null
  thread: ThreadColumns
  message: MessageColumns
  /** DB에 저장된 sender 값. 리뷰노트만 대문자다. */
  senderValues: Record<InquirySender, string>
}

const SNAKE_MESSAGE: MessageColumns = {
  id: 'id', threadId: 'thread_id', sender: 'sender', body: 'body', createdAt: 'created_at',
}

export const INQUIRY_APPS: readonly InquiryAppSpec[] = [
  {
    key: 'voicecards',
    label: '보이스카드',
    dot: '#4FBE84',
    threadTable: 'inquiry_threads',
    messageTable: 'inquiry_messages',
    writable: true,
    adminUrl: null,
    thread: {
      id: 'id', person: 'account_id', channel: 'channel',
      createdAt: 'created_at', lastMessageAt: 'last_message_at',
      unreadForAdmin: 'unread_for_admin', unreadForUser: 'unread_for_user',
      appVersion: 'app_version', platform: 'platform', locale: 'locale',
    },
    message: SNAKE_MESSAGE,
    senderValues: { user: 'user', support: 'support' },
  },
  {
    key: 'portle',
    label: '포틀',
    dot: '#E8927C',
    threadTable: 'inquiry_threads',
    messageTable: 'inquiry_messages',
    writable: true,
    adminUrl: null,
    thread: {
      // 포틀은 account_id 가 없다 — 신원은 subject(google:… / device:…)다.
      id: 'id', person: 'subject', channel: 'channel',
      createdAt: 'created_at', lastMessageAt: 'last_message_at',
      unreadForAdmin: 'unread_for_admin', unreadForUser: 'unread_for_user',
      appVersion: 'app_version', platform: 'platform', locale: 'locale',
    },
    message: SNAKE_MESSAGE,
    senderValues: { user: 'user', support: 'support' },
  },
  {
    key: 'scripta',
    label: '스크립타',
    dot: '#E894B0',
    threadTable: 'scripta_inquiry_threads',
    messageTable: 'scripta_inquiry_messages',
    writable: false,
    adminUrl: 'https://scripta.quest/admin/inquiries',
    thread: {
      id: 'id', person: 'user_id', channel: null,
      createdAt: 'created_at', lastMessageAt: 'last_message_at',
      unreadForAdmin: 'unread_for_admin', unreadForUser: 'unread_for_user',
      appVersion: null, platform: null, locale: null,
    },
    message: SNAKE_MESSAGE,
    senderValues: { user: 'user', support: 'support' },
  },
  {
    key: 'reviewnotes',
    label: '리뷰노트',
    dot: '#5FAFDF',
    // Prisma 스키마라 테이블·컬럼이 섞인 대소문자다. PostgREST 는 식별자를 스스로
    // 인용하므로 여기서는 따옴표를 붙이지 않는다 — 생 SQL 로 같은 것을 조회할 때만
    // "InquiryThread" 처럼 큰따옴표가 필요하다.
    threadTable: 'InquiryThread',
    messageTable: 'InquiryMessage',
    writable: false,
    adminUrl: 'https://reviewnotes.app/admin/inquiries',
    thread: {
      id: 'id', person: 'userId', channel: null,
      createdAt: 'createdAt', lastMessageAt: 'lastMessageAt',
      unreadForAdmin: 'unreadForAdmin', unreadForUser: 'unreadForUser',
      appVersion: null, platform: null, locale: null,
    },
    message: {
      id: 'id', threadId: 'threadId', sender: 'sender', body: 'body', createdAt: 'createdAt',
    },
    // Prisma enum "InquirySender" — 대문자다. 라이브 조회로 확인(소문자는 22P02).
    senderValues: { user: 'USER', support: 'SUPPORT' },
  },
] as const

export function appSpec(key: string): InquiryAppSpec | null {
  return INQUIRY_APPS.find(a => a.key === key) ?? null
}

// ─── DTO ──────────────────────────────────────────────────────────────────────
//
// access_token 과 draft_* 는 브라우저로 나가지 않는다. 그래서 행을 펼치지(spread)
// 않고 한 칸씩 옮겨 적는다 — 스키마에 컬럼이 하나 붙어도 여기 손대기 전엔 안 샌다.

export interface InquiryThreadDto {
  app: InquiryAppKey
  id: string
  /** 스키마가 이미 들고 있는 신원값. 이메일이 아니다. */
  personId: string | null
  channel: string | null
  createdAt: string
  lastMessageAt: string
  unreadForAdmin: boolean
  unreadForUser: boolean
  appVersion: string | null
  platform: string | null
  locale: string | null
}

export interface InquiryMessageDto {
  id: string
  sender: InquirySender
  body: string
  createdAt: string
}

/** DTO 가 가진 키의 전부. 시험이 이 목록과 정확히 대조한다. */
export const THREAD_DTO_KEYS: readonly string[] = [
  'app', 'id', 'personId', 'channel', 'createdAt', 'lastMessageAt',
  'unreadForAdmin', 'unreadForUser', 'appVersion', 'platform', 'locale',
]

/**
 * 시각을 항상 시간대가 붙은 ISO 로.
 *
 * 리뷰노트만 형태가 다르다. Prisma DateTime 은 timestamp(3)(시간대 없음)이라
 * PostgREST 가 '2025-10-12T15:49:12.129' 처럼 오프셋 없이 돌려주고(2026-08-28
 * 라이브 확인), 나머지 셋은 '...+00:00' 이 붙어 온다. 저장된 값은 넷 다 UTC 인데
 * JS 는 오프셋 없는 ISO 를 **로컬 시각**으로 읽는다 — KST 기기에서 아홉 시간이
 * 어긋난다. 네 앱을 한 줄에 세우는 화면이라, 여기서 맞춰 두지 않으면 리뷰노트
 * 문의만 아홉 시간 일찍 서고 아홉 시간 이른 시각으로 보인다.
 */
export function toInstant(raw: string): string {
  return /(?:Z|z|[+-]\d{2}:?\d{2})$/.test(raw) ? raw : `${raw}Z`
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : v == null ? null : String(v)
}

function req(v: unknown, what: string): string {
  const s = str(v)
  if (s === null || s === '') throw new Error(`${what}: 값이 비어 있다`)
  return s
}

export function threadColumns(spec: InquiryAppSpec): string {
  const c = spec.thread
  return [
    c.id, c.person, c.channel, c.createdAt, c.lastMessageAt,
    c.unreadForAdmin, c.unreadForUser, c.appVersion, c.platform, c.locale,
  ].filter((x): x is string => !!x).join(',')
}

export function messageColumns(spec: InquiryAppSpec): string {
  const c = spec.message
  return [c.id, c.threadId, c.sender, c.body, c.createdAt].join(',')
}

export function toThreadDto(spec: InquiryAppSpec, row: InquiryRow): InquiryThreadDto {
  const c = spec.thread
  return {
    app: spec.key,
    id: req(row[c.id], `${spec.key} 스레드 id`),
    personId: str(row[c.person]),
    channel: c.channel ? str(row[c.channel]) : null,
    createdAt: toInstant(req(row[c.createdAt], `${spec.key} created_at`)),
    lastMessageAt: toInstant(req(row[c.lastMessageAt], `${spec.key} last_message_at`)),
    unreadForAdmin: row[c.unreadForAdmin] === true,
    unreadForUser: row[c.unreadForUser] === true,
    appVersion: c.appVersion ? str(row[c.appVersion]) : null,
    platform: c.platform ? str(row[c.platform]) : null,
    locale: c.locale ? str(row[c.locale]) : null,
  }
}

/**
 * 저장된 sender 값을 우리 표기로. 모르는 값이면 **던진다** — 기본값으로 접으면
 * 고객이 쓴 말이 우리 답변으로(또는 그 반대로) 보인다. 대화에서 그건 조용한 오답이다.
 */
export function toSender(spec: InquiryAppSpec, raw: unknown): InquirySender {
  if (raw === spec.senderValues.user) return 'user'
  if (raw === spec.senderValues.support) return 'support'
  throw new Error(`${spec.key} ${spec.messageTable}.sender 값을 모른다: ${JSON.stringify(raw)}`)
}

export function toMessageDto(spec: InquiryAppSpec, row: InquiryRow): InquiryMessageDto {
  const c = spec.message
  return {
    id: req(row[c.id], `${spec.key} 메시지 id`),
    sender: toSender(spec, row[c.sender]),
    body: str(row[c.body]) ?? '',
    createdAt: toInstant(req(row[c.createdAt], `${spec.key} 메시지 created_at`)),
  }
}

// ─── 정렬 ─────────────────────────────────────────────────────────────────────

/** 미답변 먼저, 그 안에서 최근 순. 네 앱을 섞어 세우므로 시각은 파싱해서 비교한다. */
export function sortThreads(threads: readonly InquiryThreadDto[]): InquiryThreadDto[] {
  return [...threads].sort((a, b) => {
    if (a.unreadForAdmin !== b.unreadForAdmin) return a.unreadForAdmin ? -1 : 1
    return Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt)
  })
}

// ─── 조회 ─────────────────────────────────────────────────────────────────────

/**
 * 상한 없이 전량. PostgREST 가 응답당 1000행에서 자르므로 짧은 페이지가 나올
 * 때까지 이어 읽는다. 상한(MAX_PAGES)에 닿으면 잘린 목록을 돌려주는 대신 던진다.
 */
export async function selectAllPages(
  select: SelectPage,
  base: Omit<SelectPageArgs, 'from' | 'to'>,
): Promise<InquiryRow[]> {
  const rows: InquiryRow[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE
    const got = await select({ ...base, from, to: from + PAGE_SIZE - 1 })
    rows.push(...got)
    if (got.length < PAGE_SIZE) return rows
  }
  throw new Error(`${base.table}: ${MAX_PAGES}페이지를 넘겼다 — 잘라서 보여주지 않는다`)
}

export type InquiryAppResult =
  | { app: InquiryAppKey; status: 'ok'; threads: InquiryThreadDto[] }
  | { app: InquiryAppKey; status: 'error'; message: string }

/**
 * 한 앱의 스레드 전량.
 *
 * 실패는 **빈 목록이 아니라 error 상태**로 나간다. 조회가 깨진 화면과 문의가
 * 없는 화면이 똑같이 보이면 "기다리는 문의 없음"으로 오진한다(2026-08-28 실제 사례).
 */
export async function loadAppThreads(
  spec: InquiryAppSpec,
  select: SelectPage,
): Promise<InquiryAppResult> {
  try {
    const rows = await selectAllPages(select, {
      table: spec.threadTable,
      columns: threadColumns(spec),
      orderBy: spec.thread.lastMessageAt,
      ascending: false,
    })
    return { app: spec.key, status: 'ok', threads: sortThreads(rows.map(r => toThreadDto(spec, r))) }
  } catch (err) {
    return { app: spec.key, status: 'error', message: err instanceof Error ? err.message : String(err) }
  }
}

/** 한 스레드의 메시지 전량 — 오래된 것부터. */
export async function loadThreadMessages(
  spec: InquiryAppSpec,
  threadId: string,
  select: SelectPage,
): Promise<InquiryMessageDto[]> {
  const rows = await selectAllPages(select, {
    table: spec.messageTable,
    columns: messageColumns(spec),
    orderBy: spec.message.createdAt,
    ascending: true,
    filterColumn: spec.message.threadId,
    filterValue: threadId,
  })
  return rows.map(r => toMessageDto(spec, r))
}

// ─── 권한 ─────────────────────────────────────────────────────────────────────

export type AdminGate = 'ok' | 'unauthenticated' | 'forbidden'

/**
 * 세션 없음(401)과 세션은 있으나 관리자가 아님(403)은 서로 다른 사실이다.
 * role 이 비어 있으면 관리자가 **아니다** — 빈 값이 통과하면 게이트가 없는 것과 같다.
 */
export function adminGate(user: { role?: unknown } | null | undefined): AdminGate {
  if (!user) return 'unauthenticated'
  return user.role === 'admin' ? 'ok' : 'forbidden'
}

export const ADMIN_GATE_STATUS: Record<Exclude<AdminGate, 'ok'>, number> = {
  unauthenticated: 401,
  forbidden: 403,
}

// ─── 발행 ─────────────────────────────────────────────────────────────────────

export type PublishGuard = 'ok' | 'unknown-app' | 'read-only-app' | 'empty-body' | 'legacy-email'

/**
 * 쓰기 전 판정.
 *
 * channel='email' 은 구버전(Apps Script) 문의다 — 그쪽 고객에겐 앱 안 문의함이
 * 없어서, 여기서 발행하면 DB 에는 답이 남지만 고객은 영영 못 본다. 성공처럼
 * 보이는 실패라 아예 막는다.
 */
export function publishGuard(
  spec: InquiryAppSpec | null,
  thread: { channel: string | null } | null,
  body: string,
): PublishGuard {
  if (!spec) return 'unknown-app'
  if (!spec.writable) return 'read-only-app'
  if (body.trim() === '') return 'empty-body'
  if (thread && thread.channel !== null && thread.channel !== 'app') return 'legacy-email'
  return 'ok'
}

export const PUBLISH_GUARD_MESSAGE: Record<Exclude<PublishGuard, 'ok'>, string> = {
  'unknown-app': '모르는 앱이다',
  'read-only-app': '이 앱은 자체 관리자 화면에서 답한다 — 여기서는 읽기만 한다',
  'empty-body': '빈 답변은 보내지 않는다',
  'legacy-email': '구버전 이메일 문의다 — 앱 안 문의함이 없어 답을 써도 고객이 못 본다',
}

export const PUBLISH_GUARD_STATUS: Record<Exclude<PublishGuard, 'ok'>, number> = {
  'unknown-app': 400,
  'read-only-app': 403,
  'empty-body': 400,
  'legacy-email': 409,
}
