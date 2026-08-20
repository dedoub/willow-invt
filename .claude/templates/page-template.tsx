/**
 * Linear dashboard page template
 *
 * 신규 `src/app/(dashboard)/(linear)` 화면은 이 템플릿을 기본으로 사용한다.
 * 레거시 shadcn 화면은 개별 컴포넌트 템플릿을 참고하되, 새 linear 화면에 확산하지 않는다.
 */

'use client'

import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { LSegmented } from '@/app/(dashboard)/_components/linear-segmented'
import { LTableBody, LTableEmpty, LTableHead, LTableRow, type LColumn } from '@/app/(dashboard)/_components/linear-table'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { useState } from 'react'

type Mode = 'overview' | 'alerts'

interface Row {
  id: string
  name: string
  status: string
  count: number
}

const columns: LColumn<Row>[] = [
  { key: 'name', label: '이름', width: 'minmax(140px,1fr)' },
  { key: 'status', label: '상태', width: '72px' },
  { key: 'count', label: '개수', width: '56px', align: 'right' },
]

export default function PageName() {
  const mobile = useIsMobile()
  const [mode, setMode] = useState<Mode>('overview')
  const rows: Row[] = []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <LCard>
        <LSectionHead
          title="페이지 제목"
          meta="KST 기준"
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <LSegmented
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'overview', label: '요약' },
                  { value: 'alerts', label: '알림' },
                ]}
              />
              <LBtn size="sm" icon={<LIcon name="refresh" size={13} stroke={1.8} />}>
                새로고침
              </LBtn>
            </div>
          }
        />

        <div style={{
          display: 'grid',
          gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
          gap: 8,
        }}>
          <LStat label="ACTIVE" value="0" sub="현재 활성" tone="info" />
          <LStat label="PENDING" value="0" sub="확인 필요" tone="warn" />
          <LStat label="DONE" value="0" sub="완료" tone="pos" />
          <LStat label="FAILED" value="0" sub="실패" tone="neg" />
        </div>
      </LCard>

      <LCard>
        <LSectionHead title="운영 목록" />
        <LTableHead columns={columns} mobile={mobile} />
        <LTableBody columns={columns} mobile={mobile}>
          {rows.length === 0 ? (
            <LTableEmpty>데이터가 없습니다</LTableEmpty>
          ) : rows.map(row => (
            <LTableRow key={row.id} columns={columns} mobile={mobile}>
              <span style={{ color: t.neutrals.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.name}
              </span>
              <span style={{ color: t.neutrals.muted }}>{row.status}</span>
              <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {row.count.toLocaleString()}
              </span>
            </LTableRow>
          ))}
        </LTableBody>
      </LCard>
    </div>
  )
}
