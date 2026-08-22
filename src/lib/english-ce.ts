// CE 기출 답안 연습 — ReviewNotes의 "ISEB CE AT 11+ English" 노트를 문제은행으로 쓴다.
// 문항(지문·문제)은 ReviewNotes S3의 스캔 이미지, 답변 필드에는 공식 마크스킴(배점·인정 답 요소·풀이)이 들어있다.
// 이미지는 ReviewNotes와 같은 S3 계정(RN_AWS_*)으로 서버에서 직접 읽는다.
import 'server-only'

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { reviewnotesSupabase } from '@/lib/reviewnotes-supabase'

export const CE_NOTE_ID = 'cmsmi8al10001j61fvuz7cnii' // ISEB CE AT 11+ English

const s3 = new S3Client({
  region: process.env.RN_AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.RN_AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.RN_AWS_SECRET_ACCESS_KEY || '',
  },
})

export async function fetchS3Object(key: string): Promise<{ buf: Buffer; contentType: string }> {
  const bucket = process.env.RN_AWS_S3_BUCKET_NAME
  if (!bucket) throw new Error('RN_AWS_S3_BUCKET_NAME not set')
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  const bytes = await res.Body!.transformToByteArray()
  return { buf: Buffer.from(bytes), contentType: res.ContentType || 'image/png' }
}

export interface CeProblem {
  id: string
  title: string
  kind: 'comprehension' | 'composition'
  order: number
  imageKeys: string[]
  questionText: string
  schemeHtml: string
  schemeText: string
  maxScore: number
}

function stripHtml(html: string): string {
  return html
    .replace(/<img[^>]*>/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, '') // 엔티티로 이스케이프돼 있던 강조 태그(<b> 등)까지 제거
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function imageKeysOf(html: string): string[] {
  const keys: string[] = []
  const re = /key=([^"&\\]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) keys.push(decodeURIComponent(m[1]))
  return keys
}

export async function fetchCeProblems(): Promise<CeProblem[]> {
  if (!reviewnotesSupabase) throw new Error('reviewnotes supabase not configured')
  const { data, error } = await reviewnotesSupabase
    .from('Problem')
    .select('id, title, question, answer, order')
    .eq('noteId', CE_NOTE_ID)
    .order('order', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map(p => {
    const schemeText = stripHtml(p.answer ?? '')
    const scoreMatch = schemeText.match(/\[(\d+)점\]/)
    const kind: CeProblem['kind'] = schemeText.includes('35점') ? 'composition' : 'comprehension'
    return {
      id: p.id,
      title: String(p.title ?? ''),
      kind,
      order: p.order ?? 0,
      imageKeys: imageKeysOf(String(p.question ?? '')),
      questionText: stripHtml(String(p.question ?? '')),
      schemeHtml: String(p.answer ?? ''),
      schemeText,
      maxScore: scoreMatch ? Number(scoreMatch[1]) : (kind === 'composition' ? 35 : 2),
    }
  })
}
