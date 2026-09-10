const AKROS_REG_NUMBER = '1608802104'

function digits(value) {
  return String(value ?? '').replace(/\D/g, '')
}

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatMoney(value, currency = 'KRW') {
  const amount = number(value)
  if (String(currency).toUpperCase() === 'USD') {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  return `₩${Math.round(amount).toLocaleString('en-US')}`
}

function originalUsd(row) {
  const text = `${row.description ?? ''} ${row.notes ?? ''}`
  const match = text.match(/(?:USD\s*)?\$\s*([\d,]+(?:\.\d+)?)/i)
  return match ? `$${number(match[1].replaceAll(',', '')).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null
}

function isAkrosTaxInvoice(row) {
  if (row.transe_type !== 'sales') return false
  return digits(row.contractor_reg_number) === AKROS_REG_NUMBER
    || /아크로스/i.test(String(row.contractor_company ?? ''))
}

function isEtcCounterparty(value) {
  const text = String(value ?? '').trim()
  return /exchange\s+traded\s+concepts/i.test(text) || /(^|\W)etc(\W|$)/i.test(text)
}

function isAkrosCounterparty(value) {
  return /아크로스|akros/i.test(String(value ?? ''))
}

function isReferralFeeInvoice(invoice) {
  return (invoice.line_items ?? []).some(item => /\breferral\s+fee\b/i.test(String(item?.description ?? '')))
}

function etcInvoiceCompleted(invoice) {
  const status = String(invoice.status ?? '').toLowerCase()
  if (isReferralFeeInvoice(invoice)) {
    return Boolean(invoice.sent_to_bank_at || invoice.paid_at || ['paid', 'completed'].includes(status))
  }
  return Boolean(
    invoice.sent_to_etc_at
    || invoice.sent_at
    || invoice.paid_at
    || ['sent', 'paid', 'completed'].includes(status),
  )
}

function compactLines(lines) {
  return lines.filter(Boolean).join('\n')
}

export function buildCommercialScheduleRows({ etcInvoices, taxInvoices, cashRows }) {
  const rows = []

  for (const invoice of etcInvoices) {
    if (!invoice.id || !invoice.invoice_date) continue
    const completed = etcInvoiceCompleted(invoice)
    const referralFee = isReferralFeeInvoice(invoice)
    const invoiceNo = invoice.invoice_no || '번호 없음'
    rows.push({
      source_key: `commercial:etc-invoice:${invoice.id}:issued`,
      title: `[ETC] ${invoiceNo} 인보이스 발행`,
      description: compactLines([
        invoice.bill_to_company ? `청구처: ${invoice.bill_to_company}` : null,
        `금액: ${formatMoney(invoice.total_amount, invoice.currency)}`,
        `상태: ${completed ? referralFee ? '은행 발송 완료' : 'ETC 발송 완료' : referralFee ? '은행 미발송' : 'ETC 미발송'}`,
      ]),
      schedule_date: invoice.invoice_date,
      type: 'deadline',
      category: 'etf-etc',
      is_completed: completed,
    })
  }

  for (const invoice of taxInvoices.filter(isAkrosTaxInvoice)) {
    const scheduleDate = invoice.issue_date || invoice.reporting_date
    if (!invoice.id || !scheduleDate) continue
    rows.push({
      source_key: `commercial:akros-tax:${invoice.id}:issued`,
      title: `[아크로스] 세금계산서 발행 · ${formatMoney(invoice.total_amount)}`,
      description: compactLines([
        invoice.rep_items ? `품목: ${invoice.rep_items}` : null,
        `금액: ${formatMoney(invoice.total_amount)}`,
        invoice.approval_no ? `승인번호: ${invoice.approval_no}` : null,
      ]),
      schedule_date: scheduleDate,
      type: 'task',
      category: 'akros',
      is_completed: true,
    })
  }

  for (const cash of cashRows) {
    if (cash.type !== 'revenue') continue
    const scheduleDate = cash.payment_date || cash.issue_date
    if (!cash.id || !scheduleDate) continue

    const isEtc = isEtcCounterparty(cash.counterparty)
    const isAkros = isAkrosCounterparty(cash.counterparty)
    if (!isEtc && !isAkros) continue

    const company = isEtc ? 'ETC' : '아크로스'
    const category = isEtc ? 'etf-etc' : 'akros'
    const source = isEtc ? 'etc-cash' : 'akros-cash'
    const displayAmount = isEtc ? originalUsd(cash) || formatMoney(cash.amount) : formatMoney(cash.amount)
    rows.push({
      source_key: `commercial:${source}:${cash.id}:paid`,
      title: `[${company}] 입금 · ${displayAmount}`,
      description: compactLines([
        cash.description || null,
        `원화 인식액: ${formatMoney(cash.amount)}`,
        cash.account_number ? `계좌: ${cash.account_number}` : null,
      ]),
      schedule_date: scheduleDate,
      type: 'task',
      category,
      is_completed: true,
    })
  }

  return rows
}

function isLegacyMatch(desired, existing) {
  if (desired.schedule_date !== existing.schedule_date) return false
  if (desired.source_key.startsWith('commercial:etc-invoice:')) {
    return /ETC/i.test(existing.title) && /인보이스/.test(existing.title) && /(발행|발송)/.test(existing.title)
  }
  if (desired.source_key.startsWith('commercial:akros-tax:')) {
    return /아크로스/i.test(existing.title) && /세금계산서/.test(existing.title) && /발행/.test(existing.title)
  }
  return false
}

function scheduleIsCurrent(desired, existing) {
  return Object.entries(desired).every(([key, value]) => existing[key] === value)
}

export function planCommercialScheduleSync(desiredRows, existingRows) {
  const insert = []
  const update = []
  const claimedIds = new Set()
  const bySource = new Map(
    existingRows.filter(row => row.source_key).map(row => [row.source_key, row]),
  )

  for (const desired of desiredRows) {
    const sourced = bySource.get(desired.source_key)
    const legacy = sourced ?? existingRows.find(row => !row.source_key && !claimedIds.has(row.id) && isLegacyMatch(desired, row))
    if (!legacy) {
      insert.push(desired)
      continue
    }
    claimedIds.add(legacy.id)
    if (!scheduleIsCurrent(desired, legacy)) {
      update.push({ id: legacy.id, values: desired })
    }
  }

  return { insert, update }
}

export async function syncCommercialSchedules(sb, { dryRun = false, log = () => {} } = {}) {
  const [etcRes, taxRes, cashRes, scheduleRes] = await Promise.all([
    sb.from('willow_invoices')
      .select('id, invoice_no, invoice_date, bill_to_company, line_items, total_amount, currency, status, sent_at, sent_to_etc_at, sent_to_bank_at, paid_at'),
    sb.from('willow_finance_tax_invoices')
      .select('id, transe_type, reporting_date, issue_date, contractor_reg_number, contractor_company, total_amount, rep_items, approval_no')
      .eq('transe_type', 'sales'),
    sb.from('willow_mgmt_cash')
      .select('id, type, counterparty, description, amount, issue_date, payment_date, status, account_number, notes')
      .eq('type', 'revenue'),
    sb.from('willow_mgmt_schedules')
      .select('id, title, description, schedule_date, type, category, is_completed, source_key'),
  ])

  for (const [name, result] of [
    ['ETC 인보이스', etcRes],
    ['아크로스 세금계산서', taxRes],
    ['입금 원장', cashRes],
    ['사업관리 일정', scheduleRes],
  ]) {
    if (result.error) throw new Error(`${name} 조회 실패: ${result.error.message}`)
  }

  const desired = buildCommercialScheduleRows({
    etcInvoices: etcRes.data ?? [],
    taxInvoices: taxRes.data ?? [],
    cashRows: cashRes.data ?? [],
  })
  const plan = planCommercialScheduleSync(desired, scheduleRes.data ?? [])

  for (const row of plan.update) log(`일정 갱신: ${row.values.schedule_date} ${row.values.title}`)
  for (const row of plan.insert) log(`일정 추가: ${row.schedule_date} ${row.title}`)

  if (dryRun) return { ...plan, desiredCount: desired.length }

  for (const row of plan.update) {
    const { error } = await sb.from('willow_mgmt_schedules').update(row.values).eq('id', row.id)
    if (error) throw new Error(`일정 갱신 실패 (${row.values.title}): ${error.message}`)
  }
  if (plan.insert.length > 0) {
    const { error } = await sb.from('willow_mgmt_schedules').insert(plan.insert)
    if (error) throw new Error(`일정 추가 실패: ${error.message}`)
  }

  return { ...plan, desiredCount: desired.length }
}
