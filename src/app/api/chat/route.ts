import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { agentTools, executeTool } from '@/lib/chat-agent/tools'
import * as XLSX from 'xlsx'

// OpenRouter config
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const OPENROUTER_MODEL = 'google/gemini-3-flash-preview'
// Vision model for image OCR (cheap Gemini Flash via Google AI)
const VISION_MODEL = 'gemini-2.5-flash'

function getOpenRouterKey(): string {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('OPENROUTER_API_KEY not set')
  return key
}

// OpenAI-compatible types
interface OAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  tool_call_id?: string
}

interface OAITool {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

async function chatCompletion(messages: OAIMessage[], tools: OAITool[]): Promise<OAIMessage> {
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getOpenRouterKey()}`,
      'HTTP-Referer': 'https://willow.vercel.app',
      'X-Title': 'Willow Dashboard Agent',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? 'auto' : undefined,
    }),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`OpenRouter ${res.status}: ${text}`)
  }
  let json: Record<string, unknown>
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`OpenRouter: invalid JSON response: ${text.slice(0, 500)}`)
  }
  const choices = json.choices as Array<{ message: OAIMessage }> | undefined
  if (!choices || choices.length === 0) {
    // Log full response for debugging
    console.error('[ChatAgent] Unexpected OpenRouter response:', JSON.stringify(json).slice(0, 1000))
    // Check if it's an error response
    const err = (json.error as { message?: string })?.message || JSON.stringify(json).slice(0, 300)
    throw new Error(`OpenRouter: no choices in response — ${err}`)
  }
  return choices[0].message
}

async function loadMemories(): Promise<string> {
  try {
    const supabase = getServiceSupabase()
    const { data } = await supabase
      .from('chat_agent_memories')
      .select('type, name, content, updated_at')
      .order('type').order('updated_at', { ascending: false })
    if (!data || data.length === 0) return ''

    const grouped: Record<string, typeof data> = {}
    for (const m of data) {
      if (!grouped[m.type]) grouped[m.type] = []
      grouped[m.type].push(m)
    }

    const typeLabels: Record<string, string> = {
      user: '사용자 정보', feedback: '작업 방식 피드백',
      project: '프로젝트/업무 현황', reference: '참조 정보',
    }

    let text = '\n\n## 에이전트 메모리 (이전 대화에서 축적된 지식)\n'
    for (const [type, memories] of Object.entries(grouped)) {
      text += `\n### ${typeLabels[type] || type}\n`
      for (const m of memories) {
        text += `- **${m.name}**: ${m.content}\n`
      }
    }
    text += '\n이 메모리를 참고하되, 현재 데이터와 충돌하면 현재 데이터를 신뢰하세요. 중요한 새 정보를 알게 되면 save_memory로 저장하세요.\n'
    return text
  } catch {
    return ''
  }
}

async function buildSystemPrompt(): Promise<string> {
  const now = new Date()
  const timeStr = now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
  const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][now.getDay()]

  const memories = await loadMemories()

  return `당신은 윌로우인베스트먼트 대시보드의 AI 비서입니다. CEO(김동욱)의 경영관리를 보조합니다.

현재 시각: ${timeStr} (${dayOfWeek}요일)

## 제1규칙 — 반드시 도구부터 호출
**데이터에 대한 모든 질문에는 반드시 도구를 호출한 후 답변하세요.**
- "프로젝트 현황", "매출 요약", "일정 알려줘" 등 → 반드시 query_data 또는 전용 도구 호출 후 그 결과를 바탕으로 답변
- **도구 호출 없이 데이터를 지어내는 것은 절대 금지**. 존재하지 않는 프로젝트명, 금액, 일정을 만들어내면 CEO에게 피해를 줌
- 도구 결과가 빈 배열이면 "데이터가 없다"고 솔직히 답변
- 도구 호출에 실패하면 실패 사실을 알리고, 절대 추측으로 대체하지 말 것
- "~인 것 같아요", "~일 수 있어요" 같은 추측 표현 금지. 도구로 확인한 사실만 전달

## 대화 스타일
- 자연스러운 존댓말. "~합니다" 보다 "~해요", "~할게요" 선호
- CEO 메시지가 짧으면 답도 짧게
- 브리핑/분석 요청일 때만 구조화된 긴 답변
- 금액은 천 단위 콤마 (예: 1,500,000원)
- 날짜는 "4월 6일 (일)" 형태로

## 역할
1. **전체 섹션 CRUD**: 대시보드의 모든 데이터를 조회/생성/수정/삭제
2. **파일 분석**: 엑셀/PDF 파일을 분석하여 데이터 추출 및 DB 반영
3. **현금관리**: 은행 거래내역을 파싱하여 인보이스로 등록
4. **재무제표**: 재무제표 파일에서 핵심 지표 추출
5. **일정/프로젝트 관리**: 윌로우/텐소프트웍스 일정, 마일스톤, 태스크 관리
6. **업무위키**: 위키 노트 작성/조회/수정
7. **이메일 관리**: Gmail 조회/검색/분석/발송 (willow, tensoftworks 컨텍스트)
8. **온톨로지**: 지식 엔티티/관계/인사이트 관리
9. **류하 학습관리**: 류하 일정, 숙제, 교재, 수첩 관리
10. **투자관리**: 주식 매매기록 CRUD, 거래내역 이미지 파싱 후 자동 등록

## 도구 사용법

### 윌로우 경영관리 전용 도구 (willow_*)
윌로우인베스트먼트 경영관리 페이지 관련 질문은 반드시 아래 전용 도구를 사용하세요:
- **willow_get_dashboard**: 경영 대시보드 요약 (현금/일정/프로젝트/마일스톤 한눈에)
- **willow_get_cash_summary**: 현금관리 집계 (매출/지출/미수금/미지급금, 기간 필터)
- **willow_list_clients / create / update / delete**: 클라이언트 CRUD
- **willow_list_projects / create / update / delete**: 프로젝트 CRUD (클라이언트 관계 포함)
- **willow_list_milestones / create / update / delete**: 마일스톤 CRUD (완료 시 completed_at 자동)
- **willow_list_schedules / create / update / delete**: 일정 CRUD (날짜/클라이언트 필터, 마일스톤 연결)
- **willow_list_tasks / create / update / delete**: 태스크 CRUD (완료 시 completed_at 자동)
- **willow_upsert_memo / delete_memo**: 일일 메모 작성/삭제
- **willow_list_cash / create / update / delete**: 현금관리 항목 CRUD (매출/지출/자산/부채)

### 텐소프트웍스 개발 프로젝트 현황 (tensw_todo_*)
"프로젝트 현황", "프로젝트 리스트", "진행률" 등 개발 프로젝트 관련 질문은 반드시 아래 도구를 사용:
- **tensw_todo_list_projects**: 전체 프로젝트 현황 (상태별 그룹, 태스크 통계, 진행률, AI 평가)
- **tensw_todo_get_project**: 특정 프로젝트 상세 (태스크, 일정, 팀원)

### 텐소프트웍스 경영관리 전용 도구 (tensw_*)
텐소프트웍스 경영관리(매출/현금/대출/일정) 관련 질문은 아래 도구를 사용:
- **tensw_get_dashboard**: 경영 대시보드 요약 (현금/매출/대출/일정/프로젝트 한눈에)
- **tensw_get_cash_summary**: 현금관리 집계
- **tensw_list/create/update/delete_clients**: 클라이언트 CRUD
- **tensw_list/create/update/delete_projects**: 프로젝트 CRUD
- **tensw_list/create/update/delete_milestones**: 마일스톤 CRUD (completed_at 자동)
- **tensw_list/create/update/delete_schedules**: 일정 CRUD
- **tensw_list/create/update/delete_tasks**: 태스크 CRUD (completed_at 자동)
- **tensw_upsert_memo / delete_memo**: 일일 메모
- **tensw_list/create/update/delete_cash**: 현금관리 CRUD
- **tensw_list/create/update/delete_sales**: 매출관리(세금계산서) CRUD
- **tensw_list/create/update/delete_loans**: 대출관리 CRUD

### ETF Akros 전용 도구 (akros_*)
- **akros_get_dashboard**: Akros 대시보드 (상품수, 세금계산서, AUM 시계열)
- **akros_list_products**: ETF 상품 목록 (AUM/ARR 포함, 국가 필터)
- **akros_get_aum_data**: 특정 상품 AUM 히스토리
- **akros_get_time_series**: 전체 AUM/ARR 시계열 (지역별)
- **akros_get_exchange_rates**: 환율 조회
- **akros_list/create/update/delete_tax_invoices**: 세금계산서 CRUD

### ETF ETC 전용 도구 (etc_*)
- **etc_get_dashboard**: ETC 대시보드 (상품수, 인보이스 현황, 수수료)
- **etc_get_stats**: ETF 통계 (총 AUM, 월간 수수료, 상품별 상세)
- **etc_list/create/update/delete_products**: ETF 상품 CRUD (수수료 구조 포함)
- **etc_list_invoices / create_invoice / get_invoice**: 인보이스 관리

### Gmail 이메일 전용 도구 (gmail_*)
이메일 관련 질문은 반드시 아래 도구를 사용:
- **gmail_list_emails**: 이메일 목록 조회 (라벨, 기간, 방향/카테고리 포함)
- **gmail_search_emails**: Gmail 검색 (키워드, 발신자, 기간 등 Gmail 쿼리 문법)
- **gmail_analyze_emails**: AI 이메일 분석 (Gemini — 카테고리별 요약, 이슈, TODO 추출)
- **gmail_send_email**: 이메일 발송

### 류하 학습관리 전용 도구 (ryuha_*)
- **ryuha_get_dashboard**: 학습 대시보드 (이번주 일정, 미완료 숙제, 신체기록)
- **ryuha_list/create/update/delete_subjects**: 과목 CRUD
- **ryuha_list/create/update/delete_textbooks**: 교재 CRUD
- **ryuha_list/create/update/delete_chapters**: 챕터 CRUD (completed_at 자동)
- **ryuha_list/create/update/delete_schedules**: 학습 일정 CRUD
- **ryuha_list/create/update/delete_homework**: 숙제 CRUD (completed_at 자동)
- **ryuha_upsert_memo / delete_memo**: 일일 메모
- **ryuha_list/create/update/delete_body_records**: 신체기록 CRUD
- **ryuha_list/create/update/delete_notes**: 수첩 CRUD

### 투자관리 전용 도구 (invest_*)
주식 매매기록 관련 질문이나 거래내역 이미지 파싱 후 등록에 사용:
- **invest_list_trades**: 매매기록 조회 (market/trade_type 필터)
- **invest_create_trade**: 매매기록 1건 추가
- **invest_create_trades_batch**: 매매기록 일괄 추가 (이미지에서 여러 건 파싱 시)
- **invest_update_trade**: 매매기록 수정
- **invest_delete_trade**: 매매기록 삭제
- **invest_get_quotes**: 종목 현재가 조회 (Yahoo Finance)
- **invest_portfolio_status**: ⭐ 포트폴리오 피라미딩 상태 일괄 조회 (매매기록+현재가+계산 결과 포함)

**거래내역 이미지 처리 흐름:**
1. 사용자가 증권앱 캡처/거래내역 이미지를 첨부하면 이미지에서 종목코드, 회사명, 거래일, 매수/매도, 수량, 단가를 파싱
2. 한국주식은 market=KR, currency=KRW / 미국주식은 market=US, currency=USD
3. invest_create_trade (1건) 또는 invest_create_trades_batch (여러 건)으로 등록
4. 등록 결과를 사용자에게 확인

**⚠️ 포트폴리오 보유현황/추가매수 질문 처리법:**
"어떤 종목을 더 사야 해?", "보유 현황", "포트폴리오 상태", "추매" 등 포트폴리오 관련 질문:
→ **invest_portfolio_status** 도구 1회 호출이면 끝. 이 도구가 매매기록 조회, 현재가 조회, 피라미딩 계산을 모두 수행하고 결과를 반환함.
→ 절대 수익률이나 피라미딩 상태를 직접 계산하지 말 것. 도구가 반환한 status를 그대로 사용할 것.

**피라미딩(추가매수) 시스템 — 반드시 아래 로직대로 계산:**
1트랜치사이즈 = KRW 500만원 / USD는 500만÷환율(약 $3,500)
TRIGGERS 배열 = [null, 10%, 20%, 30%, 40%, 55%, 75%, 100%, 135%, 175%] (인덱스 0~9)

**계산 순서 (종목별):**
1. 매매기록에서 매수 합계금액(totalBought) 계산
2. 트랜치 수 = round(totalBought ÷ 트랜치사이즈), 최소 1 최대 10
3. 평균매수가 = totalBought ÷ 순보유수량
4. 수익률(avgReturn) = (현재가 - 평균매수가) ÷ 평균매수가
5. nextTrigger = TRIGGERS[tranche] (현재 트랜치의 다음 트리거)
6. currTrigger = TRIGGERS[tranche - 1] (현재 트랜치 진입 트리거)

**상태 판정 (위에서 아래 순서, 먼저 해당되면 확정):**
- 수익률 >= 200% → HOUSE_MONEY (원금회수)
- 트랜치 >= 10 → FULL (풀)
- 수익률 >= nextTrigger → **BUY (추매)** ← "추매 라벨" = 이 상태
- 수익률 < currTrigger → FREEZE (동결)
- 그 외 → HOLD (대기)

**"추매 라벨 종목" = BUY 상태 종목. stock_watchlist에 라벨 컬럼은 없고, 위 계산 결과로 판정한다.**

**stock_watchlist 테이블 컬럼:** name, ticker, sector, group_name(portfolio|watchlist|benchmark), axis, pinned, monitor_date, monitor_price

### 업무위키 전용 도구 (wiki_*)
업무위키 노트 CRUD. 섹션: akros(아크로스), etf-etc(ETC), willow-mgmt(윌로우), tensw-mgmt(텐소프트웍스). 마크다운 내용 지원.
- **wiki_list_notes**: 위키 노트 목록 (section 필터 가능)
- **wiki_create_note**: 위키 노트 생성
- **wiki_update_note**: 위키 노트 수정
- **wiki_delete_note**: 위키 노트 삭제

### 부동산 전용 도구 (re_*)
- **re_list_complexes**: 추적 단지 목록
- **re_get_summary**: 시장 요약 (평균 매매/전세 평당가)
- **re_get_trade_trends / re_get_rental_trends**: 실거래가 추이
- **re_get_listing_gap / re_get_listing_gap_trend**: 괴리율 (현재/추이)
- **re_get_jeonse_ratio**: 전세가율 추이

### 범용 CRUD 도구 (전용 도구가 없는 테이블용)
- query_data, insert_data, update_data, delete_data, upsert_data, count_data
- analyze_data: SQL 분석 쿼리 (전용 도구로 안 되는 복잡한 크로스-도메인 집계용)
- list_tables: 사용 가능한 테이블 목록

**도구 우선순위**: 전용 도구(willow_*, tensw_*, akros_*, etc_*, gmail_*, ryuha_*, re_*, invest_*, wiki_*) > 범용 CRUD > analyze_data(SQL)

## 윌로우인베스트먼트 구조
- ETF 사업: 아크로스(인덱스), ETC(ETF 플랫폼/운용사)
- AI 사업: 텐소프트웍스 (50% 지분)
- 경영관리: 윌로우/텐소프트웍스 각각 별도 관리

## 주요 테이블 스키마

### 윌로우 경영관리 (willow_mgmt_*)
- **willow_mgmt_clients**: id, name, color, icon, order_index
- **willow_mgmt_projects**: id, client_id(FK), name, description, status(active|completed|on_hold), order_index
- **willow_mgmt_milestones**: id, project_id(FK), name, description, status(pending|in_progress|completed), target_date, order_index, review_completed
- **willow_mgmt_schedules**: id, title, schedule_date, type(task|meeting|deadline), client_id, milestone_id, start_time, end_time, description, color, is_completed, task_content, task_completed, task_deadline
- **willow_mgmt_tasks**: id, schedule_id(FK), content, deadline, order_index, is_completed
- **willow_mgmt_daily_memos**: id, memo_date(unique), content
- **willow_mgmt_cash**: id, type(revenue|expense|asset|liability), counterparty, description, amount(numeric), issue_date, payment_date, status(issued|completed), attachments(jsonb), notes, account_number

### 텐소프트웍스 경영관리 (tensw_mgmt_*)
willow_mgmt_*와 동일 구조. 테이블명만 tensw_mgmt_. 메모는 tensw_mgmt_daily_memos. 추가 테이블:
- **tensw_mgmt_cash**: 텐소프트웍스 현금관리 (윌로우 현금관리와 동일 구조)
- **tensw_mgmt_sales**: id, invoice_date, company, description, supply_amount, tax_amount, total_amount, status(scheduled|pending|paid), items(jsonb), attachments(jsonb), notes
- **tensw_mgmt_loans**: id, lender, loan_type, principal, interest_rate, start_date, end_date, repayment_type(bullet|amortization), interest_payment_day, status(active|pending|closed), attachments(jsonb), notes

### ETF
- **etf_products**: id, symbol, fund_name, fund_url, listing_date, bank, platform_fee_percent, platform_min_fee, pm_fee_percent, pm_min_fee, currency, notes, is_active
- **akros_tax_invoices**: id, invoice_date, amount, notes, issued_at, paid_at
- **willow_invoices**: id (ETC 인보이스 - invoice_date, bill_to_company, attention, line_items, notes, status)

### 업무위키
- **work_wiki**: id, title, content, section(akros|etf-etc|willow-mgmt|tensw-mgmt), category, is_pinned, attachments

### 류하 학습관리 (ryuha_*)
- **ryuha_subjects**: id, name, color, icon, order_index
- **ryuha_textbooks**: id, subject_id(FK), title, publisher, is_active
- **ryuha_chapters**: id, textbook_id(FK), name, order_index, is_completed
- **ryuha_schedules**: id, subject_id, title, schedule_date, start_time, end_time, color, homework_content, homework_deadline, homework_completed, is_completed
- **ryuha_homework_items**: id, schedule_id(FK), content, deadline, order_index, is_completed
- **ryuha_daily_memos**: id, memo_date(unique), content
- **ryuha_body_records**: id, record_date, height, weight, notes
- **ryuha_notes**: id, title, content, category, is_pinned

### 재무제표
- **financial_summaries**: id, company(willow|tensw), fiscal_year, revenue~cash_and_equivalents (UNIQUE: company,fiscal_year)
- **financial_line_items**: id, company, fiscal_year, statement_type(bs|is|cf), section, account_name, amount, parent_account_name, sort_order

### 온톨로지
- **knowledge_entities**: id, name(unique), entity_type, description, properties(jsonb), tags(text[])
- **knowledge_relations**: id, subject_id(FK), predicate, object_id(FK), properties(jsonb)
- **knowledge_insights**: id, content, insight_type(decision|observation|preference|pattern), entity_ids(uuid[]), context

### 투자리서치
- **stock_research**: id, ticker, company_name, market(KR|US), scan_date, verdict(pass|fail), market_cap_b, current_price, high_12m, gap_from_high_pct, sector, thesis, risks, catalyst, notes, track(AI Infra|ETF|Geopolitics|hypergrowth|Next Gen|profitable)
- **stock_trades**: id, ticker, company_name, market(KR|US), trade_date, trade_type(buy|sell), quantity, price, total_amount, currency(KRW|USD), broker, memo
- **stock_watchlist**: name, ticker, sector, group_name(portfolio|watchlist|benchmark), axis, pinned, monitor_date, monitor_price — portfolio그룹=보유종목, watchlist그룹=관심종목
- **smallcap_screening**: id, scan_date, ticker, company_name, market, sector, market_cap_m, current_price, change_pct, composite_score, tier(A|B|C|F), track(profitable|hypergrowth), rs_rank, insider_buys_3m, reddit_mentions, notes

### 부동산
- **re_complexes**: id, name, district_code, district_name, dong_name, total_units, build_year, jibun, is_tracked
- **re_trades** (실거래가): id, district_code, dong_name, complex_name, deal_date, deal_year/deal_month/deal_day, area_sqm, area_pyeong, floor, deal_amount(만원), price_per_pyeong(만원), build_year, buyer_type, cancel_yn
- **re_rentals** (전세/월세): id, district_code, dong_name, complex_name, deal_date, area_sqm, area_pyeong, floor, rent_type(전세|월세), deposit(만원), monthly_rent(만원), build_year, contract_type(신규|갱신), previous_deposit, previous_monthly_rent
- **re_naver_listings** (네이버 매물/매도호가): id, snapshot_date, complex_no, complex_name, district_name, article_no, trade_type(매매|전세|월세), price(만원), monthly_rent, area_type, area_supply_sqm, area_exclusive_sqm, floor_info, direction, description, tags, realtor_name
  - 평형 비교: area_exclusive_sqm으로 그룹핑 (예: 59㎡≈18평, 84㎡≈25평, 114㎡≈34평)
  - 실거래가 vs 매도호가: re_trades.deal_amount vs re_naver_listings.price 비교

### 이메일
- **email_analysis**: 이메일 AI 분석 결과
- **email_todos**: id, label, content, completed, priority, related_email_ids
- **gmail_scheduled_emails**: id, context, to_email, subject, body, scheduled_at, status(pending|sent|failed|cancelled), invoice_id

## 파일 처리 가이드라인
- 은행 거래내역 엑셀: 각 행 → willow_mgmt_cash (입금=revenue, 출금=expense). 회사 구분 모호하면 질문
- 세금계산서: counterparty, amount, issue_date 추출 → 해당 인보이스 테이블
- 재무제표: → financial_summaries에 upsert (on_conflict: company,fiscal_year)
- 기타 파일: 내용 분석 후 적절한 테이블에 반영

## 응답 규칙
1. 항상 한국어로 응답
2. **조회/분석 질문 → 무조건 도구 호출 먼저. 호출 없이 답변 절대 금지**
3. 데이터 변경(생성/수정/삭제) 전에 요약하고 확인 요청. 단, CEO가 "바로 해" 등 명확히 지시하면 즉시 실행
4. 여러 건 삽입 시 몇 건 처리했는지 보고
5. 도구 실행 결과를 그대로 보여주지 말고, 자연스럽게 요약
6. list_tables 호출 불필요 — 위 스키마 참조
7. 조회 결과가 많으면 핵심만 요약하고, 상세가 필요하면 물어보기
8. 도구가 에러를 반환하면 에러 내용을 솔직히 전달. 절대 지어내지 말 것

## 메모리 시스템
대화 간 지속되는 메모리를 활용합니다. 이전 대화에서 저장한 메모리가 아래에 포함됩니다.
- CEO가 알려준 선호/피드백 → save_memory(type:'feedback')
- 진행중인 프로젝트/업무 상황 → save_memory(type:'project')
- CEO에 대해 알게 된 정보 → save_memory(type:'user')
- 외부 참조 링크/리소스 → save_memory(type:'reference')
- 오래된 메모리는 delete_memory로 삭제
${memories}`
}

// OCR image via Gemini Flash (Google AI free tier)
async function ocrImage(arrayBuffer: ArrayBuffer, mimeType: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not set for vision')
  const base64 = Buffer.from(arrayBuffer).toString('base64')
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${VISION_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: '이 이미지의 모든 텍스트, 숫자, 표를 정확히 추출해주세요. 증권 거래내역이면 종목코드, 회사명, 거래일, 매수/매도, 수량, 단가, 금액을 구조화해서 출력하세요.' },
            { inlineData: { mimeType, data: base64 } },
          ],
        }],
      }),
    }
  )
  if (!res.ok) throw new Error(`Vision API ${res.status}: ${await res.text()}`)
  const json = await res.json()
  return json.candidates?.[0]?.content?.parts?.[0]?.text || '(이미지에서 텍스트를 추출할 수 없습니다)'
}

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']

// Parse uploaded file content
async function parseFileContent(file: File): Promise<{ type: string; content: string; summary: string }> {
  const arrayBuffer = await file.arrayBuffer()

  // Image → OCR via Gemini Vision
  if (IMAGE_EXTS.some(ext => file.name.toLowerCase().endsWith(ext))) {
    const mimeType = file.type || 'image/png'
    const text = await ocrImage(arrayBuffer, mimeType)
    return {
      type: 'image',
      content: text,
      summary: `이미지 "${file.name}" (OCR 추출)`,
    }
  }

  if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
    const workbook = XLSX.read(arrayBuffer, { type: 'array' })
    const sheets: Record<string, string> = {}

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][]
      // Limit to 200 rows for token efficiency
      const rows = json.slice(0, 200)
      sheets[sheetName] = rows.map(row => (row as unknown[]).join('\t')).join('\n')
    }

    const content = Object.entries(sheets)
      .map(([name, data]) => `=== 시트: ${name} ===\n${data}`)
      .join('\n\n')

    return {
      type: 'spreadsheet',
      content,
      summary: `엑셀 파일 "${file.name}" (${workbook.SheetNames.length}개 시트, ${workbook.SheetNames.join(', ')})`,
    }
  }

  if (file.name.endsWith('.pdf')) {
    // Dynamic import for pdf-parse (Node.js only)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse')
    const buffer = Buffer.from(arrayBuffer)
    const pdfData = await pdfParse(buffer)
    const text = pdfData.text.slice(0, 10000) // Limit text

    return {
      type: 'pdf',
      content: text,
      summary: `PDF 파일 "${file.name}" (${pdfData.numpages}페이지)`,
    }
  }

  // Plain text fallback
  const text = new TextDecoder().decode(arrayBuffer)
  return {
    type: 'text',
    content: text.slice(0, 10000),
    summary: `텍스트 파일 "${file.name}"`,
  }
}

// Tool name → short Korean label for progress display
function toolLabel(name: string): string {
  if (name.startsWith('willow_')) return '윌로우 ' + name.replace('willow_', '').replace(/_/g, ' ')
  if (name.startsWith('tensw_todo_')) return '텐SW프로젝트 ' + name.replace('tensw_todo_', '').replace(/_/g, ' ')
  if (name.startsWith('tensw_')) return '텐SW ' + name.replace('tensw_', '').replace(/_/g, ' ')
  if (name.startsWith('akros_')) return '아크로스 ' + name.replace('akros_', '').replace(/_/g, ' ')
  if (name.startsWith('etc_')) return 'ETC ' + name.replace('etc_', '').replace(/_/g, ' ')
  if (name.startsWith('gmail_')) return '이메일 ' + name.replace('gmail_', '').replace(/_/g, ' ')
  if (name.startsWith('ryuha_')) return '류하 ' + name.replace('ryuha_', '').replace(/_/g, ' ')
  if (name.startsWith('invest_')) return '투자 ' + name.replace('invest_', '').replace(/_/g, ' ')
  if (name.startsWith('re_')) return '부동산 ' + name.replace('re_', '').replace(/_/g, ' ')
  if (name.startsWith('wiki_')) return '위키 ' + name.replace('wiki_', '').replace(/_/g, ' ')
  const map: Record<string, string> = {
    query_data: '데이터 조회', insert_data: '데이터 추가', update_data: '데이터 수정',
    delete_data: '데이터 삭제', upsert_data: '데이터 저장', count_data: '건수 조회',
    analyze_data: 'SQL 분석', list_tables: '테이블 목록', save_memory: '메모리 저장',
    delete_memory: '메모리 삭제',
  }
  return map[name] || name
}

// Tool routing: filter tools by current page to reduce noise
const GENERIC_TOOLS = ['query_data', 'insert_data', 'update_data', 'delete_data', 'upsert_data', 'count_data', 'analyze_data', 'list_tables', 'save_memory', 'delete_memory']

const PAGE_TOOL_PREFIXES: Record<string, string[]> = {
  '/mgmt':   ['willow_', 'gmail_', 'wiki_'],
  '/invest': ['invest_', 're_', 'wiki_'],
  '/wiki':   ['wiki_'],
  '/tensw':  ['tensw_', 'gmail_', 'wiki_'],
  '/akros':  ['akros_', 'gmail_', 'wiki_'],
  '/etc':    ['etc_', 'gmail_', 'wiki_'],
  '/ryuha':  ['ryuha_'],
}

function getToolsForPage(page: string) {
  const prefixes = PAGE_TOOL_PREFIXES[page]
  if (!prefixes) return agentTools // unknown page → all tools

  return agentTools.filter(t =>
    GENERIC_TOOLS.includes(t.name) || prefixes.some(p => t.name.startsWith(p))
  )
}

// POST: Send message to chat agent (streaming NDJSON)
export async function POST(request: NextRequest) {
  const encoder = new TextEncoder()

  // Helper to write an NDJSON line
  function line(obj: Record<string, unknown>): Uint8Array {
    return encoder.encode(JSON.stringify(obj) + '\n')
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const formData = await request.formData()
        const message = formData.get('message') as string
        const sessionId = formData.get('sessionId') as string | null
        const currentPage = formData.get('currentPage') as string || '/'
        const pageContext = formData.get('pageContext') as string || ''
        const files = formData.getAll('files') as File[]

        if (!message && files.length === 0) {
          controller.enqueue(line({ type: 'error', error: 'Message or files required' }))
          controller.close(); return
        }

        const supabase = getServiceSupabase()

        // Create or get session
        let currentSessionId = sessionId
        if (!currentSessionId) {
          const { data: session } = await supabase
            .from('agent_chat_sessions')
            .insert({ user_id: 'ceo', title: (message || '파일 분석').slice(0, 50) })
            .select().single()
          currentSessionId = session?.id
        }

        controller.enqueue(line({ type: 'progress', step: '⏳ 처리 시작', sessionId: currentSessionId }))

        // Parse files
        const fileContents: Array<{ type: string; content: string; summary: string }> = []
        for (const file of files) {
          controller.enqueue(line({ type: 'progress', step: `📂 파일 파싱: ${file.name}` }))
          try {
            const parsed = await parseFileContent(file)
            fileContents.push(parsed)
            controller.enqueue(line({ type: 'progress', step: `✅ ${parsed.summary}` }))
          } catch (e) {
            fileContents.push({
              type: 'error',
              content: `파일 파싱 실패: ${e instanceof Error ? e.message : 'Unknown error'}`,
              summary: `파일 "${file.name}" 처리 실패`,
            })
          }
        }

        // Build user message
        let userMessage = `[현재 페이지: ${pageContext || currentPage}]\n${message || ''}`
        if (fileContents.length > 0) {
          const fileSection = fileContents.map(f =>
            `[첨부 파일 - ${f.summary}]\n${f.content}`
          ).join('\n\n---\n\n')
          userMessage = `${userMessage}\n\n${fileSection}`
        }

        // Save user message to DB
        if (currentSessionId) {
          await supabase.from('agent_chat_messages').insert({
            session_id: currentSessionId,
            role: 'user',
            content: message || '(파일 첨부)',
            attachments: files.map(f => ({ name: f.name, size: f.size, type: f.type })),
          })
        }

        // Load conversation history
        let history: Array<{ role: string; parts: Array<{ text: string }> }> = []
        if (currentSessionId) {
          const { data: dbMessages } = await supabase
            .from('agent_chat_messages')
            .select('role, content')
            .eq('session_id', currentSessionId)
            .order('created_at', { ascending: true })
            .limit(30)
          if (dbMessages && dbMessages.length > 0) {
            const prior = dbMessages.slice(0, -1)
            history = prior
              .filter(m => m.role === 'user' || m.role === 'assistant')
              .map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }],
              }))
          }
        }

        // Initialize with page-scoped tools
        const routedTools = getToolsForPage(currentPage)
        console.log(`[ChatAgent] Page: ${currentPage} → ${routedTools.length}/${agentTools.length} tools`)
        controller.enqueue(line({ type: 'progress', step: `🤖 분석 중... (도구 ${routedTools.length}개)` }))

        const systemPrompt = await buildSystemPrompt()
        const oaiTools: OAITool[] = routedTools.map(t => ({
          type: 'function' as const,
          function: {
            name: t.name,
            description: t.description,
            parameters: {
              type: 'object',
              properties: t.parameters.properties,
              required: t.parameters.required || [],
            },
          },
        }))

        // Build messages array (OpenAI format)
        const messages: OAIMessage[] = [
          { role: 'system', content: systemPrompt },
          ...history.map(h => ({
            role: (h.role === 'model' ? 'assistant' : 'user') as 'assistant' | 'user',
            content: h.parts[0].text,
          })),
          { role: 'user', content: userMessage },
        ]

        let assistantMsg = await chatCompletion(messages, oaiTools)
        messages.push(assistantMsg)
        const toolCallsLog: Array<{ name: string; args: unknown; result: unknown }> = []

        // Tool calling loop (max 5 iterations)
        for (let i = 0; i < 5; i++) {
          const toolCalls = assistantMsg.tool_calls
          if (!toolCalls || toolCalls.length === 0) break

          for (const tc of toolCalls) {
            const fnName = tc.function.name
            const fnArgs = JSON.parse(tc.function.arguments || '{}')
            console.log(`[ChatAgent] Executing tool: ${fnName}`, fnArgs)
            controller.enqueue(line({ type: 'progress', step: `🔧 ${toolLabel(fnName)}` }))

            const result = await executeTool(fnName, fnArgs)
            toolCallsLog.push({ name: fnName, args: fnArgs, result })

            const r = result as Record<string, unknown>
            const count = Array.isArray(r?.data) ? ` (${(r.data as unknown[]).length}건)` : r?.error ? ' (실패)' : ''
            controller.enqueue(line({ type: 'progress', step: `✅ ${toolLabel(fnName)}${count}` }))

            messages.push({
              role: 'tool',
              content: JSON.stringify(result),
              tool_call_id: tc.id,
            })
          }

          controller.enqueue(line({ type: 'progress', step: '🤖 분석 중...' }))
          assistantMsg = await chatCompletion(messages, oaiTools)
          messages.push(assistantMsg)
        }

        // Extract final text
        let finalText = assistantMsg.content || ''
        if (!finalText?.trim() && toolCallsLog.length > 0) {
          const lastResult = toolCallsLog[toolCallsLog.length - 1].result
          if (lastResult && typeof lastResult === 'object') {
            const r = lastResult as Record<string, unknown>
            if (Array.isArray(r.data)) finalText = `조회 결과 ${r.data.length}건이 있습니다.`
            else if (r.error) finalText = `오류가 발생했습니다: ${r.error}`
            else finalText = '요청을 처리했습니다.'
          }
        }

        // Save assistant message to DB
        if (currentSessionId) {
          const isFirstExchange = !sessionId
          const sessionUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() }
          if (isFirstExchange && finalText) {
            const firstLine = finalText.split('\n')[0].replace(/[#*_`]/g, '').trim()
            if (firstLine.length > 5) {
              sessionUpdate.title = firstLine.slice(0, 40) + (firstLine.length > 40 ? '…' : '')
            }
          }
          await Promise.all([
            supabase.from('agent_chat_messages').insert({
              session_id: currentSessionId,
              role: 'assistant',
              content: finalText,
              tool_calls: toolCallsLog.length > 0 ? toolCallsLog : null,
            }),
            supabase.from('agent_chat_sessions')
              .update(sessionUpdate)
              .eq('id', currentSessionId),
          ])
        }

        controller.enqueue(line({
          type: 'done',
          message: finalText,
          sessionId: currentSessionId,
          toolCalls: toolCallsLog,
          model: OPENROUTER_MODEL,
        }))
      } catch (error) {
        console.error('[ChatAgent] Error:', error)
        controller.enqueue(line({
          type: 'error',
          error: error instanceof Error ? error.message : 'Internal server error',
        }))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'Transfer-Encoding': 'chunked',
    },
  })
}

// GET: List sessions or messages
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get('sessionId')

  const supabase = getServiceSupabase()

  if (sessionId) {
    // Get messages for a session
    const { data, error } = await supabase
      .from('agent_chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ messages: data || [] })
  }

  // List sessions
  const { data, error } = await supabase
    .from('agent_chat_sessions')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sessions: data || [] })
}
