import assert from 'node:assert/strict'
import test from 'node:test'

async function subject() {
  try {
    return await import('./daily-finance-sync.mjs')
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') return {}
    throw error
  }
}

test('company source matrix keeps Tensoftworks and Willow collection scopes separate', async () => {
  const { COMPANY_SOURCE_MATRIX } = await subject()

  assert.deepEqual(COMPANY_SOURCE_MATRIX?.tensw, [
    'hometax',
    'woori-bank',
    'shinhan-bank',
    'woori-card',
    'nhis',
    'wetax',
  ])
  assert.deepEqual(COMPANY_SOURCE_MATRIX?.willow, [
    'hometax',
    'shinhan-bank',
    'kb-card',
    'nhis',
    'wetax',
  ])
})

test('buildPipelinePlan always imports before classifying and reconciles last', async () => {
  const { buildPipelinePlan } = await subject()

  assert.equal(typeof buildPipelinePlan, 'function')
  const plan = buildPipelinePlan('tensw')
  assert.deepEqual(plan.map(step => step.phase), [
    'collect', 'collect', 'collect', 'collect', 'collect', 'collect',
    'import', 'classify', 'reconcile',
  ])
  assert.deepEqual(plan.slice(0, 6).map(step => step.source), [
    'hometax', 'woori-bank', 'shinhan-bank', 'woori-card', 'nhis', 'wetax',
  ])
})

test('validateSourceCoverage reports every missing collector without hiding partial readiness', async () => {
  const { validateSourceCoverage } = await subject()

  assert.equal(typeof validateSourceCoverage, 'function')
  assert.deepEqual(
    validateSourceCoverage('willow', {
      hometax: { ready: true },
      'shinhan-bank': { ready: false, reason: 'login not verified' },
      'kb-card': { ready: false, reason: 'collector missing' },
      nhis: { ready: true },
      wetax: { ready: false, reason: 'collector missing' },
    }),
    [
      { source: 'shinhan-bank', reason: 'login not verified' },
      { source: 'kb-card', reason: 'collector missing' },
      { source: 'wetax', reason: 'collector missing' },
    ],
  )
})

test('retryOperation retries transient failures and returns the successful result', async () => {
  const { retryOperation } = await subject()
  let attempts = 0

  const result = await retryOperation(async () => {
    attempts += 1
    if (attempts < 3) throw new Error('temporary')
    return 'ok'
  }, { attempts: 3, delayMs: 0 })

  assert.equal(result, 'ok')
  assert.equal(attempts, 3)
})

test('scheduler commands never use an interactive password prompt', async () => {
  const { assertNonInteractiveCommand } = await subject()

  assert.equal(typeof assertNonInteractiveCommand, 'function')
  assert.doesNotThrow(() => assertNonInteractiveCommand(['node', 'collector.mjs', '--keychain']))
  assert.throws(
    () => assertNonInteractiveCommand(['node', 'collector.mjs', '--password-stdin']),
    /대화형 인증 옵션/,
  )
})

test('localTaxInvoiceRow creates a stable staging row without storing a secret', async () => {
  const { localTaxInvoiceRow } = await subject()
  const invoice = {
    transe_type: 'purchase',
    approval_no: '20260825-1',
    reporting_date: '2026-08-25',
    issue_date: '2026-08-25',
    send_date: '2026-08-25',
    supplier_reg_number: '123-45-67890',
    supplier_company: '테스트상사',
    contractor_reg_number: '828-88-00992',
    contractor_company: null,
    contractor_name: null,
    contractor_email: 'buyer@example.com',
    supplier_name: '홍길동',
    supplier_email: 'seller@example.com',
    supply_amount: 100000,
    tax_amount: 10000,
    total_amount: 110000,
    invoice_kind: '일반',
    issue_form: '전자',
    receipt_or_charge: '청구',
    rep_items: '서비스',
    note: null,
  }

  const first = localTaxInvoiceRow(invoice)
  const second = localTaxInvoiceRow({ ...invoice })
  assert.equal(first.fingerprint, second.fingerprint)
  assert.match(first.fingerprint, /^[a-f0-9]{40}$/)
  assert.equal(first.raw.source, 'hometax-local-chrome')
  assert.equal(JSON.stringify(first).includes('password'), false)
  assert.equal('contractor_email' in first, false)
  assert.equal('supplier_email' in first, false)
  assert.equal('supplier_name' in first, false)
})
