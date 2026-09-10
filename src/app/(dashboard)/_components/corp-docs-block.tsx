'use client'

import { useCallback, useEffect, useState } from 'react'
import { t } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead, LHeadBtn } from '@/app/(dashboard)/_components/linear-section-head'
import { LNotice } from '@/app/(dashboard)/_components/linear-notice'
import { Bone } from '@/app/(dashboard)/_components/linear-skeleton'
import { DocumentsBlock } from '@/app/(dashboard)/(linear)/corp/_components/documents-block'
import { DocumentDialog } from '@/app/(dashboard)/(linear)/corp/_components/document-dialog'
import { CORP_COMPANY_LABEL, type CorpCompany, type CorpDocument } from '@/types/willow-corp'

interface Props {
  company: CorpCompany
  /** 페이지가 이미 문서를 들고 있으면 넘긴다. 없으면 이 블록이 직접 불러온다. */
  documents?: CorpDocument[]
  loading?: boolean
  error?: string | null
  style?: React.CSSProperties
}

/**
 * 회사별 법인서류함 섹션 — /corp의 문서 표·상세 다이얼로그를 그대로 쓰고 회사만 고정한다.
 * 쓰기는 CLI(npm run corp)만 하므로 여기서는 열람만 한다. 상단 통계는 /corp 전용이라 넣지 않는다.
 */
export function CorpDocsBlock({ company, documents: given, loading: givenLoading, error: givenError, style }: Props) {
  const [selected, setSelected] = useState<CorpDocument | null>(null)
  const close = useCallback(() => setSelected(null), [])

  // 자체 로딩 — documents를 안 넘긴 페이지(윌로우 사업관리)에서 쓴다.
  const [own, setOwn] = useState<CorpDocument[]>([])
  const [ownLoading, setOwnLoading] = useState(given === undefined)
  const [ownError, setOwnError] = useState<string | null>(null)
  const selfLoad = given === undefined

  useEffect(() => {
    if (!selfLoad) return
    let cancelled = false
    setOwnLoading(true)
    setOwnError(null)
    fetch(`/api/willow-corp/documents?company=${company}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(json => { if (!cancelled) setOwn(json.documents ?? []) })
      .catch(() => { if (!cancelled) setOwnError('법인서류함을 불러오지 못했습니다. 새로고침으로 다시 시도해 주세요.') })
      .finally(() => { if (!cancelled) setOwnLoading(false) })
    return () => { cancelled = true }
  }, [company, selfLoad])

  const documents = given ?? own
  const loading = selfLoad ? ownLoading : !!givenLoading
  const error = selfLoad ? ownError : (givenError ?? null)

  return (
    <LCard style={style}>
      <LSectionHead
        eyebrow="CORPORATE RECORDS"
        title="법인서류함"
        action={<LHeadBtn icon="chevronRight" title="전체 법인서류함" href="/corp" />}
        mb={10}
      />
      {error && <div style={{ marginBottom: t.density.gapMd }}><LNotice tone="danger" text={error} /></div>}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.kpiGap }}>
          {Array.from({ length: 5 }, (_, i) => <Bone key={i} h={26} />)}
        </div>
      ) : (
        <DocumentsBlock
          documents={documents}
          onSelect={setSelected}
          footerNote={`${CORP_COMPANY_LABEL[company]} 계약·등기·결의 원본 · 확정본은 버전으로 보존`}
        />
      )}
      <DocumentDialog company={company} document={selected} onClose={close} />
    </LCard>
  )
}
