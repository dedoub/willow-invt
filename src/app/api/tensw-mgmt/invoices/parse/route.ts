import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import * as XLSX from 'xlsx'

interface ParsedTransaction {
  date: string
  time?: string | null
  counterparty: string
  description: string
  amount: number
  type: 'revenue' | 'expense' | 'asset' | 'liability' | 'transfer' | 'exchange'
  balance_after?: number | null
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

  const buffer = Buffer.from(await file.arrayBuffer())

  let csvText: string
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    csvText = XLSX.utils.sheet_to_csv(sheet)
  } catch {
    return NextResponse.json({ error: 'Failed to parse Excel file' }, { status: 400 })
  }

  const lines = csvText.split('\n')
  const truncated = lines.slice(0, 200).join('\n')

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
      "type": "revenue|expense|asset|liability|transfer",
      "balanceAfter": 숫자 또는 null (이 거래 직후 잔액 — 잔액/잔고 컬럼에서),
      "time": "HH:MM:SS 또는 null (거래일시에 시각 있으면 24시간 포맷)"
    }
  ],
  "bankName": "감지된 은행명 또는 null",
  "accountInfo": "감지된 계좌 정보 또는 null",
  "closingBalance": 숫자 또는 null (거래내역에서 확인되는 최종 잔고/잔액),
  "balanceDate": "잔고 기준일 YYYY-MM-DD 또는 null"
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
8. closingBalance: 거래내역의 잔액/잔고 컬럼에서 가장 마지막 값(최종 잔고). 없으면 null.
9. balanceDate: closingBalance의 기준이 되는 날짜(마지막 거래일). 없으면 null.
10. balanceAfter: 각 거래 직후의 잔액(잔액/잔고 컬럼 값). 없으면 null.
11. time: 거래일시 컬럼에 시각이 같이 있으면 HH:MM:SS 24시간 포맷. 없으면 null.
`

  try {
    const result = await model.generateContent(prompt)
    const responseText = result.response.text()

    let jsonStr = responseText
    if (jsonStr.includes('```json')) {
      jsonStr = jsonStr.split('```json')[1].split('```')[0]
    } else if (jsonStr.includes('```')) {
      jsonStr = jsonStr.split('```')[1].split('```')[0]
    }

    const parsed = JSON.parse(jsonStr.trim())
    const transactions: ParsedTransaction[] = (parsed.transactions || []).map((tx: Record<string, unknown>) => ({
      date: tx.date || '',
      time: tx.time || null,
      counterparty: tx.counterparty || '',
      description: tx.description || '',
      amount: Number(tx.amount) || 0,
      type: tx.type || 'expense',
      balance_after: tx.balanceAfter != null ? Number(tx.balanceAfter) : null,
    })).filter((tx: ParsedTransaction) => tx.amount > 0 && tx.date)

    return NextResponse.json({
      transactions,
      bankName: parsed.bankName || null,
      accountInfo: parsed.accountInfo || null,
      closingBalance: parsed.closingBalance ?? null,
      balanceDate: parsed.balanceDate || null,
      rowCount: transactions.length,
    })
  } catch (error) {
    console.error('[TenSW Parse Invoice] Gemini error:', error)
    return NextResponse.json({ error: 'AI parsing failed' }, { status: 500 })
  }
}
