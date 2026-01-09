// Gemini AI 기반 이메일 분석기
// 키워드, 엔티티, 토픽, 요약 등 추출

import { GoogleGenerativeAI } from '@google/generative-ai'
import type {
  EmailForAnalysis,
  SingleEmailAnalysis,
  ExtractedEntities,
  ActionItem,
  EmailIntent,
  Sentiment,
  Priority,
} from './types'
import {
  classifyEmailCategory,
  inferCounterpartyType,
  inferProductType,
  calculateUrgencyScore,
  requiresReply,
} from './classifier'

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set')
  }
  return new GoogleGenerativeAI(apiKey)
}

/**
 * 단일 이메일 분석 (AI 기반)
 */
export async function analyzeEmail(
  email: EmailForAnalysis
): Promise<SingleEmailAnalysis> {
  const genAI = getGeminiClient()
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      maxOutputTokens: 4096,  // 충분한 토큰 확보
      temperature: 0.1,       // 일관된 JSON 출력을 위해 낮은 온도
    }
  })

  // 키워드 기반 사전 분류
  const { category, confidence: categoryConfidence } = classifyEmailCategory(
    email.subject,
    email.body
  )

  const counterpartyType = inferCounterpartyType(
    email.from,
    email.fromName || '',
    email.body
  )

  const productType = inferProductType(email.subject, email.body)
  const urgencyScore = calculateUrgencyScore(email.subject, email.body)
  const needsReply = requiresReply(email.subject, email.body, email.direction)

  // AI 분석 프롬프트
  const prompt = `
You are an expert at analyzing business emails in the US-listed ETF industry.
Analyze the following email and extract structured information.

Email:
- From: ${email.fromName || ''} <${email.from}>
- To: ${email.to}
- Subject: ${email.subject}
- Date: ${email.date}
- Direction: ${email.direction}
- Body:
${email.body.substring(0, 2000)}

Respond ONLY with valid JSON (no markdown, no explanation):
{
  "keywords": ["5-10 key terms from the email"],
  "entities": {
    "people": ["names of people mentioned"],
    "companies": ["company names mentioned"],
    "products": ["ETF names, tickers, or product names"],
    "tickers": ["stock/ETF ticker symbols like SPY, QQQ"],
    "amounts": ["monetary amounts mentioned"],
    "dates": ["dates or deadlines mentioned"]
  },
  "topics": ["1-3 main topics discussed"],
  "intent": "request|inform|confirm|inquiry|follow_up|response|alert|unknown",
  "sentiment": "positive|neutral|negative",
  "sentimentScore": 0.5,
  "actionItems": [
    {
      "task": "action needed",
      "dueDate": "YYYY-MM-DD or null",
      "priority": "Low|Medium|High|Critical",
      "owner": "person responsible or null"
    }
  ],
  "summary": "2-3 sentence summary of the email content and purpose"
}

Guidelines:
- Extract ETF-related terminology (creation/redemption, NAV, expense ratio, etc.)
- Identify regulatory terms (SEC, prospectus, N-PORT, etc.)
- Capture financial amounts and deadlines accurately
- Summary should focus on the business purpose and any required actions
`

  try {
    const result = await model.generateContent(prompt)
    const responseText = result.response.text()

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
      // JSON이 잘린 경우 복구 시도
      console.warn('[EmailAnalyzer] Attempting to repair truncated JSON')
      const repaired = repairTruncatedJson(jsonStr)
      parsed = JSON.parse(repaired)
    }

    // AI 결과와 키워드 기반 분류 결합
    const finalCategory = categoryConfidence > 0.5 ? category : category

    // 우선순위 결정
    let priority: Priority = 'Medium'
    if (urgencyScore >= 5) priority = 'Critical'
    else if (urgencyScore >= 4) priority = 'High'
    else if (urgencyScore <= 1) priority = 'Low'

    return {
      messageId: email.id,
      threadId: email.threadId,
      category: finalCategory,
      subCategory: undefined,
      intent: (parsed.intent as EmailIntent) || 'unknown',
      sentiment: (parsed.sentiment as Sentiment) || 'neutral',
      sentimentScore: parsed.sentimentScore || 0.5,
      urgencyScore,
      keywords: parsed.keywords || [],
      entities: {
        people: parsed.entities?.people || [],
        companies: parsed.entities?.companies || [],
        products: parsed.entities?.products || [],
        tickers: parsed.entities?.tickers || [],
        amounts: parsed.entities?.amounts || [],
        dates: parsed.entities?.dates || [],
      },
      topics: parsed.topics || [],
      actionItems: (parsed.actionItems || []).map((item: ActionItem) => ({
        task: item.task,
        dueDate: item.dueDate || undefined,
        priority: item.priority || 'Medium',
        owner: item.owner || undefined,
      })),
      summary: parsed.summary || '',
      productType,
      counterpartyType,
      priority,
      requiresReply: needsReply,
    }
  } catch (error) {
    console.error('[EmailAnalyzer] AI analysis failed:', error)

    // AI 실패 시 키워드 기반 결과만 반환
    return {
      messageId: email.id,
      threadId: email.threadId,
      category,
      intent: 'unknown',
      sentiment: 'neutral',
      sentimentScore: 0.5,
      urgencyScore,
      keywords: extractBasicKeywords(email.subject, email.body),
      entities: {
        people: [],
        companies: [],
        products: [],
        tickers: extractTickers(email.subject + ' ' + email.body),
        amounts: [],
        dates: [],
      },
      topics: [],
      actionItems: [],
      summary: email.subject,
      productType,
      counterpartyType,
      priority: 'Medium',
      requiresReply: needsReply,
    }
  }
}

/**
 * 여러 이메일 배치 분석
 */
export async function analyzeEmails(
  emails: EmailForAnalysis[],
  options?: {
    batchSize?: number
    onProgress?: (processed: number, total: number) => void
  }
): Promise<SingleEmailAnalysis[]> {
  const batchSize = options?.batchSize || 5
  const results: SingleEmailAnalysis[] = []

  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize)

    const batchResults = await Promise.all(
      batch.map(email => analyzeEmail(email))
    )

    results.push(...batchResults)

    if (options?.onProgress) {
      options.onProgress(Math.min(i + batchSize, emails.length), emails.length)
    }

    // Rate limiting
    if (i + batchSize < emails.length) {
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }

  return results
}

/**
 * 기본 키워드 추출 (AI 실패 시 폴백)
 */
function extractBasicKeywords(subject: string, body: string): string[] {
  const text = `${subject} ${body}`.toLowerCase()
  const keywords: string[] = []

  // ETF 관련 키워드
  const etfKeywords = [
    'etf', 'nav', 'creation', 'redemption', 'basket', 'expense ratio',
    'aum', 'index', 'benchmark', 'rebalance', 'prospectus', 'sec',
    'custody', 'settlement', 'wire', 'invoice', 'compliance',
  ]

  for (const keyword of etfKeywords) {
    if (text.includes(keyword)) {
      keywords.push(keyword)
    }
  }

  return keywords.slice(0, 10)
}

/**
 * 티커 심볼 추출
 */
function extractTickers(text: string): string[] {
  // 대문자 2-5글자 패턴 (일반적인 티커 형식)
  const tickerPattern = /\b[A-Z]{2,5}\b/g
  const matches = text.match(tickerPattern) || []

  // 일반적인 단어 제외
  const commonWords = new Set([
    'ETF', 'SEC', 'NAV', 'AUM', 'CEO', 'CFO', 'COO', 'CIO',
    'LLC', 'INC', 'USA', 'USD', 'THE', 'AND', 'FOR', 'NOT',
  ])

  return [...new Set(matches.filter(t => !commonWords.has(t)))].slice(0, 10)
}

/**
 * 잘린 JSON 문자열 복구 시도
 * 불완전한 JSON을 파싱 가능하게 만듦
 */
function repairTruncatedJson(json: string): string {
  let repaired = json.trim()

  // 열린 문자열 닫기 (잘린 문자열 값 처리)
  const openQuotes = (repaired.match(/"/g) || []).length
  if (openQuotes % 2 !== 0) {
    // 마지막 열린 따옴표 찾아서 적절히 닫기
    const lastQuoteIdx = repaired.lastIndexOf('"')
    // 마지막 따옴표 이후의 내용이 값의 일부인지 확인
    const afterQuote = repaired.substring(lastQuoteIdx + 1)
    if (!afterQuote.includes(':') && !afterQuote.includes(',') && !afterQuote.includes('}') && !afterQuote.includes(']')) {
      // 잘린 문자열 값 - 닫기
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

  // 마지막 불완전한 값 제거 (쉼표로 끝나는 경우)
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
