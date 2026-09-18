import { NextResponse } from 'next/server'
import { denyUnlessDashboardAccess } from '@/lib/api-auth'
import { getServiceSupabase } from '@/lib/supabase'
import type { PaperDataset, PaperSyncMeta } from '@/types/paper-warehouse'

export const dynamic = 'force-dynamic'

// 사용법 문서를 지금 있는 표에서 만들어 내려준다. 파일로 써 두지 않는 이유는 하나다 —
// 써 두면 스키마가 바뀐 다음 날부터 거짓말이 된다. 받는 순간의 카탈로그가 곧 문서다.

function formatRows(n: number | null): string {
  return n === null ? '-' : n.toLocaleString()
}
function formatBytes(n: number | null): string {
  if (n === null) return '-'
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)} TB`
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`
  return `${n.toLocaleString()} B`
}

function guide(datasets: PaperDataset[], lastSync: PaperSyncMeta | null): string {
  const live = datasets.filter(d => d.status !== 'todo')
  const bySnapshot = new Map<string, PaperDataset[]>()
  for (const d of live) {
    const key = `${d.source}${d.snapshot ? ` · ${d.snapshot}` : ''}`
    const arr = bySnapshot.get(key) ?? []
    arr.push(d)
    bySnapshot.set(key, arr)
  }
  const totalRows = live.reduce((s, d) => s + Number(d.row_count ?? 0), 0)
  const totalBytes = live.reduce((s, d) => s + Number(d.bytes ?? 0), 0)

  const out: string[] = []
  out.push('# 논문 데이터 웨어하우스 사용법')
  out.push('')
  out.push(`문서 생성 ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC` +
    (lastSync ? ` · 카탈로그 확인 ${lastSync.at.slice(0, 16).replace('T', ' ')} UTC` : ''))
  out.push('')
  out.push(`지금 ${live.length}개 표에 ${totalRows.toLocaleString()}행, ${formatBytes(totalBytes)} 가 들어 있습니다.`)
  out.push('')
  out.push('## 어디에 있나')
  out.push('')
  out.push('| 항목 | 값 |')
  out.push('|---|---|')
  out.push('| AWS 계정 | 965522962451 |')
  out.push('| 리전 | us-east-1 (버지니아) |')
  out.push('| S3 버킷 | `biblo-paper-data-warehouse` |')
  out.push('| Glue 데이터베이스 | `biblo_warehouse` |')
  out.push('| Athena 작업그룹 | `biblo-warehouse-etl` |')
  out.push('')
  out.push('Athena 콘솔에서 작업그룹을 `biblo-warehouse-etl` 로 바꾸고 데이터베이스를')
  out.push('`biblo_warehouse` 로 고르면 아래 표가 그대로 보입니다.')
  out.push('')
  out.push('```sql')
  out.push('SELECT work_id, title, publication_year, doi')
  out.push('FROM biblo_warehouse.oa_work_core')
  out.push('WHERE publication_year = 2025')
  out.push('LIMIT 10;')
  out.push('```')
  out.push('')
  out.push('## 무엇이 들어 있나')
  out.push('')
  for (const [group, rows] of bySnapshot) {
    out.push(`### ${group}`)
    out.push('')
    out.push('| 표 | 내용 | 행 | 용량 |')
    out.push('|---|---|---:|---:|')
    for (const d of rows) {
      out.push(`| \`${d.table_name}\` | ${d.label ?? ''} | ${formatRows(d.row_count)} | ${formatBytes(d.bytes)} |`)
    }
    out.push('')
  }
  out.push('## 스키마')
  out.push('')
  for (const d of live) {
    out.push(`### \`${d.table_name}\`${d.label ? ` — ${d.label}` : ''}`)
    out.push('')
    if (!d.columns?.length) {
      out.push('열 정보를 아직 못 읽었습니다.')
      out.push('')
      continue
    }
    out.push('| 열 | 타입 |')
    out.push('|---|---|')
    for (const c of d.columns) out.push(`| \`${c.name}\` | ${c.type} |`)
    out.push('')
  }
  out.push('## 쓸 때 알아야 할 것')
  out.push('')
  out.push('- **컬럼 추가는 예고 없이 일어납니다. 이름 변경과 삭제는 미리 알립니다.**')
  out.push('  `SELECT *` 대신 쓸 열을 적으면 갱신에 덜 흔들립니다.')
  out.push('- 갱신은 새 스냅샷 파티션에 쓰고, 검증을 통과한 뒤에 최신을 가리킵니다.')
  out.push('  직전 스냅샷은 항상 남습니다.')
  out.push('- **OpenAlex 를 국문 논문 소스로 쓸 수 없습니다.** 2022년 이후 국문 유입이 멈췄습니다')
  out.push('  (한국어 논문 수록 2020년 91,326건 → 2022년 2,400건). 국문은 KCI 쪽을 기다려 주세요.')
  out.push('- **한국 논문을 `country_code = \'KR\'` 로 뽑으면 3분의 1을 놓칩니다.** 국가 코드가 없는 행이')
  out.push('  33.4% 입니다. ISSN 으로 조인하세요.')
  out.push('- 저자 이름은 표기가 논문마다 다릅니다. `oa_author_raw_name` 에 원문 표기가 따로 있습니다.')
  out.push('- 쿼리 비용은 스캔한 양으로 매겨집니다. 파티션·열을 좁히면 그만큼 싸집니다.')
  out.push('  `count(*)` 는 메타만 읽어 사실상 공짜입니다.')
  out.push('')
  out.push('## 출처와 라이선스')
  out.push('')
  out.push('- OpenAlex — CC0. 출처 표시 의무가 없고 상업적 이용·재판매가 자유롭습니다.')
  out.push('- KCI(예정) — 공공누리 제1유형. 출처를 표시하면 상업적 이용이 가능합니다.')
  out.push('')
  out.push('## 우리가 보장하는 것')
  out.push('')
  out.push('원본의 정확성, 최신성, 스키마 안정성 셋입니다.')
  out.push('파생 데이터와 서비스 DB 는 소비 팀의 몫입니다.')
  out.push('')
  return out.join('\n')
}

export async function GET(request: Request) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied
  try {
    const supabase = getServiceSupabase()
    const [dataRes, metaRes] = await Promise.all([
      supabase.from('paper_warehouse_datasets').select('*')
        .order('source', { ascending: true })
        .order('table_name', { ascending: true }),
      supabase.from('paper_warehouse_meta').select('value').eq('key', 'last_sync').maybeSingle(),
    ])
    if (dataRes.error) throw dataRes.error
    if (metaRes.error) throw metaRes.error

    const body = guide(
      (dataRes.data ?? []) as PaperDataset[],
      (metaRes.data?.value ?? null) as PaperSyncMeta | null,
    )
    const today = new Date().toISOString().slice(0, 10)
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="paper-warehouse-guide-${today}.md"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('paper warehouse guide:', error)
    return NextResponse.json({ error: 'Failed to build guide' }, { status: 500 })
  }
}
