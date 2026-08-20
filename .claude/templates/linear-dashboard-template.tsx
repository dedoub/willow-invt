/**
 * Linear dashboard component snippets
 *
 * 현재 공식 시스템:
 * - tokens: `linear-tokens.ts`
 * - blocks: `LCard`, `LSectionHead`
 * - metrics: `LStat`
 * - actions: `LBtn`
 * - filters: `LSegmented`, `LFilterChip`
 * - tables: `DataTable` or `LTable*`
 * - loading: `Bone`
 */

'use client'

import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LBadge } from '@/app/(dashboard)/_components/linear-badge'
import { LFilterChip } from '@/app/(dashboard)/_components/linear-filter-chip'
import { LSegmented } from '@/app/(dashboard)/_components/linear-segmented'
import { Bone } from '@/app/(dashboard)/_components/linear-skeleton'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import {
  LTableBody,
  LTableEmpty,
  LTableHead,
  LTableRow,
  type LColumn,
} from '@/app/(dashboard)/_components/linear-table'
import { useState } from 'react'

export function LinearBlockTemplate() {
  return (
    <LCard>
      <LSectionHead
        title="섹션 제목"
        meta="보조 정보"
        action={<LBtn size="sm" icon={<LIcon name="plus" size={13} />}>추가</LBtn>}
      />
      <div style={{ background: t.neutrals.inner, borderRadius: t.radius.sm, padding: '8px 10px' }}>
        콘텐츠
      </div>
    </LCard>
  )
}

export function LinearKpiGridTemplate() {
  const mobile = useIsMobile()
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
      gap: 8,
    }}>
      <LStat label="ACTIVE" value="1,234" sub="최근 7일" tone="info" />
      <LStat label="GROWTH" value="+12.4%" sub="전주 대비" tone="pos" sparkline={[3, 4, 5, 4, 7, 8]} />
      <LStat label="WARN" value="3" sub="확인 필요" tone="warn" />
      <LStat label="FAILED" value="1" sub="실패" tone="neg" />
    </div>
  )
}

type Mode = 'all' | 'active' | 'closed'
type Tag = 'all' | 'product' | 'ops'

export function LinearFiltersTemplate() {
  const [mode, setMode] = useState<Mode>('all')
  const [tag, setTag] = useState<Tag>('all')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <LSegmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'all', label: '전체' },
          { value: 'active', label: '활성' },
          { value: 'closed', label: '종료' },
        ]}
      />
      <LFilterChip
        value={tag}
        onChange={setTag}
        options={[
          { value: 'all', label: '전체' },
          { value: 'product', label: '제품', tone: { bg: t.brand[100], fg: t.brand[700] } },
          { value: 'ops', label: '운영' },
        ]}
      />
    </div>
  )
}

interface TableItem {
  id: string
  name: string
  status: '대기' | '진행' | '완료'
  amount: number
}

const tableColumns: LColumn<TableItem>[] = [
  { key: 'name', label: '이름', width: 'minmax(160px,1fr)' },
  { key: 'status', label: '상태', width: '64px' },
  { key: 'amount', label: '금액', width: '72px', align: 'right' },
]

export function LinearTableTemplate({ rows }: { rows: TableItem[] }) {
  const mobile = useIsMobile()
  return (
    <LCard>
      <LSectionHead title="목록" />
      <LTableHead columns={tableColumns} mobile={mobile} />
      <LTableBody columns={tableColumns} mobile={mobile}>
        {rows.length === 0 ? (
          <LTableEmpty>데이터가 없습니다</LTableEmpty>
        ) : rows.map(row => (
          <LTableRow key={row.id} columns={tableColumns} mobile={mobile}>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {row.name}
            </span>
            <LBadge tone={row.status === '완료' ? 'done' : row.status === '진행' ? 'progress' : 'pending'}>
              {row.status}
            </LBadge>
            <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {row.amount.toLocaleString()}
            </span>
          </LTableRow>
        ))}
      </LTableBody>
    </LCard>
  )
}

export function LinearSkeletonTemplate() {
  return (
    <LCard>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Bone w={80} h={8} />
        <Bone w={140} h={14} />
        <Bone h={52} />
        <Bone h={52} />
      </div>
    </LCard>
  )
}
