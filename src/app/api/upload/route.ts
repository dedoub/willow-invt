import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

// Folder to bucket mapping
const FOLDER_BUCKET_MAP: Record<string, string> = {
  'invoices': 'tensw-project-docs',
  'tensw': 'tensw-project-docs',
  'wiki': 'wiki-attachments',
  'etf': 'etf-documents',
  'ceo': 'ceo-docs',
}

// 파일명 sanitize (Supabase Storage에서 허용하지 않는 문자 제거)
function sanitizeFileName(fileName: string): string {
  // 확장자 분리
  const lastDot = fileName.lastIndexOf('.')
  const ext = lastDot > 0 ? fileName.slice(lastDot) : ''
  const name = lastDot > 0 ? fileName.slice(0, lastDot) : fileName

  // 허용되지 않는 문자를 언더스코어로 대체 (한글, 공백, 특수문자 등)
  const sanitized = name
    .replace(/[^\w.-]/g, '_') // 영문, 숫자, 언더스코어, 점, 하이픈 외 모두 제거
    .replace(/_+/g, '_') // 연속된 언더스코어 하나로
    .replace(/^_|_$/g, '') // 앞뒤 언더스코어 제거

  return (sanitized || 'file') + ext.toLowerCase()
}

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

// POST: 파일 업로드
export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    const folder = formData.get('folder') as string || 'default'

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    // Determine bucket from folder
    const bucket = FOLDER_BUCKET_MAP[folder] || 'tensw-project-docs'

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
      const filePath = `${folder}/${sanitizedUserId}/${timestamp}_${sanitizedFileName}`

      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      const { error: uploadError } = await supabase.storage
        .from(bucket)
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
        .from(bucket)
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
    console.error('Error in POST /api/upload:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
