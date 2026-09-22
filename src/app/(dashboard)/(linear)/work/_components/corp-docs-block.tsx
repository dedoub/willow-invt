'use client'

import { useCallback, useEffect, useState } from 'react'
import { t } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LNotice } from '@/app/(dashboard)/_components/linear-notice'
import { Bone } from '@/app/(dashboard)/_components/linear-skeleton'
import { DocumentsBlock } from './documents-block'
import { DocumentDialog } from './document-dialog'
import { type CorpCompany, type CorpDocument } from '@/types/willow-corp'

interface Props {
  /** 한 회사만 볼 때. 안 주면 두 회사를 한 목록으로 합친다(문서함). */
  company?: CorpCompany
  /** 페이지가 이미 문서를 들고 있으면 넘긴다. 없으면 이 블록이 직접 불러온다. */
  documents?: CorpDocument[]
  loading?: boolean
  error?: string | null
  style?: React.CSSProperties
}

/**
 * 법인서류함 섹션 — /corp의 문서 표·상세 다이얼로그를 그대로 쓴다.
 * 쓰기는 CLI(npm run corp)만 하므로 여기서는 열람만 한다. 상단 통계는 /corp 전용이라 넣지 않는다.
 *
 * company 를 안 주면 윌로우·텐소를 한 목록으로 합쳐 보여 준다. 문서함(/work)이 그렇게 쓴다 —
 * 회사를 고르는 칸이 없어 텐소 문서 96건을 아예 볼 수 없었다(2026-09-22 CEO). 어느 회사 것인지는
 * 문서번호가 이미 말한다(WI- / TS-).
 *
 * 정렬은 여기서 한 번 더 한다. API 가 최근활동순으로 주기로 되어 있지만 그 코드가 배포되기
 * 전이었고, 두 회사를 합치면 어차피 다시 세워야 한다.
 */
/** 최근 활동(문서 생성 또는 마지막 버전) 순. 날인본이 붙으면 그 문서가 위로 온다. */
function byLatestActivity(documents: CorpDocument[]): CorpDocument[] {
  const at = (d: CorpDocument) => Math.max(
    Date.parse(d.created_at),
    ...(d.versions ?? []).map(v => Date.parse(v.created_at)),
  )
  return [...documents].sort((a, b) => at(b) - at(a))
}

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
    const targets: CorpCompany[] = company ? [company] : ['willow', 'tensw']
    Promise.all(targets.map(c =>
      fetch(`/api/willow-corp/documents?company=${c}`, { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then(json => (json.documents ?? []) as CorpDocument[]),
    ))
      .then(lists => { if (!cancelled) setOwn(byLatestActivity(lists.flat())) })
      .catch(() => { if (!cancelled) setOwnError('법인서류함을 불러오지 못했습니다. 새로고침으로 다시 시도해 주세요.') })
      .finally(() => { if (!cancelled) setOwnLoading(false) })
    return () => { cancelled = true }
  }, [company, selfLoad])

  const documents = given ?? own
  const loading = selfLoad ? ownLoading : !!givenLoading
  const error = selfLoad ? ownError : (givenError ?? null)

  return (
    <LCard style={style}>
      <LSectionHead title="공식문서" mb={t.density.panelPadY + t.density.panelPadX} />
      {error && <div style={{ marginBottom: t.density.gapMd }}><LNotice tone="danger" text={error} /></div>}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.kpiGap }}>
          {Array.from({ length: 5 }, (_, i) => <Bone key={i} h={26} />)}
        </div>
      ) : (
        <DocumentsBlock documents={documents} onSelect={setSelected} />
      )}
      {/* 두 회사를 합쳐 놓으면 상세는 그 문서의 회사로 열어야 한다. 카드에 고정된 회사로 열면
          텐소 문서를 윌로우 경로로 읽어 파일이 안 열린다. */}
      <DocumentDialog company={selected?.company ?? company ?? 'willow'} document={selected} onClose={close} />
    </LCard>
  )
}
