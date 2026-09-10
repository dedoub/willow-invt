'use client'

import { CorpDocsBlock } from '@/app/(dashboard)/(linear)/work/_components/corp-docs-block'
import type { CorpDocument } from '@/types/willow-corp'

interface Props {
  documents: CorpDocument[]
  loading: boolean
  error: string | null
}

/** 텐소프트웍스 법인서류함 — 공용 CorpDocsBlock에 회사만 고정한다(문서는 페이지가 이미 불러온다). */
export function TenswCorpDocsBlock({ documents, loading, error }: Props) {
  return <CorpDocsBlock company="tensw" documents={documents} loading={loading} error={error} />
}
