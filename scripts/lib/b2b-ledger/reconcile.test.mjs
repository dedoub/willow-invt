import assert from 'node:assert/strict'
import test from 'node:test'
import { reconcile } from './reconcile.mjs'

const BASE = {
  workSum: 1000000,
  supplyAmount: 1000000,
  vatAmount: 100000,
  totalAmount: 1100000,
  invoiceProviderSupply: 1000000,
  invoiceClientSupply: 1000000,
  cashProviderIn: 1100000,
  cashClientOut: -1100000,
  engagementFee: null,
  engagementSettledBefore: 0,
  documentsFinal: true,
}

test('all figures matching returns ok with no diffs', () => {
  const result = reconcile(BASE)
  assert.equal(result.ok, true)
  assert.deepEqual(result.diffs, [])
  assert.equal(result.figures.supplyAmount, 1000000)
  assert.equal(result.figures.engagementRemaining, null)
})

test('work_sum_mismatch when workSum differs from supplyAmount', () => {
  const result = reconcile({ ...BASE, workSum: 900000 })
  assert.deepEqual(result.diffs, ['work_sum_mismatch'])
  assert.equal(result.ok, false)
})

test('invoice_provider_missing when provider invoice is null', () => {
  const result = reconcile({ ...BASE, invoiceProviderSupply: null })
  assert.deepEqual(result.diffs, ['invoice_provider_missing'])
})

test('invoice_client_missing when client invoice is null', () => {
  const result = reconcile({ ...BASE, invoiceClientSupply: null })
  assert.deepEqual(result.diffs, ['invoice_client_missing'])
})

test('invoice_provider_mismatch when provider invoice differs from supply', () => {
  const result = reconcile({ ...BASE, invoiceProviderSupply: 999999 })
  assert.deepEqual(result.diffs, ['invoice_provider_mismatch'])
})

test('invoice_client_mismatch when client invoice differs from supply', () => {
  const result = reconcile({ ...BASE, invoiceClientSupply: 999999 })
  assert.deepEqual(result.diffs, ['invoice_client_mismatch'])
})

test('total_mismatch when totalAmount is not supply + vat', () => {
  // cash figures are moved to match the (wrong) totalAmount so only total_mismatch fires
  const result = reconcile({ ...BASE, totalAmount: 1200000, cashProviderIn: 1200000, cashClientOut: -1200000 })
  assert.deepEqual(result.diffs, ['total_mismatch'])
})

test('cash_provider_mismatch when cash-in does not equal total', () => {
  const result = reconcile({ ...BASE, cashProviderIn: 1000000 })
  assert.deepEqual(result.diffs, ['cash_provider_mismatch'])
})

test('cash_client_mismatch when abs(cash-out) does not equal total', () => {
  const result = reconcile({ ...BASE, cashClientOut: -1000000 })
  assert.deepEqual(result.diffs, ['cash_client_mismatch'])
})

test('engagement_cap_exceeded when settled-before + supply exceeds fee', () => {
  const result = reconcile({ ...BASE, engagementFee: 1500000, engagementSettledBefore: 800000 })
  assert.deepEqual(result.diffs, ['engagement_cap_exceeded'])
  assert.equal(result.figures.engagementRemaining, 1500000 - 800000 - 1000000)
})

test('engagement within cap has no engagement diff and reports remaining', () => {
  const result = reconcile({ ...BASE, engagementFee: 3000000, engagementSettledBefore: 500000 })
  assert.deepEqual(result.diffs, [])
  assert.equal(result.figures.engagementRemaining, 3000000 - 500000 - 1000000)
})

test('documents_not_final when documentsFinal is false', () => {
  const result = reconcile({ ...BASE, documentsFinal: false })
  assert.deepEqual(result.diffs, ['documents_not_final'])
})

test('documents_not_final when documentsFinal is omitted', () => {
  const { documentsFinal, ...baseWithoutDocsFinal } = BASE
  const result = reconcile(baseWithoutDocsFinal)
  assert.equal(result.ok, false)
  assert.deepEqual(result.diffs, ['documents_not_final'])
})

test('multiple diffs accumulate together', () => {
  const result = reconcile({ ...BASE, workSum: 1, documentsFinal: false })
  assert.deepEqual(result.diffs, ['work_sum_mismatch', 'documents_not_final'])
  assert.equal(result.ok, false)
})
