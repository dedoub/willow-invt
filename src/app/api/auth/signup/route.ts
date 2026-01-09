import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getServiceSupabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { email, password, name, signupCode } = await request.json()

    // Validate required fields
    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'Email, password, and name are required' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Validate password strength
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      )
    }

    // Verify signup code
    const expectedSignupCode = process.env.SIGNUP_CODE
    if (expectedSignupCode && signupCode !== expectedSignupCode) {
      return NextResponse.json(
        { error: 'Invalid signup code' },
        { status: 400 }
      )
    }

    const supabase = getServiceSupabase()

    // Check if email already exists
    const { data: existingUser } = await supabase
      .from('willow_users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single()

    if (existingUser) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 400 }
      )
    }

    // Check if this is the first user (will be admin)
    const { count } = await supabase
      .from('willow_users')
      .select('*', { count: 'exact', head: true })

    const isFirstUser = count === 0

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12)

    // Create user
    const { data: newUser, error: createError } = await supabase
      .from('willow_users')
      .insert({
        email: email.toLowerCase(),
        password_hash: passwordHash,
        name,
        role: isFirstUser ? 'admin' : 'viewer',
        is_active: true,
      })
      .select()
      .single()

    if (createError) {
      console.error('Create user error:', createError)
      return NextResponse.json(
        { error: 'Failed to create user' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Account created successfully. Please login.',
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
      },
    })
  } catch (error) {
    console.error('Signup error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
