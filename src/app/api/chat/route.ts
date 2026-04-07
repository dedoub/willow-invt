import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI, FunctionCallingMode, SchemaType } from '@google/generative-ai'
import { getServiceSupabase } from '@/lib/supabase'
import { agentTools, executeTool } from '@/lib/chat-agent/tools'
import * as XLSX from 'xlsx'

// Gemini client
function getGemini() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')
  return new GoogleGenerativeAI(apiKey)
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
7. **온톨로지**: 지식 엔티티/관계/인사이트 관리
8. **류하 학습관리**: 류하 일정, 숙제, 교재, 수첩 관리

## 도구 사용법

### 부동산 전용 도구 (우선 사용!)
부동산 관련 질문은 반드시 아래 전용 도구를 사용하세요. SQL 직접 작성보다 정확하고 빠릅니다:
- **re_list_complexes**: 추적 단지 목록 (구 필터 가능)
- **re_get_summary**: 시장 요약 (평균 매매/전세 평당가)
- **re_get_trade_trends**: 매매 실거래가 추이 (월별 평당가, 단지별/전체)
- **re_get_rental_trends**: 전세 실거래가 추이 (월별 평당가, 단지별/전체)
- **re_get_listing_gap**: 매도호가 vs 실거래가 괴리율 현재 스냅샷 (단지별/평형대별)
- **re_get_listing_gap_trend**: 매매/전세 괴리율 일별 추이 (trade_type으로 매매/전세 선택)
- **re_get_jeonse_ratio**: 전세가율 추이 (월별)

### 범용 CRUD 도구
- query_data: 데이터 조회 (필터, 정렬, 조인 지원)
- insert_data: 새 레코드 생성
- update_data: 레코드 수정
- delete_data: 레코드 삭제
- upsert_data: upsert (없으면 생성, 있으면 수정)
- count_data: 레코드 수 세기
- analyze_data: SQL 분석 쿼리 (부동산 외 집계/비교용. 순수 SQL만 전달, 백틱/마크다운 금지)
- list_tables: 사용 가능한 테이블 목록

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
- **stock_research**: id, ticker, company_name, market(KR|US), scan_date, verdict(pass|fail), market_cap_b, current_price, high_12m, gap_from_high_pct, sector, thesis, risks, catalyst, notes
- **stock_trades**: id, ticker, company_name, market(KR|US), trade_date, trade_type(buy|sell), quantity, price, total_amount, currency(KRW|USD), broker, memo
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
2. 데이터 변경(생성/수정/삭제) 전에 요약하고 확인 요청. 단, CEO가 "바로 해" 등 명확히 지시하면 즉시 실행
3. 여러 건 삽입 시 몇 건 처리했는지 보고
4. 도구 실행 결과를 그대로 보여주지 말고, 자연스럽게 요약
5. list_tables 호출 불필요 — 위 스키마 참조
6. 조회 결과가 많으면 핵심만 요약하고, 상세가 필요하면 물어보기

## 메모리 시스템
대화 간 지속되는 메모리를 활용합니다. 이전 대화에서 저장한 메모리가 아래에 포함됩니다.
- CEO가 알려준 선호/피드백 → save_memory(type:'feedback')
- 진행중인 프로젝트/업무 상황 → save_memory(type:'project')
- CEO에 대해 알게 된 정보 → save_memory(type:'user')
- 외부 참조 링크/리소스 → save_memory(type:'reference')
- 오래된 메모리는 delete_memory로 삭제
${memories}`
}

// Parse uploaded file content
async function parseFileContent(file: File): Promise<{ type: string; content: string; summary: string }> {
  const arrayBuffer = await file.arrayBuffer()

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

// POST: Send message to chat agent
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const message = formData.get('message') as string
    const sessionId = formData.get('sessionId') as string | null
    const currentPage = formData.get('currentPage') as string || '/'
    const pageContext = formData.get('pageContext') as string || ''
    const files = formData.getAll('files') as File[]

    if (!message && files.length === 0) {
      return NextResponse.json({ error: 'Message or files required' }, { status: 400 })
    }

    const supabase = getServiceSupabase()

    // Create or get session
    let currentSessionId = sessionId
    if (!currentSessionId) {
      const { data: session } = await supabase
        .from('agent_chat_sessions')
        .insert({ user_id: 'ceo', title: (message || '파일 분석').slice(0, 50) })
        .select()
        .single()
      currentSessionId = session?.id
    }

    // Parse files
    const fileContents: Array<{ type: string; content: string; summary: string }> = []
    for (const file of files) {
      try {
        const parsed = await parseFileContent(file)
        fileContents.push(parsed)
      } catch (e) {
        fileContents.push({
          type: 'error',
          content: `파일 파싱 실패: ${e instanceof Error ? e.message : 'Unknown error'}`,
          summary: `파일 "${file.name}" 처리 실패`,
        })
      }
    }

    // Build user message with page context and file context
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

    // Load conversation history from DB
    let history: Array<{ role: string; parts: Array<{ text: string }> }> = []
    if (currentSessionId) {
      const { data: dbMessages } = await supabase
        .from('agent_chat_messages')
        .select('role, content')
        .eq('session_id', currentSessionId)
        .order('created_at', { ascending: true })
        .limit(30)

      if (dbMessages && dbMessages.length > 0) {
        // Exclude the user message we just saved (last one) — it will be sent as the current message
        const prior = dbMessages.slice(0, -1)
        history = prior
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          }))
      }
    }

    // Initialize Gemini with function calling
    const genAI = getGemini()
    const systemPrompt = await buildSystemPrompt()
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: systemPrompt,
      tools: [{
        functionDeclarations: agentTools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: {
            type: SchemaType.OBJECT,
            properties: Object.fromEntries(
              Object.entries(t.parameters.properties).map(([k, v]) => [k, {
                ...v,
                type: v.type === 'string' ? SchemaType.STRING
                  : v.type === 'number' ? SchemaType.NUMBER
                  : SchemaType.STRING,
              }])
            ),
            required: t.parameters.required || [],
          },
        })),
      }],
      toolConfig: {
        functionCallingConfig: { mode: FunctionCallingMode.AUTO },
      },
    })

    const chat = model.startChat({ history })

    // Send message and handle tool calling loop
    let response = await chat.sendMessage(userMessage)
    const toolCallsLog: Array<{ name: string; args: unknown; result: unknown }> = []

    // Tool calling loop (max 5 iterations)
    for (let i = 0; i < 5; i++) {
      const candidate = response.response.candidates?.[0]
      const parts = candidate?.content?.parts || []

      const functionCalls = parts.filter(p => 'functionCall' in p)
      if (functionCalls.length === 0) break

      // Execute all function calls
      const functionResponses = []
      for (const part of functionCalls) {
        const fc = (part as { functionCall: { name: string; args: Record<string, unknown> } }).functionCall
        console.log(`[ChatAgent] Executing tool: ${fc.name}`, fc.args)

        const result = await executeTool(fc.name, fc.args)
        toolCallsLog.push({ name: fc.name, args: fc.args, result })

        functionResponses.push({
          functionResponse: {
            name: fc.name,
            response: result as object,
          },
        })
      }

      // Send results back to Gemini
      response = await chat.sendMessage(functionResponses)
    }

    // Extract final text response
    const finalText = response.response.text()

    // Save assistant message to DB and update session
    if (currentSessionId) {
      // Auto-generate better title from first exchange (replace the truncated user message)
      const isFirstExchange = !sessionId // New session created in this request
      const sessionUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (isFirstExchange && finalText) {
        // Use first line of assistant response (up to 40 chars) as title
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

    return NextResponse.json({
      message: finalText,
      sessionId: currentSessionId,
      toolCalls: toolCallsLog,
    })
  } catch (error) {
    console.error('[ChatAgent] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
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
