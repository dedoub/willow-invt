// Chat Agent — Generic CRUD Meta-Tools for Gemini Function Calling
// 모든 섹션의 데이터를 범용적으로 CRUD할 수 있는 메타도구

import { getServiceSupabase } from '@/lib/supabase'
import {
  reListComplexes, reGetTradeTrends, reGetRentalTrends,
  reGetListingGap, reGetListingGapTrend, reGetJeonseRatio, reGetSummary,
} from '@/lib/real-estate/queries'
import {
  willowListClients, willowCreateClient, willowUpdateClient, willowDeleteClient,
  willowListProjects, willowCreateProject, willowUpdateProject, willowDeleteProject,
  willowListMilestones, willowCreateMilestone, willowUpdateMilestone, willowDeleteMilestone,
  willowListSchedules, willowCreateSchedule, willowUpdateSchedule, willowDeleteSchedule, willowToggleScheduleDate,
  willowListTasks, willowCreateTask, willowUpdateTask, willowDeleteTask,
  willowListMemos, willowUpsertMemo, willowDeleteMemo,
  willowListCash, willowCreateCash, willowUpdateCash, willowDeleteCash,
  willowGetDashboard, willowGetCashSummary,
} from '@/lib/willow-mgmt/queries'
import {
  tenswListClients, tenswCreateClient, tenswUpdateClient, tenswDeleteClient,
  tenswListProjects, tenswCreateProject, tenswUpdateProject, tenswDeleteProject,
  tenswListMilestones, tenswCreateMilestone, tenswUpdateMilestone, tenswDeleteMilestone,
  tenswListSchedules, tenswCreateSchedule, tenswUpdateSchedule, tenswDeleteSchedule,
  tenswListTasks, tenswCreateTask, tenswUpdateTask, tenswDeleteTask,
  tenswListMemos, tenswUpsertMemo, tenswDeleteMemo,
  tenswListCash, tenswCreateCash, tenswUpdateCash, tenswDeleteCash,
  tenswGetCashSummary, tenswGetDashboard,
  tenswListSales, tenswCreateSales, tenswUpdateSales, tenswDeleteSales,
  tenswListLoans, tenswCreateLoan, tenswUpdateLoan, tenswDeleteLoan,
} from '@/lib/tensw-mgmt/queries'
import {
  akrosListProducts, akrosGetAumData, akrosGetTimeSeries, akrosGetExchangeRates,
  akrosListTaxInvoices, akrosCreateTaxInvoice, akrosUpdateTaxInvoice, akrosDeleteTaxInvoice,
  akrosGetDashboard,
  etcListProducts, etcCreateProduct, etcUpdateProduct, etcDeleteProduct,
  etcListInvoices, etcCreateInvoice, etcGetInvoice, etcGetStats, etcGetDashboard,
} from '@/lib/etf/queries'
import {
  ryuhaListSubjects, ryuhaCreateSubject, ryuhaUpdateSubject, ryuhaDeleteSubject,
  ryuhaListTextbooks, ryuhaCreateTextbook, ryuhaUpdateTextbook, ryuhaDeleteTextbook,
  ryuhaListChapters, ryuhaCreateChapter, ryuhaUpdateChapter, ryuhaDeleteChapter,
  ryuhaListSchedules, ryuhaCreateSchedule, ryuhaUpdateSchedule, ryuhaDeleteSchedule,
  ryuhaListHomework, ryuhaCreateHomework, ryuhaUpdateHomework, ryuhaDeleteHomework,
  ryuhaListMemos, ryuhaUpsertMemo, ryuhaDeleteMemo,
  ryuhaListBodyRecords, ryuhaCreateBodyRecord, ryuhaUpdateBodyRecord, ryuhaDeleteBodyRecord,
  ryuhaListNotes, ryuhaCreateNote, ryuhaUpdateNote, ryuhaDeleteNote,
  ryuhaGetDashboard,
} from '@/lib/ryuha/queries'

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
  // ---- 윌로우 경영관리 전용 도구 ----
  // -- Dashboard --
  {
    name: 'willow_get_dashboard',
    description: '[윌로우] 경영관리 대시보드 요약 — 현금(매출/지출/미수금/미지급금), 이번주 일정, 진행중 프로젝트, 대기중 마일스톤을 한눈에 봅니다.',
    parameters: { type: 'object' as const, properties: {} },
  },
  {
    name: 'willow_get_cash_summary',
    description: '[윌로우] 현금관리 요약 — 매출/지출/자산/부채 집계. 기간 필터 가능.',
    parameters: {
      type: 'object' as const,
      properties: {
        start_date: { type: 'string', description: '시작일 (YYYY-MM-DD)' },
        end_date: { type: 'string', description: '종료일 (YYYY-MM-DD)' },
      },
    },
  },
  // -- Clients --
  {
    name: 'willow_list_clients',
    description: '[윌로우] 클라이언트 목록 조회',
    parameters: { type: 'object' as const, properties: {} },
  },
  {
    name: 'willow_create_client',
    description: '[윌로우] 새 클라이언트 생성',
    parameters: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: '클라이언트 이름 (필수)' },
        color: { type: 'string', description: '색상 hex (예: #3B82F6)' },
        icon: { type: 'string', description: '아이콘 이름' },
      },
      required: ['name'],
    },
  },
  {
    name: 'willow_update_client',
    description: '[윌로우] 클라이언트 수정',
    parameters: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: '클라이언트 ID (필수)' },
        name: { type: 'string', description: '이름' },
        color: { type: 'string', description: '색상 hex' },
        icon: { type: 'string', description: '아이콘' },
      },
      required: ['id'],
    },
  },
  {
    name: 'willow_delete_client',
    description: '[윌로우] 클라이언트 삭제',
    parameters: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: '클라이언트 ID (필수)' },
      },
      required: ['id'],
    },
  },
  // -- Projects --
  {
    name: 'willow_list_projects',
    description: '[윌로우] 프로젝트 목록 (클라이언트 관계 포함). client_id로 필터 가능.',
    parameters: {
      type: 'object' as const,
      properties: {
        client_id: { type: 'string', description: '클라이언트 ID 필터' },
      },
    },
  },
  {
    name: 'willow_create_project',
    description: '[윌로우] 새 프로젝트 생성',
    parameters: {
      type: 'object' as const,
      properties: {
        client_id: { type: 'string', description: '클라이언트 ID (필수)' },
        name: { type: 'string', description: '프로젝트 이름 (필수)' },
        description: { type: 'string', description: '설명' },
        status: { type: 'string', description: 'active|completed|on_hold|cancelled (기본: active)' },
      },
      required: ['client_id', 'name'],
    },
  },
  {
    name: 'willow_update_project',
    description: '[윌로우] 프로젝트 수정',
    parameters: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: '프로젝트 ID (필수)' },
        name: { type: 'string', description: '이름' },
        description: { type: 'string', description: '설명' },
        status: { type: 'string', description: 'active|completed|on_hold|cancelled' },
      },
      required: ['id'],
    },
  },
  {
    name: 'willow_delete_project',
    description: '[윌로우] 프로젝트 삭제',
    parameters: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: '프로젝트 ID (필수)' },
      },
      required: ['id'],
    },
  },
  // -- Milestones --
  {
    name: 'willow_list_milestones',
    description: '[윌로우] 마일스톤 목록 (프로젝트/클라이언트 관계 포함). project_id로 필터 가능.',
    parameters: {
      type: 'object' as const,
      properties: {
        project_id: { type: 'string', description: '프로젝트 ID 필터' },
      },
    },
  },
  {
    name: 'willow_create_milestone',
    description: '[윌로우] 새 마일스톤 생성',
    parameters: {
      type: 'object' as const,
      properties: {
        project_id: { type: 'string', description: '프로젝트 ID (필수)' },
        name: { type: 'string', description: '마일스톤 이름 (필수)' },
        description: { type: 'string', description: '설명' },
        status: { type: 'string', description: 'pending|in_progress|review_pending|completed (기본: pending)' },
        target_date: { type: 'string', description: '목표일 (YYYY-MM-DD)' },
      },
      required: ['project_id', 'name'],
    },
  },
  {
    name: 'willow_update_milestone',
    description: '[윌로우] 마일스톤 수정. status를 completed로 바꾸면 completed_at이 자동 설정됩니다.',
    parameters: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: '마일스톤 ID (필수)' },
        name: { type: 'string', description: '이름' },
        description: { type: 'string', description: '설명' },
        status: { type: 'string', description: 'pending|in_progress|review_pending|completed' },
        target_date: { type: 'string', description: '목표일 (YYYY-MM-DD)' },
        review_completed: { type: 'string', description: '리뷰 완료 여부 (true/false)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'willow_delete_milestone',
    description: '[윌로우] 마일스톤 삭제',
    parameters: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: '마일스톤 ID (필수)' },
      },
      required: ['id'],
    },
  },
  // -- Schedules --
  {
    name: 'willow_list_schedules',
    description: '[윌로우] 일정 목록 (클라이언트/마일스톤 관계 포함). 날짜 범위, 클라이언트 필터 가능.',
    parameters: {
      type: 'object' as const,
      properties: {
        start_date: { type: 'string', description: '시작일 (YYYY-MM-DD)' },
        end_date: { type: 'string', description: '종료일 (YYYY-MM-DD)' },
        client_id: { type: 'string', description: '클라이언트 ID 필터' },
      },
    },
  },
  {
    name: 'willow_create_schedule',
    description: '[윌로우] 새 일정 생성. 미팅, 업무, 마감일 등.',
    parameters: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: '일정 제목 (필수)' },
        schedule_date: { type: 'string', description: '일정 날짜 YYYY-MM-DD (필수)' },
        end_date: { type: 'string', description: '종료일 YYYY-MM-DD (여러 날 일정)' },
        start_time: { type: 'string', description: '시작 시간 HH:MM' },
        end_time: { type: 'string', description: '종료 시간 HH:MM' },
        type: { type: 'string', description: 'task|meeting|deadline (기본: task)' },
        client_id: { type: 'string', description: '클라이언트 ID' },
        description: { type: 'string', description: '설명' },
        color: { type: 'string', description: '색상 hex' },
        task_content: { type: 'string', description: '태스크 내용' },
        task_deadline: { type: 'string', description: '태스크 마감일 YYYY-MM-DD' },
      },
      required: ['title', 'schedule_date'],
    },
  },
  {
    name: 'willow_update_schedule',
    description: '[윌로우] 일정 수정. 완료 처리, 시간 변경 등.',
    parameters: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: '일정 ID (필수)' },
        title: { type: 'string', description: '제목' },
        schedule_date: { type: 'string', description: '날짜 YYYY-MM-DD' },
        end_date: { type: 'string', description: '종료일' },
        start_time: { type: 'string', description: '시작 시간' },
        end_time: { type: 'string', description: '종료 시간' },
        type: { type: 'string', description: 'task|meeting|deadline' },
        client_id: { type: 'string', description: '클라이언트 ID' },
        description: { type: 'string', description: '설명' },
        is_completed: { type: 'string', description: '완료 여부 (true/false)' },
        task_content: { type: 'string', description: '태스크 내용' },
        task_completed: { type: 'string', description: '태스크 완료 (true/false)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'willow_delete_schedule',
    description: '[윌로우] 일정 삭제',
    parameters: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: '일정 ID (필수)' },
      },
      required: ['id'],
    },
  },
  // -- Tasks --
  {
    name: 'willow_list_tasks',
    description: '[윌로우] 태스크 목록. schedule_id로 특정 일정의 태스크만 조회 가능.',
    parameters: {
      type: 'object' as const,
      properties: {
        schedule_id: { type: 'string', description: '일정 ID 필터' },
      },
    },
  },
  {
    name: 'willow_create_task',
    description: '[윌로우] 새 태스크 생성 (일정에 연결)',
    parameters: {
      type: 'object' as const,
      properties: {
        schedule_id: { type: 'string', description: '일정 ID (필수)' },
        content: { type: 'string', description: '태스크 내용 (필수)' },
        deadline: { type: 'string', description: '마감일 YYYY-MM-DD' },
      },
      required: ['schedule_id', 'content'],
    },
  },
  {
    name: 'willow_update_task',
    description: '[윌로우] 태스크 수정/완료 처리. is_completed를 true로 하면 completed_at이 자동 설정.',
    parameters: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: '태스크 ID (필수)' },
        content: { type: 'string', description: '내용' },
        deadline: { type: 'string', description: '마감일' },
        is_completed: { type: 'string', description: '완료 여부 (true/false)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'willow_delete_task',
    description: '[윌로우] 태스크 삭제',
    parameters: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: '태스크 ID (필수)' },
      },
      required: ['id'],
    },
  },
  // -- Memos --
  {
    name: 'willow_upsert_memo',
    description: '[윌로우] 일일 메모 작성/수정. 같은 날짜에 이미 메모가 있으면 덮어씁니다.',
    parameters: {
      type: 'object' as const,
      properties: {
        memo_date: { type: 'string', description: '메모 날짜 YYYY-MM-DD (필수)' },
        content: { type: 'string', description: '메모 내용 (필수)' },
      },
      required: ['memo_date', 'content'],
    },
  },
  {
    name: 'willow_delete_memo',
    description: '[윌로우] 일일 메모 삭제',
    parameters: {
      type: 'object' as const,
      properties: {
        date: { type: 'string', description: '삭제할 메모 날짜 YYYY-MM-DD (필수)' },
      },
      required: ['date'],
    },
  },
  // -- Cash --
  {
    name: 'willow_list_cash',
    description: '[윌로우] 현금관리 항목 목록. type(revenue|expense|asset|liability)이나 status(issued|completed)로 필터 가능.',
    parameters: {
      type: 'object' as const,
      properties: {
        type: { type: 'string', description: 'revenue|expense|asset|liability' },
        status: { type: 'string', description: 'issued|completed' },
      },
    },
  },
  {
    name: 'willow_create_cash',
    description: '[윌로우] 현금관리 항목 생성 (매출/지출/자산/부채)',
    parameters: {
      type: 'object' as const,
      properties: {
        type: { type: 'string', description: 'revenue|expense|asset|liability (필수)' },
        counterparty: { type: 'string', description: '거래처 (필수)' },
        amount: { type: 'string', description: '금액 (필수)' },
        description: { type: 'string', description: '설명' },
        issue_date: { type: 'string', description: '발행일 YYYY-MM-DD' },
        payment_date: { type: 'string', description: '입금/지급일 YYYY-MM-DD' },
        status: { type: 'string', description: 'issued|completed (기본: issued)' },
        notes: { type: 'string', description: '비고' },
        account_number: { type: 'string', description: '계좌번호' },
      },
      required: ['type', 'counterparty', 'amount'],
    },
  },
  {
    name: 'willow_update_cash',
    description: '[윌로우] 현금관리 항목 수정',
    parameters: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: '항목 ID (필수)' },
        type: { type: 'string', description: 'revenue|expense|asset|liability' },
        counterparty: { type: 'string', description: '거래처' },
        amount: { type: 'string', description: '금액' },
        description: { type: 'string', description: '설명' },
        issue_date: { type: 'string', description: '발행일' },
        payment_date: { type: 'string', description: '입금/지급일' },
        status: { type: 'string', description: 'issued|completed' },
        notes: { type: 'string', description: '비고' },
      },
      required: ['id'],
    },
  },
  {
    name: 'willow_delete_cash',
    description: '[윌로우] 현금관리 항목 삭제',
    parameters: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: '항목 ID (필수)' },
      },
      required: ['id'],
    },
  },
  // ---- 텐소프트웍스 경영관리 전용 도구 ----
  // -- Dashboard --
  { name: 'tensw_get_dashboard', description: '[텐소프트웍스] 경영관리 대시보드 요약 — 현금/매출/대출/일정/프로젝트/마일스톤 한눈에', parameters: { type: 'object' as const, properties: {} } },
  { name: 'tensw_get_cash_summary', description: '[텐소프트웍스] 현금관리 요약 — 매출/지출/자산/부채 집계. 기간 필터 가능.', parameters: { type: 'object' as const, properties: { start_date: { type: 'string', description: '시작일 (YYYY-MM-DD)' }, end_date: { type: 'string', description: '종료일 (YYYY-MM-DD)' } } } },
  // -- Clients --
  { name: 'tensw_list_clients', description: '[텐소프트웍스] 클라이언트 목록', parameters: { type: 'object' as const, properties: {} } },
  { name: 'tensw_create_client', description: '[텐소프트웍스] 새 클라이언트 생성', parameters: { type: 'object' as const, properties: { name: { type: 'string', description: '이름 (필수)' }, color: { type: 'string', description: '색상 hex' }, icon: { type: 'string', description: '아이콘' } }, required: ['name'] } },
  { name: 'tensw_update_client', description: '[텐소프트웍스] 클라이언트 수정', parameters: { type: 'object' as const, properties: { id: { type: 'string', description: 'ID (필수)' }, name: { type: 'string', description: '이름' }, color: { type: 'string', description: '색상' }, icon: { type: 'string', description: '아이콘' } }, required: ['id'] } },
  { name: 'tensw_delete_client', description: '[텐소프트웍스] 클라이언트 삭제', parameters: { type: 'object' as const, properties: { id: { type: 'string', description: 'ID (필수)' } }, required: ['id'] } },
  // -- Projects --
  { name: 'tensw_list_projects', description: '[텐소프트웍스] 프로젝트 목록 (클라이언트 관계 포함)', parameters: { type: 'object' as const, properties: { client_id: { type: 'string', description: '클라이언트 ID 필터' } } } },
  { name: 'tensw_create_project', description: '[텐소프트웍스] 새 프로젝트 생성', parameters: { type: 'object' as const, properties: { client_id: { type: 'string', description: '클라이언트 ID (필수)' }, name: { type: 'string', description: '이름 (필수)' }, description: { type: 'string', description: '설명' }, status: { type: 'string', description: 'active|completed|on_hold|cancelled' } }, required: ['client_id', 'name'] } },
  { name: 'tensw_update_project', description: '[텐소프트웍스] 프로젝트 수정', parameters: { type: 'object' as const, properties: { id: { type: 'string', description: 'ID (필수)' }, name: { type: 'string', description: '이름' }, description: { type: 'string', description: '설명' }, status: { type: 'string', description: 'active|completed|on_hold|cancelled' } }, required: ['id'] } },
  { name: 'tensw_delete_project', description: '[텐소프트웍스] 프로젝트 삭제', parameters: { type: 'object' as const, properties: { id: { type: 'string', description: 'ID (필수)' } }, required: ['id'] } },
  // -- Milestones --
  { name: 'tensw_list_milestones', description: '[텐소프트웍스] 마일스톤 목록 (프로젝트/클라이언트 관계 포함)', parameters: { type: 'object' as const, properties: { project_id: { type: 'string', description: '프로젝트 ID 필터' } } } },
  { name: 'tensw_create_milestone', description: '[텐소프트웍스] 새 마일스톤 생성', parameters: { type: 'object' as const, properties: { project_id: { type: 'string', description: '프로젝트 ID (필수)' }, name: { type: 'string', description: '이름 (필수)' }, description: { type: 'string', description: '설명' }, status: { type: 'string', description: 'pending|in_progress|review_pending|completed' }, target_date: { type: 'string', description: '목표일 YYYY-MM-DD' } }, required: ['project_id', 'name'] } },
  { name: 'tensw_update_milestone', description: '[텐소프트웍스] 마일스톤 수정 (completed 시 completed_at 자동)', parameters: { type: 'object' as const, properties: { id: { type: 'string', description: 'ID (필수)' }, name: { type: 'string', description: '이름' }, description: { type: 'string', description: '설명' }, status: { type: 'string', description: 'pending|in_progress|review_pending|completed' }, target_date: { type: 'string', description: '목표일' }, review_completed: { type: 'string', description: 'true/false' } }, required: ['id'] } },
  { name: 'tensw_delete_milestone', description: '[텐소프트웍스] 마일스톤 삭제', parameters: { type: 'object' as const, properties: { id: { type: 'string', description: 'ID (필수)' } }, required: ['id'] } },
  // -- Schedules --
  { name: 'tensw_list_schedules', description: '[텐소프트웍스] 일정 목록 (날짜/클라이언트 필터, 태스크 포함)', parameters: { type: 'object' as const, properties: { start_date: { type: 'string', description: '시작일' }, end_date: { type: 'string', description: '종료일' }, client_id: { type: 'string', description: '클라이언트 ID' } } } },
  { name: 'tensw_create_schedule', description: '[텐소프트웍스] 새 일정 생성', parameters: { type: 'object' as const, properties: { title: { type: 'string', description: '제목 (필수)' }, schedule_date: { type: 'string', description: '날짜 YYYY-MM-DD (필수)' }, end_date: { type: 'string', description: '종료일' }, start_time: { type: 'string', description: '시작 시간 HH:MM' }, end_time: { type: 'string', description: '종료 시간' }, type: { type: 'string', description: 'task|meeting|deadline' }, client_id: { type: 'string', description: '클라이언트 ID' }, description: { type: 'string', description: '설명' }, color: { type: 'string', description: '색상' }, task_content: { type: 'string', description: '태스크 내용' }, task_deadline: { type: 'string', description: '태스크 마감일' } }, required: ['title', 'schedule_date'] } },
  { name: 'tensw_update_schedule', description: '[텐소프트웍스] 일정 수정', parameters: { type: 'object' as const, properties: { id: { type: 'string', description: 'ID (필수)' }, title: { type: 'string', description: '제목' }, schedule_date: { type: 'string', description: '날짜' }, end_date: { type: 'string', description: '종료일' }, start_time: { type: 'string', description: '시작 시간' }, end_time: { type: 'string', description: '종료 시간' }, type: { type: 'string', description: 'task|meeting|deadline' }, client_id: { type: 'string', description: '클라이언트' }, description: { type: 'string', description: '설명' }, is_completed: { type: 'string', description: 'true/false' }, task_content: { type: 'string', description: '태스크 내용' }, task_completed: { type: 'string', description: 'true/false' } }, required: ['id'] } },
  { name: 'tensw_delete_schedule', description: '[텐소프트웍스] 일정 삭제', parameters: { type: 'object' as const, properties: { id: { type: 'string', description: 'ID (필수)' } }, required: ['id'] } },
  // -- Tasks --
  { name: 'tensw_list_tasks', description: '[텐소프트웍스] 태스크 목록', parameters: { type: 'object' as const, properties: { schedule_id: { type: 'string', description: '일정 ID 필터' } } } },
  { name: 'tensw_create_task', description: '[텐소프트웍스] 새 태스크', parameters: { type: 'object' as const, properties: { schedule_id: { type: 'string', description: '일정 ID (필수)' }, content: { type: 'string', description: '내용 (필수)' }, deadline: { type: 'string', description: '마감일' } }, required: ['schedule_id', 'content'] } },
  { name: 'tensw_update_task', description: '[텐소프트웍스] 태스크 수정/완료 (completed_at 자동)', parameters: { type: 'object' as const, properties: { id: { type: 'string', description: 'ID (필수)' }, content: { type: 'string', description: '내용' }, deadline: { type: 'string', description: '마감일' }, is_completed: { type: 'string', description: 'true/false' } }, required: ['id'] } },
  { name: 'tensw_delete_task', description: '[텐소프트웍스] 태스크 삭제', parameters: { type: 'object' as const, properties: { id: { type: 'string', description: 'ID (필수)' } }, required: ['id'] } },
  // -- Memos --
  { name: 'tensw_upsert_memo', description: '[텐소프트웍스] 일일 메모 작성/수정', parameters: { type: 'object' as const, properties: { memo_date: { type: 'string', description: '날짜 YYYY-MM-DD (필수)' }, content: { type: 'string', description: '내용 (필수)' } }, required: ['memo_date', 'content'] } },
  { name: 'tensw_delete_memo', description: '[텐소프트웍스] 일일 메모 삭제', parameters: { type: 'object' as const, properties: { date: { type: 'string', description: '날짜 YYYY-MM-DD (필수)' } }, required: ['date'] } },
  // -- Cash --
  { name: 'tensw_list_cash', description: '[텐소프트웍스] 현금관리 항목 목록', parameters: { type: 'object' as const, properties: { type: { type: 'string', description: 'revenue|expense|asset|liability' }, status: { type: 'string', description: 'issued|completed' } } } },
  { name: 'tensw_create_cash', description: '[텐소프트웍스] 현금관리 항목 생성', parameters: { type: 'object' as const, properties: { type: { type: 'string', description: 'revenue|expense|asset|liability (필수)' }, counterparty: { type: 'string', description: '거래처 (필수)' }, amount: { type: 'string', description: '금액 (필수)' }, description: { type: 'string', description: '설명' }, issue_date: { type: 'string', description: '발행일' }, payment_date: { type: 'string', description: '입금/지급일' }, status: { type: 'string', description: 'issued|completed' }, notes: { type: 'string', description: '비고' }, account_number: { type: 'string', description: '계좌번호' } }, required: ['type', 'counterparty', 'amount'] } },
  { name: 'tensw_update_cash', description: '[텐소프트웍스] 현금관리 항목 수정', parameters: { type: 'object' as const, properties: { id: { type: 'string', description: 'ID (필수)' }, type: { type: 'string', description: 'revenue|expense|asset|liability' }, counterparty: { type: 'string', description: '거래처' }, amount: { type: 'string', description: '금액' }, description: { type: 'string', description: '설명' }, issue_date: { type: 'string', description: '발행일' }, payment_date: { type: 'string', description: '입금/지급일' }, status: { type: 'string', description: 'issued|completed' }, notes: { type: 'string', description: '비고' } }, required: ['id'] } },
  { name: 'tensw_delete_cash', description: '[텐소프트웍스] 현금관리 항목 삭제', parameters: { type: 'object' as const, properties: { id: { type: 'string', description: 'ID (필수)' } }, required: ['id'] } },
  // -- Sales --
  { name: 'tensw_list_sales', description: '[텐소프트웍스] 매출관리(세금계산서) 목록', parameters: { type: 'object' as const, properties: { status: { type: 'string', description: 'scheduled|pending|paid' } } } },
  { name: 'tensw_create_sales', description: '[텐소프트웍스] 매출 항목 생성', parameters: { type: 'object' as const, properties: { invoice_date: { type: 'string', description: '계산서 발행일 (필수)' }, company: { type: 'string', description: '거래처 (필수)' }, description: { type: 'string', description: '설명' }, supply_amount: { type: 'string', description: '공급가액 (필수)' }, tax_amount: { type: 'string', description: '세액' }, total_amount: { type: 'string', description: '합계' }, status: { type: 'string', description: 'scheduled|pending|paid' }, notes: { type: 'string', description: '비고' } }, required: ['invoice_date', 'company', 'supply_amount'] } },
  { name: 'tensw_update_sales', description: '[텐소프트웍스] 매출 항목 수정', parameters: { type: 'object' as const, properties: { id: { type: 'string', description: 'ID (필수)' }, invoice_date: { type: 'string', description: '발행일' }, company: { type: 'string', description: '거래처' }, description: { type: 'string', description: '설명' }, supply_amount: { type: 'string', description: '공급가액' }, tax_amount: { type: 'string', description: '세액' }, total_amount: { type: 'string', description: '합계' }, status: { type: 'string', description: 'scheduled|pending|paid' }, notes: { type: 'string', description: '비고' } }, required: ['id'] } },
  { name: 'tensw_delete_sales', description: '[텐소프트웍스] 매출 항목 삭제', parameters: { type: 'object' as const, properties: { id: { type: 'string', description: 'ID (필수)' } }, required: ['id'] } },
  // -- Loans --
  { name: 'tensw_list_loans', description: '[텐소프트웍스] 대출관리 목록', parameters: { type: 'object' as const, properties: { status: { type: 'string', description: 'active|pending|closed' } } } },
  { name: 'tensw_create_loan', description: '[텐소프트웍스] 대출 항목 생성', parameters: { type: 'object' as const, properties: { lender: { type: 'string', description: '대출기관 (필수)' }, loan_type: { type: 'string', description: '대출유형 (필수)' }, principal: { type: 'string', description: '대출원금 (필수)' }, interest_rate: { type: 'string', description: '이자율 (필수)' }, start_date: { type: 'string', description: '시작일 (필수)' }, end_date: { type: 'string', description: '만기일' }, repayment_type: { type: 'string', description: 'bullet|amortization' }, interest_payment_day: { type: 'string', description: '이자납입일 (일자)' }, status: { type: 'string', description: 'active|pending|closed' }, notes: { type: 'string', description: '비고' } }, required: ['lender', 'loan_type', 'principal', 'interest_rate', 'start_date'] } },
  { name: 'tensw_update_loan', description: '[텐소프트웍스] 대출 항목 수정', parameters: { type: 'object' as const, properties: { id: { type: 'string', description: 'ID (필수)' }, lender: { type: 'string', description: '대출기관' }, loan_type: { type: 'string', description: '유형' }, principal: { type: 'string', description: '원금' }, interest_rate: { type: 'string', description: '이자율' }, start_date: { type: 'string', description: '시작일' }, end_date: { type: 'string', description: '만기일' }, repayment_type: { type: 'string', description: 'bullet|amortization' }, interest_payment_day: { type: 'string', description: '이자납입일' }, status: { type: 'string', description: 'active|pending|closed' }, notes: { type: 'string', description: '비고' } }, required: ['id'] } },
  { name: 'tensw_delete_loan', description: '[텐소프트웍스] 대출 항목 삭제', parameters: { type: 'object' as const, properties: { id: { type: 'string', description: 'ID (필수)' } }, required: ['id'] } },
  // ---- ETF Akros 전용 도구 ----
  { name: 'akros_get_dashboard', description: '[Akros] 대시보드 요약 — 상품수, 세금계산서 현황, 최신 AUM 시계열', parameters: { type: 'object' as const, properties: {} } },
  { name: 'akros_list_products', description: '[Akros] ETF 상품 목록 (AUM/ARR 포함)', parameters: { type: 'object' as const, properties: { country: { type: 'string', description: '국가 필터 (KR, US, AU)' } } } },
  { name: 'akros_get_aum_data', description: '[Akros] 특정 ETF 상품의 AUM 히스토리', parameters: { type: 'object' as const, properties: { symbol: { type: 'string', description: '심볼 (필수)' }, days: { type: 'string', description: '조회 일수 (기본: 30)' } }, required: ['symbol'] } },
  { name: 'akros_get_time_series', description: '[Akros] 전체 AUM/ARR 시계열 데이터 (지역별 분류)', parameters: { type: 'object' as const, properties: { days: { type: 'string', description: '조회 일수' } } } },
  { name: 'akros_get_exchange_rates', description: '[Akros] 최신 환율 조회 (KRW, AUD 등)', parameters: { type: 'object' as const, properties: { date: { type: 'string', description: '특정 날짜 YYYY-MM-DD' } } } },
  { name: 'akros_list_tax_invoices', description: '[Akros] 세금계산서 목록', parameters: { type: 'object' as const, properties: {} } },
  { name: 'akros_create_tax_invoice', description: '[Akros] 세금계산서 생성', parameters: { type: 'object' as const, properties: { invoice_date: { type: 'string', description: '발행일 (필수)' }, amount: { type: 'string', description: '금액 (필수)' }, notes: { type: 'string', description: '비고' } }, required: ['invoice_date', 'amount'] } },
  { name: 'akros_update_tax_invoice', description: '[Akros] 세금계산서 수정', parameters: { type: 'object' as const, properties: { id: { type: 'string', description: 'ID (필수)' }, invoice_date: { type: 'string', description: '발행일' }, amount: { type: 'string', description: '금액' }, notes: { type: 'string', description: '비고' }, issued_at: { type: 'string', description: '발급일' }, paid_at: { type: 'string', description: '입금일' } }, required: ['id'] } },
  { name: 'akros_delete_tax_invoice', description: '[Akros] 세금계산서 삭제', parameters: { type: 'object' as const, properties: { id: { type: 'string', description: 'ID (필수)' } }, required: ['id'] } },
  // ---- ETF ETC 전용 도구 ----
  { name: 'etc_get_dashboard', description: '[ETC] 대시보드 요약 — 상품수, 인보이스 현황, 수수료 정보', parameters: { type: 'object' as const, properties: {} } },
  { name: 'etc_get_stats', description: '[ETC] ETF 통계 — 총 AUM, 월간 수수료, 상품별 상세', parameters: { type: 'object' as const, properties: {} } },
  { name: 'etc_list_products', description: '[ETC] ETF 상품 메타데이터 (수수료 구조 포함)', parameters: { type: 'object' as const, properties: { bank: { type: 'string', description: '발행사 필터' } } } },
  { name: 'etc_create_product', description: '[ETC] ETF 상품 생성', parameters: { type: 'object' as const, properties: { symbol: { type: 'string', description: '심볼 (필수)' }, fund_name: { type: 'string', description: '펀드명 (필수)' }, fund_url: { type: 'string', description: 'URL' }, listing_date: { type: 'string', description: '상장일' }, bank: { type: 'string', description: '발행사' }, platform_fee_percent: { type: 'string', description: '플랫폼 수수료%' }, platform_min_fee: { type: 'string', description: '플랫폼 최소수수료' }, pm_fee_percent: { type: 'string', description: 'PM 수수료%' }, pm_min_fee: { type: 'string', description: 'PM 최소수수료' }, currency: { type: 'string', description: '통화 (기본: USD)' }, notes: { type: 'string', description: '비고' } }, required: ['symbol', 'fund_name'] } },
  { name: 'etc_update_product', description: '[ETC] ETF 상품 수정', parameters: { type: 'object' as const, properties: { id: { type: 'string', description: 'ID (필수, number)' }, symbol: { type: 'string', description: '심볼' }, fund_name: { type: 'string', description: '펀드명' }, fund_url: { type: 'string', description: 'URL' }, listing_date: { type: 'string', description: '상장일' }, bank: { type: 'string', description: '발행사' }, platform_fee_percent: { type: 'string', description: '플랫폼 수수료%' }, platform_min_fee: { type: 'string', description: '플랫폼 최소수수료' }, pm_fee_percent: { type: 'string', description: 'PM 수수료%' }, pm_min_fee: { type: 'string', description: 'PM 최소수수료' }, currency: { type: 'string', description: '통화' }, notes: { type: 'string', description: '비고' }, is_active: { type: 'string', description: 'true/false' } }, required: ['id'] } },
  { name: 'etc_delete_product', description: '[ETC] ETF 상품 삭제', parameters: { type: 'object' as const, properties: { id: { type: 'string', description: 'ID (필수, number)' } }, required: ['id'] } },
  { name: 'etc_list_invoices', description: '[ETC] 인보이스 목록', parameters: { type: 'object' as const, properties: { status: { type: 'string', description: 'draft|sent|paid|overdue|cancelled' }, limit: { type: 'string', description: '최대 건수 (기본: 50)' } } } },
  { name: 'etc_create_invoice', description: '[ETC] 인보이스 생성', parameters: { type: 'object' as const, properties: { invoice_date: { type: 'string', description: '발행일 (필수)' }, bill_to_company: { type: 'string', description: '수신 회사 (기본: Exchange Traded Concepts, LLC)' }, attention: { type: 'string', description: '담당자 (기본: Garrett Stevens)' }, line_items: { type: 'string', description: 'JSON 배열 [{description, qty?, unitPrice?, amount}] (필수)' }, notes: { type: 'string', description: '비고' } }, required: ['invoice_date', 'line_items'] } },
  { name: 'etc_get_invoice', description: '[ETC] 인보이스 상세 조회', parameters: { type: 'object' as const, properties: { id: { type: 'string', description: '인보이스 ID (필수)' } }, required: ['id'] } },
  // ---- 류하 학습관리 전용 도구 ----
  { name: 'ryuha_get_dashboard', description: '[류하] 학습 대시보드 — 이번주 일정, 미완료 숙제, 최근 신체기록', parameters: { type: 'object' as const, properties: {} } },
  // -- Subjects --
  { name: 'ryuha_list_subjects', description: '[류하] 과목 목록', parameters: { type: 'object' as const, properties: {} } },
  { name: 'ryuha_create_subject', description: '[류하] 과목 생성', parameters: { type: 'object' as const, properties: { name: { type: 'string', description: '과목명 (필수)' }, color: { type: 'string', description: '색상 hex' }, icon: { type: 'string', description: '아이콘' } }, required: ['name'] } },
  { name: 'ryuha_update_subject', description: '[류하] 과목 수정', parameters: { type: 'object' as const, properties: { id: { type: 'string', description: 'ID (필수)' }, name: { type: 'string', description: '이름' }, color: { type: 'string', description: '색상' }, icon: { type: 'string', description: '아이콘' } }, required: ['id'] } },
  { name: 'ryuha_delete_subject', description: '[류하] 과목 삭제', parameters: { type: 'object' as const, properties: { id: { type: 'string', description: 'ID (필수)' } }, required: ['id'] } },
  // -- Textbooks --
  { name: 'ryuha_list_textbooks', description: '[류하] 교재 목록 (과목 관계 포함)', parameters: { type: 'object' as const, properties: { subject_id: { type: 'string', description: '과목 ID 필터' } } } },
  { name: 'ryuha_create_textbook', description: '[류하] 교재 생성', parameters: { type: 'object' as const, properties: { subject_id: { type: 'string', description: '과목 ID (필수)' }, name: { type: 'string', description: '교재명 (필수)' }, publisher: { type: 'string', description: '출판사' }, description: { type: 'string', description: '설명' } }, required: ['subject_id', 'name'] } },
  { name: 'ryuha_update_textbook', description: '[류하] 교재 수정', parameters: { type: 'object' as const, properties: { id: { type: 'string', description: 'ID (필수)' }, name: { type: 'string', description: '이름' }, publisher: { type: 'string', description: '출판사' }, description: { type: 'string', description: '설명' } }, required: ['id'] } },
  { name: 'ryuha_delete_textbook', description: '[류하] 교재 삭제', parameters: { type: 'object' as const, properties: { id: { type: 'string', description: 'ID (필수)' } }, required: ['id'] } },
  // -- Chapters --
  { name: 'ryuha_list_chapters', description: '[류하] 챕터 목록 (교재/과목 관계 포함)', parameters: { type: 'object' as const, properties: { textbook_id: { type: 'string', description: '교재 ID 필터' } } } },
  { name: 'ryuha_create_chapter', description: '[류하] 챕터 생성', parameters: { type: 'object' as const, properties: { textbook_id: { type: 'string', description: '교재 ID (필수)' }, name: { type: 'string', description: '챕터명 (필수)' }, description: { type: 'string', description: '설명' }, status: { type: 'string', description: 'pending|in_progress|review_notes_pending|completed' }, target_date: { type: 'string', description: '목표일' } }, required: ['textbook_id', 'name'] } },
  { name: 'ryuha_update_chapter', description: '[류하] 챕터 수정 (completed 시 completed_at 자동)', parameters: { type: 'object' as const, properties: { id: { type: 'string', description: 'ID (필수)' }, name: { type: 'string', description: '이름' }, description: { type: 'string', description: '설명' }, status: { type: 'string', description: 'pending|in_progress|review_notes_pending|completed' }, target_date: { type: 'string', description: '목표일' }, review_completed: { type: 'string', description: 'true/false' } }, required: ['id'] } },
  { name: 'ryuha_delete_chapter', description: '[류하] 챕터 삭제', parameters: { type: 'object' as const, properties: { id: { type: 'string', description: 'ID (필수)' } }, required: ['id'] } },
  // -- Schedules --
  { name: 'ryuha_list_schedules', description: '[류하] 학습 일정 목록 (과목/숙제 포함, 날짜/과목 필터)', parameters: { type: 'object' as const, properties: { start_date: { type: 'string', description: '시작일' }, end_date: { type: 'string', description: '종료일' }, subject_id: { type: 'string', description: '과목 ID' } } } },
  { name: 'ryuha_create_schedule', description: '[류하] 학습 일정 생성', parameters: { type: 'object' as const, properties: { title: { type: 'string', description: '제목 (필수)' }, schedule_date: { type: 'string', description: '날짜 YYYY-MM-DD (필수)' }, end_date: { type: 'string', description: '종료일' }, start_time: { type: 'string', description: '시작 시간 HH:MM' }, end_time: { type: 'string', description: '종료 시간' }, type: { type: 'string', description: 'homework|self_study' }, subject_id: { type: 'string', description: '과목 ID' }, description: { type: 'string', description: '설명' }, color: { type: 'string', description: '색상' }, homework_content: { type: 'string', description: '숙제 내용' }, homework_deadline: { type: 'string', description: '숙제 마감일' } }, required: ['title', 'schedule_date'] } },
  { name: 'ryuha_update_schedule', description: '[류하] 학습 일정 수정', parameters: { type: 'object' as const, properties: { id: { type: 'string', description: 'ID (필수)' }, title: { type: 'string', description: '제목' }, schedule_date: { type: 'string', description: '날짜' }, start_time: { type: 'string', description: '시작 시간' }, end_time: { type: 'string', description: '종료 시간' }, type: { type: 'string', description: 'homework|self_study' }, subject_id: { type: 'string', description: '과목 ID' }, description: { type: 'string', description: '설명' }, is_completed: { type: 'string', description: 'true/false' }, homework_content: { type: 'string', description: '숙제 내용' }, homework_deadline: { type: 'string', description: '숙제 마감일' }, homework_completed: { type: 'string', description: 'true/false' } }, required: ['id'] } },
  { name: 'ryuha_delete_schedule', description: '[류하] 학습 일정 삭제', parameters: { type: 'object' as const, properties: { id: { type: 'string', description: 'ID (필수)' } }, required: ['id'] } },
  // -- Homework --
  { name: 'ryuha_list_homework', description: '[류하] 숙제 목록', parameters: { type: 'object' as const, properties: { schedule_id: { type: 'string', description: '일정 ID 필터' } } } },
  { name: 'ryuha_create_homework', description: '[류하] 숙제 생성', parameters: { type: 'object' as const, properties: { schedule_id: { type: 'string', description: '일정 ID (필수)' }, content: { type: 'string', description: '내용 (필수)' }, deadline: { type: 'string', description: '마감일' } }, required: ['schedule_id', 'content'] } },
  { name: 'ryuha_update_homework', description: '[류하] 숙제 수정/완료 (completed_at 자동)', parameters: { type: 'object' as const, properties: { id: { type: 'string', description: 'ID (필수)' }, content: { type: 'string', description: '내용' }, deadline: { type: 'string', description: '마감일' }, is_completed: { type: 'string', description: 'true/false' } }, required: ['id'] } },
  { name: 'ryuha_delete_homework', description: '[류하] 숙제 삭제', parameters: { type: 'object' as const, properties: { id: { type: 'string', description: 'ID (필수)' } }, required: ['id'] } },
  // -- Memos --
  { name: 'ryuha_upsert_memo', description: '[류하] 일일 메모 작성/수정', parameters: { type: 'object' as const, properties: { memo_date: { type: 'string', description: '날짜 YYYY-MM-DD (필수)' }, content: { type: 'string', description: '내용 (필수)' } }, required: ['memo_date', 'content'] } },
  { name: 'ryuha_delete_memo', description: '[류하] 일일 메모 삭제', parameters: { type: 'object' as const, properties: { date: { type: 'string', description: '날짜 (필수)' } }, required: ['date'] } },
  // -- Body Records --
  { name: 'ryuha_list_body_records', description: '[류하] 신체기록 목록', parameters: { type: 'object' as const, properties: { start_date: { type: 'string', description: '시작일' }, end_date: { type: 'string', description: '종료일' } } } },
  { name: 'ryuha_create_body_record', description: '[류하] 신체기록 생성', parameters: { type: 'object' as const, properties: { record_date: { type: 'string', description: '날짜 (필수)' }, height_cm: { type: 'string', description: '키 cm' }, weight_kg: { type: 'string', description: '몸무게 kg' }, notes: { type: 'string', description: '비고' } }, required: ['record_date'] } },
  { name: 'ryuha_update_body_record', description: '[류하] 신체기록 수정', parameters: { type: 'object' as const, properties: { id: { type: 'string', description: 'ID (필수)' }, record_date: { type: 'string', description: '날짜' }, height_cm: { type: 'string', description: '키' }, weight_kg: { type: 'string', description: '몸무게' }, notes: { type: 'string', description: '비고' } }, required: ['id'] } },
  { name: 'ryuha_delete_body_record', description: '[류하] 신체기록 삭제', parameters: { type: 'object' as const, properties: { id: { type: 'string', description: 'ID (필수)' } }, required: ['id'] } },
  // -- Notes --
  { name: 'ryuha_list_notes', description: '[류하] 수첩(노트) 목록. 카테고리/검색 필터 가능.', parameters: { type: 'object' as const, properties: { category: { type: 'string', description: '카테고리 필터' }, search: { type: 'string', description: '검색어 (제목/내용)' } } } },
  { name: 'ryuha_create_note', description: '[류하] 수첩(노트) 생성', parameters: { type: 'object' as const, properties: { title: { type: 'string', description: '제목 (필수)' }, content: { type: 'string', description: '내용 (필수)' }, category: { type: 'string', description: '카테고리' }, is_pinned: { type: 'string', description: 'true/false' } }, required: ['title', 'content'] } },
  { name: 'ryuha_update_note', description: '[류하] 수첩(노트) 수정', parameters: { type: 'object' as const, properties: { id: { type: 'string', description: 'ID (필수)' }, title: { type: 'string', description: '제목' }, content: { type: 'string', description: '내용' }, category: { type: 'string', description: '카테고리' }, is_pinned: { type: 'string', description: 'true/false' } }, required: ['id'] } },
  { name: 'ryuha_delete_note', description: '[류하] 수첩(노트) 삭제', parameters: { type: 'object' as const, properties: { id: { type: 'string', description: 'ID (필수)' } }, required: ['id'] } },
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

    // ---- 윌로우 경영관리 도구 ----
    case 'willow_get_dashboard':
      return await willowGetDashboard()

    case 'willow_get_cash_summary':
      return await willowGetCashSummary({
        start_date: args.start_date as string | undefined,
        end_date: args.end_date as string | undefined,
      })

    case 'willow_list_clients':
      return await willowListClients()

    case 'willow_create_client':
      return await willowCreateClient({
        name: args.name as string,
        color: args.color as string | undefined,
        icon: args.icon as string | undefined,
      })

    case 'willow_update_client':
      return await willowUpdateClient({
        id: args.id as string,
        name: args.name as string | undefined,
        color: args.color as string | undefined,
        icon: args.icon as string | undefined,
      })

    case 'willow_delete_client':
      return await willowDeleteClient(args.id as string)

    case 'willow_list_projects':
      return await willowListProjects({
        client_id: args.client_id as string | undefined,
      })

    case 'willow_create_project':
      return await willowCreateProject({
        client_id: args.client_id as string,
        name: args.name as string,
        description: args.description as string | undefined,
        status: args.status as string | undefined,
      })

    case 'willow_update_project':
      return await willowUpdateProject({
        id: args.id as string,
        name: args.name as string | undefined,
        description: args.description as string | undefined,
        status: args.status as string | undefined,
      })

    case 'willow_delete_project':
      return await willowDeleteProject(args.id as string)

    case 'willow_list_milestones':
      return await willowListMilestones({
        project_id: args.project_id as string | undefined,
      })

    case 'willow_create_milestone':
      return await willowCreateMilestone({
        project_id: args.project_id as string,
        name: args.name as string,
        description: args.description as string | undefined,
        status: args.status as string | undefined,
        target_date: args.target_date as string | undefined,
      })

    case 'willow_update_milestone':
      return await willowUpdateMilestone({
        id: args.id as string,
        name: args.name as string | undefined,
        description: args.description as string | undefined,
        status: args.status as string | undefined,
        target_date: args.target_date as string | undefined,
        review_completed: args.review_completed === 'true' ? true : args.review_completed === 'false' ? false : undefined,
      })

    case 'willow_delete_milestone':
      return await willowDeleteMilestone(args.id as string)

    case 'willow_list_schedules':
      return await willowListSchedules({
        start_date: args.start_date as string | undefined,
        end_date: args.end_date as string | undefined,
        client_id: args.client_id as string | undefined,
      })

    case 'willow_create_schedule':
      return await willowCreateSchedule({
        title: args.title as string,
        schedule_date: args.schedule_date as string,
        end_date: args.end_date as string | undefined,
        start_time: args.start_time as string | undefined,
        end_time: args.end_time as string | undefined,
        type: args.type as string | undefined,
        client_id: args.client_id as string | undefined,
        description: args.description as string | undefined,
        color: args.color as string | undefined,
        task_content: args.task_content as string | undefined,
        task_deadline: args.task_deadline as string | undefined,
      })

    case 'willow_update_schedule':
      return await willowUpdateSchedule({
        id: args.id as string,
        title: args.title as string | undefined,
        schedule_date: args.schedule_date as string | undefined,
        end_date: args.end_date as string | undefined,
        start_time: args.start_time as string | undefined,
        end_time: args.end_time as string | undefined,
        type: args.type as string | undefined,
        client_id: args.client_id as string | undefined,
        description: args.description as string | undefined,
        is_completed: args.is_completed === 'true' ? true : args.is_completed === 'false' ? false : undefined,
        task_content: args.task_content as string | undefined,
        task_completed: args.task_completed === 'true' ? true : args.task_completed === 'false' ? false : undefined,
      })

    case 'willow_delete_schedule':
      return await willowDeleteSchedule(args.id as string)

    case 'willow_list_tasks':
      return await willowListTasks({
        schedule_id: args.schedule_id as string | undefined,
      })

    case 'willow_create_task':
      return await willowCreateTask({
        schedule_id: args.schedule_id as string,
        content: args.content as string,
        deadline: args.deadline as string | undefined,
      })

    case 'willow_update_task':
      return await willowUpdateTask({
        id: args.id as string,
        content: args.content as string | undefined,
        deadline: args.deadline as string | undefined,
        is_completed: args.is_completed === 'true' ? true : args.is_completed === 'false' ? false : undefined,
      })

    case 'willow_delete_task':
      return await willowDeleteTask(args.id as string)

    case 'willow_upsert_memo':
      return await willowUpsertMemo({
        memo_date: args.memo_date as string,
        content: args.content as string,
      })

    case 'willow_delete_memo':
      return await willowDeleteMemo(args.date as string)

    case 'willow_list_cash':
      return await willowListCash({
        type: args.type as string | undefined,
        status: args.status as string | undefined,
      })

    case 'willow_create_cash':
      return await willowCreateCash({
        type: args.type as string,
        counterparty: args.counterparty as string,
        amount: Number(args.amount),
        description: args.description as string | undefined,
        issue_date: args.issue_date as string | undefined,
        payment_date: args.payment_date as string | undefined,
        status: args.status as string | undefined,
        notes: args.notes as string | undefined,
        account_number: args.account_number as string | undefined,
      })

    case 'willow_update_cash':
      return await willowUpdateCash({
        id: args.id as string,
        type: args.type as string | undefined,
        counterparty: args.counterparty as string | undefined,
        amount: args.amount ? Number(args.amount) : undefined,
        description: args.description as string | undefined,
        issue_date: args.issue_date as string | undefined,
        payment_date: args.payment_date as string | undefined,
        status: args.status as string | undefined,
        notes: args.notes as string | undefined,
      })

    case 'willow_delete_cash':
      return await willowDeleteCash(args.id as string)

    // ---- 텐소프트웍스 경영관리 도구 ----
    case 'tensw_get_dashboard': return await tenswGetDashboard()
    case 'tensw_get_cash_summary': return await tenswGetCashSummary({ start_date: args.start_date as string | undefined, end_date: args.end_date as string | undefined })
    case 'tensw_list_clients': return await tenswListClients()
    case 'tensw_create_client': return await tenswCreateClient({ name: args.name as string, color: args.color as string | undefined, icon: args.icon as string | undefined })
    case 'tensw_update_client': return await tenswUpdateClient({ id: args.id as string, name: args.name as string | undefined, color: args.color as string | undefined, icon: args.icon as string | undefined })
    case 'tensw_delete_client': return await tenswDeleteClient(args.id as string)
    case 'tensw_list_projects': return await tenswListProjects({ client_id: args.client_id as string | undefined })
    case 'tensw_create_project': return await tenswCreateProject({ client_id: args.client_id as string, name: args.name as string, description: args.description as string | undefined, status: args.status as string | undefined })
    case 'tensw_update_project': return await tenswUpdateProject({ id: args.id as string, name: args.name as string | undefined, description: args.description as string | undefined, status: args.status as string | undefined })
    case 'tensw_delete_project': return await tenswDeleteProject(args.id as string)
    case 'tensw_list_milestones': return await tenswListMilestones({ project_id: args.project_id as string | undefined })
    case 'tensw_create_milestone': return await tenswCreateMilestone({ project_id: args.project_id as string, name: args.name as string, description: args.description as string | undefined, status: args.status as string | undefined, target_date: args.target_date as string | undefined })
    case 'tensw_update_milestone': return await tenswUpdateMilestone({ id: args.id as string, name: args.name as string | undefined, description: args.description as string | undefined, status: args.status as string | undefined, target_date: args.target_date as string | undefined, review_completed: args.review_completed === 'true' ? true : args.review_completed === 'false' ? false : undefined })
    case 'tensw_delete_milestone': return await tenswDeleteMilestone(args.id as string)
    case 'tensw_list_schedules': return await tenswListSchedules({ start_date: args.start_date as string | undefined, end_date: args.end_date as string | undefined, client_id: args.client_id as string | undefined })
    case 'tensw_create_schedule': return await tenswCreateSchedule({ title: args.title as string, schedule_date: args.schedule_date as string, end_date: args.end_date as string | undefined, start_time: args.start_time as string | undefined, end_time: args.end_time as string | undefined, type: args.type as string | undefined, client_id: args.client_id as string | undefined, description: args.description as string | undefined, color: args.color as string | undefined, task_content: args.task_content as string | undefined, task_deadline: args.task_deadline as string | undefined })
    case 'tensw_update_schedule': return await tenswUpdateSchedule({ id: args.id as string, title: args.title as string | undefined, schedule_date: args.schedule_date as string | undefined, end_date: args.end_date as string | undefined, start_time: args.start_time as string | undefined, end_time: args.end_time as string | undefined, type: args.type as string | undefined, client_id: args.client_id as string | undefined, description: args.description as string | undefined, is_completed: args.is_completed === 'true' ? true : args.is_completed === 'false' ? false : undefined, task_content: args.task_content as string | undefined, task_completed: args.task_completed === 'true' ? true : args.task_completed === 'false' ? false : undefined })
    case 'tensw_delete_schedule': return await tenswDeleteSchedule(args.id as string)
    case 'tensw_list_tasks': return await tenswListTasks({ schedule_id: args.schedule_id as string | undefined })
    case 'tensw_create_task': return await tenswCreateTask({ schedule_id: args.schedule_id as string, content: args.content as string, deadline: args.deadline as string | undefined })
    case 'tensw_update_task': return await tenswUpdateTask({ id: args.id as string, content: args.content as string | undefined, deadline: args.deadline as string | undefined, is_completed: args.is_completed === 'true' ? true : args.is_completed === 'false' ? false : undefined })
    case 'tensw_delete_task': return await tenswDeleteTask(args.id as string)
    case 'tensw_upsert_memo': return await tenswUpsertMemo({ memo_date: args.memo_date as string, content: args.content as string })
    case 'tensw_delete_memo': return await tenswDeleteMemo(args.date as string)
    case 'tensw_list_cash': return await tenswListCash({ type: args.type as string | undefined, status: args.status as string | undefined })
    case 'tensw_create_cash': return await tenswCreateCash({ type: args.type as string, counterparty: args.counterparty as string, amount: Number(args.amount), description: args.description as string | undefined, issue_date: args.issue_date as string | undefined, payment_date: args.payment_date as string | undefined, status: args.status as string | undefined, notes: args.notes as string | undefined, account_number: args.account_number as string | undefined })
    case 'tensw_update_cash': return await tenswUpdateCash({ id: args.id as string, type: args.type as string | undefined, counterparty: args.counterparty as string | undefined, amount: args.amount ? Number(args.amount) : undefined, description: args.description as string | undefined, issue_date: args.issue_date as string | undefined, payment_date: args.payment_date as string | undefined, status: args.status as string | undefined, notes: args.notes as string | undefined })
    case 'tensw_delete_cash': return await tenswDeleteCash(args.id as string)
    case 'tensw_list_sales': return await tenswListSales({ status: args.status as string | undefined })
    case 'tensw_create_sales': return await tenswCreateSales({ invoice_date: args.invoice_date as string, company: args.company as string, description: args.description as string | undefined, supply_amount: Number(args.supply_amount), tax_amount: args.tax_amount ? Number(args.tax_amount) : undefined, total_amount: args.total_amount ? Number(args.total_amount) : undefined, status: args.status as string | undefined, notes: args.notes as string | undefined })
    case 'tensw_update_sales': return await tenswUpdateSales({ id: args.id as string, invoice_date: args.invoice_date as string | undefined, company: args.company as string | undefined, description: args.description as string | undefined, supply_amount: args.supply_amount ? Number(args.supply_amount) : undefined, tax_amount: args.tax_amount ? Number(args.tax_amount) : undefined, total_amount: args.total_amount ? Number(args.total_amount) : undefined, status: args.status as string | undefined, notes: args.notes as string | undefined })
    case 'tensw_delete_sales': return await tenswDeleteSales(args.id as string)
    case 'tensw_list_loans': return await tenswListLoans({ status: args.status as string | undefined })
    case 'tensw_create_loan': return await tenswCreateLoan({ lender: args.lender as string, loan_type: args.loan_type as string, principal: Number(args.principal), interest_rate: Number(args.interest_rate), start_date: args.start_date as string, end_date: args.end_date as string | undefined, repayment_type: args.repayment_type as string | undefined, interest_payment_day: args.interest_payment_day ? Number(args.interest_payment_day) : undefined, status: args.status as string | undefined, notes: args.notes as string | undefined })
    case 'tensw_update_loan': return await tenswUpdateLoan({ id: args.id as string, lender: args.lender as string | undefined, loan_type: args.loan_type as string | undefined, principal: args.principal ? Number(args.principal) : undefined, interest_rate: args.interest_rate ? Number(args.interest_rate) : undefined, start_date: args.start_date as string | undefined, end_date: args.end_date as string | undefined, repayment_type: args.repayment_type as string | undefined, interest_payment_day: args.interest_payment_day ? Number(args.interest_payment_day) : undefined, status: args.status as string | undefined, notes: args.notes as string | undefined })
    case 'tensw_delete_loan': return await tenswDeleteLoan(args.id as string)

    // ---- ETF Akros 도구 ----
    case 'akros_get_dashboard': return await akrosGetDashboard()
    case 'akros_list_products': return await akrosListProducts({ country: args.country as string | undefined })
    case 'akros_get_aum_data': return await akrosGetAumData({ symbol: args.symbol as string, days: args.days ? Number(args.days) : undefined })
    case 'akros_get_time_series': return await akrosGetTimeSeries({ days: args.days ? Number(args.days) : undefined })
    case 'akros_get_exchange_rates': return await akrosGetExchangeRates({ date: args.date as string | undefined })
    case 'akros_list_tax_invoices': return await akrosListTaxInvoices()
    case 'akros_create_tax_invoice': return await akrosCreateTaxInvoice({ invoice_date: args.invoice_date as string, amount: Number(args.amount), notes: args.notes as string | undefined })
    case 'akros_update_tax_invoice': return await akrosUpdateTaxInvoice({ id: args.id as string, invoice_date: args.invoice_date as string | undefined, amount: args.amount ? Number(args.amount) : undefined, notes: args.notes as string | undefined, issued_at: args.issued_at as string | undefined, paid_at: args.paid_at as string | undefined })
    case 'akros_delete_tax_invoice': return await akrosDeleteTaxInvoice(args.id as string)

    // ---- ETF ETC 도구 ----
    case 'etc_get_dashboard': return await etcGetDashboard()
    case 'etc_get_stats': return await etcGetStats()
    case 'etc_list_products': return await etcListProducts({ bank: args.bank as string | undefined })
    case 'etc_create_product': return await etcCreateProduct({ symbol: args.symbol as string, fund_name: args.fund_name as string, fund_url: args.fund_url as string | undefined, listing_date: args.listing_date as string | undefined, bank: args.bank as string | undefined, platform_fee_percent: args.platform_fee_percent ? Number(args.platform_fee_percent) : undefined, platform_min_fee: args.platform_min_fee ? Number(args.platform_min_fee) : undefined, pm_fee_percent: args.pm_fee_percent ? Number(args.pm_fee_percent) : undefined, pm_min_fee: args.pm_min_fee ? Number(args.pm_min_fee) : undefined, currency: args.currency as string | undefined, notes: args.notes as string | undefined })
    case 'etc_update_product': return await etcUpdateProduct({ id: Number(args.id), symbol: args.symbol as string | undefined, fund_name: args.fund_name as string | undefined, fund_url: args.fund_url as string | undefined, listing_date: args.listing_date as string | undefined, bank: args.bank as string | undefined, platform_fee_percent: args.platform_fee_percent ? Number(args.platform_fee_percent) : undefined, platform_min_fee: args.platform_min_fee ? Number(args.platform_min_fee) : undefined, pm_fee_percent: args.pm_fee_percent ? Number(args.pm_fee_percent) : undefined, pm_min_fee: args.pm_min_fee ? Number(args.pm_min_fee) : undefined, currency: args.currency as string | undefined, notes: args.notes as string | undefined, is_active: args.is_active === 'true' ? true : args.is_active === 'false' ? false : undefined })
    case 'etc_delete_product': return await etcDeleteProduct(Number(args.id))
    case 'etc_list_invoices': return await etcListInvoices({ status: args.status as string | undefined, limit: args.limit ? Number(args.limit) : undefined })
    case 'etc_create_invoice': return await etcCreateInvoice({ invoice_date: args.invoice_date as string, bill_to_company: args.bill_to_company as string | undefined, attention: args.attention as string | undefined, line_items: typeof args.line_items === 'string' ? JSON.parse(args.line_items) : args.line_items as Array<{ description: string; qty?: number; unitPrice?: number; amount: number }>, notes: args.notes as string | undefined })
    case 'etc_get_invoice': return await etcGetInvoice({ id: args.id as string })

    // ---- 류하 학습관리 도구 ----
    case 'ryuha_get_dashboard': return await ryuhaGetDashboard()
    case 'ryuha_list_subjects': return await ryuhaListSubjects()
    case 'ryuha_create_subject': return await ryuhaCreateSubject({ name: args.name as string, color: args.color as string | undefined, icon: args.icon as string | undefined })
    case 'ryuha_update_subject': return await ryuhaUpdateSubject({ id: args.id as string, name: args.name as string | undefined, color: args.color as string | undefined, icon: args.icon as string | undefined })
    case 'ryuha_delete_subject': return await ryuhaDeleteSubject(args.id as string)
    case 'ryuha_list_textbooks': return await ryuhaListTextbooks({ subject_id: args.subject_id as string | undefined })
    case 'ryuha_create_textbook': return await ryuhaCreateTextbook({ subject_id: args.subject_id as string, name: args.name as string, publisher: args.publisher as string | undefined, description: args.description as string | undefined })
    case 'ryuha_update_textbook': return await ryuhaUpdateTextbook({ id: args.id as string, name: args.name as string | undefined, publisher: args.publisher as string | undefined, description: args.description as string | undefined })
    case 'ryuha_delete_textbook': return await ryuhaDeleteTextbook(args.id as string)
    case 'ryuha_list_chapters': return await ryuhaListChapters({ textbook_id: args.textbook_id as string | undefined })
    case 'ryuha_create_chapter': return await ryuhaCreateChapter({ textbook_id: args.textbook_id as string, name: args.name as string, description: args.description as string | undefined, status: args.status as string | undefined, target_date: args.target_date as string | undefined })
    case 'ryuha_update_chapter': return await ryuhaUpdateChapter({ id: args.id as string, name: args.name as string | undefined, description: args.description as string | undefined, status: args.status as string | undefined, target_date: args.target_date as string | undefined, review_completed: args.review_completed === 'true' ? true : args.review_completed === 'false' ? false : undefined })
    case 'ryuha_delete_chapter': return await ryuhaDeleteChapter(args.id as string)
    case 'ryuha_list_schedules': return await ryuhaListSchedules({ start_date: args.start_date as string | undefined, end_date: args.end_date as string | undefined, subject_id: args.subject_id as string | undefined })
    case 'ryuha_create_schedule': return await ryuhaCreateSchedule({ title: args.title as string, schedule_date: args.schedule_date as string, end_date: args.end_date as string | undefined, start_time: args.start_time as string | undefined, end_time: args.end_time as string | undefined, type: args.type as string | undefined, subject_id: args.subject_id as string | undefined, description: args.description as string | undefined, color: args.color as string | undefined, homework_content: args.homework_content as string | undefined, homework_deadline: args.homework_deadline as string | undefined })
    case 'ryuha_update_schedule': return await ryuhaUpdateSchedule({ id: args.id as string, title: args.title as string | undefined, schedule_date: args.schedule_date as string | undefined, start_time: args.start_time as string | undefined, end_time: args.end_time as string | undefined, type: args.type as string | undefined, subject_id: args.subject_id as string | undefined, description: args.description as string | undefined, is_completed: args.is_completed === 'true' ? true : args.is_completed === 'false' ? false : undefined, homework_content: args.homework_content as string | undefined, homework_deadline: args.homework_deadline as string | undefined, homework_completed: args.homework_completed === 'true' ? true : args.homework_completed === 'false' ? false : undefined })
    case 'ryuha_delete_schedule': return await ryuhaDeleteSchedule(args.id as string)
    case 'ryuha_list_homework': return await ryuhaListHomework({ schedule_id: args.schedule_id as string | undefined })
    case 'ryuha_create_homework': return await ryuhaCreateHomework({ schedule_id: args.schedule_id as string, content: args.content as string, deadline: args.deadline as string | undefined })
    case 'ryuha_update_homework': return await ryuhaUpdateHomework({ id: args.id as string, content: args.content as string | undefined, deadline: args.deadline as string | undefined, is_completed: args.is_completed === 'true' ? true : args.is_completed === 'false' ? false : undefined })
    case 'ryuha_delete_homework': return await ryuhaDeleteHomework(args.id as string)
    case 'ryuha_upsert_memo': return await ryuhaUpsertMemo({ memo_date: args.memo_date as string, content: args.content as string })
    case 'ryuha_delete_memo': return await ryuhaDeleteMemo(args.date as string)
    case 'ryuha_list_body_records': return await ryuhaListBodyRecords({ start_date: args.start_date as string | undefined, end_date: args.end_date as string | undefined })
    case 'ryuha_create_body_record': return await ryuhaCreateBodyRecord({ record_date: args.record_date as string, height_cm: args.height_cm ? Number(args.height_cm) : undefined, weight_kg: args.weight_kg ? Number(args.weight_kg) : undefined, notes: args.notes as string | undefined })
    case 'ryuha_update_body_record': return await ryuhaUpdateBodyRecord({ id: args.id as string, record_date: args.record_date as string | undefined, height_cm: args.height_cm ? Number(args.height_cm) : undefined, weight_kg: args.weight_kg ? Number(args.weight_kg) : undefined, notes: args.notes as string | undefined })
    case 'ryuha_delete_body_record': return await ryuhaDeleteBodyRecord(args.id as string)
    case 'ryuha_list_notes': return await ryuhaListNotes({ category: args.category as string | undefined, search: args.search as string | undefined })
    case 'ryuha_create_note': return await ryuhaCreateNote({ title: args.title as string, content: args.content as string, category: args.category as string | undefined, is_pinned: args.is_pinned === 'true' ? true : undefined })
    case 'ryuha_update_note': return await ryuhaUpdateNote({ id: args.id as string, title: args.title as string | undefined, content: args.content as string | undefined, category: args.category as string | undefined, is_pinned: args.is_pinned === 'true' ? true : args.is_pinned === 'false' ? false : undefined })
    case 'ryuha_delete_note': return await ryuhaDeleteNote(args.id as string)

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
