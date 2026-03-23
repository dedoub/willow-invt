import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getServiceSupabase } from '@/lib/supabase'
import { createServiceToken, listServiceTokens, revokeServiceToken } from '@/lib/mcp/auth'
import { getDefaultScopes } from '@/lib/mcp/permissions'
import type { UserRole } from '@/lib/auth'

// Admin 권한 확인
async function getAdminUser() {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) return null

  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    const email = payload.email || payload.sub
    if (!email) return null

    const supabase = getServiceSupabase()
    const { data: user } = await supabase
      .from('willow_users')
      .select('id, email, role, is_active')
      .eq('email', email)
      .single()

    if (!user || !user.is_active || user.role !== 'admin') return null
    return user
  } catch {
    return null
  }
}

// GET: 서비스 토큰 목록
export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const tokens = await listServiceTokens()
  return NextResponse.json({ tokens })
}

// POST: 서비스 토큰 생성
export async function POST(request: Request) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const body = await request.json()
  const { name, userId, scopes } = body

  if (!name || !userId) {
    return NextResponse.json({ error: 'name and userId are required' }, { status: 400 })
  }

  // userId로 사용자 조회하여 role 기반 스코프 결정
  const supabase = getServiceSupabase()
  const { data: targetUser } = await supabase
    .from('willow_users')
    .select('id, role, is_active')
    .eq('id', userId)
    .single()

  if (!targetUser || !targetUser.is_active) {
    return NextResponse.json({ error: 'User not found or inactive' }, { status: 404 })
  }

  // 명시적 스코프가 있으면 사용, 없으면 role 기반 기본 스코프
  const scope = scopes
    ? (scopes as string[]).join(' ')
    : getDefaultScopes(targetUser.role as UserRole).join(' ')

  try {
    const result = await createServiceToken({ name, userId, scope })

    return NextResponse.json({
      id: result.id,
      token: result.token,  // 생성 시에만 노출
      name,
      userId,
      scope,
      message: '토큰은 이 응답에서만 확인 가능합니다. 안전하게 보관하세요.',
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// DELETE: 서비스 토큰 폐기
export async function DELETE(request: Request) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  await revokeServiceToken(id)
  return NextResponse.json({ success: true })
}
