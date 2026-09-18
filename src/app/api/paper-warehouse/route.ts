import { NextResponse } from 'next/server'
import { denyUnlessDashboardAccess } from '@/lib/api-auth'
import { getServiceSupabase } from '@/lib/supabase'
import type { PaperWarehouseLoad, PaperWarehouseStage } from '@/types/paper-warehouse'

export const dynamic = 'force-dynamic'

const STAGE_STATUS = new Set(['done', 'running', 'todo', 'blocked'])
const LOAD_STATUS = new Set(['done', 'running', 'todo', 'failed'])

// 적재 현황 전체. 두 표가 각각 열 대 안쪽이라 나눠 부를 이유가 없다.
export async function GET(request: Request) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied
  try {
    const supabase = getServiceSupabase()
    const [stagesRes, loadsRes] = await Promise.all([
      supabase.from('paper_warehouse_stages').select('*').order('seq', { ascending: true }),
      supabase.from('paper_warehouse_loads').select('*')
        .order('source', { ascending: true }).order('sort_order', { ascending: true }),
    ])
    if (stagesRes.error) throw stagesRes.error
    if (loadsRes.error) throw loadsRes.error
    return NextResponse.json({
      stages: (stagesRes.data ?? []) as PaperWarehouseStage[],
      loads: (loadsRes.data ?? []) as PaperWarehouseLoad[],
    })
  } catch (error) {
    console.error('paper warehouse status:', error)
    return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 })
  }
}

/**
 * 한 줄 수정. 화면에서 상태를 바꾸거나 메모를 다는 자리다.
 *
 *   PATCH { kind: 'stage', key: 'load',          status?, note? }
 *   PATCH { kind: 'load',  table_name: 'oa_...', source?, status?, note? }
 *
 * 숫자(행 수·스캔량·비용)는 여기서 안 받는다. 그건 AWS 를 실제로 돌린 쪽이
 * scripts/paper-warehouse-report.mjs 로 적는다 — 손으로 고칠 값이 아니다.
 */
export async function PATCH(request: Request) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied
  try {
    const body = await request.json()
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (typeof body.note === 'string') patch.note = body.note.trim() || null

    const supabase = getServiceSupabase()

    if (body.kind === 'stage') {
      if (typeof body.key !== 'string') return NextResponse.json({ error: 'key required' }, { status: 400 })
      if (body.status !== undefined) {
        if (!STAGE_STATUS.has(body.status)) return NextResponse.json({ error: 'bad status' }, { status: 400 })
        patch.status = body.status
      }
      const { data, error } = await supabase.from('paper_warehouse_stages')
        .update(patch).eq('key', body.key).select().single()
      if (error) throw error
      return NextResponse.json({ stage: data as PaperWarehouseStage })
    }

    if (body.kind === 'load') {
      if (typeof body.table_name !== 'string') return NextResponse.json({ error: 'table_name required' }, { status: 400 })
      if (body.status !== undefined) {
        if (!LOAD_STATUS.has(body.status)) return NextResponse.json({ error: 'bad status' }, { status: 400 })
        patch.status = body.status
      }
      const { data, error } = await supabase.from('paper_warehouse_loads')
        .update(patch)
        .eq('source', typeof body.source === 'string' ? body.source : 'openalex')
        .eq('table_name', body.table_name)
        .select().single()
      if (error) throw error
      return NextResponse.json({ load: data as PaperWarehouseLoad })
    }

    return NextResponse.json({ error: 'kind must be stage or load' }, { status: 400 })
  } catch (error) {
    console.error('paper warehouse patch:', error)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
