// Turns the KB국민카드 기업 승인내역 grid into the rows the card approvals table
// holds, matching the shape the 우리카드 collector already writes.
//
// KB splits every approval across two <tr>: the first carries the approval and
// the merchant, the second the department, the VAT and — the field that matters
// for matching purchases — the merchant's 사업자등록번호. A row on its own is
// half a record, so the two are paired before anything is read.
//
// 승인구분 says 국내 or 해외 rather than giving separate amounts, and the grid
// prints the billed KRW figure either way. A cancellation comes through as a
// negative 승인금액.

import crypto from 'node:crypto'

export const KB_CARD_ORGANIZATION = '0301'

// 표의 첫 칸은 스크린리더용 요약이라 데이터가 아니다.
export const KB_APPROVAL_COLUMNS = Object.freeze({
  approvedAt: 1,
  departmentNo: 2,
  cardNo: 3,
  nickname: 4,
  storeName: 5,
  paymentMethod: 6,
  amount: 7,
  domesticOrOverseas: 8,
  approvalNo: 9,
  taxType: 10,
  storeNo: 11,
  representative: 12,
  storeAddress: 13,
})

/** 두 번째 줄. 첫 줄과 달리 스크린리더 칸이 없다. */
export const KB_APPROVAL_DETAIL_COLUMNS = Object.freeze({
  departmentName: 0,
  userName: 1,
  businessType: 2,
  installmentMonths: 3,
  vat: 4,
  approvalMethod: 5,
  status: 6,
  storeStatus: 7,
  storeRegNumber: 8,
  storePhone: 9,
})

export const KB_APPROVAL_ROW_CELLS = 14
export const KB_APPROVAL_DETAIL_CELLS = 10

/**
 * 두 줄씩 짝지어 돌려준다. 칸 수로 어느 줄인지 가리므로 순서가 흐트러져도
 * 엉뚱하게 붙지 않는다.
 */
export function pairApprovalRows(rows) {
  const pairs = []
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index].length !== KB_APPROVAL_ROW_CELLS) continue
    const detail = rows[index + 1]
    pairs.push({
      row: rows[index],
      detail: detail && detail.length === KB_APPROVAL_DETAIL_CELLS ? detail : [],
    })
  }
  return pairs
}

export function amount(value) {
  const digits = String(value ?? '').replace(/[^\d-]/g, '')
  return digits ? Number(digits) : 0
}

/** "2026.08.25 17:19:50" 을 날짜와 시각으로 나눈다. */
export function splitApprovedAt(value) {
  const match = String(value ?? '').trim()
    .match(/^(\d{4})\.(\d{2})\.(\d{2})(?:\s+(\d{2}:\d{2}:\d{2}))?/)
  if (!match) return { used_date: null, used_time: null }
  return { used_date: `${match[1]}-${match[2]}-${match[3]}`, used_time: match[4] ?? null }
}

/** 결제방법은 "일시불" 또는 "3개월 할부" 처럼 온다. */
export function paymentType(value) {
  const text = String(value ?? '')
  if (text.includes('할부')) return '2'
  if (text.includes('일시불')) return '1'
  return null
}

export function installmentMonths(paymentMethod, column) {
  const fromColumn = String(column ?? '').replace(/\D/g, '')
  if (fromColumn) return fromColumn
  const match = String(paymentMethod ?? '').match(/(\d+)\s*개월/)
  return match ? match[1] : null
}

/** 취소는 승인금액이 음수로 찍힌다. */
export function cancelFlag(approved) {
  return approved < 0 ? '1' : '0'
}

export function kbCardFingerprint(row) {
  return crypto
    .createHash('sha1')
    .update([
      row.organization,
      row.card_no,
      row.used_date,
      row.used_time ?? '',
      row.approval_no ?? '',
      row.store_name ?? '',
      row.amount,
    ].join('|'))
    .digest('hex')
}

export function kbApprovalFromCells(cells, detail = []) {
  const at = splitApprovedAt(cells[KB_APPROVAL_COLUMNS.approvedAt])
  if (!at.used_date) return null

  const cardNo = String(cells[KB_APPROVAL_COLUMNS.cardNo] ?? '').replaceAll('-', '').trim()
  const approvalNo = String(cells[KB_APPROVAL_COLUMNS.approvalNo] ?? '').trim() || null
  if (!cardNo) throw new Error('KB카드 승인 행에 카드번호가 없어요.')

  const approved = amount(cells[KB_APPROVAL_COLUMNS.amount])
  const overseas = String(cells[KB_APPROVAL_COLUMNS.domesticOrOverseas] ?? '').includes('해외')
  const paymentMethod = String(cells[KB_APPROVAL_COLUMNS.paymentMethod] ?? '').trim()
  const detailAt = index => String(detail[index] ?? '').trim()
  const vatText = detailAt(KB_APPROVAL_DETAIL_COLUMNS.vat)

  const row = {
    organization: KB_CARD_ORGANIZATION,
    card_no: cardNo,
    used_date: at.used_date,
    used_time: at.used_time,
    store_name: String(cells[KB_APPROVAL_COLUMNS.storeName] ?? '').trim() || null,
    // 가맹점번호(11번 칸)는 KB 내부 번호이고, 매입 계산서와 붙는 건 두 번째 줄의
    // 가맹점사업자번호다.
    store_corp_no: detailAt(KB_APPROVAL_DETAIL_COLUMNS.storeRegNumber).replace(/\D/g, '') || null,
    store_type: detailAt(KB_APPROVAL_DETAIL_COLUMNS.businessType) || null,
    amount: Math.abs(approved),
    krw_amount: null,
    home_foreign_type: overseas ? '2' : '1',
    vat: vatText && vatText !== '-' ? amount(vatText) : null,
    payment_type: paymentType(paymentMethod),
    installment_month: installmentMonths(
      paymentMethod,
      detailAt(KB_APPROVAL_DETAIL_COLUMNS.installmentMonths),
    ),
    approval_no: approvalNo,
    payment_due_date: null,
    cancel_yn: cancelFlag(approved),
    cancel_amount: approved < 0 ? Math.abs(approved) : null,
    purchase_yn: null,
    purchase_date: null,
    raw: {
      source: 'kb-local-chrome',
      resTaxType: String(cells[KB_APPROVAL_COLUMNS.taxType] ?? '').trim(),
      resStoreNo: String(cells[KB_APPROVAL_COLUMNS.storeNo] ?? '').trim(),
      resStoreAddress: String(cells[KB_APPROVAL_COLUMNS.storeAddress] ?? '').trim(),
      resDepartmentName: detailAt(KB_APPROVAL_DETAIL_COLUMNS.departmentName),
      resUserName: detailAt(KB_APPROVAL_DETAIL_COLUMNS.userName),
      resApprovalMethod: detailAt(KB_APPROVAL_DETAIL_COLUMNS.approvalMethod),
      resStatus: detailAt(KB_APPROVAL_DETAIL_COLUMNS.status),
      resPaymentMethod: paymentMethod,
    },
  }

  return { ...row, fingerprint: kbCardFingerprint(row) }
}

export function mapKbCardApproval(source) {
  if (Array.isArray(source)) return kbApprovalFromCells(source)
  if (source && Array.isArray(source.row)) return kbApprovalFromCells(source.row, source.detail)
  return source
}

export function summarizeKbCardApprovals(pairs) {
  let gross = 0
  let cancellation = 0
  let cancelled = 0

  for (const entry of pairs) {
    const cells = Array.isArray(entry) ? entry : entry.row
    const approved = amount(cells[KB_APPROVAL_COLUMNS.amount])
    if (approved < 0) {
      cancellation += Math.abs(approved)
      cancelled += 1
    } else {
      gross += approved
    }
  }

  return {
    raw_count: pairs.length,
    effective_count: pairs.length - cancelled,
    gross_krw_amount: gross,
    cancellation_krw_amount: cancellation,
    net_krw_amount: gross - cancellation,
  }
}

export function validateKbCardPayload(payload) {
  if (!Array.isArray(payload?.rows) || payload.rows.length === 0) {
    throw new Error('KB카드 승인 원본이 비어 있어요.')
  }
  const summary = summarizeKbCardApprovals(payload.rows)
  // 화면 집계가 함께 왔을 때만 대조한다 — 표만 읽어온 경우는 그대로 통과시킨다.
  if (payload.ui_net_krw_amount != null
    && summary.net_krw_amount !== Number(payload.ui_net_krw_amount)) {
    throw new Error(
      'KB카드 화면 집계와 승인 원본이 일치하지 않아요: '
      + `화면 ${payload.ui_net_krw_amount}원, 원본 ${summary.net_krw_amount}원`,
    )
  }
  return summary
}
