import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getUserFromAuthInfo } from '../auth'
import { checkToolPermission } from '../permissions'
import { logMcpAction } from '../audit'
import { getServiceSupabase } from '@/lib/supabase'

const ok = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] })
const err = (msg: string) => ({ content: [{ type: 'text' as const, text: msg }], isError: true })

const EVENT_KINDS = ['progress', 'decision', 'blocker', 'note', 'email_ref', 'commit'] as const
const THREAD_STATUSES = ['open', 'blocked', 'resolved', 'archived'] as const

export function registerWorkstationTools(server: McpServer) {
  // ─── 부팅 맥락 로드 (모든 세션이 시작 시 호출) ───
  server.registerTool('ws_context_load', {
    description: '[워크스테이션] cross-project 부팅 맥락을 한 번에 로드합니다. 열린 스레드(우선순위·최근순), 최근 결정, 최근 세션 요약. 어떤 프로젝트/워크트리 세션이든 시작 시 이것부터 호출하세요.',
    inputSchema: z.object({
      project: z.string().optional().describe('특정 프로젝트로 한정 (미지정 시 전체)'),
      thread_limit: z.number().optional().describe('열린 스레드 수 (기본 20)'),
    }),
  }, async ({ project, thread_limit }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return err('Unauthorized')
    const perm = checkToolPermission('ws_context_load', user, authInfo?.scopes || [])
    if (!perm.allowed) return err(perm.reason!)

    const supabase = getServiceSupabase()

    let threadsQ = supabase
      .from('ws_threads')
      .select('id, project, title, status, priority, summary, tags, last_touched_at')
      .in('status', ['open', 'blocked'])
      .order('priority', { ascending: true })
      .order('last_touched_at', { ascending: false })
      .limit(thread_limit || 20)
    if (project) threadsQ = threadsQ.eq('project', project)

    let decisionsQ = supabase
      .from('ws_thread_events')
      .select('thread_id, project, body, ref, created_at')
      .eq('kind', 'decision')
      .order('created_at', { ascending: false })
      .limit(10)
    if (project) decisionsQ = decisionsQ.eq('project', project)

    let sessionsQ = supabase
      .from('ws_sessions')
      .select('project, worktree_path, title, summary, highlights, started_at, ended_at')
      .order('started_at', { ascending: false })
      .limit(8)
    if (project) sessionsQ = sessionsQ.eq('project', project)

    const [{ data: threads, error: te }, { data: decisions }, { data: sessions }] = await Promise.all([threadsQ, decisionsQ, sessionsQ])
    if (te) return err(`Error: ${te.message}`)

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'ws_context_load', inputParams: { project, thread_limit } })
    return ok({ open_threads: threads || [], recent_decisions: decisions || [], recent_sessions: sessions || [] })
  })

  // ─── 스레드 목록 ───
  server.registerTool('ws_thread_list', {
    description: '[워크스테이션] 스레드 목록을 조회합니다. 프로젝트/상태 필터 가능.',
    inputSchema: z.object({
      project: z.string().optional(),
      status: z.enum(THREAD_STATUSES).optional().describe('기본: open+blocked'),
      limit: z.number().optional(),
    }),
  }, async ({ project, status, limit }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return err('Unauthorized')
    const perm = checkToolPermission('ws_thread_list', user, authInfo?.scopes || [])
    if (!perm.allowed) return err(perm.reason!)

    const supabase = getServiceSupabase()
    let q = supabase
      .from('ws_threads')
      .select('id, project, title, status, priority, summary, tags, entity_ids, created_at, last_touched_at')
      .order('last_touched_at', { ascending: false })
      .limit(limit || 50)
    if (project) q = q.eq('project', project)
    if (status) q = q.eq('status', status)
    else q = q.in('status', ['open', 'blocked'])

    const { data, error } = await q
    if (error) return err(`Error: ${error.message}`)

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'ws_thread_list', inputParams: { project, status, limit } })
    return ok(data || [])
  })

  // ─── 스레드 상세 + 이벤트 로그 ───
  server.registerTool('ws_thread_get', {
    description: '[워크스테이션] 스레드 상세와 전체 이벤트 로그(진행/결정/블로커/이메일 등)를 조회합니다.',
    inputSchema: z.object({
      thread_id: z.string().describe('스레드 UUID'),
      event_limit: z.number().optional().describe('이벤트 수 (기본 50)'),
    }),
  }, async ({ thread_id, event_limit }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return err('Unauthorized')
    const perm = checkToolPermission('ws_thread_get', user, authInfo?.scopes || [])
    if (!perm.allowed) return err(perm.reason!)

    const supabase = getServiceSupabase()
    const { data: thread, error } = await supabase.from('ws_threads').select('*').eq('id', thread_id).single()
    if (error || !thread) return err(`Thread not found: ${thread_id}`)

    const { data: events } = await supabase
      .from('ws_thread_events')
      .select('id, kind, body, ref, author, created_at')
      .eq('thread_id', thread_id)
      .order('created_at', { ascending: false })
      .limit(event_limit || 50)

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'ws_thread_get', inputParams: { thread_id } })
    return ok({ thread, events: events || [] })
  })

  // ─── 스레드 생성/수정 (upsert) ───
  server.registerTool('ws_thread_upsert', {
    description: '[워크스테이션] 스레드를 생성하거나 수정합니다. thread_id를 주면 수정, 없으면 생성. entity_ids로 knowledge_entities와 연결.',
    inputSchema: z.object({
      thread_id: z.string().optional().describe('수정 시 스레드 UUID'),
      project: z.string().optional().describe('프로젝트 키 (예: willow-invt, valuechain-wiki, voicecards, global). 생성 시 기본 global'),
      title: z.string().optional().describe('생성 시 필수'),
      status: z.enum(THREAD_STATUSES).optional(),
      priority: z.enum(['high', 'normal', 'low']).optional(),
      summary: z.string().optional().describe('현재 상태 한 줄'),
      entity_ids: z.array(z.string()).optional().describe('knowledge_entities UUID 배열'),
      tags: z.array(z.string()).optional(),
    }),
  }, async ({ thread_id, project, title, status, priority, summary, entity_ids, tags }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return err('Unauthorized')
    const perm = checkToolPermission('ws_thread_upsert', user, authInfo?.scopes || [])
    if (!perm.allowed) return err(perm.reason!)

    const supabase = getServiceSupabase()

    if (thread_id) {
      const patch: Record<string, unknown> = { last_touched_at: new Date().toISOString() }
      if (project !== undefined) patch.project = project
      if (title !== undefined) patch.title = title
      if (status !== undefined) patch.status = status
      if (priority !== undefined) patch.priority = priority
      if (summary !== undefined) patch.summary = summary
      if (entity_ids !== undefined) patch.entity_ids = entity_ids
      if (tags !== undefined) patch.tags = tags

      const { data, error } = await supabase.from('ws_threads').update(patch).eq('id', thread_id).select().single()
      if (error) return err(`Error: ${error.message}`)
      await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'ws_thread_upsert', inputParams: { thread_id } })
      return ok({ updated: data })
    }

    if (!title) return err('생성 시 title은 필수입니다.')
    const { data, error } = await supabase.from('ws_threads').insert({
      project: project || 'global',
      title,
      status: status || 'open',
      priority: priority || 'normal',
      summary: summary || null,
      entity_ids: entity_ids || [],
      tags: tags || [],
    }).select().single()
    if (error) return err(`Error: ${error.message}`)

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'ws_thread_upsert', inputParams: { title, project } })
    return ok({ created: data })
  })

  // ─── 스레드에 이벤트 append (진행/결정/블로커/이메일/커밋) ───
  server.registerTool('ws_thread_log', {
    description: '[워크스테이션] 스레드에 이벤트를 남깁니다. kind: progress(진행), decision(결정), blocker(막힘), note(메모), email_ref(이메일 연결), commit(커밋). email_ref는 ref에 {gmail_thread_id}, commit은 ref에 {commit_sha} 권장. 스레드의 last_touched_at도 갱신됩니다.',
    inputSchema: z.object({
      thread_id: z.string().describe('스레드 UUID'),
      kind: z.enum(EVENT_KINDS).describe('이벤트 종류'),
      body: z.string().describe('내용'),
      ref: z.record(z.string(), z.unknown()).optional().describe('참조 (gmail_thread_id, url, commit_sha, session_id 등)'),
      author: z.string().optional().describe('작성 주체 (agent/세션/사람)'),
    }),
  }, async ({ thread_id, kind, body, ref, author }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return err('Unauthorized')
    const perm = checkToolPermission('ws_thread_log', user, authInfo?.scopes || [])
    if (!perm.allowed) return err(perm.reason!)

    const supabase = getServiceSupabase()

    const { data: thread } = await supabase.from('ws_threads').select('id, project').eq('id', thread_id).single()
    if (!thread) return err(`Thread not found: ${thread_id}`)

    const { data, error } = await supabase.from('ws_thread_events').insert({
      thread_id,
      project: thread.project,
      kind,
      body,
      ref: ref || {},
      author: author || user.userId,
    }).select().single()
    if (error) return err(`Error: ${error.message}`)

    // 스레드 touch
    await supabase.from('ws_threads').update({ last_touched_at: new Date().toISOString() }).eq('id', thread_id)

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'ws_thread_log', inputParams: { thread_id, kind } })
    return ok({ logged: data })
  })

  // ─── 스레드 종료 (resolve/archive) ───
  server.registerTool('ws_thread_resolve', {
    description: '[워크스테이션] 스레드를 종료합니다. status를 resolved(해결) 또는 archived(보관)로 변경.',
    inputSchema: z.object({
      thread_id: z.string().describe('스레드 UUID'),
      status: z.enum(['resolved', 'archived']).optional().describe('기본 resolved'),
      resolution: z.string().optional().describe('종료 사유/결과 (이벤트로 기록)'),
    }),
  }, async ({ thread_id, status, resolution }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return err('Unauthorized')
    const perm = checkToolPermission('ws_thread_resolve', user, authInfo?.scopes || [])
    if (!perm.allowed) return err(perm.reason!)

    const supabase = getServiceSupabase()
    const { data: thread } = await supabase.from('ws_threads').select('id, project').eq('id', thread_id).single()
    if (!thread) return err(`Thread not found: ${thread_id}`)

    const { error } = await supabase.from('ws_threads')
      .update({ status: status || 'resolved', last_touched_at: new Date().toISOString() })
      .eq('id', thread_id)
    if (error) return err(`Error: ${error.message}`)

    if (resolution) {
      await supabase.from('ws_thread_events').insert({
        thread_id, project: thread.project, kind: 'decision',
        body: `[종료] ${resolution}`, author: user.userId,
      })
    }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'ws_thread_resolve', inputParams: { thread_id, status } })
    return ok({ resolved: thread_id, status: status || 'resolved' })
  })

  // ─── 세션 로그 write back (세션 종료 시) ───
  server.registerTool('ws_session_log', {
    description: '[워크스테이션] Claude 세션 요약을 기록합니다. 세션 종료 시 write back. worktree_path로 어느 워크트리인지 남기고, thread_ids로 이번에 건드린 스레드를 연결.',
    inputSchema: z.object({
      project: z.string().describe('프로젝트 키'),
      summary: z.string().describe('세션 요약 (뭘 했는지)'),
      worktree_path: z.string().optional(),
      title: z.string().optional(),
      highlights: z.array(z.string()).optional().describe('핵심 포인트 배열'),
      thread_ids: z.array(z.string()).optional().describe('이 세션이 건드린 스레드 UUID'),
    }),
  }, async ({ project, summary, worktree_path, title, highlights, thread_ids }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return err('Unauthorized')
    const perm = checkToolPermission('ws_session_log', user, authInfo?.scopes || [])
    if (!perm.allowed) return err(perm.reason!)

    const supabase = getServiceSupabase()
    const { data, error } = await supabase.from('ws_sessions').insert({
      project,
      summary,
      worktree_path: worktree_path || null,
      title: title || null,
      highlights: highlights || [],
      thread_ids: thread_ids || [],
      ended_at: new Date().toISOString(),
    }).select().single()
    if (error) return err(`Error: ${error.message}`)

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'ws_session_log', inputParams: { project } })
    return ok({ session: data })
  })

  // ─── 검색 (스레드 + 이벤트 본문) ───
  server.registerTool('ws_search', {
    description: '[워크스테이션] 스레드 제목/요약과 이벤트 본문을 텍스트 검색합니다.',
    inputSchema: z.object({
      query: z.string().describe('검색어'),
      project: z.string().optional(),
      limit: z.number().optional(),
    }),
  }, async ({ query, project, limit }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return err('Unauthorized')
    const perm = checkToolPermission('ws_search', user, authInfo?.scopes || [])
    if (!perm.allowed) return err(perm.reason!)

    const supabase = getServiceSupabase()
    const cap = limit || 20

    let threadsQ = supabase
      .from('ws_threads')
      .select('id, project, title, status, priority, summary, last_touched_at')
      .or(`title.ilike.%${query}%,summary.ilike.%${query}%`)
      .order('last_touched_at', { ascending: false })
      .limit(cap)
    if (project) threadsQ = threadsQ.eq('project', project)

    let eventsQ = supabase
      .from('ws_thread_events')
      .select('id, thread_id, project, kind, body, created_at')
      .ilike('body', `%${query}%`)
      .order('created_at', { ascending: false })
      .limit(cap)
    if (project) eventsQ = eventsQ.eq('project', project)

    const [{ data: threads }, { data: events }] = await Promise.all([threadsQ, eventsQ])

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'ws_search', inputParams: { query, project } })
    return ok({ threads: threads || [], events: events || [] })
  })
}
