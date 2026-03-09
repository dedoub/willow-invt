import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getUserFromAuthInfo } from '../auth'
import { checkToolPermission } from '../permissions'
import { logMcpAction } from '../audit'
import { getServiceSupabase } from '@/lib/supabase'

export function registerKnowledgeTools(server: McpServer) {
  // ─── Entities ───

  server.registerTool('knowledge_list_entities', {
    description: '[온톨로지] 지식 그래프의 엔티티 목록을 조회합니다. 타입별 필터 가능.',
    inputSchema: z.object({
      entity_type: z.string().optional().describe('엔티티 타입 필터 (person, company, concept, technology, strategy 등)'),
      search: z.string().optional().describe('이름 또는 설명 검색어'),
      limit: z.number().optional().describe('조회 수 (기본: 50)'),
    }),
  }, async ({ entity_type, search, limit }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }
    const perm = checkToolPermission('knowledge_list_entities', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    let query = supabase
      .from('knowledge_entities')
      .select('id, name, entity_type, description, properties, tags, source, updated_at')
      .order('updated_at', { ascending: false })
      .limit(limit || 50)

    if (entity_type) query = query.eq('entity_type', entity_type)
    if (search) query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`)

    const { data, error } = await query
    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'knowledge_list_entities', inputParams: { entity_type, search, limit } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('knowledge_get_entity', {
    description: '[온톨로지] 특정 엔티티의 상세 정보와 연결된 관계, 관련 인사이트를 조회합니다.',
    inputSchema: z.object({
      name: z.string().describe('엔티티 이름'),
    }),
  }, async ({ name }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }
    const perm = checkToolPermission('knowledge_get_entity', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()

    // Get entity
    const { data: entity, error } = await supabase
      .from('knowledge_entities')
      .select('*')
      .eq('name', name)
      .limit(1)
      .single()

    if (error || !entity) return { content: [{ type: 'text' as const, text: `Entity not found: "${name}"` }], isError: true }

    // Get relations where this entity is subject or object
    const [{ data: asSubject }, { data: asObject }, { data: insights }] = await Promise.all([
      supabase
        .from('knowledge_relations')
        .select('predicate, object:knowledge_entities!object_id(name, entity_type)')
        .eq('subject_id', entity.id),
      supabase
        .from('knowledge_relations')
        .select('predicate, subject:knowledge_entities!subject_id(name, entity_type)')
        .eq('object_id', entity.id),
      supabase
        .from('knowledge_insights')
        .select('id, content, insight_type, context, created_at')
        .contains('entity_ids', [entity.id])
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(10),
    ])

    const result = {
      entity,
      outgoing_relations: asSubject?.map(r => ({
        predicate: r.predicate,
        target: (r as any).object?.name,
        target_type: (r as any).object?.entity_type,
      })) || [],
      incoming_relations: asObject?.map(r => ({
        predicate: r.predicate,
        source: (r as any).subject?.name,
        source_type: (r as any).subject?.entity_type,
      })) || [],
      related_insights: insights || [],
    }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'knowledge_get_entity', inputParams: { name } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  })

  server.registerTool('knowledge_create_entity', {
    description: '[온톨로지] 엔티티를 생성하거나 업데이트합니다. 이미 같은 이름이 있으면 업데이트.',
    inputSchema: z.object({
      name: z.string().describe('엔티티 이름'),
      entity_type: z.string().optional().describe('타입: person, company, project, strategy, concept, technology, market, risk, opportunity, product, client, regulation'),
      description: z.string().optional().describe('설명'),
      properties: z.record(z.string(), z.unknown()).optional().describe('커스텀 속성 (JSON)'),
      tags: z.array(z.string()).optional().describe('태그 배열'),
    }),
  }, async ({ name, entity_type, description, properties, tags }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }
    const perm = checkToolPermission('knowledge_create_entity', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()

    // Check existing
    const { data: existing } = await supabase
      .from('knowledge_entities')
      .select('id')
      .eq('name', name)
      .limit(1)
      .single()

    if (existing) {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (description) updates.description = description
      if (properties) updates.properties = properties
      if (tags) updates.tags = tags
      if (entity_type) updates.entity_type = entity_type

      const { data, error } = await supabase
        .from('knowledge_entities')
        .update(updates)
        .eq('id', existing.id)
        .select()
        .single()

      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

      await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'knowledge_create_entity', inputParams: { name, action: 'update' } })
      return { content: [{ type: 'text' as const, text: JSON.stringify({ action: 'updated', entity: data }, null, 2) }] }
    } else {
      const { data, error } = await supabase
        .from('knowledge_entities')
        .insert({
          name,
          entity_type: entity_type || 'concept',
          description: description || '',
          properties: properties || {},
          tags: tags || [],
          source: 'mcp',
        })
        .select()
        .single()

      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

      await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'knowledge_create_entity', inputParams: { name, action: 'create' } })
      return { content: [{ type: 'text' as const, text: JSON.stringify({ action: 'created', entity: data }, null, 2) }] }
    }
  })

  server.registerTool('knowledge_delete_entity', {
    description: '[온톨로지] 엔티티를 삭제합니다. 연결된 관계도 함께 삭제됩니다.',
    inputSchema: z.object({
      name: z.string().describe('삭제할 엔티티 이름'),
    }),
  }, async ({ name }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }
    const perm = checkToolPermission('knowledge_delete_entity', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { error } = await supabase
      .from('knowledge_entities')
      .delete()
      .eq('name', name)

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'knowledge_delete_entity', inputParams: { name } })
    return { content: [{ type: 'text' as const, text: `Deleted entity: "${name}"` }] }
  })

  // ─── Relations ───

  server.registerTool('knowledge_list_relations', {
    description: '[온톨로지] 관계 목록을 조회합니다. 특정 엔티티의 관계만 필터 가능.',
    inputSchema: z.object({
      entity_name: z.string().optional().describe('특정 엔티티 이름으로 필터 (주어 또는 목적어)'),
      predicate: z.string().optional().describe('관계 타입 필터 (owns, manages, part_of 등)'),
      limit: z.number().optional().describe('조회 수 (기본: 50)'),
    }),
  }, async ({ entity_name, predicate, limit }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }
    const perm = checkToolPermission('knowledge_list_relations', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()

    if (entity_name) {
      // Find entity ID first
      const { data: entity } = await supabase
        .from('knowledge_entities')
        .select('id')
        .eq('name', entity_name)
        .limit(1)
        .single()

      if (!entity) return { content: [{ type: 'text' as const, text: `Entity not found: "${entity_name}"` }], isError: true }

      let q1 = supabase
        .from('knowledge_relations')
        .select('id, predicate, properties, subject:knowledge_entities!subject_id(name, entity_type), object:knowledge_entities!object_id(name, entity_type)')
        .or(`subject_id.eq.${entity.id},object_id.eq.${entity.id}`)
        .limit(limit || 50)

      if (predicate) q1 = q1.eq('predicate', predicate)

      const { data, error } = await q1
      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

      const formatted = data?.map(r => ({
        id: r.id,
        subject: (r as any).subject?.name,
        predicate: r.predicate,
        object: (r as any).object?.name,
        properties: r.properties,
      }))

      await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'knowledge_list_relations', inputParams: { entity_name, predicate } })
      return { content: [{ type: 'text' as const, text: JSON.stringify(formatted, null, 2) }] }
    }

    // All relations
    let query = supabase
      .from('knowledge_relations')
      .select('id, predicate, properties, subject:knowledge_entities!subject_id(name, entity_type), object:knowledge_entities!object_id(name, entity_type)')
      .limit(limit || 50)

    if (predicate) query = query.eq('predicate', predicate)

    const { data, error } = await query
    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    const formatted = data?.map(r => ({
      id: r.id,
      subject: (r as any).subject?.name,
      predicate: r.predicate,
      object: (r as any).object?.name,
      properties: r.properties,
    }))

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'knowledge_list_relations', inputParams: { predicate, limit } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(formatted, null, 2) }] }
  })

  server.registerTool('knowledge_create_relation', {
    description: '[온톨로지] 엔티티 간 관계를 생성합니다. 엔티티가 없으면 자동 생성.',
    inputSchema: z.object({
      subject: z.string().describe('주어 엔티티 이름'),
      predicate: z.string().describe('관계 타입: owns, manages, leads, part_of, depends_on, competes_with, supports, contradicts, blocks, leads_to, evolves_from, uses_technology, employs_strategy, serves_market, targets, collaborates_with, invested_in'),
      object: z.string().describe('목적어 엔티티 이름'),
      properties: z.record(z.string(), z.unknown()).optional().describe('관계 속성 (JSON)'),
    }),
  }, async ({ subject, predicate, object, properties }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }
    const perm = checkToolPermission('knowledge_create_relation', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()

    // Resolve or create entities
    const resolveEntity = async (name: string) => {
      const { data } = await supabase.from('knowledge_entities').select('id').eq('name', name).limit(1).single()
      if (data) return data.id
      const { data: created } = await supabase.from('knowledge_entities')
        .insert({ name, entity_type: 'concept', source: 'auto' })
        .select('id').single()
      return created?.id
    }

    const [subjId, objId] = await Promise.all([resolveEntity(subject), resolveEntity(object)])
    if (!subjId || !objId) return { content: [{ type: 'text' as const, text: 'Failed to resolve entities' }], isError: true }

    const { data, error } = await supabase
      .from('knowledge_relations')
      .insert({
        subject_id: subjId,
        predicate,
        object_id: objId,
        properties: properties || {},
        source: 'mcp',
      })
      .select()
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'knowledge_create_relation', inputParams: { subject, predicate, object } })
    return { content: [{ type: 'text' as const, text: JSON.stringify({ action: 'created', relation: { subject, predicate, object, id: data.id } }, null, 2) }] }
  })

  server.registerTool('knowledge_delete_relation', {
    description: '[온톨로지] 관계를 삭제합니다.',
    inputSchema: z.object({
      id: z.string().describe('관계 ID (UUID)'),
    }),
  }, async ({ id }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }
    const perm = checkToolPermission('knowledge_delete_relation', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { error } = await supabase.from('knowledge_relations').delete().eq('id', id)
    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'knowledge_delete_relation', inputParams: { id } })
    return { content: [{ type: 'text' as const, text: `Deleted relation: ${id}` }] }
  })

  // ─── Insights ───

  server.registerTool('knowledge_list_insights', {
    description: '[온톨로지] 인사이트(결정, 관찰, 패턴) 목록을 조회합니다.',
    inputSchema: z.object({
      insight_type: z.string().optional().describe('타입 필터: decision, observation, preference, pattern'),
      entity_name: z.string().optional().describe('관련 엔티티 이름으로 필터'),
      search: z.string().optional().describe('내용 검색어'),
      limit: z.number().optional().describe('조회 수 (기본: 20)'),
    }),
  }, async ({ insight_type, entity_name, search, limit }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }
    const perm = checkToolPermission('knowledge_list_insights', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    let query = supabase
      .from('knowledge_insights')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(limit || 20)

    if (insight_type) query = query.eq('insight_type', insight_type)
    if (search) query = query.ilike('content', `%${search}%`)

    if (entity_name) {
      // Resolve entity ID first
      const { data: entity } = await supabase
        .from('knowledge_entities')
        .select('id')
        .eq('name', entity_name)
        .limit(1)
        .single()
      if (entity) query = query.contains('entity_ids', [entity.id])
    }

    const { data, error } = await query
    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'knowledge_list_insights', inputParams: { insight_type, entity_name, search, limit } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('knowledge_create_insight', {
    description: '[온톨로지] 인사이트(결정, 관찰, 패턴)를 기록합니다.',
    inputSchema: z.object({
      content: z.string().describe('인사이트 내용'),
      insight_type: z.string().optional().describe('타입: decision, observation, preference, pattern (기본: observation)'),
      entity_names: z.array(z.string()).optional().describe('관련 엔티티 이름 배열'),
      context: z.string().optional().describe('인사이트의 맥락/배경'),
    }),
  }, async ({ content, insight_type, entity_names, context }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }
    const perm = checkToolPermission('knowledge_create_insight', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()

    // Resolve entity IDs
    const entityIds: string[] = []
    if (entity_names?.length) {
      for (const name of entity_names) {
        const { data } = await supabase.from('knowledge_entities').select('id').eq('name', name).limit(1).single()
        if (data) entityIds.push(data.id)
      }
    }

    const { data, error } = await supabase
      .from('knowledge_insights')
      .insert({
        content,
        insight_type: insight_type || 'observation',
        entity_ids: entityIds,
        context: context || '',
        status: 'active',
      })
      .select()
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'knowledge_create_insight', inputParams: { content: content.slice(0, 60), insight_type } })
    return { content: [{ type: 'text' as const, text: JSON.stringify({ action: 'created', insight: data }, null, 2) }] }
  })

  // ─── Search (Full Graph) ───

  server.registerTool('knowledge_search', {
    description: '[온톨로지] 지식 그래프 전체를 검색합니다. 엔티티, 관계, 인사이트를 한번에 검색.',
    inputSchema: z.object({
      query: z.string().describe('검색어'),
      limit: z.number().optional().describe('각 카테고리별 최대 결과 수 (기본: 10)'),
    }),
  }, async ({ query, limit }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }
    const perm = checkToolPermission('knowledge_search', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const maxResults = limit || 10

    const [{ data: entities }, { data: insights }] = await Promise.all([
      supabase
        .from('knowledge_entities')
        .select('id, name, entity_type, description, tags')
        .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
        .limit(maxResults),
      supabase
        .from('knowledge_insights')
        .select('id, content, insight_type, context, created_at')
        .eq('status', 'active')
        .ilike('content', `%${query}%`)
        .limit(maxResults),
    ])

    // For matched entities, also fetch their relations
    const entityIds = entities?.map(e => e.id) || []
    let relations: any[] = []
    if (entityIds.length) {
      const { data } = await supabase
        .from('knowledge_relations')
        .select('predicate, subject:knowledge_entities!subject_id(name), object:knowledge_entities!object_id(name)')
        .or(entityIds.map(id => `subject_id.eq.${id}`).join(',') + ',' + entityIds.map(id => `object_id.eq.${id}`).join(','))
        .limit(maxResults * 2)
      relations = data?.map(r => ({
        subject: (r as any).subject?.name,
        predicate: r.predicate,
        object: (r as any).object?.name,
      })) || []
    }

    const result = {
      entities: entities || [],
      relations,
      insights: insights || [],
      summary: `Found ${entities?.length || 0} entities, ${relations.length} relations, ${insights?.length || 0} insights`,
    }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'knowledge_search', inputParams: { query } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  })

  // ─── Stats (Summary) ───

  server.registerTool('knowledge_get_stats', {
    description: '[온톨로지] 지식 그래프의 통계 요약을 조회합니다. 엔티티 수, 관계 수, 인사이트 수, 타입별 분포.',
    inputSchema: z.object({}),
  }, async (_params, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }
    const perm = checkToolPermission('knowledge_get_stats', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()

    const [{ data: entities }, { data: relations }, { data: insights }] = await Promise.all([
      supabase.from('knowledge_entities').select('entity_type'),
      supabase.from('knowledge_relations').select('predicate'),
      supabase.from('knowledge_insights').select('insight_type').eq('status', 'active'),
    ])

    // Count by type
    const entityByType: Record<string, number> = {}
    for (const e of entities || []) {
      entityByType[e.entity_type] = (entityByType[e.entity_type] || 0) + 1
    }

    const relationByPredicate: Record<string, number> = {}
    for (const r of relations || []) {
      relationByPredicate[r.predicate] = (relationByPredicate[r.predicate] || 0) + 1
    }

    const insightByType: Record<string, number> = {}
    for (const i of insights || []) {
      insightByType[i.insight_type] = (insightByType[i.insight_type] || 0) + 1
    }

    const stats = {
      total_entities: entities?.length || 0,
      total_relations: relations?.length || 0,
      total_insights: insights?.length || 0,
      entities_by_type: entityByType,
      relations_by_predicate: relationByPredicate,
      insights_by_type: insightByType,
    }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'knowledge_get_stats', inputParams: {} })
    return { content: [{ type: 'text' as const, text: JSON.stringify(stats, null, 2) }] }
  })
}
