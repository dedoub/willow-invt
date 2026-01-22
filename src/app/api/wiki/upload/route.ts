import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

const STORAGE_BUCKET = 'wiki-attachments'

// 현재 사용자 ID 가져오기
async function getCurrentUserId(): Promise<string | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) return null

  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    return payload.email || payload.sub || null
  } catch {
    return null
  }
}

// 파일명 sanitize (한글, 공백, 특수문자 처리)
function sanitizeFileName(fileName: string): string {
  // 확장자 분리
  const lastDot = fileName.lastIndexOf('.')
  const name = lastDot > 0 ? fileName.slice(0, lastDot) : fileName
  const ext = lastDot > 0 ? fileName.slice(lastDot) : ''

  // 파일명에서 허용되지 않는 문자를 언더스코어로 변환
  // 영문, 숫자, 하이픈, 언더스코어만 허용
  const sanitized = name
    .replace(/\s+/g, '_')  // 공백을 언더스코어로
    .replace(/[^a-zA-Z0-9_\-]/g, '')  // 허용되지 않는 문자 제거
    .slice(0, 50)  // 파일명 길이 제한

  // 빈 파일명 방지
  const finalName = sanitized || 'file'

  return `${finalName}${ext.toLowerCase()}`
}

// POST: 파일 업로드
export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const formData = await request.formData()
    const files = formData.getAll('files') as File[]

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    const uploadedFiles: Array<{
      name: string
      url: string
      size: number
      type: string
    }> = []

    for (const file of files) {
      const timestamp = Date.now()
      const sanitizedUserId = userId.replace(/[^a-zA-Z0-9]/g, '_')
      const sanitizedFileName = sanitizeFileName(file.name)
      const filePath = `${sanitizedUserId}/${timestamp}_${sanitizedFileName}`

      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(filePath, buffer, {
          contentType: file.type,
          cacheControl: '3600',
          upsert: false,
        })

      if (uploadError) {
        console.error('Error uploading file:', uploadError)
        continue
      }

      const { data: urlData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(filePath)

      uploadedFiles.push({
        name: file.name,
        url: urlData.publicUrl,
        size: file.size,
        type: file.type,
      })
    }

    if (uploadedFiles.length === 0) {
      return NextResponse.json({ error: 'Failed to upload any files' }, { status: 500 })
    }

    return NextResponse.json({ files: uploadedFiles })
  } catch (error) {
    console.error('Error in POST /api/wiki/upload:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
