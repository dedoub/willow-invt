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
    const { data, error } = await supabase
      .from('tensw_mgmt_clients')
      .select('*')
      .order('order_index')

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching clients:', error)
    return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied

  try {
    const supabase = getServiceSupabase()
    const body = await request.json()

    const { data, error } = await supabase
      .from('tensw_mgmt_clients')
      .insert(body)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error creating client:', error)
    return NextResponse.json({ error: 'Failed to create client' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied

  try {
    const supabase = getServiceSupabase()
    const body = await request.json()
    const { id, ...updates } = body

    const { data, error } = await supabase
      .from('tensw_mgmt_clients')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error updating client:', error)
    return NextResponse.json({ error: 'Failed to update client' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied

  try {
    const supabase = getServiceSupabase()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('tensw_mgmt_clients')
      .delete()
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting client:', error)
    return NextResponse.json({ error: 'Failed to delete client' }, { status: 500 })
  }
}
