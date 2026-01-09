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
      const filePath = `${sanitizedUserId}/${timestamp}_${file.name}`

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
