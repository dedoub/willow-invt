function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatMoney(value) {
  return `₩${Math.round(number(value)).toLocaleString('en-US')}`
}

function compactLines(lines) {
  return lines.filter(Boolean).join('\n')
}

function normalize(value) {
  return String(value ?? '').replace(/\s|\(주\)|주식회사|㈜|특별시|광역시|법인/g, '').toLowerCase()
}

function isPaid(row) {
  return Boolean(row.paid_at || row.payment_date || ['paid', 'completed'].includes(String(row.status ?? '').toLowerCase()))
}

function invoiceDirection(invoice) {
  return invoice.transe_type === 'sales' ? 'sales' : 'purchase'
}

function invoiceCounterparty(invoice) {
  return invoiceDirection(invoice) === 'sales'
    ? invoice.contractor_company || '거래처 미확인'
    : invoice.supplier_company || '거래처 미확인'
}

function dedupeTaxInvoices(rows) {
  const seen = new Set()
  return rows.filter(row => {
    const key = row.approval_no || row.fingerprint || row.id
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function partiesMatch(cash, invoice) {
  const cashParty = normalize(cash.counterparty)
  const invoiceParty = normalize(invoiceCounterparty(invoice))
  if (!cashParty || !invoiceParty) return false
  return cashParty.includes(invoiceParty) || invoiceParty.includes(cashParty)
}

function matchesInvoicePayment(cash, invoice) {
  const direction = invoiceDirection(invoice)
  if ((direction === 'sales' && cash.type !== 'revenue') || (direction === 'purchase' && cash.type !== 'expense')) return false
  if (!partiesMatch(cash, invoice)) return false

  const text = `${cash.description ?? ''} ${cash.notes ?? ''}`
  if (/세금계산서/.test(text)) return true
  const tolerance = Math.max(1_000, number(invoice.total_amount) * 0.001)
  return Math.abs(Math.abs(number(cash.amount)) - number(invoice.total_amount)) <= tolerance
}

function cashDate(row) {
  return row.payment_date || row.issue_date
}

function cashText(row) {
  return `${row.counterparty ?? ''} ${row.description ?? ''} ${row.notes ?? ''}`
}

function classifyCash(row, invoices, obligationCashIds) {
  const invoice = invoices.find(candidate => matchesInvoicePayment(row, candidate))
  if (invoice) return invoiceDirection(invoice) === 'sales' ? 'sales_payment' : 'purchase_payment'

  const text = cashText(row)
  if (/급여|상여/.test(text)) return 'salary'
  if (/법인카드|카드.*(?:대금|결제|이용|선결제)|우리카드/.test(text)) return 'card'
  if (/대출\s*이자|대여금.*이자|이자.*대여금/.test(text)) return 'interest'
  if (!obligationCashIds.has(row.id) && /부가가치세|부가세|법인세|소득세|지방세|원천징수|국세|세금|4대보험|국민연금|건강보험|고용보험|산재보험/.test(text)) return 'tax'
  return null
}

function cashTitle(kind, row) {
  const party = row.counterparty || '거래처 미확인'
  const amount = formatMoney(Math.abs(number(row.amount)))
  switch (kind) {
    case 'sales_payment': return `[재무] 매출대금 입금 · ${party} · ${amount}`
    case 'purchase_payment': return `[재무] 매입대금 이체 · ${party} · ${amount}`
    case 'salary': return `[재무] 급여 이체 · ${amount}`
    case 'card': return `[재무] 법인카드 결제 · ${amount}`
    case 'interest': return `[재무] ${/대여금.*이자|이자.*대여금/.test(cashText(row)) ? '대여금 이자' : '대출이자'} 상환 · ${amount}`
    case 'tax': return `[재무] 세금 납부 · ${amount}`
    default: return ''
  }
}

function isSocialInsurance(row) {
  return row.source === 'nhis' || ['pension', 'health_insurance', 'employment_insurance', 'industrial_accident'].includes(row.obligation_type)
}

function obligationTitle(row) {
  const raw = String(row.title || row.obligation_type || '세금')
  if (/부가가치|부가세|vat/i.test(raw)) return '부가가치세'
  if (/원천|withhold/i.test(raw)) return '원천징수세'
  if (/지방|local/i.test(raw)) return '지방세'
  if (/법인|corporate/i.test(raw)) return '법인세'
  return raw.replace(/\s*\([^)]*\)\s*/g, ' ').trim()
}

function obligationRows(rows) {
  const result = []
  const socialByDate = new Map()

  for (const row of rows) {
    const date = row.due_date || row.issued_date
    if (!row.id || !date) continue
    if (!isSocialInsurance(row)) {
      result.push({
        source_key: `tensw-finance:tax-obligation:${row.id}:due`,
        title: `[재무] ${obligationTitle(row)} 납부 · ${formatMoney(row.amount)}`,
        description: compactLines([
          row.agency ? `기관: ${row.agency}` : null,
          row.period_label ? `귀속기간: ${row.period_label}` : null,
          row.notice_number ? `고지번호: ${row.notice_number}` : null,
        ]),
        schedule_date: date,
        type: 'deadline',
        category: 'expense', // 세금·고지 납부 = 돈 나가는 일
        is_completed: isPaid(row),
      })
      continue
    }

    const group = socialByDate.get(date) || []
    group.push(row)
    socialByDate.set(date, group)
  }

  for (const [date, group] of socialByDate) {
    const amount = group.reduce((sum, row) => sum + number(row.amount), 0)
    result.push({
      source_key: `tensw-finance:tax-obligation:social:${date}:due`,
      title: `[재무] 4대보험 납부 · ${formatMoney(amount)}`,
      description: group.map(row => `${obligationTitle(row)} ${formatMoney(row.amount)}`).join('\n'),
      schedule_date: date,
      type: 'deadline',
      category: 'expense',
      is_completed: group.every(isPaid),
    })
  }

  return result
}

export function buildTenswFinanceScheduleRows({ taxInvoices, cashRows, taxObligations }) {
  const invoices = dedupeTaxInvoices(taxInvoices)
  const rows = invoices.flatMap(invoice => {
    const scheduleDate = invoice.issue_date || invoice.reporting_date
    const sourceId = invoice.approval_no || invoice.fingerprint || invoice.id
    if (!sourceId || !scheduleDate) return []
    const direction = invoiceDirection(invoice)
    const kind = direction === 'sales' ? '매출' : '매입'
    const party = invoiceCounterparty(invoice)
    return [{
      source_key: `tensw-finance:tax-invoice:${sourceId}:issued`,
      title: `[재무] ${kind} 세금계산서 · ${party} · ${formatMoney(invoice.total_amount)}`,
      description: compactLines([
        invoice.rep_items ? `품목: ${invoice.rep_items}` : null,
        invoice.approval_no ? `승인번호: ${invoice.approval_no}` : null,
      ]),
      schedule_date: scheduleDate,
      type: 'task',
      category: direction === 'sales' ? 'revenue' : 'expense',
      is_completed: true,
    }]
  })

  const obligationCashIds = new Set(taxObligations.map(row => row.matched_cash_id).filter(Boolean))
  for (const cash of cashRows) {
    const scheduleDate = cashDate(cash)
    if (!cash.id || !scheduleDate) continue
    const kind = classifyCash(cash, invoices, obligationCashIds)
    if (!kind) continue
    rows.push({
      source_key: `tensw-finance:cash:${cash.id}:paid`,
      title: cashTitle(kind, cash),
      description: compactLines([
        cash.description || null,
        cash.account_number ? `계좌: ${cash.account_number}` : null,
      ]),
      schedule_date: scheduleDate,
      type: 'task',
      category: kind === 'sales_payment' ? 'revenue' : 'expense',
      is_completed: isPaid(cash),
    })
  }

  rows.push(...obligationRows(taxObligations))
  return rows
}

function isLegacyMatch(desired, existing) {
  if (desired.schedule_date !== existing.schedule_date) return false
  const source = desired.source_key
  if (source.includes(':tax-invoice:')) return /세금계산서/.test(existing.title)
  if (source.includes(':cash:')) {
    if (/급여 이체/.test(desired.title)) return /급여.*(?:이체|지급)/.test(existing.title)
    if (/법인카드 결제/.test(desired.title)) return /법인카드|카드.*(?:대금|결제)/.test(existing.title)
    if (/대출이자 상환/.test(desired.title)) return /대출.*이자|이자.*상환/.test(existing.title)
    if (/매출대금 입금/.test(desired.title)) return /입금|수금/.test(existing.title)
    if (/매입대금 이체/.test(desired.title)) return /이체|지급/.test(existing.title)
    return /세금.*납부/.test(existing.title)
  }
  if (source.includes(':tax-obligation:social:')) return /4대보험|사회보험/.test(existing.title)
  return /부가세|부가가치세|원천징수|지방세|법인세|국세/.test(existing.title)
}

function scheduleIsCurrent(desired, existing) {
  return Object.entries(desired).every(([key, value]) => existing[key] === value)
}

export function planTenswFinanceScheduleSync(desiredRows, existingRows) {
  const insert = []
  const update = []
  const claimedIds = new Set()
  const bySource = new Map(existingRows.filter(row => row.source_key).map(row => [row.source_key, row]))

  for (const desired of desiredRows) {
    const sourced = bySource.get(desired.source_key)
    const legacy = sourced ?? existingRows.find(row => !row.source_key && !claimedIds.has(row.id) && isLegacyMatch(desired, row))
    if (!legacy) {
      insert.push(desired)
      continue
    }
    claimedIds.add(legacy.id)
    if (!scheduleIsCurrent(desired, legacy)) update.push({ id: legacy.id, values: desired })
  }

  return { insert, update }
}

export async function syncTenswFinanceSchedules(sb, { dryRun = false, log = () => {} } = {}) {
  const [invoiceRes, cashRes, obligationRes, scheduleRes] = await Promise.all([
    sb.from('tensw_codef_tax_invoices')
      .select('id, transe_type, approval_no, fingerprint, reporting_date, issue_date, supplier_company, contractor_company, total_amount, rep_items, status'),
    sb.from('tensw_mgmt_cash')
      .select('id, type, counterparty, description, amount, issue_date, payment_date, status, account_number, notes'),
    sb.from('finance_tax_obligations')
      .select('id, source, obligation_type, notice_number, period_label, title, agency, amount, issued_date, due_date, status, paid_at, matched_cash_id')
      .eq('company', 'tensw'),
    sb.from('tensw_mgmt_schedules')
      .select('id, title, description, schedule_date, type, category, is_completed, source_key'),
  ])

  for (const [name, result] of [
    ['세금계산서', invoiceRes],
    ['현금 원장', cashRes],
    ['세금·사회보험', obligationRes],
    ['텐소프트웍스 일정', scheduleRes],
  ]) {
    if (result.error) throw new Error(`${name} 조회 실패: ${result.error.message}`)
  }

  const desired = buildTenswFinanceScheduleRows({
    taxInvoices: invoiceRes.data ?? [],
    cashRows: cashRes.data ?? [],
    taxObligations: obligationRes.data ?? [],
  })
  const plan = planTenswFinanceScheduleSync(desired, scheduleRes.data ?? [])

  for (const row of plan.update) log(`일정 갱신: ${row.values.schedule_date} ${row.values.title}`)
  for (const row of plan.insert) log(`일정 추가: ${row.schedule_date} ${row.title}`)
  if (dryRun) return { ...plan, desiredCount: desired.length }

  for (const row of plan.update) {
    const { error } = await sb.from('tensw_mgmt_schedules').update(row.values).eq('id', row.id)
    if (error) throw new Error(`일정 갱신 실패 (${row.values.title}): ${error.message}`)
  }
  if (plan.insert.length > 0) {
    const { error } = await sb.from('tensw_mgmt_schedules').insert(plan.insert)
    if (error) throw new Error(`일정 추가 실패: ${error.message}`)
  }

  return { ...plan, desiredCount: desired.length }
}
