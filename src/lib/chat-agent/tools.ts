// Chat Agent — Generic CRUD Meta-Tools for Gemini Function Calling
// 모든 섹션의 데이터를 범용적으로 CRUD할 수 있는 메타도구

import { getServiceSupabase } from '@/lib/supabase'
import {
  reListComplexes, reGetTradeTrends, reGetRentalTrends,
  reGetListingGap, reGetListingGapTrend, reGetJeonseRatio, reGetSummary,
} from '@/lib/real-estate/queries'

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
  're_listing_daily_summary': '매물 일별 요약',
  // 에이전트 메모리
  'chat_agent_memories': '에이전트 메모리',
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
    description: '복잡한 분석 쿼리를 실행합니다. GROUP BY, SUM, AVG, JOIN 등 집계/분석이 필요할 때 사용합니다. SELECT/WITH 쿼리만 허용됩니다. 부동산 분석은 re_* 전용 도구를 먼저 사용하세요.',
    parameters: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'SQL SELECT 쿼리 (백틱/마크다운 없이 순수 SQL만). 예: SELECT complex_name, ROUND(AVG(deal_amount)) FROM re_trades GROUP BY complex_name' },
      },
      required: ['query'],
    },
  },
  // ---- 부동산 전용 도구 (MCP 로직 재사용) ----
  {
    name: 're_list_complexes',
    description: '추적 중인 아파트 단지 목록을 조회합니다 (13개 주요 단지). 부동산 분석의 시작점.',
    parameters: {
      type: 'object' as const,
      properties: {
        district: { type: 'string', description: '구 필터 (강남구, 서초구, 송파구)' },
      },
    },
  },
  {
    name: 're_get_summary',
    description: '부동산 시장 요약 — 추적 단지의 평균 매매/전세 평당가를 조회합니다.',
    parameters: {
      type: 'object' as const,
      properties: {
        district: { type: 'string', description: '구 필터 (강남구, 서초구, 송파구)' },
      },
    },
  },
  {
    name: 're_get_trade_trends',
    description: '매매 실거래가 추이를 조회합니다 (월별 공급면적 기준 평당가). 단지별 또는 전체 추적 단지 평균.',
    parameters: {
      type: 'object' as const,
      properties: {
        complex_name: { type: 'string', description: '단지명 (미지정 시 추적 전체 평균)' },
        months: { type: 'string', description: '조회 기간 개월수 (기본: 12)' },
      },
    },
  },
  {
    name: 're_get_rental_trends',
    description: '전세 실거래가 추이를 조회합니다 (월별 공급면적 기준 평당 보증금). 단지별 또는 전체 추적 단지 평균.',
    parameters: {
      type: 'object' as const,
      properties: {
        complex_name: { type: 'string', description: '단지명 (미지정 시 추적 전체 평균)' },
        months: { type: 'string', description: '조회 기간 개월수 (기본: 12)' },
      },
    },
  },
  {
    name: 're_get_listing_gap',
    description: '매도호가 vs 실거래가 괴리율을 단지별/평형대별로 비교합니다 (현재 시점 스냅샷). 호가가 실거래 대비 몇% 높은지.',
    parameters: {
      type: 'object' as const,
      properties: {
        trade_type: { type: 'string', description: '거래유형: 매매 또는 전세 (기본: 매매)' },
      },
    },
  },
  {
    name: 're_get_listing_gap_trend',
    description: '매도호가 vs 실거래가 괴리율 추이를 일별로 조회합니다. 매매 괴리율 추이, 전세 괴리율 추이 분석에 사용.',
    parameters: {
      type: 'object' as const,
      properties: {
        trade_type: { type: 'string', description: '거래유형: 매매 또는 전세 (기본: 매매)' },
        area_band: { type: 'string', description: '평형대 필터: 20, 30, 40, 50, 60 (미지정 시 전체)' },
      },
    },
  },
  {
    name: 're_get_jeonse_ratio',
    description: '전세가율(전세/매매 비율) 추이를 조회합니다. 월별 전세가율 변화 추적.',
    parameters: {
      type: 'object' as const,
      properties: {
        months: { type: 'string', description: '조회 기간 개월수 (기본: 12)' },
      },
    },
  },
  // ---- 메모리 도구 ----
  {
    name: 'save_memory',
    description: '중요한 정보를 메모리에 저장합니다. 대화가 끝나도 유지되며, 이후 대화에서 컨텍스트로 활용됩니다. 사용자의 선호, 업무 맥락, 프로젝트 현황, 피드백 등을 기억할 때 사용.',
    parameters: {
      type: 'object' as const,
      properties: {
        type: { type: 'string', description: '메모리 유형: user(사용자정보), feedback(작업방식 피드백), project(진행중 업무/프로젝트), reference(외부 참조/링크)' },
        name: { type: 'string', description: '메모리 이름 (짧고 고유하게). 동일 이름이 있으면 업데이트됨' },
        content: { type: 'string', description: '저장할 내용' },
      },
      required: ['type', 'name', 'content'],
    },
  },
  {
    name: 'delete_memory',
    description: '더 이상 유효하지 않은 메모리를 삭제합니다.',
    parameters: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: '삭제할 메모리 이름' },
      },
      required: ['name'],
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
      // Strip markdown code fences, backticks, and leading/trailing whitespace
      let query = (args.query as string || '').trim()
        .replace(/^```(?:sql)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .replace(/^`+|`+$/g, '')
        .trim()
      // Strip leading comments (-- ...) and block comments (/* ... */)
      query = query.replace(/^(--[^\n]*\n\s*)+/g, '').replace(/^\/\*[\s\S]*?\*\/\s*/g, '').trim()

      // Safety: only SELECT or WITH (CTE) allowed
      if (!query.match(/^\s*(SELECT|WITH)\b/i)) {
        return { error: `SELECT 또는 WITH (CTE) 쿼리만 허용됩니다. 받은 쿼리 앞부분: "${query.slice(0, 80)}"` }
      }

      // Safety: block mutations (but allow CREATE inside CTE subquery names like "created_at")
      const forbidden = /\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s|ALTER\s|CREATE\s+(TABLE|INDEX|FUNCTION|VIEW)|TRUNCATE|GRANT|REVOKE)\b/i
      if (forbidden.test(query)) {
        return { error: '읽기 전용 쿼리만 허용됩니다. (INSERT/UPDATE/DELETE/DROP 등 금지)' }
      }

      // Safety: check at least one allowed table is referenced
      const tables = Object.keys(ALLOWED_TABLES)
      const hasAllowedTable = tables.some(t => query.includes(t))
      if (!hasAllowedTable) {
        return { error: `허용된 테이블만 조회 가능합니다. 부동산: re_complexes, re_trades, re_rentals, re_naver_listings / 경영: willow_mgmt_*, tensw_mgmt_* / ETF: etf_products, willow_invoices / 기타: work_wiki, ryuha_*, financial_*, stock_*, smallcap_screening, knowledge_*` }
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
        return { error: `쿼리 실행 실패: ${err}`, query: safeQuery }
      }

      const data = await res.json()
      return { data, count: Array.isArray(data) ? data.length : 0 }
    }

    // ---- 부동산 전용 도구 ----
    case 're_list_complexes':
      return await reListComplexes({ district: args.district as string | undefined })

    case 're_get_summary':
      return await reGetSummary({ district: args.district as string | undefined })

    case 're_get_trade_trends':
      return await reGetTradeTrends({
        complex_name: args.complex_name as string | undefined,
        months: args.months ? Number(args.months) : undefined,
      })

    case 're_get_rental_trends':
      return await reGetRentalTrends({
        complex_name: args.complex_name as string | undefined,
        months: args.months ? Number(args.months) : undefined,
      })

    case 're_get_listing_gap':
      return await reGetListingGap({ trade_type: args.trade_type as string | undefined })

    case 're_get_listing_gap_trend':
      return await reGetListingGapTrend({
        trade_type: args.trade_type as string | undefined,
        area_band: args.area_band ? Number(args.area_band) : undefined,
      })

    case 're_get_jeonse_ratio':
      return await reGetJeonseRatio({
        months: args.months ? Number(args.months) : undefined,
      })

    // ---- 메모리 도구 ----
    case 'save_memory': {
      const memType = args.type as string
      const memName = args.name as string
      const memContent = args.content as string
      if (!memType || !memName || !memContent) return { error: 'type, name, content 모두 필수' }

      const supabase = getServiceSupabase()
      // Upsert by name
      const { data: existing } = await supabase.from('chat_agent_memories').select('id').eq('name', memName).limit(1)
      if (existing && existing.length > 0) {
        const { error } = await supabase.from('chat_agent_memories').update({ type: memType, content: memContent, updated_at: new Date().toISOString() }).eq('id', existing[0].id)
        if (error) return { error: error.message }
        return { result: `메모리 업데이트: ${memName}` }
      } else {
        const { error } = await supabase.from('chat_agent_memories').insert({ type: memType, name: memName, content: memContent })
        if (error) return { error: error.message }
        return { result: `메모리 저장: ${memName}` }
      }
    }

    case 'delete_memory': {
      const memName = args.name as string
      if (!memName) return { error: 'name 필수' }
      const supabase = getServiceSupabase()
      const { error } = await supabase.from('chat_agent_memories').delete().eq('name', memName)
      if (error) return { error: error.message }
      return { result: `메모리 삭제: ${memName}` }
    }

    default:
      return { error: `Unknown tool: ${name}` }
  }
}
