import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getServiceSupabase } from '@/lib/supabase'

export interface UserData {
  id: string
  email: string
  name: string
  role: string
  is_active: boolean
  created_at: string
  last_login_at: string | null
}

// GET - List all users (admin only)
export async function GET() {
  try {
    const authUser = await getAuthUser()

    if (!authUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    if (authUser.role !== 'admin') {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }

    const supabase = getServiceSupabase()
    const { data: users, error } = await supabase
      .from('willow_users')
      .select('id, email, name, role, is_active, created_at, last_login_at')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch users:', error)
      return NextResponse.json(
        { error: 'Failed to fetch users' },
        { status: 500 }
      )
    }

    return NextResponse.json({ users })
  } catch (error) {
    console.error('Users API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH - Update user role or status (admin only)
export async function PATCH(request: Request) {
  try {
    const authUser = await getAuthUser()

    if (!authUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    if (authUser.role !== 'admin') {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { userId, role, is_active } = body

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    // Prevent admin from modifying their own role
    if (userId === authUser.userId && role && role !== authUser.role) {
      return NextResponse.json(
        { error: 'Cannot modify your own role' },
        { status: 400 }
      )
    }

    const supabase = getServiceSupabase()

    const updateData: { role?: string; is_active?: boolean } = {}
    if (role) updateData.role = role
    if (typeof is_active === 'boolean') updateData.is_active = is_active

    const { data: user, error } = await supabase
      .from('willow_users')
      .update(updateData)
      .eq('id', userId)
      .select('id, email, name, role, is_active, created_at, last_login_at')
      .single()

    if (error) {
      console.error('Failed to update user:', error)
      return NextResponse.json(
        { error: 'Failed to update user' },
        { status: 500 }
      )
    }

    return NextResponse.json({ user })
  } catch (error) {
    console.error('Users API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Delete user (admin only)
export async function DELETE(request: Request) {
  try {
    const authUser = await getAuthUser()

    if (!authUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    if (authUser.role !== 'admin') {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    // Prevent admin from deleting themselves
    if (userId === authUser.userId) {
      return NextResponse.json(
        { error: 'Cannot delete your own account' },
        { status: 400 }
      )
    }

    const supabase = getServiceSupabase()

    const { error } = await supabase
      .from('willow_users')
      .delete()
      .eq('id', userId)

    if (error) {
      console.error('Failed to delete user:', error)
      return NextResponse.json(
        { error: 'Failed to delete user' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Users API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
