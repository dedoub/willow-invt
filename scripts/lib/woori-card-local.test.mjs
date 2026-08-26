import assert from 'node:assert/strict'
import test from 'node:test'

async function loadSubject() {
  try {
    return await import('./woori-card-local.mjs')
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') return {}
    throw error
  }
}

const overseasApproval = {
  OVS_APV_AM_12: 11.01,
  ISTL_TM_2: '',
  SLSH_RCP_DIS_1: '0',
  APV_NO_8: '493577',
  CD_NO_MSK: '5532-****-****-7149',
  CAN_AM_12: '000000000000',
  APV_MCH_NM_40: 'ANTHROPIC              SAN FRANCISCO USA',
  CAN_DY_8: '',
  APV_TM_6: '075022',
  USE_RGN_NM: '해외',
  ADD_TAX_11: '00000000000',
  APV_SAL_DIS_NM: '일시불',
  APV_AM_12: '000000015418',
  APV_DY_8: '20260825',
  BIZ_NO: '',
  MCC_CD_NM: '컴퓨터 소프트웨어 판매',
}

test('mapWooriCardApproval matches the existing CODEF approval shape and fingerprint', async () => {
  const { mapWooriCardApproval } = await loadSubject()

  assert.equal(typeof mapWooriCardApproval, 'function')
  const row = mapWooriCardApproval(overseasApproval)
  assert.deepEqual({
    organization: row.organization,
    card_no: row.card_no,
    used_date: row.used_date,
    used_time: row.used_time,
    store_name: row.store_name,
    amount: row.amount,
    krw_amount: row.krw_amount,
    home_foreign_type: row.home_foreign_type,
    payment_type: row.payment_type,
    approval_no: row.approval_no,
    cancel_yn: row.cancel_yn,
    purchase_yn: row.purchase_yn,
    fingerprint: row.fingerprint,
  }, {
    organization: '0309',
    card_no: '5532********7149',
    used_date: '2026-08-25',
    used_time: '07:50:22',
    store_name: 'ANTHROPIC              SAN FRANCISCO USA',
    amount: 11.01,
    krw_amount: 15418,
    home_foreign_type: '2',
    payment_type: '1',
    approval_no: '493577',
    cancel_yn: '0',
    purchase_yn: '0',
    fingerprint: 'b6ce92558e70e39ee271e1833dde8aef5a3f107c',
  })
  assert.equal('CD_NO_16' in row.raw, false)
})

test('mapWooriCardApproval distinguishes full and partial cancellations', async () => {
  const { mapWooriCardApproval } = await loadSubject()
  const base = {
    ...overseasApproval,
    USE_RGN_NM: '국내',
    OVS_APV_AM_12: 0,
    APV_AM_12: '000000020000',
    CAN_AM_12: '000000020000',
    BIZ_NO: '4398701023',
  }

  assert.deepEqual(
    { cancel_yn: mapWooriCardApproval(base).cancel_yn, cancel_amount: mapWooriCardApproval(base).cancel_amount },
    { cancel_yn: '1', cancel_amount: 20000 },
  )
  assert.deepEqual(
    {
      cancel_yn: mapWooriCardApproval({ ...base, APV_AM_12: '000000062920', CAN_AM_12: '000000004180' }).cancel_yn,
      cancel_amount: mapWooriCardApproval({ ...base, APV_AM_12: '000000062920', CAN_AM_12: '000000004180' }).cancel_amount,
    },
    { cancel_yn: '2', cancel_amount: 4180 },
  )
})

test('mapWooriCardApproval trims card-site full-width trailing spaces', async () => {
  const { mapWooriCardApproval } = await loadSubject()
  const row = mapWooriCardApproval({
    ...overseasApproval,
    USE_RGN_NM: '국내',
    OVS_APV_AM_12: 0,
    APV_MCH_NM_40: '비트　성균관대학교　',
    APV_AM_12: '2000',
  })

  assert.equal(row.store_name, '비트　성균관대학교')
  assert.equal(row.raw.resMemberStoreName, '비트　성균관대학교')
})

test('summarizeWooriCardApprovals uses net count and net KRW amount', async () => {
  const { summarizeWooriCardApprovals } = await loadSubject()
  const rows = [
    { APV_AM_12: '10000', CAN_AM_12: '0' },
    { APV_AM_12: '20000', CAN_AM_12: '20000' },
    { APV_AM_12: '30000', CAN_AM_12: '5000' },
  ]

  assert.deepEqual(summarizeWooriCardApprovals(rows), {
    raw_count: 3,
    effective_count: 2,
    gross_krw_amount: 60000,
    cancellation_krw_amount: 25000,
    net_krw_amount: 35000,
  })
})

test('validateWooriCardPayload rejects a UI summary mismatch', async () => {
  const { validateWooriCardPayload } = await loadSubject()
  const rows = [
    { APV_AM_12: '10000', CAN_AM_12: '0' },
    { APV_AM_12: '20000', CAN_AM_12: '20000' },
  ]

  assert.throws(
    () => validateWooriCardPayload({ rows, ui_count: 2, ui_net_krw_amount: 10000 }),
    /화면 집계와 승인 원본이 일치하지 않아요/,
  )
  assert.deepEqual(
    validateWooriCardPayload({ rows, ui_count: 1, ui_net_krw_amount: 10000 }),
    {
      raw_count: 2,
      effective_count: 1,
      gross_krw_amount: 30000,
      cancellation_krw_amount: 20000,
      net_krw_amount: 10000,
    },
  )
})

test('shouldExpandWooriCardRows keeps loading while the more button can add rows', async () => {
  const { shouldExpandWooriCardRows } = await loadSubject()

  assert.equal(typeof shouldExpandWooriCardRows, 'function')
  assert.equal(shouldExpandWooriCardRows({ moreVisible: true, rowCount: 50 }, null), true)
  assert.equal(
    shouldExpandWooriCardRows({ moreVisible: true, rowCount: 57 }, { moreVisible: true, rowCount: 50 }),
    true,
  )
  assert.equal(
    shouldExpandWooriCardRows({ moreVisible: true, rowCount: 57 }, { moreVisible: true, rowCount: 57 }),
    false,
  )
  assert.equal(shouldExpandWooriCardRows({ moreVisible: false, rowCount: 57 }, null), false)
})

test('buildWooriCardKeypadMap preserves the card keypad lower-row order', async () => {
  const { buildWooriCardKeypadMap } = await loadSubject()
  const locks = [
    { x: 723, y: 485 },
    { x: 1165, y: 485 },
    { x: 844, y: 524 },
    { x: 925, y: 524 },
    { x: 965, y: 524 },
    { x: 1045, y: 524 },
    { x: 844, y: 564 },
    { x: 925, y: 564 },
    { x: 965, y: 564 },
    { x: 1045, y: 564 },
    { x: 884, y: 604 },
    { x: 1005, y: 604 },
  ]

  const layouts = buildWooriCardKeypadMap(locks)
  assert.deepEqual(layouts.base.k, { x: 1165, y: 564 })
  const moved = buildWooriCardKeypadMap(locks, { dx: 425, dy: 154 })
  assert.deepEqual(moved.base.k, { x: 1590, y: 718 })
  assert.deepEqual(layouts.base.z, { x: 763, y: 604 })
  assert.deepEqual(layouts.base.m, { x: 1085, y: 604 })
  assert.deepEqual(layouts.base.l, { x: 1125, y: 604 })
})

test('parseWooriCardTabState treats the AppleScript missing sentinel as no tab', async () => {
  const { parseWooriCardTabState } = await loadSubject()

  assert.equal(typeof parseWooriCardTabState, 'function')
  assert.deepEqual(parseWooriCardTabState('missing'), { url: '', title: '' })
  assert.deepEqual(
    parseWooriCardTabState('https://pc.wooricard.com/login\n우리카드 기업로그인'),
    { url: 'https://pc.wooricard.com/login', title: '우리카드 기업로그인' },
  )
})

test('needsWooriCardWindowReposition detects a card window on another display', async () => {
  const { needsWooriCardWindowReposition } = await loadSubject()

  assert.equal(typeof needsWooriCardWindowReposition, 'function')
  assert.equal(needsWooriCardWindowReposition({ left: 1920, top: 30, right: 3840, bottom: 1080 }), true)
  assert.equal(needsWooriCardWindowReposition({ left: 0, top: 30, right: 1920, bottom: 1080 }), false)
})

test('wooriCardPasswordActions pauses after shift before entering the shifted key', async () => {
  const { buildWooriCardKeypadMap, wooriCardPasswordActions } = await loadSubject()
  const locks = [
    { x: 723, y: 485 }, { x: 1165, y: 485 },
    { x: 844, y: 524 }, { x: 925, y: 524 }, { x: 965, y: 524 }, { x: 1045, y: 524 },
    { x: 844, y: 564 }, { x: 925, y: 564 }, { x: 965, y: 564 }, { x: 1045, y: 564 },
    { x: 884, y: 604 }, { x: 1005, y: 604 },
  ]
  const layouts = buildWooriCardKeypadMap(locks)

  assert.deepEqual(wooriCardPasswordActions('A', layouts), [
    { type: 'click', point: { x: 1205, y: 644 } },
    { type: 'pause', milliseconds: 300 },
    { type: 'shifted-character', character: 'A' },
    { type: 'pause', milliseconds: 180 },
  ])
})
