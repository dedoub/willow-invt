// 토스증권 Open API 클라이언트 (서버 전용).
// OAuth2 client_credentials 토큰과 accountSeq를 모듈 메모리에 캐싱한다.
// Vercel Fluid Compute에서 warm 인스턴스 간 재사용되며, cold start 시 재발급.
// 인증정보는 env(TOSS_CLIENT_ID / TOSS_CLIENT_SECRET)에서만 읽는다 — 클라이언트 번들 금지.

const BASE = 'https://openapi.tossinvest.com'

export class TossError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
    this.name = 'TossError'
  }
}

let tokenCache: { token: string; exp: number } | null = null
let accountSeqCache: number | null = null

async function getToken(): Promise<string> {
  const now = Date.now()
  if (tokenCache && tokenCache.exp > now) return tokenCache.token

  const clientId = process.env.TOSS_CLIENT_ID
  const clientSecret = process.env.TOSS_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new TossError(500, 'config-missing', 'TOSS_CLIENT_ID / TOSS_CLIENT_SECRET 환경변수가 설정되지 않았습니다.')
  }

  const res = await fetch(`${BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
    cache: 'no-store',
  })
  if (!res.ok) {
    let msg = `토큰 발급 실패 (${res.status})`
    try {
      const e = await res.json()
      msg = e?.error_description || e?.error || msg
    } catch { /* ignore */ }
    throw new TossError(res.status, 'auth-failed', msg)
  }
  const j = await res.json()
  // 만료 2분 전에 갱신하도록 버퍼.
  tokenCache = { token: j.access_token, exp: now + (Number(j.expires_in) - 120) * 1000 }
  return tokenCache.token
}

interface GetOpts {
  account?: boolean
  revalidate?: number
}

async function tossGet<T>(path: string, opts: GetOpts = {}): Promise<T> {
  const token = await getToken()
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (opts.account) headers['X-Tossinvest-Account'] = String(await getAccountSeq())

  const res = await fetch(`${BASE}${path}`, {
    headers,
    ...(opts.revalidate != null ? { next: { revalidate: opts.revalidate } } : { cache: 'no-store' }),
  })
  if (!res.ok) {
    let code = 'http-error'
    let msg = `${res.status} ${res.statusText}`
    try {
      const e = await res.json()
      code = e?.error?.code || code
      msg = e?.error?.message || msg
    } catch { /* ignore */ }
    throw new TossError(res.status, code, msg)
  }
  const j = await res.json()
  return j.result as T
}

export async function getAccountSeq(): Promise<number> {
  if (accountSeqCache != null) return accountSeqCache
  const accounts = await tossGet<{ accountNo: string; accountSeq: number; accountType: string }[]>(
    '/api/v1/accounts',
  )
  if (!accounts?.length) throw new TossError(404, 'no-account', '종합매매 계좌를 찾을 수 없습니다.')
  accountSeqCache = accounts[0].accountSeq
  return accountSeqCache
}

// ---- Market data ----

export interface TossPrice {
  symbol: string
  timestamp: string | null
  lastPrice: string
  currency: 'KRW' | 'USD'
}

// 최대 200개 배치. 미상장/미커버 심볼은 응답에서 누락된다(에러 아님).
export async function getPrices(symbols: string[]): Promise<Map<string, TossPrice>> {
  const map = new Map<string, TossPrice>()
  if (!symbols.length) return map
  for (let i = 0; i < symbols.length; i += 200) {
    const batch = symbols.slice(i, i + 200)
    const result = await tossGet<TossPrice[]>(
      `/api/v1/prices?symbols=${encodeURIComponent(batch.join(','))}`,
      { revalidate: 30 },
    )
    for (const p of result || []) map.set(p.symbol, p)
  }
  return map
}

export interface TossStockInfo {
  symbol: string
  name: string
  market: string
  securityType: string
  currency: 'KRW' | 'USD'
  status: string
  sharesOutstanding: string
}

// 최대 200개 배치. 시가총액 = lastPrice * sharesOutstanding 계산에 사용.
export async function getStocks(symbols: string[]): Promise<Map<string, TossStockInfo>> {
  const map = new Map<string, TossStockInfo>()
  if (!symbols.length) return map
  for (let i = 0; i < symbols.length; i += 200) {
    const batch = symbols.slice(i, i + 200)
    const result = await tossGet<TossStockInfo[]>(
      `/api/v1/stocks?symbols=${encodeURIComponent(batch.join(','))}`,
      { revalidate: 3600 },
    )
    for (const s of result || []) map.set(s.symbol, s)
  }
  return map
}

interface TossCandle {
  timestamp: string
  openPrice: string
  highPrice: string
  lowPrice: string
  closePrice: string
  volume: string
}

// 전일 종가(변동률 계산용). 일봉 2개를 받아 직전 영업일 종가를 반환.
export async function getPrevClose(symbol: string): Promise<number | null> {
  try {
    const result = await tossGet<{ candles: TossCandle[] }>(
      `/api/v1/candles?symbol=${encodeURIComponent(symbol)}&interval=1d&count=2`,
      { revalidate: 300 },
    )
    const candles = result?.candles || []
    // 최신순 정렬: [0]=당일(형성중), [1]=직전 영업일. 직전 영업일 종가를 우선 사용.
    const prev = candles[1] ?? candles[0]
    return prev ? Number(prev.closePrice) : null
  } catch {
    return null
  }
}

export async function getExchangeRate(base: 'USD' | 'KRW', quote: 'USD' | 'KRW'): Promise<number | null> {
  try {
    const result = await tossGet<{ rate: string }>(
      `/api/v1/exchange-rate?baseCurrency=${base}&quoteCurrency=${quote}`,
      { revalidate: 60 },
    )
    return result?.rate ? Number(result.rate) : null
  } catch {
    return null
  }
}

// ---- Account / asset ----

export interface TossHoldingItem {
  symbol: string
  name: string
  marketCountry: 'KR' | 'US'
  currency: 'KRW' | 'USD'
  quantity: string
  lastPrice: string
  averagePurchasePrice: string
}

export interface TossHoldings {
  totalPurchaseAmount: { krw: string; usd: string | null }
  marketValue: { amount: { krw: string; usd: string | null } }
  profitLoss: { amount: { krw: string; usd: string | null }; rate: string }
  items: TossHoldingItem[]
}

export async function getHoldings(): Promise<TossHoldings> {
  return tossGet<TossHoldings>('/api/v1/holdings', { account: true })
}

// ---- Order history ----

export interface TossOrder {
  orderId: string
  symbol: string
  side: 'BUY' | 'SELL'
  orderType: string
  status: string
  price: string | null
  quantity: string
  currency: 'KRW' | 'USD'
  orderedAt: string
  execution: {
    filledQuantity: string
    averageFilledPrice: string | null
    filledAmount: string | null
    commission: string | null
    tax: string | null
    filledAt: string | null
  }
}

// 종료된(CLOSED) 주문 전량을 커서 페이지네이션으로 수집.
export async function getClosedOrders(): Promise<TossOrder[]> {
  const orders: TossOrder[] = []
  let cursor: string | null = null
  for (let page = 0; page < 100; page++) {
    const q = `/api/v1/orders?status=CLOSED&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
    const result: { orders: TossOrder[]; nextCursor: string | null; hasNext: boolean } = await tossGet(q, {
      account: true,
    })
    orders.push(...(result.orders || []))
    if (!result.hasNext || !result.nextCursor) break
    cursor = result.nextCursor
  }
  return orders
}

// 체결 수량이 있는 주문만(부분체결 포함).
export function filledOrders(orders: TossOrder[]): TossOrder[] {
  return orders.filter((o) => Number(o.execution?.filledQuantity || '0') > 0)
}
