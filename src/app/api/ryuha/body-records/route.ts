import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export async function GET(request: Request) {
  try {
    const supabase = getServiceSupabase()
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const limit = searchParams.get('limit')

    let query = supabase
      .from('ryuha_body_records')
      .select('*')
      .order('record_date', { ascending: false })

    if (startDate) {
      query = query.gte('record_date', startDate)
    }
    if (endDate) {
      query = query.lte('record_date', endDate)
    }
    if (limit) {
      query = query.limit(parseInt(limit))
    }

    const { data, error } = await query

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching body records:', error)
    return NextResponse.json({ error: 'Failed to fetch body records' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getServiceSupabase()
    const body = await request.json()
    const { record_date, height_cm, weight_kg, notes } = body

    // Upsert - update if exists, insert if not
    const { data, error } = await supabase
      .from('ryuha_body_records')
      .upsert(
        { record_date, height_cm, weight_kg, notes },
        { onConflict: 'record_date' }
      )
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error saving body record:', error)
    return NextResponse.json({ error: 'Failed to save body record' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = getServiceSupabase()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('ryuha_body_records')
      .delete()
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting body record:', error)
    return NextResponse.json({ error: 'Failed to delete body record' }, { status: 500 })
  }
}