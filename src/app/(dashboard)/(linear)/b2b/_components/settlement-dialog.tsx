'use client'

import { useEffect, useState } from 'react'
import { t, tonePalettes } from '@/app/(dashboard)/_components/linear-tokens'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LNotice } from '@/app/(dashboard)/_components/linear-notice'
import { LTableBadge } from '@/app/(dashboard)/_components/linear-table'
import {
  B2B_COMPANY_LABEL, B2B_DIFF_LABEL, B2B_SETTLEMENT_STATUS_LABEL,
  type B2bReconciliation, type B2bSettlementDetail, type B2bWorkRecordDetail,
} from '@/types/b2b'

interface Props {
  refNo: string | null
  /** 목록에 저장된 대사 결과(라이브 재계산 아님). 상세의 "현재 대사"와 다를 때만 참고용으로 함께 보여준다. */
  storedReconciliation?: B2bReconciliation | null
  storedUpdatedAt?: string | null
  onClose: () => void
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const FEE_BASIS_LABEL: Record<string, string> = {
  fixed: '고정액', percent_of_contract: '계약금액 비율', rate_card: '단가표',
}

const EVIDENCE_KIND_LABEL: Record<string, string> = {
  todo: '할 일', comment: '코멘트', wiki: '위키', email: '이메일',
  file: '파일', commit: '커밋', meeting: '회의', doc: '문서', other: '기타',
}

export function SettlementDialog({ refNo, storedReconciliation = null, storedUpdatedAt = null, onClose }: Props) {
  const [detail, setDetail] = useState<B2bSettlementDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [openingDoc, setOpeningDoc] = useState<string | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!refNo) return
    let cancelled = false
    setDetail(null)
    setLoadError(null)
    setExpanded(new Set())
    fetch(`/api/b2b/settlements/${encodeURIComponent(refNo)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(json => { if (!cancelled) setDetail(json as B2bSettlementDetail) })
      .catch(() => { if (!cancelled) setLoadError('정산 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.') })
    return () => { cancelled = true }
  }, [refNo])

  useEffect(() => {
    if (!refNo) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [refNo, onClose])

  if (!refNo) return null

  const openDoc = async (docNo: string) => {
    setOpeningDoc(docNo)
    setOpenError(null)
    try {
      const res = await fetch(`/api/willow-corp/documents/${encodeURIComponent(docNo)}/url`)
      if (!res.ok) throw new Error(String(res.status))
      const { url } = await res.json()
      window.open(url, '_blank', 'noopener')
    } catch {
      setOpenError('문서를 여는 데 실패했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setOpeningDoc(null)
    }
  }

  const toggleWork = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const s = detail?.settlement

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,15,18,0.18)', backdropFilter: 'blur(3px)' }} />
      <div style={{
        position: 'relative', width: 'min(640px, calc(100vw - 24px))', maxHeight: '85vh',
        background: t.neutrals.card, borderRadius: t.radius.lg + 2,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px 12px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, fontWeight: 600, color: t.neutrals.subtle, letterSpacing: 0.6, marginBottom: 4 }}>
              {refNo}
            </div>
            <div style={{ fontSize: 'calc(16px * var(--fz, 1))', fontWeight: t.weight.semibold, fontFamily: t.font.sans, color: t.neutrals.text, lineHeight: 1.35 }}>
              {s?.period_label ?? refNo}
            </div>
          </div>
          <button onClick={onClose} aria-label="닫기" style={{
            width: 28, height: 28, borderRadius: t.radius.sm, flexShrink: 0,
            background: t.neutrals.inner, border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.neutrals.muted,
          }}>
            <LIcon name="x" size={14} stroke={2} />
          </button>
        </div>

        {s && (
          <div style={{ padding: '0 20px 12px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <LTableBadge tone={tonePalettes.neutral}>{B2B_COMPANY_LABEL[s.provider_company]} → {B2B_COMPANY_LABEL[s.client_company]}</LTableBadge>
            <LTableBadge tone={s.status === 'closed' ? tonePalettes.done : s.status === 'disputed' ? tonePalettes.danger : tonePalettes.pending}>
              {B2B_SETTLEMENT_STATUS_LABEL[s.status]}
            </LTableBadge>
          </div>
        )}

        <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', minHeight: 0 }}>
          {!detail && !loadError && (
            <div style={{ fontSize: 'calc(12px * var(--fz, 1))', color: t.neutrals.subtle, padding: '16px 0' }}>불러오는 중</div>
          )}
          {loadError && <LNotice tone="danger" text={loadError} />}

          {detail && s && (
            <>
              <div style={{ padding: '10px 12px', borderRadius: t.radius.md, background: t.neutrals.inner, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px 12px' }}>
                <Field label="공급가액" value={`₩${Math.round(s.supply_amount).toLocaleString()}`} />
                <Field label="세액" value={`₩${Math.round(s.vat_amount).toLocaleString()}`} />
                <Field label="합계" value={`₩${Math.round(s.total_amount).toLocaleString()}`} />
              </div>

              <Section title="기본계약·약정">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: `1px solid ${t.neutrals.line}` }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 'calc(12px * var(--fz, 1))', color: t.neutrals.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {detail.agreement.title}
                  </span>
                  <LTableBadge tone={detail.agreement.status === 'active' ? tonePalettes.done : tonePalettes.pending}>
                    {detail.agreement.status === 'active' ? '유효' : detail.agreement.status === 'draft' ? '초안' : '종료'}
                  </LTableBadge>
                  {detail.agreement.document_doc_no && (
                    <LBtn variant="secondary" size="xs" onClick={() => openDoc(detail.agreement.document_doc_no!)} disabled={openingDoc !== null}>
                      {openingDoc === detail.agreement.document_doc_no ? '여는 중' : '열기'}
                    </LBtn>
                  )}
                </div>
                {detail.engagement ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '6px 0', borderTop: `1px solid ${t.neutrals.line}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: t.font.mono, fontSize: 'calc(11px * var(--fz, 1))', color: t.neutrals.muted }}>{detail.engagement.ref_no}</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 'calc(11.5px * var(--fz, 1))', color: t.neutrals.muted }}>
                        {FEE_BASIS_LABEL[detail.engagement.fee_basis] ?? detail.engagement.fee_basis}
                        {detail.engagement.fee_amount != null && ` · ₩${Math.round(detail.engagement.fee_amount).toLocaleString()} 상한`}
                      </span>
                      {detail.engagement.document_doc_no && (
                        <LBtn variant="secondary" size="xs" onClick={() => openDoc(detail.engagement!.document_doc_no!)} disabled={openingDoc !== null}>
                          {openingDoc === detail.engagement.document_doc_no ? '여는 중' : '열기'}
                        </LBtn>
                      )}
                    </div>
                    {detail.engagement.basis_text && (
                      <div style={{ fontSize: 'calc(11.5px * var(--fz, 1))', color: t.neutrals.subtle, lineHeight: 1.5 }}>{detail.engagement.basis_text}</div>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: 'calc(11.5px * var(--fz, 1))', color: t.neutrals.subtle, padding: '6px 0', borderTop: `1px solid ${t.neutrals.line}` }}>
                    프로젝트 무관 업무 (개별 약정 없음)
                  </div>
                )}
              </Section>

              <Section title={`업무기록 ${detail.works.length}건`}>
                {detail.works.length === 0 && (
                  <div style={{ fontSize: 'calc(12px * var(--fz, 1))', color: t.neutrals.subtle, padding: '6px 0' }}>아직 업무기록이 없습니다.</div>
                )}
                {detail.works.map(w => <WorkRow key={w.id} work={w} expanded={expanded.has(w.id)} onToggle={() => toggleWork(w.id)} />)}
              </Section>

              <Section title="문서">
                <DocRow label="업무확인서" doc={detail.documents.confirmation} onOpen={openDoc} opening={openingDoc} />
                <DocRow label="정산서" doc={detail.documents.statement} onOpen={openDoc} opening={openingDoc} />
              </Section>

              <Section title="세금계산서">
                <InvoiceRow label={B2B_COMPANY_LABEL[s.provider_company]} invoice={detail.invoices.willow} />
                <InvoiceRow label={B2B_COMPANY_LABEL[s.client_company]} invoice={detail.invoices.tensw} />
              </Section>

              <Section title="입금">
                <CashRows label={B2B_COMPANY_LABEL[s.provider_company]} rows={detail.cash.willow} />
                <CashRows label={B2B_COMPANY_LABEL[s.client_company]} rows={detail.cash.tensw} />
              </Section>

              <Section title="대사 결과">
                <div style={{ fontSize: `calc(${t.type.label}px * var(--fz, 1))`, color: t.neutrals.subtle, marginBottom: 2 }}>현재 대사</div>
                {s.reconciliation == null && (
                  <div style={{ fontSize: 'calc(11.5px * var(--fz, 1))', color: t.neutrals.subtle, padding: '6px 0' }}>대사 결과가 없습니다.</div>
                )}
                {s.reconciliation && s.reconciliation.ok && (
                  <div style={{ padding: '6px 0' }}><LTableBadge tone={tonePalettes.done}>일치</LTableBadge></div>
                )}
                {s.reconciliation && !s.reconciliation.ok && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '6px 0' }}>
                    {s.reconciliation.diffs.map(code => (
                      <div key={code} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <LTableBadge tone={tonePalettes.danger}>{B2B_DIFF_LABEL[code] ?? code}</LTableBadge>
                      </div>
                    ))}
                  </div>
                )}
                {storedReconciliation != null && storedReconciliation.ok !== s.reconciliation?.ok && (
                  <div style={{ marginTop: 4, paddingTop: 8, borderTop: `1px solid ${t.neutrals.line}` }}>
                    <div style={{ fontSize: `calc(${t.type.label}px * var(--fz, 1))`, color: t.neutrals.subtle, marginBottom: 2 }}>
                      저장된 대사{storedUpdatedAt ? ` · ${formatTimestamp(storedUpdatedAt)}` : ''}
                    </div>
                    <div style={{ padding: '2px 0' }}>
                      <LTableBadge tone={storedReconciliation.ok ? tonePalettes.done : tonePalettes.danger}>
                        {storedReconciliation.ok ? '일치' : '불일치'}
                      </LTableBadge>
                    </div>
                  </div>
                )}
              </Section>

              {openError && <LNotice tone="danger" text={openError} />}
            </>
          )}
        </div>

        {s?.bundle_doc_no && (
          <div style={{ padding: '10px 20px', borderTop: `1px solid ${t.neutrals.line}`, display: 'flex', justifyContent: 'flex-end' }}>
            <LBtn variant="secondary" size="sm" onClick={() => openDoc(s.bundle_doc_no!)} disabled={openingDoc !== null}>
              {openingDoc === s.bundle_doc_no ? '여는 중' : '증빙 묶음 열기'}
            </LBtn>
          </div>
        )}
      </div>
    </div>
  )
}

function WorkRow({ work, expanded, onToggle }: { work: B2bWorkRecordDetail; expanded: boolean; onToggle: () => void }) {
  const period = work.period_from
    ? `${work.period_from}${work.period_to && work.period_to !== work.period_from ? ` ~ ${work.period_to}` : ''}`
    : '-'
  return (
    <div style={{ borderTop: `1px solid ${t.neutrals.line}` }}>
      <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer' }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 'calc(12px * var(--fz, 1))', fontWeight: 500, color: t.neutrals.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {work.title}
        </span>
        <span style={{ fontFamily: t.font.mono, fontSize: 'calc(10.5px * var(--fz, 1))', color: t.neutrals.subtle, whiteSpace: 'nowrap' }}>{period}</span>
        <span style={{ fontFamily: t.font.mono, fontSize: 'calc(11px * var(--fz, 1))', fontWeight: 500, color: t.neutrals.text, whiteSpace: 'nowrap' }}>
          {work.pricing ? `₩${Math.round(work.pricing.agreed_amount).toLocaleString()}` : '-'}
        </span>
        <LIcon name={expanded ? 'chevronDown' : 'chevronRight'} size={12} stroke={2} />
      </div>
      {expanded && (
        <div style={{ padding: '0 0 8px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {work.performed_text && <Field label="수행 내용" value={work.performed_text} block />}
          {work.pricing?.basis_text && <Field label="산정 근거" value={work.pricing.basis_text} block />}
          {work.evidence.length > 0 && (
            <div>
              <div style={{ fontSize: 'calc(10px * var(--fz, 1))', color: t.neutrals.subtle, marginBottom: 3 }}>증거 링크</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {work.evidence.map(ev => (
                  <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'calc(11px * var(--fz, 1))' }}>
                    <LTableBadge tone={tonePalettes.neutral}>{EVIDENCE_KIND_LABEL[ev.kind] ?? ev.kind}</LTableBadge>
                    {ev.url ? (
                      <a href={ev.url} target="_blank" rel="noopener noreferrer" style={{ color: t.brand[600], minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ev.title ?? ev.url}
                      </a>
                    ) : (
                      <span style={{ color: t.neutrals.muted, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title ?? '-'}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DocRow({ label, doc, onOpen, opening }: {
  label: string
  doc: { doc_no: string; status: 'draft' | 'final' } | null
  onOpen: (docNo: string) => void
  opening: string | null
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: `1px solid ${t.neutrals.line}` }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 'calc(12px * var(--fz, 1))', color: t.neutrals.text }}>{label}</span>
      {doc ? (
        <>
          <LTableBadge tone={doc.status === 'final' ? tonePalettes.done : tonePalettes.pending}>{doc.status === 'final' ? '확정' : '초안'}</LTableBadge>
          <LBtn variant="secondary" size="xs" onClick={() => onOpen(doc.doc_no)} disabled={opening !== null}>
            {opening === doc.doc_no ? '여는 중' : '열기'}
          </LBtn>
        </>
      ) : (
        <span style={{ fontSize: 'calc(11.5px * var(--fz, 1))', color: t.neutrals.subtle }}>미등록</span>
      )}
    </div>
  )
}

function InvoiceRow({ label, invoice }: {
  label: string
  invoice: { approval_no: string | null; issue_date: string | null; supply_amount: number; total_amount: number } | null
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: `1px solid ${t.neutrals.line}` }}>
      <span style={{ width: 48, flexShrink: 0, fontSize: 'calc(11.5px * var(--fz, 1))', color: t.neutrals.muted }}>{label}</span>
      {invoice ? (
        <>
          <span style={{ fontFamily: t.font.mono, fontSize: 'calc(10.5px * var(--fz, 1))', color: t.neutrals.subtle }}>{invoice.issue_date ?? '-'}</span>
          <span style={{ fontFamily: t.font.mono, fontSize: 'calc(10.5px * var(--fz, 1))', color: t.neutrals.muted, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {invoice.approval_no ?? '-'}
          </span>
          <span style={{ fontFamily: t.font.mono, fontSize: 'calc(11.5px * var(--fz, 1))', fontWeight: 500, color: t.neutrals.text }}>
            ₩{Math.round(invoice.total_amount).toLocaleString()}
          </span>
        </>
      ) : (
        <span style={{ fontSize: 'calc(11.5px * var(--fz, 1))', color: t.neutrals.subtle }}>미확인</span>
      )}
    </div>
  )
}

function CashRows({ label, rows }: { label: string; rows: { id: string; payment_date: string; amount: number; counterparty: string | null }[] }) {
  return (
    <div style={{ padding: '6px 0', borderTop: `1px solid ${t.neutrals.line}` }}>
      <div style={{ fontSize: 'calc(11.5px * var(--fz, 1))', color: t.neutrals.muted, marginBottom: rows.length ? 3 : 0 }}>{label}</div>
      {rows.length === 0 && <div style={{ fontSize: 'calc(11.5px * var(--fz, 1))', color: t.neutrals.subtle }}>미확인</div>}
      {rows.map(r => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'calc(11px * var(--fz, 1))', padding: '2px 0' }}>
          <span style={{ fontFamily: t.font.mono, color: t.neutrals.subtle }}>{r.payment_date}</span>
          <span style={{ flex: 1, minWidth: 0, color: t.neutrals.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.counterparty ?? '-'}</span>
          <span style={{ fontFamily: t.font.mono, fontWeight: 500, color: t.neutrals.text }}>₩{Math.round(Math.abs(r.amount)).toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

function Field({ label, value, block }: { label: string; value: string; block?: boolean }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: `calc(${t.type.label}px * var(--fz, 1))`, color: t.neutrals.subtle, marginBottom: 2 }}>{label}</div>
      <div style={block
        ? { fontSize: 'calc(11.5px * var(--fz, 1))', color: t.neutrals.text, lineHeight: 1.5, wordBreak: 'break-word' as const, whiteSpace: 'pre-wrap' as const }
        : { fontSize: 'calc(12px * var(--fz, 1))', color: t.neutrals.text, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }
      }>{value}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: `calc(${t.type.panelTitle}px * var(--fz, 1))`, fontFamily: t.font.mono, fontWeight: 600, letterSpacing: 0.6, color: t.neutrals.subtle, marginBottom: 4 }}>
        {title}
      </div>
      {children}
    </div>
  )
}
