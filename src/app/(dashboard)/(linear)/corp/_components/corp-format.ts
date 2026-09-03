import { tonePalettes } from '@/app/(dashboard)/_components/linear-tokens'
import type { CorpDocument, CorpDocumentVersion } from '@/types/willow-corp'

export const DAY_MS = 86_400_000

export function todayYmd(): string {
  return new Date().toISOString().slice(0, 10)
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const pad = (v: number) => String(v).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 유효기간 상태. 만료됐거나 30일 안이면 표시한다. */
export function expiryState(doc: CorpDocument, today = todayYmd()): 'expired' | 'soon' | null {
  const end = doc.valid_to ?? doc.contract_end
  if (!end) return null
  if (end < today) return 'expired'
  const days = (new Date(end).getTime() - new Date(today).getTime()) / DAY_MS
  return days <= 30 ? 'soon' : null
}

export function versionTone(kind: CorpDocumentVersion['kind']) {
  if (kind === 'final_signed') return tonePalettes.done
  if (kind === 'reissue') return tonePalettes.info
  return tonePalettes.pending
}

export function docStatusTone(status: CorpDocument['status']) {
  return status === 'final' ? tonePalettes.done : tonePalettes.pending
}

/** 문서 유형을 필터 칩용 묶음으로 */
export type DocGroup = 'all' | 'rules' | 'registry' | 'shareholders' | 'contract' | 'tax' | 'resolution' | 'other'

const GROUP_OF: Record<string, DocGroup> = {
  regulation: 'rules',
  registry_extract: 'registry', business_registration: 'registry', license_permit: 'registry',
  shareholder_list: 'shareholders',
  contract: 'contract', exec_contract: 'contract',
  tax_filing: 'tax', tax_payment_proof: 'tax',
  minutes_shareholders: 'resolution', written_resolution_shareholders: 'resolution', waiver_notice: 'resolution',
  minutes_board: 'resolution', resolution_board: 'resolution', compensation_notice: 'resolution',
  bonus_payment_resolution: 'resolution', audit_notice: 'resolution',
}

export function docGroup(docType: string): DocGroup {
  return GROUP_OF[docType] ?? 'other'
}

export const DOC_GROUP_OPTIONS: ReadonlyArray<{ value: DocGroup; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'rules', label: '정관·규정' },
  { value: 'registry', label: '등기·인허가' },
  { value: 'shareholders', label: '주주' },
  { value: 'contract', label: '계약' },
  { value: 'tax', label: '세무' },
  { value: 'resolution', label: '결의' },
  { value: 'other', label: '기타' },
]
