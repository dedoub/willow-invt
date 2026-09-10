export interface VoicecardsStoreRevenueAmountRow {
  platform: string
  currency: string
  units: number
  customer_price: number | null
  proceeds: number | null
  proceeds_currency: string | null
}

export interface VoicecardsStoreRevenueRow extends VoicecardsStoreRevenueAmountRow {
  date: string
  product_id: string
  created_at?: string
}

export interface VoicecardsStoreRevenueTotals {
  reportedUnits: number
  unpricedRows: number
  salesByPlatformCurrency: Map<string, number>
  proceedsByPlatformCurrency: Map<string, number>
}

function normalizedCurrency(value: string | null | undefined): string {
  return value?.trim().toUpperCase() || 'USD'
}

function addAmount(target: Map<string, number>, key: string, amount: number) {
  target.set(key, (target.get(key) || 0) + amount)
}

// Apple reports Customer Price and Developer Proceeds per unit. Refund rows carry
// the sign in the amount itself, while partial refunds may have zero units.
function appStoreReportLineAmount(amountPerUnit: number, units: number): number {
  return amountPerUnit * (units === 0 ? 1 : Math.abs(units))
}

export function aggregateVoicecardsStoreRevenue(
  rows: VoicecardsStoreRevenueAmountRow[],
): VoicecardsStoreRevenueTotals {
  const totals: VoicecardsStoreRevenueTotals = {
    reportedUnits: 0,
    unpricedRows: 0,
    salesByPlatformCurrency: new Map(),
    proceedsByPlatformCurrency: new Map(),
  }

  for (const row of rows) {
    const platform = row.platform === 'android' ? 'android' : 'ios'
    const units = Number(row.units) || 0
    totals.reportedUnits += units

    const customerPrice = row.customer_price === null ? null : Number(row.customer_price)
    if (customerPrice === null || !Number.isFinite(customerPrice)) {
      totals.unpricedRows += 1
    } else {
      const currency = normalizedCurrency(row.currency)
      addAmount(
        totals.salesByPlatformCurrency,
        `${platform}:${currency}`,
        customerPrice,
      )
    }

    const proceeds = row.proceeds === null ? null : Number(row.proceeds)
    if (proceeds !== null && Number.isFinite(proceeds)) {
      const currency = normalizedCurrency(row.proceeds_currency || row.currency)
      addAmount(
        totals.proceedsByPlatformCurrency,
        `${platform}:${currency}`,
        proceeds,
      )
    }
  }

  return totals
}

export function parseVoicecardsAppStoreSalesReport(
  text: string,
  date: string,
): VoicecardsStoreRevenueRow[] {
  const lines = text.split(/\r?\n/).filter(line => line.trim())
  if (lines.length < 2) return []

  const header = lines[0].split('\t').map(column => column.replace(/^\uFEFF/, '').trim().toLowerCase())
  const indexOf = (name: string) => header.findIndex(column => column === name)
  const iSku = indexOf('sku')
  const iUnits = indexOf('units')
  const iProceeds = indexOf('developer proceeds')
  const iCustomerCurrency = indexOf('customer currency')
  const iProceedsCurrency = indexOf('currency of proceeds')
  const iType = indexOf('product type identifier')
  const iCustomerPrice = indexOf('customer price')

  if ([iSku, iUnits, iProceeds, iCustomerCurrency, iCustomerPrice].some(index => index < 0)) {
    throw new Error('App Store sales report is missing a required revenue column')
  }

  const rows: VoicecardsStoreRevenueRow[] = []
  for (const line of lines.slice(1)) {
    const columns = line.split('\t')
    const units = Number(columns[iUnits]) || 0
    const proceeds = Number(columns[iProceeds]) || 0
    const customerPrice = Number(columns[iCustomerPrice]) || 0
    if (proceeds === 0 && customerPrice === 0) continue

    const sku = columns[iSku] || ''
    const productType = iType >= 0 ? columns[iType] || '' : ''
    rows.push({
      date,
      platform: 'ios',
      product_id: `${sku}${productType ? `:${productType}` : ''}`,
      currency: columns[iCustomerCurrency] || 'USD',
      units,
      customer_price: appStoreReportLineAmount(customerPrice, units),
      proceeds: appStoreReportLineAmount(proceeds, units),
      proceeds_currency: iProceedsCurrency >= 0 ? columns[iProceedsCurrency] || null : null,
    })
  }

  return rows
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        field += character
      }
    } else if (character === '"') {
      quoted = true
    } else if (character === ',') {
      row.push(field)
      field = ''
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''))
      if (row.some(value => value.length > 0)) rows.push(row)
      row = []
      field = ''
    } else {
      field += character
    }
  }

  row.push(field.replace(/\r$/, ''))
  if (row.some(value => value.length > 0)) rows.push(row)
  return rows
}

export function parseVoicecardsGooglePlaySalesReport(
  text: string,
  packageId: string,
): VoicecardsStoreRevenueRow[] {
  const parsed = parseCsvRows(text)
  if (parsed.length < 2) return []

  const header = parsed[0].map(column => column.replace(/^\uFEFF/, '').trim().toLowerCase())
  const indexOf = (name: string) => header.findIndex(column => column === name)
  const iDate = indexOf('order charged date')
  const iStatus = indexOf('financial status')
  const iPackage = indexOf('package id')
  const iSku = indexOf('sku id')
  const iCurrency = indexOf('currency of sale')
  const iCharged = indexOf('charged amount')

  if ([iDate, iStatus, iPackage, iSku, iCurrency, iCharged].some(index => index < 0)) {
    throw new Error('Google Play sales report is missing a required revenue column')
  }

  const grouped = new Map<string, VoicecardsStoreRevenueRow>()
  for (const columns of parsed.slice(1)) {
    if (columns[iPackage] !== packageId) continue
    const date = columns[iDate] || ''
    const productId = columns[iSku] || ''
    const currency = columns[iCurrency] || 'USD'
    const status = (columns[iStatus] || '').trim().toLowerCase()
    const refund = status.includes('refund') || status.includes('chargeback')
    const rawAmount = Number((columns[iCharged] || '').replace(/,/g, '')) || 0
    const amount = refund && rawAmount > 0 ? -rawAmount : rawAmount
    if (!date || !productId || amount === 0) continue

    const key = `${date}\u0000${productId}\u0000${currency}`
    const previous = grouped.get(key)
    if (previous) {
      previous.units += refund ? -1 : 1
      previous.customer_price = Number(((previous.customer_price || 0) + amount).toFixed(6))
    } else {
      grouped.set(key, {
        date,
        platform: 'android',
        product_id: productId,
        currency,
        units: refund ? -1 : 1,
        customer_price: amount,
        proceeds: null,
        proceeds_currency: null,
      })
    }
  }

  return Array.from(grouped.values()).sort((left, right) =>
    left.date.localeCompare(right.date) || left.product_id.localeCompare(right.product_id)
  )
}
