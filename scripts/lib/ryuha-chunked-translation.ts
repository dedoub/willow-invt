import { google, sheets_v4 } from 'googleapis'

export type ChunkedLanguage = 'english'

export interface ChunkedTranslationRow {
  question: string
  answer: string
  memo?: string
}

export interface ChunkedTranslationRows {
  english: ChunkedTranslationRow[]
}

export interface ChunkedTranslationRequest {
  sourceText: string
}

export interface SheetRowsByLanguage {
  english: string[][]
}

export interface VerificationResult {
  ok: boolean
  expected: number
  found: number
}

export interface ChunkedTranslationSummaryInput {
  englishAdded: number
  englishSkipped: number
  verified: Record<ChunkedLanguage, VerificationResult>
}

export const RINA_CHUNKED_TRANSLATION_SPREADSHEET_ID = '1ThEDOoNDdS7HcUhAR36JACM6A1VpBgt7xG34Fy7xTzs'
export const RINA_ENGLISH_SHEET_TITLE = 'Voice Cards'
const HEADER = ['Question', 'Answer', 'Memo', 'Bookmark']
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets'

export function getGoogleServiceAccountEmail(): string | null {
  const b64 = process.env.GOOGLE_SA_JSON_B64
  if (!b64) return null
  try {
    const credentials = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
    return typeof credentials.client_email === 'string' ? credentials.client_email : null
  } catch {
    return null
  }
}

function normalizePairPart(value: string | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim()
}

function pairKey(question: string | undefined, answer: string | undefined): string {
  return `${normalizePairPart(question)}\u0000${normalizePairPart(answer)}`
}

function cleanSourceText(text: string): string {
  const withoutUrl = text.replace(/https:\/\/docs\.google\.com\/spreadsheets\/d\/[^\s]+/g, '')
  const lines = withoutUrl
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !/(청킹\s*번역|청킹번역|보이스카드|voice\s*cards?|시트에|넣어줘|추가해줘|추가|저장)/i.test(line))
  const candidate = lines.join('\n').replace(/[—\-_\s]+$/g, '').trim()
  return candidate || withoutUrl
    .replace(/청킹\s*번역(?:해서)?|청킹번역(?:해서)?|보이스카드(?:덱)?에?|넣어줘|추가해줘|추가|저장/gi, '')
    .replace(/[—\-_\s]+$/g, '')
    .trim()
}

export function detectChunkedTranslationRequest(text: string): ChunkedTranslationRequest | null {
  const trigger = /(청킹\s*번역|청킹번역|보이스카드(?:덱)?에?\s*(?:넣|추가)|영어.*(?:넣|추가|저장))/i
  if (!trigger.test(text)) return null

  const sourceText = cleanSourceText(text)
  if (!sourceText || sourceText.length < 2) return null
  return { sourceText }
}

export function buildChunkedTranslationPrompt(sourceText: string): string {
  return `You create Rina's VoiceCards chunked translation rows.

Korean source:
${sourceText}

Rules:
- Rewrite the Korean source into natural British English that a child around Rina's age would actually say in the UK.
- Preserve Rina's original intent and emotion. Make it sound spoken, warm, and age-appropriate instead of literal or textbook-like.
- For each reusable speaking frame, create exactly three expressions: one base expression + two variations.
- Rewrite naturally first, then chunk by actual spoken breath units.
- Each row is one chunk. The Korean question must match the meaning and order of the English chunk.
- Avoid one-word chunks unless it is a natural standalone utterance.
- Do not add explanations, markdown, comments, or code fences.

Return strict JSON with this exact shape:
{
  "english": [
    { "question": "한글 청크", "answer": "British English chunk" }
  ]
}`
}

export function parseChunkedTranslationJson(raw: string): ChunkedTranslationRows {
  const jsonText = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const parsed = JSON.parse(jsonText) as Partial<ChunkedTranslationRows>
  const normalizeRows = (rows: unknown): ChunkedTranslationRow[] => {
    if (!Array.isArray(rows)) return []
    return rows
      .map((row) => {
        const r = row as Partial<ChunkedTranslationRow>
        return {
          question: normalizePairPart(r.question),
          answer: normalizePairPart(r.answer),
          memo: normalizePairPart(r.memo),
        }
      })
      .filter(row => row.question && row.answer)
      .map(row => row.memo ? row : { question: row.question, answer: row.answer })
  }

  const result = {
    english: normalizeRows(parsed.english),
  }
  if (!result.english.length) {
    throw new Error('청킹 번역 JSON에 english 행이 부족합니다.')
  }
  return result
}

export function filterDuplicateRows(
  rows: ChunkedTranslationRows,
  existingRows: SheetRowsByLanguage
): ChunkedTranslationRows {
  const filterLang = (lang: ChunkedLanguage) => {
    const existing = new Set(
      existingRows[lang]
        .slice(1)
        .map(row => pairKey(row[0], row[1]))
    )
    return rows[lang].filter(row => !existing.has(pairKey(row.question, row.answer)))
  }
  return {
    english: filterLang('english'),
  }
}

export function verifyAppendedRows(
  expected: ChunkedTranslationRows,
  rereadRows: SheetRowsByLanguage
): Record<ChunkedLanguage, VerificationResult> {
  const verifyLang = (lang: ChunkedLanguage): VerificationResult => {
    const expectedRows = expected[lang]
    if (!expectedRows.length) return { ok: true, expected: 0, found: 0 }
    const existing = new Set(
      rereadRows[lang]
        .slice(1)
        .map(row => pairKey(row[0], row[1]))
    )
    const found = expectedRows.filter(row => existing.has(pairKey(row.question, row.answer))).length
    return { ok: found === expectedRows.length, expected: expectedRows.length, found }
  }
  return {
    english: verifyLang('english'),
  }
}

export function summarizeChunkedTranslationResult(input: ChunkedTranslationSummaryInput): string {
  if (!input.verified.english.ok) {
    return [
      `청킹 번역 저장을 완료하지 못했어.`,
      `영어 추가 ${input.englishAdded}개.`,
      `검증: 영어 ${input.verified.english.found}/${input.verified.english.expected}.`,
    ].join(' ')
  }

  const skippedText = input.englishSkipped ? `, 기존 중복 ${input.englishSkipped}개는 제외했어` : ''
  return `영국식 영어 청킹 ${input.englishAdded}개를 영어 시트에 추가했고${skippedText}. 영어 시트 재조회 검증까지 완료했어.`
}

export function formatChunkedTranslationError(err: unknown, serviceAccountEmail?: string | null): string {
  const code = Number((err as { code?: number; status?: number })?.code || (err as { code?: number; status?: number })?.status)
  const message = err instanceof Error ? err.message : String(err)
  if (code === 403 || /permission|forbidden|PERMISSION_DENIED/i.test(message)) {
    const account = serviceAccountEmail || '현재 GOOGLE_SA_JSON_B64 서비스 계정'
    return `시트 편집 권한이 없어서 청킹 번역을 저장하지 못했어. Google Sheet를 ${account} 에 편집자로 공유한 뒤 다시 보내줘.`
  }
  return `청킹 번역 처리 중 오류가 났어: ${message.slice(0, 180)}`
}

function encodeSheetName(title: string): string {
  return `'${title.replace(/'/g, "''")}'`
}

function assertCompatibleHeader(title: string, rows: string[][]) {
  const header = rows[0] || []
  const ok = header[0] === 'Question' && header[1] === 'Answer' && header[2] === 'Memo' &&
    (header[3] === 'Bookmark' || header[3] === 'Favorite')
  if (!ok) {
    throw new Error(`${title} 시트 헤더가 예상 구조가 아닙니다: ${header.join(', ')}`)
  }
}

export class RinaChunkedTranslationSheets {
  private sheets: sheets_v4.Sheets
  private spreadsheetId: string

  constructor(opts?: { spreadsheetId?: string; sheets?: sheets_v4.Sheets }) {
    this.spreadsheetId = opts?.spreadsheetId || RINA_CHUNKED_TRANSLATION_SPREADSHEET_ID
    this.sheets = opts?.sheets || this.createSheetsClient()
  }

  private createSheetsClient(): sheets_v4.Sheets {
    const b64 = process.env.GOOGLE_SA_JSON_B64
    if (!b64) throw new Error('GOOGLE_SA_JSON_B64 미설정')
    const credentials = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
    const auth = new google.auth.GoogleAuth({ credentials, scopes: [SHEETS_SCOPE] })
    return google.sheets({ version: 'v4', auth })
  }

  async ensureSheets(): Promise<Record<ChunkedLanguage, string>> {
    const meta = await this.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId })
    const titles = new Set((meta.data.sheets || []).map(sheet => sheet.properties?.title).filter(Boolean) as string[])
    if (!titles.has(RINA_ENGLISH_SHEET_TITLE)) {
      throw new Error(`${RINA_ENGLISH_SHEET_TITLE} 시트를 찾지 못했습니다.`)
    }
    return { english: RINA_ENGLISH_SHEET_TITLE }
  }

  async readAllRows(sheetTitles: Record<ChunkedLanguage, string>): Promise<SheetRowsByLanguage> {
    const read = async (title: string) => {
      const res = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${encodeSheetName(title)}!A:D`,
      })
      const rows = (res.data.values || []) as string[][]
      assertCompatibleHeader(title, rows)
      return rows
    }
    return {
      english: await read(sheetTitles.english),
    }
  }

  async appendRows(sheetTitles: Record<ChunkedLanguage, string>, rows: ChunkedTranslationRows): Promise<void> {
    const append = async (title: string, values: ChunkedTranslationRow[]) => {
      if (!values.length) return
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${encodeSheetName(title)}!A:D`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: values.map(row => [row.question, row.answer, row.memo || '', '']),
        },
      })
    }
    await append(sheetTitles.english, rows.english)
  }
}
