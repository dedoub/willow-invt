import assert from 'node:assert/strict'
import test from 'node:test'
import {
  KB_CARD_ORGANIZATION,
  pairApprovalRows,
  cancelFlag,
  installmentMonths,
  kbApprovalFromCells,
  paymentType,
  splitApprovedAt,
  summarizeKbCardApprovals,
  validateKbCardPayload,
} from './kb-card-local.mjs'

// 2026-08-26 승인내역 화면에서 그대로 가져온 행.
const ROW = [
  '2026.08.25 17:19:50 에 KV3894로 (주)이마트 역삼점에서 결제한 8,480 원 선택',
  '2026.08.25 17:19:50',
  '00000',
  'KV3894',
  '',
  '(주)이마트 역삼점',
  '일시불',
  '8,480 원',
  '국내',
  '30089461',
  '일반과세자',
  '12057325',
  '한*양',
  '서울 강남구 역삼2동 755 한솔필리아지층',
]

// 같은 승인의 두 번째 줄.
const DETAIL = [
  '윌로우인베스트먼트(주)',
  '김*욱',
  '대형마트(4107)',
  '-',
  '771 원',
  'IC',
  '정상',
  '정상',
  '206-86-50913',
  '0269081234',
]

test('splitApprovedAt은 날짜와 시각을 나눈다', () => {
  assert.deepEqual(splitApprovedAt('2026.08.25 17:19:50'),
    { used_date: '2026-08-25', used_time: '17:19:50' })
  // 시각 없이 날짜만 오는 행도 있다.
  assert.deepEqual(splitApprovedAt('2026.08.25'), { used_date: '2026-08-25', used_time: null })
  assert.deepEqual(splitApprovedAt('합계'), { used_date: null, used_time: null })
})

test('paymentType과 할부개월은 결제방법 문구에서 읽는다', () => {
  assert.equal(paymentType('일시불'), '1')
  assert.equal(paymentType('3개월 할부'), '2')
  assert.equal(paymentType(''), null)
  assert.equal(installmentMonths('3개월 할부', ''), '3')
  assert.equal(installmentMonths('일시불', ''), null)
  // 별도 칸이 있으면 그쪽이 우선이다.
  assert.equal(installmentMonths('일시불', '6'), '6')
})

test('취소는 승인금액이 음수로 찍힌다', () => {
  assert.equal(cancelFlag(-8480), '1')
  assert.equal(cancelFlag(8480), '0')
})

test('pairApprovalRows는 14칸 줄과 10칸 줄을 한 건으로 묶는다', () => {
  const pairs = pairApprovalRows([ROW, DETAIL, ROW, DETAIL])
  assert.equal(pairs.length, 2)
  assert.deepEqual(pairs[0].detail, DETAIL)
  // 상세줄이 빠진 승인도 버리지 않는다.
  assert.deepEqual(pairApprovalRows([ROW])[0].detail, [])
})

test('kbApprovalFromCells는 승인 두 줄을 적재 형태로 옮긴다', () => {
  const row = kbApprovalFromCells(ROW, DETAIL)

  assert.equal(row.organization, KB_CARD_ORGANIZATION)
  assert.equal(row.card_no, 'KV3894')
  assert.equal(row.used_date, '2026-08-25')
  assert.equal(row.used_time, '17:19:50')
  assert.equal(row.store_name, '(주)이마트 역삼점')
  assert.equal(row.amount, 8_480)
  assert.equal(row.approval_no, '30089461')
  assert.equal(row.payment_type, '1')
  assert.equal(row.home_foreign_type, '1')
  assert.equal(row.cancel_yn, '0')
  // 매입 계산서와 붙는 건 둘째 줄의 가맹점사업자번호이지, 첫 줄의 가맹점번호가 아니다.
  assert.equal(row.store_corp_no, '2068650913')
  assert.equal(row.raw.resStoreNo, '12057325')
  assert.equal(row.vat, 771)
  assert.equal(row.store_type, '대형마트(4107)')
  assert.equal(row.raw.resTaxType, '일반과세자')
  assert.match(row.fingerprint, /^[0-9a-f]{40}$/)
})

test('같은 승인은 같은 지문, 다른 승인은 다른 지문', () => {
  const other = [...ROW]
  other[9] = '30089462'
  assert.equal(kbApprovalFromCells(ROW, DETAIL).fingerprint,
    kbApprovalFromCells([...ROW], DETAIL).fingerprint)
  assert.notEqual(kbApprovalFromCells(ROW, DETAIL).fingerprint,
    kbApprovalFromCells(other, DETAIL).fingerprint)
})

test('취소 행은 금액을 양수로 두고 취소로 표시한다', () => {
  const cancelled = [...ROW]
  cancelled[7] = '-8,480 원'
  const row = kbApprovalFromCells(cancelled, DETAIL)
  assert.equal(row.amount, 8_480)
  assert.equal(row.cancel_yn, '1')
  assert.equal(row.cancel_amount, 8_480)
})

test('요약은 취소분을 차감하고, 화면 집계와 어긋나면 막는다', () => {
  const cancelled = [...ROW]
  cancelled[7] = '-1,000 원'
  const summary = summarizeKbCardApprovals([ROW, cancelled])
  assert.equal(summary.raw_count, 2)
  assert.equal(summary.effective_count, 1)
  assert.equal(summary.net_krw_amount, 7_480)

  assert.equal(validateKbCardPayload({ rows: [ROW] }).net_krw_amount, 8_480)
  assert.throws(() => validateKbCardPayload({ rows: [ROW], ui_net_krw_amount: 9_000 }),
    /일치하지 않아요/)
  assert.throws(() => validateKbCardPayload({ rows: [] }), /비어 있어요/)
})

test('날짜가 아닌 합계 행은 건너뛴다', () => {
  assert.equal(kbApprovalFromCells(['합계', '합계', '', '', '', '', '', '0 원'], []), null)
})
