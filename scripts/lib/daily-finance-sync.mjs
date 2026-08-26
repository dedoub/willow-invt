export const COMPANY_SOURCE_MATRIX = Object.freeze({
  tensw: Object.freeze([
    'hometax',
    'woori-bank',
    'shinhan-bank',
    'woori-card',
    'nhis',
    'wetax',
  ]),
  willow: Object.freeze([
    'hometax',
    'shinhan-bank',
    'kb-card',
    'nhis',
    'wetax',
  ]),
})

export function buildPipelinePlan(company) {
  const sources = COMPANY_SOURCE_MATRIX[company]
  if (!sources) throw new Error(`지원하지 않는 회사예요: ${company}`)

  return [
    ...sources.map(source => ({ company, phase: 'collect', source })),
    { company, phase: 'import', source: null },
    { company, phase: 'classify', source: null },
    { company, phase: 'reconcile', source: null },
  ]
}

export function validateSourceCoverage(company, registry) {
  const sources = COMPANY_SOURCE_MATRIX[company]
  if (!sources) throw new Error(`지원하지 않는 회사예요: ${company}`)

  return sources.flatMap(source => {
    const entry = registry[source]
    if (entry?.ready) return []
    return [{ source, reason: entry?.reason || 'collector not configured' }]
  })
}

export async function retryOperation(operation, options = {}) {
  const attempts = Math.max(1, Number(options.attempts ?? 2))
  const delayMs = Math.max(0, Number(options.delayMs ?? 2_000))
  let lastError

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt)
    } catch (error) {
      lastError = error
      if (attempt < attempts && delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }
  }

  throw lastError
}

const INTERACTIVE_ARGUMENTS = new Set([
  '--password-stdin',
  '--prompt',
  '--interactive',
])

export function assertNonInteractiveCommand(command) {
  const blocked = command.find(argument => INTERACTIVE_ARGUMENTS.has(argument))
  if (blocked) throw new Error(`대화형 인증 옵션은 스케줄러에서 사용할 수 없어요: ${blocked}`)
  return command
}

export function localTaxInvoiceRow(invoice) {
  const fingerprintParts = [
    invoice.transe_type,
    invoice.approval_no || '',
    invoice.reporting_date,
    invoice.supplier_reg_number || '',
    invoice.contractor_reg_number || '',
    Number(invoice.total_amount || 0),
  ]

  return {
    transe_type: invoice.transe_type,
    approval_no: invoice.approval_no || null,
    reporting_date: invoice.reporting_date,
    issue_date: invoice.issue_date || null,
    send_date: invoice.send_date || null,
    supplier_reg_number: invoice.supplier_reg_number || null,
    supplier_company: invoice.supplier_company || null,
    contractor_reg_number: invoice.contractor_reg_number || null,
    contractor_company: invoice.contractor_company || null,
    contractor_name: invoice.contractor_name || null,
    supply_amount: Number(invoice.supply_amount || 0),
    tax_amount: Number(invoice.tax_amount || 0),
    total_amount: Number(invoice.total_amount || 0),
    invoice_kind: invoice.invoice_kind || null,
    issue_form: invoice.issue_form || null,
    receipt_or_charge: invoice.receipt_or_charge || null,
    rep_items: invoice.rep_items || null,
    note: invoice.note || null,
    raw: { source: 'hometax-local-chrome' },
    fingerprint: crypto.createHash('sha1').update(fingerprintParts.join('|')).digest('hex'),
  }
}
import crypto from 'node:crypto'
