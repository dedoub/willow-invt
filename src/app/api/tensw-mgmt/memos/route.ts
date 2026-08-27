import { NextResponse } from 'next/server'
import { denyUnlessDashboardAccess } from '@/lib/api-auth'
import { getServiceSupabase } from '@/lib/supabase'

// 로그인 쿠키를 읽으므로 요청마다 실행돼야 한다. 이 줄이 없으면 Next 가 빌드 때 한 번
// 실행해 응답을 굳혀 버리고, 그때는 쿠키가 없어 401 이 통째로 캐시된다 (2026-08-27 투자 페이지).
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied

  try {
    const supabase = getServiceSupabase()
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    let query = supabase
      .from('tensw_mgmt_daily_memos')
      .select('*')
      .order('memo_date')

    if (startDate) {
      query = query.gte('memo_date', startDate)
    }
    if (endDate) {
      query = query.lte('memo_date', endDate)
    }

    const { data, error } = await query

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching memos:', error)
    return NextResponse.json({ error: 'Failed to fetch memos' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied

  try {
    const supabase = getServiceSupabase()
    const body = await request.json()
    const { memo_date, content } = body

    // Upsert - update if exists, insert if not
    const { data, error } = await supabase
      .from('tensw_mgmt_daily_memos')
      .upsert(
        { memo_date, content, updated_at: new Date().toISOString() },
        { onConflict: 'memo_date' }
      )
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error saving memo:', error)
    return NextResponse.json({ error: 'Failed to save memo' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied

  try {
    const supabase = getServiceSupabase()
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')

    if (!date) {
      return NextResponse.json({ error: 'Date required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('tensw_mgmt_daily_memos')
      .delete()
      .eq('memo_date', date)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting memo:', error)
    return NextResponse.json({ error: 'Failed to delete memo' }, { status: 500 })
  }
}
