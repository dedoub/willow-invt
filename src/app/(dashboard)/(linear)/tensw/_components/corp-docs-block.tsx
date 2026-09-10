'use client'

import { t } from '@/app/(dashboard)/_components/linear-tokens'

import { useCallback, useState } from 'react'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead, LHeadBtn } from '@/app/(dashboard)/_components/linear-section-head'
import { LNotice } from '@/app/(dashboard)/_components/linear-notice'
import { Bone } from '@/app/(dashboard)/_components/linear-skeleton'
import { DocumentsBlock } from '@/app/(dashboard)/(linear)/corp/_components/documents-block'
import { DocumentDialog } from '@/app/(dashboard)/(linear)/corp/_components/document-dialog'
import type { CorpDocument } from '@/types/willow-corp'

interface Props {
  documents: CorpDocument[]
  loading: boolean
  error: string | null
}

// 텐소프트웍스 법인서류함 — /corp의 문서 표·상세 다이얼로그를 그대로 쓰되 회사를 tensw로 고정한다.
// 쓰기는 CLI(npm run corp)만 하므로 여기서는 열람만 한다.
export function TenswCorpDocsBlock({ documents, loading, error }: Props) {
  const [selected, setSelected] = useState<CorpDocument | null>(null)
  const close = useCallback(() => setSelected(null), [])

  return (
    <LCard>
      <LSectionHead
        eyebrow="CORPORATE RECORDS"
        title="법인서류함"
        meta={loading ? undefined : `${documents.length}건`}
        note="텐소프트웍스의 계약·등기·결의 원본. 확정본은 수정되지 않고 버전으로만 쌓입니다."
        action={<LHeadBtn icon="chevronRight" title="전체 법인서류함" href="/corp" />}
        mb={10}
      />
      {error && <div style={{ marginBottom: t.density.gapMd }}><LNotice tone="danger" text={error} /></div>}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.kpiGap }}>
          {Array.from({ length: 5 }, (_, i) => <Bone key={i} h={26} />)}
        </div>
      ) : (
        <DocumentsBlock documents={documents} onSelect={setSelected} />
      )}
      <DocumentDialog company="tensw" document={selected} onClose={close} />
    </LCard>
  )
}
