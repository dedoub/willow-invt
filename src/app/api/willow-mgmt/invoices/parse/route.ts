import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import * as XLSX from 'xlsx'

interface ParsedTransaction {
  date: string
  counterparty: string
  description: string
  amount: number
  type: 'revenue' | 'expense' | 'asset' | 'liability'
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  // Read file into buffer
  const buffer = Buffer.from(await file.arrayBuffer())

  // Parse with xlsx
  let csvText: string
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    csvText = XLSX.utils.sheet_to_csv(sheet)
  } catch {
    return NextResponse.json({ error: 'Failed to parse Excel file' }, { status: 400 })
  }

  // Limit to first 200 rows to stay within token limits
  const lines = csvText.split('\n')
  const truncated = lines.slice(0, 200).join('\n')

  // Use Gemini to structure the data
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      maxOutputTokens: 4096,
      temperature: 0.1,
    },
  })

  const prompt = `
다음은 한국 은행 거래내역 엑셀 파일을 CSV로 변환한 내용입니다.
이 데이터를 파싱하여 구조화된 거래 목록을 JSON으로 반환해주세요.

CSV 데이터:
${truncated}

다음 JSON 형식으로만 응답해주세요 (다른 텍스트 없이):
{
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "counterparty": "거래처/적요에서 추출한 상대방 이름",
      "description": "거래 설명/적요 원문",
      "amount": 숫자 (양수),
      "type": "revenue|expense|asset|liability"
    }
  ],
  "bankName": "감지된 은행명 또는 null",
  "accountInfo": "감지된 계좌 정보 또는 null"
}

파싱 규칙:
1. date: 날짜를 YYYY-MM-DD 형식으로 변환. 년도가 2자리면 20XX로 추정.
2. counterparty: 적요/메모에서 거래 상대방을 추출. 없으면 적요 전체 사용.
3. description: 원래 적요/메모 내용 그대로.
4. amount: 항상 양수. 출금/입금 구분은 type으로.
5. type 판단 기준:
   - 입금(수입) → "revenue"
   - 출금(지출) → "expense"
   - 헤더 행이나 합계 행 등 거래가 아닌 행은 제외.
6. 빈 행, 헤더 행, 합계 행은 제외.
7. 금액이 0이거나 없는 행은 제외.
`

  try {
    const result = await model.generateContent(prompt)
    const responseText = result.response.text()

    // Parse JSON (strip markdown code block if present)
    let jsonStr = responseText
    if (jsonStr.includes('```json')) {
      jsonStr = jsonStr.split('```json')[1].split('```')[0]
    } else if (jsonStr.includes('```')) {
      jsonStr = jsonStr.split('```')[1].split('```')[0]
    }

    const parsed = JSON.parse(jsonStr.trim())
    const transactions: ParsedTransaction[] = (parsed.transactions || []).map((tx: Record<string, unknown>) => ({
      date: tx.date || '',
      counterparty: tx.counterparty || '',
      description: tx.description || '',
      amount: Number(tx.amount) || 0,
      type: tx.type || 'expense',
    })).filter((tx: ParsedTransaction) => tx.amount > 0 && tx.date)

    return NextResponse.json({
      transactions,
      bankName: parsed.bankName || null,
      accountInfo: parsed.accountInfo || null,
      rowCount: transactions.length,
    })
  } catch (error) {
    console.error('[Parse Invoice] Gemini error:', error)
    return NextResponse.json({ error: 'AI parsing failed' }, { status: 500 })
  }
}
