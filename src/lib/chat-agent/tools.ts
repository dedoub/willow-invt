// Chat Agent — Generic CRUD Meta-Tools for Gemini Function Calling
// 모든 섹션의 데이터를 범용적으로 CRUD할 수 있는 메타도구

import { getServiceSupabase } from '@/lib/supabase'

// ============================================================
// 허용 테이블 목록 (안전장치)
// ============================================================

const ALLOWED_TABLES: Record<string, string> = {
  // 윌로우 경영관리
  'willow_mgmt_clients': '윌로우 클라이언트',
  'willow_mgmt_projects': '윌로우 프로젝트',
  'willow_mgmt_milestones': '윌로우 마일스톤',
  'willow_mgmt_schedules': '윌로우 스케줄',
  'willow_mgmt_tasks': '윌로우 태스크',
  'willow_mgmt_daily_memos': '윌로우 일일메모',
  'willow_mgmt_cash': '윌로우 현금관리',
  // 텐소프트웍스 경영관리
  'tensw_mgmt_clients': '텐소프트웍스 클라이언트',
  'tensw_mgmt_projects': '텐소프트웍스 프로젝트',
  'tensw_mgmt_milestones': '텐소프트웍스 마일스톤',
  'tensw_mgmt_schedules': '텐소프트웍스 스케줄',
  'tensw_mgmt_tasks': '텐소프트웍스 태스크',
  'tensw_mgmt_daily_memos': '텐소프트웍스 일일메모',
  'tensw_mgmt_cash': '텐소프트웍스 현금관리',
  'tensw_mgmt_sales': '텐소프트웍스 매출관리',
  'tensw_mgmt_loans': '텐소프트웍스 대출관리',
  // ETF
  'etf_products': 'ETF 상품',
  'akros_tax_invoices': 'Akros 세금계산서',
  'willow_invoices': 'ETC 인보이스',
  // 업무위키
  'work_wiki': '업무위키',
  // 이메일
  'email_analysis': '이메일 분석',
  'email_todos': '이메일 TODO',
  'gmail_scheduled_emails': '예약발송 이메일',
  // 류하 학습관리
  'ryuha_subjects': '류하 과목',
  'ryuha_textbooks': '류하 교재',
  'ryuha_chapters': '류하 챕터',
  'ryuha_schedules': '류하 스케줄',
  'ryuha_homework_items': '류하 과제',
  'ryuha_daily_memos': '류하 일일메모',
  'ryuha_body_records': '류하 신체기록',
  'ryuha_notes': '류하 수첩',
  // 재무제표
  'financial_summaries': '재무제표 요약',
  'financial_line_items': '재무제표 항목',
  // 온톨로지
  'knowledge_entities': '지식 엔티티',
  'knowledge_relations': '지식 관계',
  'knowledge_insights': '지식 인사이트',
  // 투자리서치
  'stock_research': '투자 리서치',
  'stock_trades': '주식 매매기록',
  'smallcap_screening': '소형주 스크리닝',
  // 부동산
  're_complexes': '부동산 단지',
  're_trades': '부동산 매매',
  're_rentals': '부동산 전세',
  're_naver_listings': '네이버 매물',
}

// ============================================================
// Tool Definitions (Gemini Function Calling format)
// ============================================================

export const agentTools = [
  {
    name: 'list_tables',
    description: '사용 가능한 모든 테이블 목록과 설명을 반환합니다. 어떤 테이블에서 데이터를 조회/생성/수정/삭제할 수 있는지 확인할 때 사용합니다.',
    parameters: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'query_data',
    description: '테이블에서 데이터를 조회합니다. 필터, 정렬, 제한, 컬럼 선택을 지원합니다. 조인이 필요하면 select에 "*, client:willow_mgmt_clients(*)" 형태로 작성합니다.',
    parameters: {
      type: 'object' as const,
      properties: {
        table: { type: 'string', description: '테이블명 (필수)' },
        select: { type: 'string', description: '조회할 컬럼 (기본: *)' },
        filters: { type: 'string', description: 'JSON 형태의 필터 배열. 예: [{"column":"type","op":"eq","value":"revenue"},{"column":"amount","op":"gte","value":1000000}]. 지원 연산: eq, neq, gt, gte, lt, lte, like, ilike, is, in' },
        order_by: { type: 'string', description: '정렬 컬럼 (기본: created_at)' },
        ascending: { type: 'string', description: '오름차순 여부 (true/false, 기본: false)' },
        limit: { type: 'string', description: '최대 행 수 (기본: 50)' },
      },
      required: ['table'],
    },
  },
  {
    name: 'insert_data',
    description: '테이블에 새 레코드를 삽입합니다. 여러 건을 한 번에 삽입하려면 records에 배열로 전달합니다.',
    parameters: {
      type: 'object' as const,
      properties: {
        table: { type: 'string', description: '테이블명 (필수)' },
        records: { type: 'string', description: 'JSON 형태의 레코드 배열. 예: [{"type":"revenue","counterparty":"A사","amount":1000000}]' },
      },
      required: ['table', 'records'],
    },
  },
  {
    name: 'update_data',
    description: '테이블의 레코드를 수정합니다. id로 특정 레코드를 지정합니다.',
    parameters: {
      type: 'object' as const,
      properties: {
        table: { type: 'string', description: '테이블명 (필수)' },
        id: { type: 'string', description: '수정할 레코드 ID (필수)' },
        updates: { type: 'string', description: 'JSON 형태의 수정할 필드. 예: {"status":"completed","payment_date":"2026-04-01"}' },
      },
      required: ['table', 'id', 'updates'],
    },
  },
  {
    name: 'delete_data',
    description: '테이블에서 레코드를 삭제합니다.',
    parameters: {
      type: 'object' as const,
      properties: {
        table: { type: 'string', description: '테이블명 (필수)' },
        id: { type: 'string', description: '삭제할 레코드 ID (필수)' },
      },
      required: ['table', 'id'],
    },
  },
  {
    name: 'upsert_data',
    description: '테이블에 레코드를 upsert(없으면 생성, 있으면 수정)합니다. conflict 컬럼을 지정해야 합니다.',
    parameters: {
      type: 'object' as const,
      properties: {
        table: { type: 'string', description: '테이블명 (필수)' },
        records: { type: 'string', description: 'JSON 형태의 레코드 배열' },
        on_conflict: { type: 'string', description: '충돌 감지 컬럼 (쉼표 구분). 예: "company,fiscal_year"' },
      },
      required: ['table', 'records', 'on_conflict'],
    },
  },
  {
    name: 'count_data',
    description: '테이블의 레코드 수를 셉니다. 필터 적용 가능합니다.',
    parameters: {
      type: 'object' as const,
      properties: {
        table: { type: 'string', description: '테이블명 (필수)' },
        filters: { type: 'string', description: 'JSON 형태의 필터 배열 (query_data와 동일 형식)' },
      },
      required: ['table'],
    },
  },
  {
    name: 'analyze_data',
    description: '복잡한 분석 쿼리를 실행합니다. GROUP BY, SUM, AVG, JOIN 등 집계/분석이 필요할 때 사용합니다. SELECT 쿼리만 허용됩니다.',
    parameters: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'SQL SELECT 쿼리. 예: SELECT complex_name, area_pyeong, AVG(deal_amount) FROM re_trades GROUP BY complex_name, area_pyeong' },
      },
      required: ['query'],
    },
  },
]

// ============================================================
// Tool Execution
// ============================================================

interface Filter {
  column: string
  op: string
  value: unknown
}

function validateTable(table: string): string | null {
  if (!ALLOWED_TABLES[table]) {
    return `허용되지 않은 테이블: ${table}. list_tables로 사용 가능한 테이블을 확인하세요.`
  }
  return null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(query: any, filters: Filter[]) {
  let q = query
  for (const f of filters) {
    switch (f.op) {
      case 'eq': q = q.eq(f.column, f.value); break
      case 'neq': q = q.neq(f.column, f.value); break
      case 'gt': q = q.gt(f.column, f.value); break
      case 'gte': q = q.gte(f.column, f.value); break
      case 'lt': q = q.lt(f.column, f.value); break
      case 'lte': q = q.lte(f.column, f.value); break
      case 'like': q = q.like(f.column, f.value); break
      case 'ilike': q = q.ilike(f.column, f.value); break
      case 'is': q = q.is(f.column, f.value); break
      case 'in': q = q.in(f.column, f.value as unknown[]); break
    }
  }
  return q
}

function safeJsonParse(str: string | undefined, fallback: unknown = undefined) {
  if (!str) return fallback
  try { return JSON.parse(str) } catch { return fallback }
}

export async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const supabase = getServiceSupabase()

  switch (name) {
    case 'list_tables': {
      return {
        tables: Object.entries(ALLOWED_TABLES).map(([name, desc]) => ({ name, description: desc })),
      }
    }

    case 'query_data': {
      const table = args.table as string
      const err = validateTable(table)
      if (err) return { error: err }

      const select = (args.select as string) || '*'
      const filters: Filter[] = safeJsonParse(args.filters as string, [])
      const orderBy = (args.order_by as string) || 'created_at'
      const ascending = (args.ascending as string) === 'true'
      const limit = parseInt((args.limit as string) || '50', 10)

      let query = supabase.from(table).select(select)
      query = applyFilters(query, filters)
      query = query.order(orderBy, { ascending }).limit(limit)

      const { data, error } = await query
      if (error) return { error: error.message }
      return { data: data || [], count: (data || []).length }
    }

    case 'insert_data': {
      const table = args.table as string
      const err = validateTable(table)
      if (err) return { error: err }

      const records = safeJsonParse(args.records as string, [])
      if (!Array.isArray(records) || records.length === 0) {
        return { error: 'records는 비어있지 않은 JSON 배열이어야 합니다.' }
      }

      // Auto-fill user_id for tables that require it
      const enriched = records.map((r: Record<string, unknown>) => {
        if (table === 'work_wiki' && !r.user_id) {
          return { ...r, user_id: 'dw.kim@willowinvt.com' }
        }
        return r
      })

      const { data, error } = await supabase.from(table).insert(enriched).select()
      if (error) return { error: error.message }
      return { success: true, inserted: data?.length || 0, data }
    }

    case 'update_data': {
      const table = args.table as string
      const err = validateTable(table)
      if (err) return { error: err }

      const id = args.id as string
      const updates = safeJsonParse(args.updates as string, {})
      if (!id || !updates || Object.keys(updates).length === 0) {
        return { error: 'id와 updates가 필요합니다.' }
      }

      // Add updated_at if the table likely has it
      const updatesWithTimestamp = { ...updates, updated_at: new Date().toISOString() }

      const { data, error } = await supabase.from(table).update(updatesWithTimestamp).eq('id', id).select().single()
      if (error) return { error: error.message }
      return { success: true, data }
    }

    case 'delete_data': {
      const table = args.table as string
      const err = validateTable(table)
      if (err) return { error: err }

      const id = args.id as string
      if (!id) return { error: 'id가 필요합니다.' }

      const { error } = await supabase.from(table).delete().eq('id', id)
      if (error) return { error: error.message }
      return { success: true }
    }

    case 'upsert_data': {
      const table = args.table as string
      const err = validateTable(table)
      if (err) return { error: err }

      const records = safeJsonParse(args.records as string, [])
      const onConflict = args.on_conflict as string
      if (!Array.isArray(records) || records.length === 0) {
        return { error: 'records는 비어있지 않은 JSON 배열이어야 합니다.' }
      }

      const { data, error } = await supabase.from(table).upsert(records, { onConflict }).select()
      if (error) return { error: error.message }
      return { success: true, upserted: data?.length || 0, data }
    }

    case 'count_data': {
      const table = args.table as string
      const err = validateTable(table)
      if (err) return { error: err }

      const filters: Filter[] = safeJsonParse(args.filters as string, [])
      let query = supabase.from(table).select('*', { count: 'exact', head: true })
      query = applyFilters(query, filters)

      const { count, error } = await query
      if (error) return { error: error.message }
      return { count }
    }

    case 'analyze_data': {
      const query = (args.query as string || '').trim()

      // Safety: only SELECT
      if (!query.match(/^\s*SELECT\b/i)) {
        return { error: 'SELECT 쿼리만 허용됩니다.' }
      }

      // Safety: block mutations
      const forbidden = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\b/i
      if (forbidden.test(query)) {
        return { error: '읽기 전용 쿼리만 허용됩니다. (INSERT/UPDATE/DELETE/DROP 등 금지)' }
      }

      // Safety: check at least one allowed table is referenced
      const tables = Object.keys(ALLOWED_TABLES)
      const hasAllowedTable = tables.some(t => query.includes(t))
      if (!hasAllowedTable) {
        return { error: `허용된 테이블만 조회 가능합니다. 사용 가능: ${tables.join(', ')}` }
      }

      // Execute via fetch to Supabase REST API (raw SQL via PostgREST RPC)
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseKey = process.env.SUPABASE_SECRET_KEY

      if (!supabaseUrl || !supabaseKey) {
        return { error: 'Supabase 설정 누락' }
      }

      // Add LIMIT if not present
      const hasLimit = /\bLIMIT\b/i.test(query)
      const safeQuery = hasLimit ? query : `${query} LIMIT 200`

      const res = await fetch(`${supabaseUrl}/rest/v1/rpc/execute_readonly_query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ sql_query: safeQuery }),
      })

      if (!res.ok) {
        const err = await res.text()
        return { error: `쿼리 실행 실패: ${err}` }
      }

      const data = await res.json()
      return { data, count: Array.isArray(data) ? data.length : 0 }
    }

    default:
      return { error: `Unknown tool: ${name}` }
  }
}
