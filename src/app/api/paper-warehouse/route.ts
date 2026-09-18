import { NextResponse } from 'next/server'
import { denyUnlessDashboardAccess } from '@/lib/api-auth'
import { getServiceSupabase } from '@/lib/supabase'
import type { PaperDataset, PaperPipeline, PaperSyncMeta } from '@/types/paper-warehouse'

export const dynamic = 'force-dynamic'

// 적재 현황. 읽기 전용이다 — 상태는 사람이 고르지 않고 scripts/paper-warehouse-sync.mjs 가
// AWS 를 직접 보고 덮어쓴다.
export async function GET(request: Request) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied
  try {
    const supabase = getServiceSupabase()
    const [dataRes, metaRes] = await Promise.all([
      supabase.from('paper_warehouse_datasets').select('*')
        .order('source', { ascending: true })
        .order('snapshot', { ascending: false, nullsFirst: false })
        .order('table_name', { ascending: true }),
      supabase.from('paper_warehouse_meta').select('key, value').in('key', ['last_sync', 'pipeline']),
    ])
    if (dataRes.error) throw dataRes.error
    if (metaRes.error) throw metaRes.error
    const meta = new Map((metaRes.data ?? []).map(r => [r.key as string, r.value]))
    return NextResponse.json({
      datasets: (dataRes.data ?? []) as PaperDataset[],
      lastSync: (meta.get('last_sync') ?? null) as PaperSyncMeta | null,
      pipeline: (meta.get('pipeline') ?? null) as PaperPipeline | null,
    })
  } catch (error) {
    console.error('paper warehouse status:', error)
    return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 })
  }
}
