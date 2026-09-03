export function reconcile({
  workSum,
  supplyAmount,
  vatAmount,
  totalAmount,
  invoiceProviderSupply,
  invoiceClientSupply,
  cashProviderIn,
  cashClientOut,
  engagementFee,
  engagementSettledBefore,
  documentsFinal,
}) {
  const diffs = []

  if (workSum !== supplyAmount) diffs.push('work_sum_mismatch')

  if (invoiceProviderSupply == null) diffs.push('invoice_provider_missing')
  else if (invoiceProviderSupply !== supplyAmount) diffs.push('invoice_provider_mismatch')

  if (invoiceClientSupply == null) diffs.push('invoice_client_missing')
  else if (invoiceClientSupply !== supplyAmount) diffs.push('invoice_client_mismatch')

  if (totalAmount !== supplyAmount + vatAmount) diffs.push('total_mismatch')

  if (cashProviderIn !== totalAmount) diffs.push('cash_provider_mismatch')

  if (Math.abs(cashClientOut) !== totalAmount) diffs.push('cash_client_mismatch')

  const engagementRemaining =
    engagementFee == null ? null : engagementFee - engagementSettledBefore - supplyAmount

  if (engagementFee != null && engagementSettledBefore + supplyAmount > engagementFee) {
    diffs.push('engagement_cap_exceeded')
  }

  if (documentsFinal !== true) diffs.push('documents_not_final')

  return {
    ok: diffs.length === 0,
    diffs,
    figures: {
      workSum,
      supplyAmount,
      vatAmount,
      totalAmount,
      invoiceProviderSupply,
      invoiceClientSupply,
      cashProviderIn,
      cashClientOut,
      engagementFee,
      engagementSettledBefore,
      engagementRemaining,
    },
  }
}
