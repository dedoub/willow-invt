import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getServiceSupabase } from '@/lib/supabase'

export async function GET() {
  try {
    const authUser = await getAuthUser()

    if (!authUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    // Verify user still exists and is active
    const supabase = getServiceSupabase()
    const { data: user, error } = await supabase
      .from('willow_users')
      .select('id, email, name, role, is_active')
      .eq('id', authUser.userId)
      .single()

    if (error || !user || !user.is_active) {
      return NextResponse.json(
        { error: 'User not found or inactive' },
        { status: 401 }
      )
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    })
  } catch (error) {
    console.error('Me error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
