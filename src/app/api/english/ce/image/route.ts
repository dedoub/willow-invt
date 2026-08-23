import { NextRequest, NextResponse } from 'next/server'
import { fetchS3Object } from '@/lib/english-ce'

export const maxDuration = 15

// CE 기출 스캔 이미지 프록시 — ReviewNotes S3에서 읽어 그대로 서빙.
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key') ?? ''
  if (!key.startsWith('images/')) return NextResponse.json({ error: 'invalid key' }, { status: 400 })
  try {
    const { buf, contentType } = await fetchS3Object(key)
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=86400, immutable',
      },
    })
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
}
