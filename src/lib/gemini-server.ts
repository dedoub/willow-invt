// Gemini AI 서버사이드 유틸리티
// 이 파일은 API 라우트에서만 사용됩니다

import { GoogleGenerativeAI } from '@google/generative-ai'

// Gemini 클라이언트 초기화
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set')
  }
  return new GoogleGenerativeAI(apiKey)
}

// 이메일 분석용 타입
export interface EmailForAnalysis {
  id: string
  from: string
  fromName?: string
  to: string
  subject: string
  body: string
  date: string
  category?: string | null
  direction: 'inbound' | 'outbound'
}

export interface EmailAnalysisResult {
  category: string
  summary: string
  recentTopics: string[]  // 최근 주요 주제
  issues: Array<{
    title: string
    description: string
    priority: 'high' | 'medium' | 'low'
    relatedEmailIds: string[]
  }>
  todos: Array<{
    task: string
    dueDate?: string
    priority: 'high' | 'medium' | 'low'
    relatedEmailIds: string[]
  }>
  emailCount: number
}

export interface OverallAnalysisResult {
  generatedAt: string
  categories: EmailAnalysisResult[]
  overallSummary: string
}

// 이메일 분석 수행
export async function analyzeEmails(
  emails: EmailForAnalysis[],
  parentLabel: string,
  customContext?: string
): Promise<OverallAnalysisResult> {
  const genAI = getGeminiClient()
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      maxOutputTokens: 8192,  // 요약 분석은 더 긴 출력 필요
      temperature: 0.1,       // 일관된 JSON 출력
    }
  })

  // 카테고리별로 이메일 그룹화
  const emailsByCategory = new Map<string, EmailForAnalysis[]>()

  for (const email of emails) {
    const category = email.category || 'Uncategorized'
    if (!emailsByCategory.has(category)) {
      emailsByCategory.set(category, [])
    }
    emailsByCategory.get(category)!.push(email)
  }

  const categoryResults: EmailAnalysisResult[] = []

  // 각 카테고리별로 분석
  for (const [category, categoryEmails] of emailsByCategory) {
    // 최근 30개 이메일만 분석 (토큰 제한)
    const recentEmails = categoryEmails.slice(0, 30)

    const emailsContext = recentEmails.map((email, idx) => {
      return `
[이메일 ${idx + 1}] ID: ${email.id}
- 발신자: ${email.fromName} <${email.from}>
- 수신자: ${email.to}
- 제목: ${email.subject}
- 날짜: ${email.date}
- 방향: ${email.direction === 'inbound' ? '수신' : '발신'}
- 내용 요약:
${email.body.substring(0, 500)}${email.body.length > 500 ? '...' : ''}
`
    }).join('\n---\n')

    // 커스텀 컨텍스트 추가
    const contextSection = customContext
      ? `
사용자 제공 배경 정보:
${customContext}

이 배경 정보를 참고하여 더 정확한 분석을 수행해주세요.
`
      : ''

    const prompt = `
당신은 금융/투자 업계의 비즈니스 이메일 분석 전문가입니다.
"${category}" 거래처와의 이메일 커뮤니케이션을 분석하여 실행 가능한 인사이트를 제공해주세요.
${contextSection}
분석할 이메일들:
${emailsContext}

다음 JSON 형식으로만 응답해주세요 (다른 텍스트 없이):
{
  "summary": "이 거래처와의 최근 커뮤니케이션 현황 요약 (3-4문장, 구체적으로)",
  "recentTopics": ["최근 논의된 주요 주제 3-5개"],
  "issues": [
    {
      "title": "이슈/주목할 사항",
      "description": "상세 설명",
      "priority": "high|medium|low",
      "relatedEmailIds": []
    }
  ],
  "todos": [
    {
      "task": "후속 조치 또는 해야 할 일",
      "dueDate": null,
      "priority": "high|medium|low",
      "relatedEmailIds": []
    }
  ]
}

분석 지침:
1. summary: 최근 어떤 대화가 오갔는지 구체적으로 요약 (예: "수수료 정산 관련 문의", "신규 ETF 상장 논의")
2. recentTopics: 이메일에서 다뤄진 주요 주제들 (예: "수수료", "계약서", "미팅 일정")
3. issues: 주목할 만한 사항을 적극적으로 찾아주세요:
   - 답변이 필요한 질문
   - 확인이 필요한 요청사항
   - 일정 관련 사항
   - 대기 중인 결정사항
   - 중요한 알림이나 공지
4. todos: 후속 조치가 필요한 항목:
   - 회신해야 할 이메일
   - 확인/검토해야 할 문서
   - 예정된 미팅 준비
   - 요청받은 자료 전달

중요: 이슈나 할 일이 없어 보여도, 이메일 내용을 바탕으로 잠재적인 후속 조치나 주목할 점을 찾아주세요.
모든 텍스트는 한국어로 작성하세요.
`

    try {
      console.log(`[Gemini] Analyzing category: ${category} with ${recentEmails.length} emails`)
      const result = await model.generateContent(prompt)
      const responseText = result.response.text()
      console.log(`[Gemini] Response for ${category}:`, responseText.substring(0, 200))

      // JSON 파싱 (마크다운 코드블록 제거)
      let jsonStr = responseText
      if (jsonStr.includes('```json')) {
        jsonStr = jsonStr.split('```json')[1].split('```')[0]
      } else if (jsonStr.includes('```')) {
        jsonStr = jsonStr.split('```')[1].split('```')[0]
      }

      // 잘린 JSON 복구 시도
      jsonStr = jsonStr.trim()
      let parsed
      try {
        parsed = JSON.parse(jsonStr)
      } catch {
        console.warn(`[Gemini] Attempting to repair truncated JSON for ${category}`)
        const repaired = repairTruncatedJson(jsonStr)
        parsed = JSON.parse(repaired)
      }
      console.log(`[Gemini] Parsed successfully for ${category}`)

      categoryResults.push({
        category,
        summary: parsed.summary || '',
        recentTopics: parsed.recentTopics || [],
        issues: parsed.issues || [],
        todos: parsed.todos || [],
        emailCount: categoryEmails.length,
      })
    } catch (error) {
      console.error(`[Gemini] Error analyzing category ${category}:`, error)
      if (error instanceof Error) {
        console.error(`[Gemini] Error message:`, error.message)
        console.error(`[Gemini] Error stack:`, error.stack)
      }
      // 분석 실패 시 기본 결과 반환
      categoryResults.push({
        category,
        summary: `${categoryEmails.length}개의 이메일이 있습니다. (분석 실패)`,
        recentTopics: [],
        issues: [],
        todos: [],
        emailCount: categoryEmails.length,
      })
    }
  }

  // 전체 요약 생성
  let overallSummary = ''
  if (categoryResults.length > 0) {
    const summaryPrompt = `
다음은 "${parentLabel}" 라벨의 이메일 분석 결과입니다:

${categoryResults.map(r => `
카테고리: ${r.category} (${r.emailCount}개 이메일)
요약: ${r.summary}
주요 이슈: ${r.issues.length}건
할 일: ${r.todos.length}건
`).join('\n')}

위 내용을 바탕으로 전체적인 현황을 2-3문장으로 요약해주세요. 한국어로 작성하세요.
`
    try {
      const summaryResult = await model.generateContent(summaryPrompt)
      overallSummary = summaryResult.response.text()
    } catch {
      overallSummary = `총 ${emails.length}개의 이메일이 ${categoryResults.length}개 카테고리에서 분석되었습니다.`
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    categories: categoryResults,
    overallSummary,
  }
}

/**
 * 잘린 JSON 문자열 복구 시도
 */
function repairTruncatedJson(json: string): string {
  let repaired = json.trim()

  // 열린 문자열 닫기
  const openQuotes = (repaired.match(/"/g) || []).length
  if (openQuotes % 2 !== 0) {
    const lastQuoteIdx = repaired.lastIndexOf('"')
    const afterQuote = repaired.substring(lastQuoteIdx + 1)
    if (!afterQuote.includes(':') && !afterQuote.includes(',') && !afterQuote.includes('}') && !afterQuote.includes(']')) {
      repaired = repaired + '"'
    }
  }

  // 열린 배열/객체 카운트
  let openBraces = 0
  let openBrackets = 0
  let inString = false

  for (let i = 0; i < repaired.length; i++) {
    const char = repaired[i]
    const prevChar = i > 0 ? repaired[i - 1] : ''

    if (char === '"' && prevChar !== '\\') {
      inString = !inString
    } else if (!inString) {
      if (char === '{') openBraces++
      else if (char === '}') openBraces--
      else if (char === '[') openBrackets++
      else if (char === ']') openBrackets--
    }
  }

  // 마지막 불완전한 값 제거
  repaired = repaired.replace(/,\s*$/, '')

  // 열린 배열 닫기
  while (openBrackets > 0) {
    repaired += ']'
    openBrackets--
  }

  // 열린 객체 닫기
  while (openBraces > 0) {
    repaired += '}'
    openBraces--
  }

  return repaired
}
