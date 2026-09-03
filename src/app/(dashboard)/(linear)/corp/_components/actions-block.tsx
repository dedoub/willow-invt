'use client'

import { useMemo, useState } from 'react'
import { t, tonePalettes, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LSegmented } from '@/app/(dashboard)/_components/linear-segmented'
import {
  LTableBadge, LTableBody, LTableDate, LTableEmpty, LTableHead, LTableRow, LTableScroll, type LColumn,
} from '@/app/(dashboard)/_components/linear-table'
import { CORP_ACTION_KIND_LABEL, type CorpAction, type CorpDocument } from '@/types/willow-corp'
import { todayYmd } from './corp-format'

const COLUMNS: LColumn<CorpAction>[] = [
  { key: 'due', label: '기한', width: '82px' },
  { key: 'kind', label: '종류', width: '60px' },
  { key: 'desc', label: '요청 내용', width: 'minmax(220px,1fr)' },
  { key: 'doc', label: '문서', width: '118px', hideMobile: true },
  { key: 'status', label: '상태', width: '60px' },
]

type StatusFilter = 'pending' | 'done' | 'all'

interface Props {
  actions: CorpAction[]
  documents: CorpDocument[]
  onSelectDocument: (doc: CorpDocument) => void
}

const KIND_TONE = { confirm: tonePalettes.info, sign: tonePalettes.warn, provide: tonePalettes.pending } as const

export function ActionsBlock({ actions, documents, onSelectDocument }: Props) {
  const mobile = useIsMobile()
  const [status, setStatus] = useState<StatusFilter>('pending')
  const today = todayYmd()
  const docById = useMemo(() => new Map(documents.map(d => [d.id, d])), [documents])

  const shown = useMemo(() => {
    const list = status === 'all' ? actions : actions.filter(a => a.status === status)
    return [...list].sort((a, b) => (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999'))
  }, [actions, status])

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapMd, marginBottom: 10 }}>
        <LSegmented
          value={status} onChange={setStatus}
          options={[{ value: 'pending', label: '대기' }, { value: 'done', label: '완료' }, { value: 'all', label: '전체' }]}
        />
        <span style={{ fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, color: t.neutrals.subtle }}>{shown.length}건</span>
      </div>

      <LTableScroll columns={COLUMNS} mobile={mobile}>
        <LTableHead columns={COLUMNS} mobile={mobile} />
        {shown.length === 0 && <LTableEmpty>{status === 'pending' ? '대기 중인 요청이 없습니다' : '해당 요청이 없습니다'}</LTableEmpty>}
        <LTableBody columns={COLUMNS} mobile={mobile}>
          {shown.map(action => {
            const doc = action.document_id ? docById.get(action.document_id) : undefined
            const overdue = action.status === 'pending' && action.due_at !== null && action.due_at < today
            return (
              <LTableRow key={action.id} columns={COLUMNS} mobile={mobile} onClick={doc ? () => onSelectDocument(doc) : undefined}>
                {action.due_at
                  ? <LTableDate value={action.due_at} format="ymd" tone={overdue ? 'neg' : undefined} />
                  : <span style={{ color: t.neutrals.subtle }}>-</span>}
                <LTableBadge tone={KIND_TONE[action.kind]}>{CORP_ACTION_KIND_LABEL[action.kind]}</LTableBadge>
                <span style={{ minWidth: 0, whiteSpace: mobile ? 'normal' : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={action.description}>
                  {action.description}
                </span>
                {!mobile && (
                  <span style={{ fontFamily: t.font.mono, fontSize: 'calc(10.5px * var(--fz, 1))', color: doc ? t.neutrals.muted : t.neutrals.subtle, whiteSpace: 'nowrap' }}>
                    {doc ? doc.doc_no : '-'}
                  </span>
                )}
                <LTableBadge tone={action.status === 'done' ? tonePalettes.done : action.status === 'skipped' ? tonePalettes.neutral : overdue ? tonePalettes.danger : tonePalettes.pending}>
                  {action.status === 'done' ? '완료' : action.status === 'skipped' ? '건너뜀' : overdue ? '지연' : '대기'}
                </LTableBadge>
              </LTableRow>
            )
          })}
        </LTableBody>
      </LTableScroll>
    </>
  )
}
