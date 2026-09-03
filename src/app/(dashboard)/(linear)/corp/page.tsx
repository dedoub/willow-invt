'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAgentRefresh } from '@/hooks/use-agent-refresh'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'
import { LSegmented } from '@/app/(dashboard)/_components/linear-segmented'
import { LNotice } from '@/app/(dashboard)/_components/linear-notice'
import { CorpSkeleton } from '@/app/(dashboard)/_components/linear-skeleton'
import {
  CORP_COMPANY_LABEL, type CorpAction, type CorpCompany, type CorpDocument, type CorpRule,
} from '@/types/willow-corp'
import { DocumentsBlock } from './_components/documents-block'
import { RulesBlock } from './_components/rules-block'
import { ActionsBlock } from './_components/actions-block'
import { DocumentDialog } from './_components/document-dialog'
import { RuleDialog } from './_components/rule-dialog'
import { expiryState, todayYmd } from './_components/corp-format'

type Mode = 'documents' | 'rules' | 'actions'

const COMPANY_KEY = 'corp-company'
const COMPANY_OPTIONS = [
  { value: 'willow', label: '윌로우' },
  { value: 'tensw', label: '텐소' },
] as const
const MODE_OPTIONS = [
  { value: 'documents', label: '문서' },
  { value: 'rules', label: '규정' },
  { value: 'actions', label: '요청' },
] as const

function storedCompany(): CorpCompany {
  if (typeof window === 'undefined') return 'willow'
  return localStorage.getItem(COMPANY_KEY) === 'tensw' ? 'tensw' : 'willow'
}

export default function CorpPage() {
  const mobile = useIsMobile()
  const [company, setCompany] = useState<CorpCompany>(storedCompany)
  const [mode, setMode] = useState<Mode>('documents')
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [documents, setDocuments] = useState<CorpDocument[]>([])
  const [rules, setRules] = useState<CorpRule[]>([])
  const [actions, setActions] = useState<CorpAction[]>([])
  const [selectedDoc, setSelectedDoc] = useState<CorpDocument | null>(null)
  const [selectedRule, setSelectedRule] = useState<CorpRule | null>(null)

  const loadData = useCallback(async () => {
    setLoadError(null)
    try {
      const q = `company=${company}`
      const [docRes, ruleRes, actRes] = await Promise.all([
        fetch(`/api/willow-corp/documents?${q}`),
        fetch(`/api/willow-corp/rules?${q}`),
        fetch(`/api/willow-corp/actions?${q}&status=all`),
      ])
      if (!docRes.ok || !ruleRes.ok || !actRes.ok) throw new Error('load failed')
      const [docJson, ruleJson, actJson] = await Promise.all([docRes.json(), ruleRes.json(), actRes.json()])
      setDocuments(docJson.documents ?? [])
      setRules(ruleJson.rules ?? [])
      setActions(actJson.actions ?? [])
    } catch {
      setLoadError('서류함을 불러오지 못했습니다. 새로고침으로 다시 시도해 주세요.')
    } finally {
      setLoaded(true)
    }
  }, [company])

  useEffect(() => { loadData() }, [loadData])
  useAgentRefresh(['willow_corp'], loadData)

  const changeCompany = (c: CorpCompany) => {
    setCompany(c)
    setSelectedDoc(null)
    setSelectedRule(null)
    localStorage.setItem(COMPANY_KEY, c)
  }

  const stats = useMemo(() => {
    const today = todayYmd()
    const finalVersions = documents.reduce((n, d) => n + d.versions.filter(v => v.kind !== 'draft').length, 0)
    const pending = actions.filter(a => a.status === 'pending')
    const overdue = pending.filter(a => a.due_at !== null && a.due_at < today).length
    const expiring = documents.filter(d => expiryState(d, today) !== null).length
    const articles = rules.find(r => r.rule_type === 'articles' && r.effective_to === null)
    return { finalVersions, pending: pending.length, overdue, expiring, articlesFrom: articles?.effective_from ?? null, articlesVersion: articles?.version_no ?? null }
  }, [documents, actions, rules])

  const closeDoc = useCallback(() => setSelectedDoc(null), [])
  const closeRule = useCallback(() => setSelectedRule(null), [])

  if (!loaded) return <CorpSkeleton />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.blockGap }}>
      <LCard>
        <LSectionHead
          eyebrow="CORPORATE RECORDS"
          title="법인 서류함"
          note={`${CORP_COMPANY_LABEL[company]}의 정관·등기·계약·결의 원본. 확정본은 수정되지 않고 버전으로만 쌓입니다.`}
          tools={<LSegmented options={COMPANY_OPTIONS} value={company} onChange={changeCompany} />}
        />
        {loadError && <div style={{ marginBottom: 10 }}><LNotice tone="danger" text={loadError} /></div>}
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: t.density.kpiGap }}>
          <LStat label="문서" value={String(documents.length)} unit="건" sub={`확정 버전 ${stats.finalVersions}개`} />
          <LStat label="대기 요청" value={String(stats.pending)} unit="건" sub={stats.overdue ? `기한 지남 ${stats.overdue}건` : '기한 내'} tone={stats.overdue ? 'neg' : stats.pending ? 'warn' : 'default'} />
          <LStat label="만료·임박" value={String(stats.expiring)} unit="건" sub="유효기간 30일 이내" tone={stats.expiring ? 'warn' : 'default'} />
          <LStat label="현행 정관" value={stats.articlesVersion ? `v${stats.articlesVersion}` : '-'} sub={stats.articlesFrom ? `${stats.articlesFrom} 시행` : '미등록'} />
        </div>
      </LCard>

      <LCard>
        <LSectionHead
          title={mode === 'documents' ? '문서' : mode === 'rules' ? '정관·규정' : '요청'}
          meta={mode === 'documents' ? `${documents.length}건` : mode === 'rules' ? `${rules.length}개 버전` : `${stats.pending}건 대기`}
          tools={<LSegmented options={MODE_OPTIONS} value={mode} onChange={setMode} />}
          mb={10}
        />
        {mode === 'documents' && <DocumentsBlock documents={documents} onSelect={setSelectedDoc} />}
        {mode === 'rules' && <RulesBlock rules={rules} onSelect={setSelectedRule} />}
        {mode === 'actions' && <ActionsBlock actions={actions} documents={documents} onSelectDocument={setSelectedDoc} />}
      </LCard>

      <DocumentDialog company={company} document={selectedDoc} onClose={closeDoc} />
      <RuleDialog rule={selectedRule} onClose={closeRule} />
    </div>
  )
}
