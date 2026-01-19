import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getServiceSupabase } from '@/lib/supabase'

// Available pages for permission settings
export const AVAILABLE_PAGES = [
  { path: '/etf/etc', section: 'etfIndexing', name: 'ETC' },
  { path: '/etf/akros', section: 'etfIndexing', name: 'Akros' },
  { path: '/monor/voicecards', section: 'monoRApps', name: 'Voice Cards' },
  { path: '/monor/reviewnotes', section: 'monoRApps', name: 'Review Notes' },
  { path: '/tensoftworks/poc', section: 'tenSoftworks', name: 'POC Projects' },
  { path: '/tensoftworks/active', section: 'tenSoftworks', name: 'Active Projects' },
  { path: '/tensoftworks/managed', section: 'tenSoftworks', name: 'Managed Projects' },
  { path: '/tensoftworks/closed', section: 'tenSoftworks', name: 'Closed Projects' },
  { path: '/others/ryuha-study', section: 'others', name: 'Ryuha Study' },
]

// GET - Get permissions for a user or list of available pages
export async function GET(request: Request) {
  try {
    const authUser = await getAuthUser()

    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    // If no userId, return available pages (for any authenticated user)
    if (!userId) {
      return NextResponse.json({ pages: AVAILABLE_PAGES })
    }

    // For user-specific permissions, require admin
    if (authUser.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const supabase = getServiceSupabase()
    const { data: permissions, error } = await supabase
      .from('willow_user_permissions')
      .select('page_path')
      .eq('user_id', userId)

    if (error) {
      console.error('Failed to fetch permissions:', error)
      return NextResponse.json({ error: 'Failed to fetch permissions' }, { status: 500 })
    }

    return NextResponse.json({
      userId,
      permissions: permissions.map(p => p.page_path),
    })
  } catch (error) {
    console.error('Permissions API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT - Update permissions for a user (admin only)
export async function PUT(request: Request) {
  try {
    const authUser = await getAuthUser()

    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    if (authUser.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { userId, permissions } = body

    if (!userId || !Array.isArray(permissions)) {
      return NextResponse.json({ error: 'userId and permissions array required' }, { status: 400 })
    }

    const supabase = getServiceSupabase()

    // Delete existing permissions
    await supabase
      .from('willow_user_permissions')
      .delete()
      .eq('user_id', userId)

    // Insert new permissions
    if (permissions.length > 0) {
      const permissionRecords = permissions.map(page_path => ({
        user_id: userId,
        page_path,
      }))

      const { error } = await supabase
        .from('willow_user_permissions')
        .insert(permissionRecords)

      if (error) {
        console.error('Failed to insert permissions:', error)
        return NextResponse.json({ error: 'Failed to update permissions' }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true, userId, permissions })
  } catch (error) {
    console.error('Permissions API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
