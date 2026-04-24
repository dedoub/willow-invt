import { NextResponse } from 'next/server'
import {
  getCredentials,
  getAnyCredentials,
  saveCredentials,
  getConnectionStatus,
} from '@/lib/voicecards-server'

function mask(value: string | null | undefined): string | null {
  if (!value) return null
  if (value.length <= 6) return '••••••'
  return value.slice(0, 3) + '•'.repeat(Math.min(value.length - 6, 10)) + value.slice(-3)
}

// GET: 인증 정보 조회 (마스킹 처리)
export async function GET() {
  try {
    const creds = await getCredentials() || await getAnyCredentials()
    const status = await getConnectionStatus()

    return NextResponse.json({
      ...status,
      credentials: creds ? {
        ios_issuer_id: mask(creds.ios_issuer_id),
        ios_key_id: mask(creds.ios_key_id),
        ios_private_key: creds.ios_private_key ? '••••••(설정됨)' : null,
        ios_app_id: creds.ios_app_id || null,
        ios_vendor_number: creds.ios_vendor_number || null,
        android_service_account: creds.android_service_account ? '••••••(설정됨)' : null,
        android_package_name: creds.android_package_name || null,
      } : null,
    })
  } catch (error) {
    console.error('Error getting credentials:', error)
    return NextResponse.json(
      { error: 'Failed to get credentials' },
      { status: 500 }
    )
  }
}

// POST: 인증 정보 저장
export async function POST(request: Request) {
  try {
    const body = await request.json()

    const result = await saveCredentials({
      ios_issuer_id: body.ios_issuer_id,
      ios_key_id: body.ios_key_id,
      ios_private_key: body.ios_private_key,
      ios_app_id: body.ios_app_id,
      ios_vendor_number: body.ios_vendor_number,
      android_service_account: body.android_service_account,
      android_package_name: body.android_package_name,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      )
    }

    // 업데이트된 연결 상태 반환
    const status = await getConnectionStatus()
    return NextResponse.json(status)
  } catch (error) {
    console.error('Error saving credentials:', error)
    return NextResponse.json(
      { error: 'Failed to save credentials' },
      { status: 500 }
    )
  }
}

// DELETE: 인증 정보 삭제 (특정 플랫폼)
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const platform = searchParams.get('platform') // 'ios' | 'android' | 'all'

    const creds = await getCredentials()
    if (!creds) {
      return NextResponse.json({ success: true })
    }

    const updates: Record<string, null> = {}

    if (platform === 'ios' || platform === 'all') {
      updates.ios_issuer_id = null
      updates.ios_key_id = null
      updates.ios_private_key = null
      updates.ios_app_id = null
    }

    if (platform === 'android' || platform === 'all') {
      updates.android_service_account = null
      updates.android_package_name = null
    }

    await saveCredentials(updates)

    const status = await getConnectionStatus()
    return NextResponse.json(status)
  } catch (error) {
    console.error('Error deleting credentials:', error)
    return NextResponse.json(
      { error: 'Failed to delete credentials' },
      { status: 500 }
    )
  }
}
