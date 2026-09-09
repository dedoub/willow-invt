export interface VoicecardsPurchaseSignal {
  id?: string
  event_name: string | null
  created_at: string
  user_id: string | null
  device_id: string | null
  country?: string | null
  platform?: string | null
  properties: Record<string, unknown> | null
}

export interface VoicecardsPurchaseReceipt {
  store_txn_id: string
  platform: string | null
  user_id: string
  product_id: string
  credits: number
  created_at: string
}

export interface VoicecardsPurchaseTotals {
  iosByDate: Map<string, number>
  androidByDate: Map<string, number>
  creditsByDate: Map<string, number>
  iosTotal: number
  androidTotal: number
  creditsTotal: number
}

export interface VoicecardsUserPurchaseFacts {
  purchasedCredits: number
  purchasedToday: number
  lastPurchaseAt: string | null
}

const PURCHASE_SOURCE_DEDUP_WINDOW_MS = 2 * 60 * 1000

function receiptMatchesEvent(
  receipt: VoicecardsPurchaseSignal,
  event: VoicecardsPurchaseSignal,
): boolean {
  const receiptTime = Date.parse(receipt.created_at)
  const eventTime = Date.parse(event.created_at)
  return receipt.user_id === event.user_id
    && receipt.properties?.product_id === event.properties?.product_id
    && Number(receipt.properties?.delta || 0) === Number(event.properties?.delta || 0)
    && Number.isFinite(receiptTime)
    && Number.isFinite(eventTime)
    && Math.abs(receiptTime - eventTime) <= PURCHASE_SOURCE_DEDUP_WINDOW_MS
}

export function mergeVoicecardsPurchaseSignals(
  events: VoicecardsPurchaseSignal[],
  receipts: VoicecardsPurchaseReceipt[],
): VoicecardsPurchaseSignal[] {
  const merged: VoicecardsPurchaseSignal[] = receipts.map(receipt => ({
    id: `receipt:${receipt.store_txn_id}`,
    event_name: 'purchase_receipt',
    created_at: receipt.created_at,
    user_id: receipt.user_id,
    device_id: null,
    platform: receipt.platform,
    country: null,
    properties: {
      reason: 'purchase',
      delta: receipt.credits,
      product_id: receipt.product_id,
      store_txn_id: receipt.store_txn_id,
      source: 'purchase_receipts',
    },
  } satisfies VoicecardsPurchaseSignal))

  for (const event of events) {
    const receipt = merged.find(candidate => receiptMatchesEvent(candidate, event))
    if (!receipt) {
      merged.push(event)
      continue
    }
    receipt.device_id ||= event.device_id
    receipt.country ||= event.country
    receipt.platform ||= event.platform
  }

  return merged.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
}

export function summarizeVoicecardsPurchaseSignals(
  signals: VoicecardsPurchaseSignal[],
  pricesByProduct: Record<string, number>,
  creditsByProduct: Record<string, number>,
  dateKey: (createdAt: string) => string,
): VoicecardsPurchaseTotals {
  const totals: VoicecardsPurchaseTotals = {
    iosByDate: new Map(),
    androidByDate: new Map(),
    creditsByDate: new Map(),
    iosTotal: 0,
    androidTotal: 0,
    creditsTotal: 0,
  }

  for (const signal of signals) {
    const properties = signal.properties || {}
    if (properties.reason !== 'purchase') continue
    const productId = String(properties.product_id || '')
    const price = pricesByProduct[productId]
    if (!price) continue
    const date = dateKey(signal.created_at)
    const credits = Math.max(0, Number(properties.delta) || 0) || (creditsByProduct[productId] ?? 0)

    totals.creditsByDate.set(date, (totals.creditsByDate.get(date) || 0) + credits)
    totals.creditsTotal += credits
    if (signal.platform === 'android') {
      totals.androidByDate.set(date, (totals.androidByDate.get(date) || 0) + price)
      totals.androidTotal += price
    } else {
      totals.iosByDate.set(date, (totals.iosByDate.get(date) || 0) + price)
      totals.iosTotal += price
    }
  }

  return totals
}

export function buildVoicecardsUserPurchaseFacts(
  rollups: Array<{ user_id: string | null; purchased_credits: number | string | null; last_purchase: string | null }>,
  activities: Array<{ user_id: string | null; purchased_today: number | string | null }>,
  receipts: VoicecardsPurchaseReceipt[],
  canonicalOwnerId: (ownerId: string) => string,
  dateKey: (createdAt: string) => string,
  today: string,
): Map<string, VoicecardsUserPurchaseFacts> {
  const facts = new Map<string, VoicecardsUserPurchaseFacts>()
  const getFacts = (ownerId: string) => facts.get(ownerId) ?? {
    purchasedCredits: 0,
    purchasedToday: 0,
    lastPurchaseAt: null,
  }

  for (const row of rollups) {
    if (!row.user_id) continue
    const ownerId = canonicalOwnerId(row.user_id)
    const previous = getFacts(ownerId)
    facts.set(ownerId, {
      ...previous,
      purchasedCredits: previous.purchasedCredits + (Number(row.purchased_credits) || 0),
      lastPurchaseAt: [previous.lastPurchaseAt, row.last_purchase].filter(Boolean).sort().at(-1) || null,
    })
  }
  for (const row of activities) {
    if (!row.user_id) continue
    const ownerId = canonicalOwnerId(row.user_id)
    const previous = getFacts(ownerId)
    facts.set(ownerId, {
      ...previous,
      purchasedToday: previous.purchasedToday + (Number(row.purchased_today) || 0),
    })
  }

  const receiptFacts = new Map<string, VoicecardsUserPurchaseFacts>()
  for (const receipt of receipts) {
    const ownerId = canonicalOwnerId(receipt.user_id)
    const previous = receiptFacts.get(ownerId) ?? {
      purchasedCredits: 0,
      purchasedToday: 0,
      lastPurchaseAt: null,
    }
    receiptFacts.set(ownerId, {
      purchasedCredits: previous.purchasedCredits + (Number(receipt.credits) || 0),
      purchasedToday: previous.purchasedToday + (dateKey(receipt.created_at) === today ? (Number(receipt.credits) || 0) : 0),
      lastPurchaseAt: !previous.lastPurchaseAt || receipt.created_at > previous.lastPurchaseAt
        ? receipt.created_at
        : previous.lastPurchaseAt,
    })
  }

  // 서버 영수증이 존재하는 사용자는 그것을 단일 진실원으로 삼고, 영수증이 없는
  // 오래된 구매자만 이벤트 롤업 값을 유지한다.
  for (const [ownerId, receiptFact] of receiptFacts) facts.set(ownerId, receiptFact)
  return facts
}
