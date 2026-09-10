import type { LineItem } from './types'

type InvoiceWithLineItems = {
  line_items?: Pick<LineItem, 'description'>[] | null
}

export type InvoiceDeliveryTarget = 'etc' | 'bank'

export function isReferralFeeInvoice(invoice: InvoiceWithLineItems): boolean {
  return (invoice.line_items ?? []).some(item => /\breferral\s+fee\b/i.test(item.description ?? ''))
}

export function allowedInvoiceDeliveryTargets(invoice: InvoiceWithLineItems): InvoiceDeliveryTarget[] {
  return isReferralFeeInvoice(invoice) ? ['bank'] : ['etc', 'bank']
}

export function isInvoiceDeliveryTargetAllowed(
  invoice: InvoiceWithLineItems,
  target: InvoiceDeliveryTarget,
): boolean {
  return allowedInvoiceDeliveryTargets(invoice).includes(target)
}
