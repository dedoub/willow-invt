'use client'

import { useEffect, useState } from 'react'
import { t, tonePalettes } from '@/app/(dashboard)/_components/linear-tokens'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LTableBadge } from '@/app/(dashboard)/_components/linear-table'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { FigureGrid, type FigureItem } from '@/app/(dashboard)/(linear)/mgmt/_components/figure-grid'
import {
  CORP_DOC_TYPE_LABEL, CORP_VERSION_KIND_LABEL, type CorpCompany, type CorpDocument, type CorpEvent,
} from '@/types/willow-corp'
import { docStatusTone, expiryState, formatBytes, formatDateTime, versionTone } from '@/app/(dashboard)/(linear)/corp/_components/corp-format'

interface Props {
  company: CorpCompany
  document: CorpDocument | null
  onClose: () => void
}

const EVENT_LABEL: Record<string, string> = {
  created: '문서 생성',
  version_added: '버전 추가',
  finalized: '확정',
  superseded: '대체됨',
  void: '무효',
}

export function DocumentDialog({ company, document: doc, onClose }: Props) {
  const [events, setEvents] = useState<CorpEvent[] | null>(null)
  const [opening, setOpening] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!doc) return
    let cancelled = false
    setEvents(null)
    setError(null)
    fetch(`/api/willow-corp/events?company=${company}&entity_type=document&entity_id=${encodeURIComponent(doc.doc_no)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(json => { if (!cancelled) setEvents([...(json.events as CorpEvent[])].sort((a, b) => a.id - b.id)) })
      .catch(() => { if (!cancelled) setEvents([]) })
    return () => { cancelled = true }
  }, [doc, company])

  useEffect(() => {
    if (!doc) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doc, onClose])

  if (!doc) return null

  const openVersion = async (versionNo: number) => {
    setOpening(versionNo)
    setError(null)
    try {
      const res = await fetch(`/api/willow-corp/documents/${encodeURIComponent(doc.doc_no)}/url?version=${versionNo}`)
      if (!res.ok) throw new Error(String(res.status))
      const { url } = await res.json()
      window.open(url, '_blank', 'noopener')
    } catch {
      setError('문서를 여는 데 실패했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setOpening(null)
    }
  }

  const expiry = expiryState(doc)
  const end = doc.valid_to ?? doc.contract_end

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: t.density.pagePadX }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,15,18,0.18)', backdropFilter: 'blur(3px)' }} />
      {/* 껍데기·머리·항목 격자는 사업관리 상세와 같은 문법. 높이는 내용이 정한다(2026-09-11) */}
      <LCard pad={0} style={{
        position: 'relative', width: 'min(560px, calc(100vw - 24px))', maxHeight: '85vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* 닫기는 다른 상세 모달과 같은 자리 — 카드 모서리에서 10px(2026-09-11) */}
        <button onClick={onClose} aria-label="닫기" title="닫기" style={{
          position: 'absolute', top: 10, right: 10, zIndex: 2,
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: t.density.gapXs, borderRadius: t.radius.sm, color: t.neutrals.muted, display: 'flex',
        }}>
          <LIcon name="x" size={14} stroke={2} />
        </button>

        <div style={{ padding: `${t.density.cardPad}px 32px ${t.density.panelPadY}px ${t.density.cardPad}px` }}>
          <LSectionHead title={doc.title} mb={0} />
        </div>

        <div style={{ padding: `0 ${t.density.cardPad}px ${t.density.gapSm}px`, display: 'flex', gap: t.density.gapSm, flexWrap: 'wrap' }}>
          <LTableBadge tone={docStatusTone(doc.status)}>{CORP_DOC_TYPE_LABEL[doc.doc_type] ?? doc.doc_type}</LTableBadge>
          <LTableBadge tone={doc.status === 'final' ? tonePalettes.done : tonePalettes.pending}>{doc.status === 'final' ? '확정' : '초안'}</LTableBadge>
          {expiry && <LTableBadge tone={expiry === 'expired' ? tonePalettes.danger : tonePalettes.warn}>{expiry === 'expired' ? '유효기간 만료' : '만료 임박'}</LTableBadge>}
          {doc.tags.filter(tag => !tag.startsWith('wiki:')).map(tag => (
            <LTableBadge key={tag} tone={tonePalettes.neutral}>{tag}</LTableBadge>
          ))}
        </div>

        <div style={{ padding: `0 ${t.density.cardPad}px ${t.density.cardPad}px`, display: 'flex', flexDirection: 'column', gap: t.density.gapMd, overflowY: 'auto', minHeight: 0 }}>
          <FigureGrid cols={2} items={[
            { label: '문서번호', value: doc.doc_no, mono: true },
            { label: '발급·체결', value: doc.issued_at ?? '-', mono: true },
            { label: '발급기관·상대방', value: doc.issued_by ?? doc.counterparty ?? '-', wrap: true },
            { label: '유효·종료', value: end ?? '-', mono: true },
            ...(doc.contract_start ? [{ label: '계약기간', value: `${doc.contract_start} ~ ${doc.contract_end ?? ''}`, mono: true, span: 2 } as FigureItem] : []),
          ]} />

          <Section title={`버전 ${doc.versions.length}개`}>
            {doc.versions.length === 0 && (
              <div style={{ fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, color: t.neutrals.subtle, padding: `${t.density.gapSm}px 0` }}>
                파일이 아직 없습니다. 원본을 받으면 첫 버전으로 등록됩니다.
              </div>
            )}
            {doc.versions.map(v => (
              <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: t.density.kpiGap, padding: `${t.density.gapSm}px 0`, borderTop: `1px solid ${t.neutrals.line}` }}>
                <span style={{ fontFamily: t.font.mono, fontSize: `calc(${t.type.control}px * var(--fz, 1))`, width: 26, color: t.neutrals.muted }}>v{v.version_no}</span>
                <LTableBadge tone={versionTone(v.kind)}>{CORP_VERSION_KIND_LABEL[v.kind]}</LTableBadge>
                <span style={{ flex: 1, minWidth: 0, fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, color: t.neutrals.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={v.note ?? undefined}>
                  {v.note ?? mimeLabel(v.mime)} · {formatBytes(v.size_bytes)}
                </span>
                <LBtn variant="secondary" size="xs" onClick={() => openVersion(v.version_no)} disabled={opening !== null}>
                  {opening === v.version_no ? '여는 중' : '열기'}
                </LBtn>
              </div>
            ))}
            {error && <div style={{ fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, color: t.accent.neg, paddingTop: t.density.gapSm }}>{error}</div>}
          </Section>

          <Section title="기록">
            {events === null && <div style={{ fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, color: t.neutrals.subtle }}>불러오는 중</div>}
            {events && events.length === 0 && <div style={{ fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, color: t.neutrals.subtle }}>기록이 없습니다</div>}
            {events?.map(ev => (
              <div key={ev.id} style={{ display: 'flex', gap: t.density.gapMd, padding: `${t.density.gapSm}px 0`, borderTop: `1px solid ${t.neutrals.line}`, fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))` }}>
                <span style={{ fontFamily: t.font.mono, color: t.neutrals.subtle, whiteSpace: 'nowrap' }}>{formatDateTime(ev.at)}</span>
                <span style={{ color: t.neutrals.text, fontWeight: t.weight.medium }}>{EVENT_LABEL[ev.event] ?? ev.event}</span>
                <span style={{ color: t.neutrals.muted, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {eventDetail(ev)}
                </span>
              </div>
            ))}
          </Section>
        </div>
      </LCard>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: `calc(${t.type.label}px * var(--fz, 1))`, color: t.neutrals.subtle, marginBottom: t.density.tableRowGap }}>{label}</div>
      <div style={{ fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, color: t.neutrals.text, fontFamily: /^\d{4}-/.test(value) ? t.font.mono : t.font.sans, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: `calc(${t.type.label}px * var(--fz, 1))`, color: t.neutrals.subtle, marginBottom: t.density.gapSm }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function mimeLabel(mime: string): string {
  if (mime === 'application/pdf') return 'PDF'
  if (mime.startsWith('image/')) return '이미지'
  if (mime.includes('wordprocessingml')) return 'DOCX'
  return mime
}

function eventDetail(ev: CorpEvent): string {
  const p = ev.payload
  if (ev.event === 'version_added') return `v${p.version_no} ${String(p.kind ?? '')} ${String(p.sha256 ?? '').slice(0, 8)}`
  if (ev.event === 'created') return String(p.title ?? '')
  return Object.keys(p).length ? JSON.stringify(p) : ''
}
