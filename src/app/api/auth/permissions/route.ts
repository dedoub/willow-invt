import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getServiceSupabase } from '@/lib/supabase'

// GET - Get current user's permissions
export async function GET() {
  try {
    const authUser = await getAuthUser()

    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Admin has access to all pages
    if (authUser.role === 'admin') {
      return NextResponse.json({ permissions: ['*'] })
    }

    const supabase = getServiceSupabase()
    const { data: permissions, error } = await supabase
      .from('willow_user_permissions')
      .select('page_path')
      .eq('user_id', authUser.userId)

    if (error) {
      console.error('Failed to fetch permissions:', error)
      return NextResponse.json({ error: 'Failed to fetch permissions' }, { status: 500 })
    }

    return NextResponse.json({
      permissions: permissions.map(p => p.page_path),
    })
  } catch (error) {
    console.error('Permissions API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
