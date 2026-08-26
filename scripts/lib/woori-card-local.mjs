import crypto from 'node:crypto'

export const WOORI_CARD_ORGANIZATION = '0309'

export function parseWooriCardTabState(output) {
  if (!output || output === 'missing') return { url: '', title: '' }
  const [url = '', title = ''] = output.split('\n')
  return { url, title }
}

export function needsWooriCardWindowReposition({ left, top, right, bottom }) {
  return left !== 0 || top > 30 || right !== 1920 || bottom !== 1080
}

export const WOORI_CARD_KEYPAD_ROWS = [
  { characters: '`1234567890', y: 485, xs: [683, 723, 763, 804, 844, 884, 925, 965, 1005, 1045, 1085, 1125, 1165] },
  { characters: 'qwertyuiop', y: 524, xs: [683, 723, 763, 804, 844, 884, 925, 965, 1005, 1045, 1085, 1125, 1165, 1205] },
  { characters: 'asdfghjk', y: 564, xs: [723, 763, 804, 844, 884, 925, 965, 1005, 1045, 1085, 1125, 1165] },
  { characters: 'zxcvbnml', y: 604, xs: [763, 804, 844, 884, 925, 965, 1005, 1045, 1085, 1125] },
]

const WOORI_CARD_FIXED_KEYS = {
  '-': { x: 724, y: 644 },
  '=': { x: 765, y: 644 },
  '\\': { x: 805, y: 644 },
  '[': { x: 845, y: 644 },
  ']': { x: 885, y: 644 },
  ' ': { x: 947, y: 644 },
  ';': { x: 1005, y: 644 },
  "'": { x: 1045, y: 644 },
  ',': { x: 1085, y: 644 },
  '.': { x: 1125, y: 644 },
  '/': { x: 1165, y: 644 },
}

const WOORI_CARD_SHIFTED_KEYS = {
  '`': '~',
  '1': '!',
  '2': '@',
  '3': '#',
  '4': '$',
  '5': '%',
  '6': '^',
  '7': '&',
  '8': '*',
  '9': '(',
  '0': ')',
  '-': '_',
  '=': '+',
  '\\': '|',
  '[': '{',
  ']': '}',
  ';': ':',
  "'": '"',
  ',': '<',
  '.': '>',
  '/': '?',
}

// The keypad is a floating window that can be dragged, so callers pass the
// offset between where it was calibrated and where it actually is; every point
// comes back in real screen coordinates.
export function buildWooriCardKeypadMap(lockedCoordinates, offset = { dx: 0, dy: 0 }) {
  const locked = new Set(lockedCoordinates.map(({ x, y }) => `${x}:${y}`))
  const base = { ...WOORI_CARD_FIXED_KEYS }

  for (const row of WOORI_CARD_KEYPAD_ROWS) {
    const available = row.xs.filter(x => !locked.has(`${x}:${row.y}`))
    if (available.length !== row.characters.length) {
      throw new Error(
        `우리카드 키패드 문자 수가 예상과 달라요: y=${row.y}, expected=${row.characters.length}, actual=${available.length}`,
      )
    }
    for (const [index, character] of [...row.characters].entries()) {
      base[character] = { x: available[index], y: row.y }
    }
  }

  const shifted = {}
  for (const [character, point] of Object.entries(base)) {
    if (/^[a-z]$/.test(character)) shifted[character.toUpperCase()] = point
    const shiftedCharacter = WOORI_CARD_SHIFTED_KEYS[character]
    if (shiftedCharacter) shifted[shiftedCharacter] = point
  }

  const place = point => ({ x: point.x + offset.dx, y: point.y + offset.dy })
  return {
    base: Object.fromEntries(Object.entries(base).map(([key, point]) => [key, place(point)])),
    shifted: Object.fromEntries(Object.entries(shifted).map(([key, point]) => [key, place(point)])),
  }
}

// The card keypad's active Shift is the right-hand one; the left slot at x=683 is
// a decoy that does not switch the layout.
const WOORI_CARD_SHIFT_KEY = { x: 1205, y: 644 }

export function wooriCardPasswordActions(password, layouts) {
  const shift = WOORI_CARD_SHIFT_KEY
  const actions = []

  for (const character of password) {
    if (layouts.base[character]) {
      actions.push(
        { type: 'click', point: layouts.base[character] },
        { type: 'pause', milliseconds: 180 },
      )
      continue
    }
    if (layouts.shifted[character]) {
      actions.push(
        { type: 'click', point: shift },
        { type: 'pause', milliseconds: 300 },
        { type: 'shifted-character', character },
        { type: 'pause', milliseconds: 180 },
      )
      continue
    }
    throw new Error('우리카드 키패드에서 비밀번호 문자를 안전하게 찾지 못했어요.')
  }

  return actions
}

function numberValue(value) {
  const parsed = Number(String(value ?? '').replaceAll(',', '').trim())
  return Number.isFinite(parsed) ? parsed : 0
}

function isoDate(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.length === 8
    ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
    : null
}

function isoTime(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.length >= 6
    ? `${digits.slice(0, 2)}:${digits.slice(2, 4)}:${digits.slice(4, 6)}`
    : null
}

function paymentType(value) {
  if (String(value ?? '').includes('할부')) return '2'
  if (String(value ?? '').includes('일시불')) return '1'
  return null
}

function codefFingerprint(row) {
  return crypto
    .createHash('sha1')
    .update([
      row.organization,
      row.raw.resCardNo,
      row.raw.resUsedDate,
      row.raw.resUsedTime,
      row.raw.resApprovalNo,
      row.raw.resMemberStoreName,
      row.raw.resUsedAmount,
      row.raw.resCancelYN,
    ].join('|'))
    .digest('hex')
}

export function mapWooriCardApproval(source) {
  const isOverseas = source.USE_RGN_NM === '해외'
  const approvedKrw = numberValue(source.APV_AM_12)
  const approvedForeign = numberValue(source.OVS_APV_AM_12)
  const cancelled = numberValue(source.CAN_AM_12)
  const cancelYn = cancelled <= 0 ? '0' : cancelled >= approvedKrw ? '1' : '2'
  const cardNo = String(source.CD_NO_MSK ?? '').replaceAll('-', '')
  const usedDate = String(source.APV_DY_8 ?? '').replace(/\D/g, '')
  const usedTime = String(source.APV_TM_6 ?? '').replace(/\D/g, '')
  const storeCorpNo = String(source.BIZ_NO ?? '').replace(/\D/g, '') || null
  const payment = paymentType(source.APV_SAL_DIS_NM)
  const installment = String(source.ISTL_TM_2 ?? '').trim() || null
  const usedAmount = isOverseas ? approvedForeign : approvedKrw
  const storeName = String(source.APV_MCH_NM_40 ?? '').trim()

  if (!cardNo || !usedDate || !usedTime || !source.APV_NO_8) {
    throw new Error('우리카드 승인 필수 필드가 비어 있어요.')
  }

  const raw = {
    source: 'woori-local-chrome',
    resCardNo: cardNo,
    resUsedDate: usedDate,
    resUsedTime: usedTime,
    resApprovalNo: String(source.APV_NO_8),
    resMemberStoreName: storeName,
    resMemberStoreCorpNo: storeCorpNo ?? '',
    resMemberStoreType: String(source.MCC_CD_NM ?? ''),
    resUsedAmount: String(usedAmount),
    resKRWAmt: isOverseas ? String(approvedKrw) : '',
    resVAT: isOverseas ? '' : String(numberValue(source.ADD_TAX_11)),
    resHomeForeignType: isOverseas ? '2' : '1',
    resAccountCurrency: isOverseas ? 'USD' : 'KRW',
    resPaymentType: payment ?? '',
    resInstallmentMonth: installment ?? '',
    resCancelYN: cancelYn,
    resCancelAmount: cancelled > 0 ? String(cancelled) : '',
    resCancelDate: String(source.CAN_DY_8 ?? ''),
    resCancelTime: String(source.CAN_TM_6 ?? ''),
    resPurchaseYN: String(source.SLSH_RCP_DIS_1 ?? ''),
    resPurchaseDate: '',
  }

  const row = {
    organization: WOORI_CARD_ORGANIZATION,
    card_no: cardNo,
    used_date: isoDate(usedDate),
    used_time: isoTime(usedTime),
    store_name: raw.resMemberStoreName || null,
    store_corp_no: storeCorpNo,
    store_type: raw.resMemberStoreType || null,
    amount: usedAmount,
    krw_amount: isOverseas ? approvedKrw : null,
    home_foreign_type: raw.resHomeForeignType,
    vat: isOverseas ? null : numberValue(source.ADD_TAX_11),
    payment_type: payment,
    installment_month: installment,
    approval_no: raw.resApprovalNo,
    payment_due_date: null,
    cancel_yn: cancelYn,
    cancel_amount: cancelled > 0 ? cancelled : null,
    purchase_yn: raw.resPurchaseYN || null,
    purchase_date: null,
    raw,
  }

  return { ...row, fingerprint: codefFingerprint(row) }
}

export function summarizeWooriCardApprovals(rows) {
  let gross = 0
  let cancellation = 0
  let fullCancellationCount = 0

  for (const row of rows) {
    const approved = numberValue(row.APV_AM_12)
    const cancelled = numberValue(row.CAN_AM_12)
    gross += approved
    cancellation += cancelled
    if (approved > 0 && cancelled >= approved) fullCancellationCount += 1
  }

  return {
    raw_count: rows.length,
    effective_count: rows.length - fullCancellationCount,
    gross_krw_amount: gross,
    cancellation_krw_amount: cancellation,
    net_krw_amount: gross - cancellation,
  }
}

export function validateWooriCardPayload(payload) {
  if (!Array.isArray(payload?.rows) || payload.rows.length === 0) {
    throw new Error('우리카드 승인 원본이 비어 있어요.')
  }
  const summary = summarizeWooriCardApprovals(payload.rows)
  if (
    summary.effective_count !== Number(payload.ui_count)
    || summary.net_krw_amount !== Number(payload.ui_net_krw_amount)
  ) {
    throw new Error(
      `우리카드 화면 집계와 승인 원본이 일치하지 않아요: `
      + `화면 ${payload.ui_count}건/${payload.ui_net_krw_amount}원, `
      + `원본 ${summary.effective_count}건/${summary.net_krw_amount}원`,
    )
  }
  return summary
}

export function shouldExpandWooriCardRows(state, previousState) {
  if (!state?.moreVisible) return false
  if (!previousState) return true
  return Number(state.rowCount) > Number(previousState.rowCount)
}
