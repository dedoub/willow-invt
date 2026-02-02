// LemonSqueezy API 유틸리티
// https://docs.lemonsqueezy.com/api

const LEMONSQUEEZY_API_URL = 'https://api.lemonsqueezy.com/v1'

interface LemonSqueezyResponse<T> {
  data: T
  meta?: {
    page: {
      currentPage: number
      from: number
      lastPage: number
      perPage: number
      to: number
      total: number
    }
  }
  links?: {
    first: string
    last: string
  }
}

// 타입 정의
export interface LemonSqueezyOrder {
  id: string
  type: 'orders'
  attributes: {
    store_id: number
    customer_id: number
    identifier: string
    order_number: number
    user_name: string
    user_email: string
    currency: string
    currency_rate: string
    subtotal: number
    discount_total: number
    tax: number
    total: number
    subtotal_usd: number
    discount_total_usd: number
    tax_usd: number
    total_usd: number
    tax_name: string
    tax_rate: string
    status: 'pending' | 'failed' | 'paid' | 'refunded'
    status_formatted: string
    refunded: boolean
    refunded_at: string | null
    subtotal_formatted: string
    discount_total_formatted: string
    tax_formatted: string
    total_formatted: string
    first_order_item: {
      id: number
      order_id: number
      product_id: number
      variant_id: number
      product_name: string
      variant_name: string
      price: number
      created_at: string
      updated_at: string
    }
    created_at: string
    updated_at: string
  }
}

export interface LemonSqueezySubscription {
  id: string
  type: 'subscriptions'
  attributes: {
    store_id: number
    customer_id: number
    order_id: number
    order_item_id: number
    product_id: number
    variant_id: number
    product_name: string
    variant_name: string
    user_name: string
    user_email: string
    status: 'on_trial' | 'active' | 'paused' | 'past_due' | 'unpaid' | 'cancelled' | 'expired'
    status_formatted: string
    card_brand: string
    card_last_four: string
    pause: null | {
      mode: 'void' | 'free'
      resumes_at: string
    }
    cancelled: boolean
    trial_ends_at: string | null
    billing_anchor: number
    renews_at: string
    ends_at: string | null
    created_at: string
    updated_at: string
  }
}

export interface LemonSqueezyCustomer {
  id: string
  type: 'customers'
  attributes: {
    store_id: number
    name: string
    email: string
    status: string
    city: string | null
    region: string | null
    country: string
    total_revenue_currency: number
    mrr: number
    status_formatted: string
    country_formatted: string
    total_revenue_currency_formatted: string
    mrr_formatted: string
    created_at: string
    updated_at: string
  }
}

export interface LemonSqueezyProduct {
  id: string
  type: 'products'
  attributes: {
    store_id: number
    name: string
    slug: string
    description: string
    status: 'draft' | 'published'
    status_formatted: string
    thumb_url: string | null
    large_thumb_url: string | null
    price: number
    price_formatted: string
    from_price: number | null
    to_price: number | null
    pay_what_you_want: boolean
    buy_now_url: string
    created_at: string
    updated_at: string
  }
}

// API 호출 함수
async function fetchLemonSqueezy<T>(
  endpoint: string,
  params?: Record<string, string>
): Promise<LemonSqueezyResponse<T>> {
  const apiKey = process.env.LEMONSQUEEZY_API_KEY
  if (!apiKey) {
    throw new Error('LEMONSQUEEZY_API_KEY is not configured')
  }

  const url = new URL(`${LEMONSQUEEZY_API_URL}${endpoint}`)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value)
    })
  }

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      'Authorization': `Bearer ${apiKey}`,
    },
    next: { revalidate: 60 }, // 1분 캐시
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(`LemonSqueezy API error: ${response.status} - ${JSON.stringify(error)}`)
  }

  return response.json()
}

// 주문 목록 조회
export async function getOrders(storeId?: string, page = 1, perPage = 50): Promise<LemonSqueezyResponse<LemonSqueezyOrder[]>> {
  const params: Record<string, string> = {
    'page[number]': page.toString(),
    'page[size]': perPage.toString(),
  }

  if (storeId) {
    params['filter[store_id]'] = storeId
  }

  return fetchLemonSqueezy<LemonSqueezyOrder[]>('/orders', params)
}

// 구독 목록 조회
export async function getSubscriptions(storeId?: string, page = 1, perPage = 50): Promise<LemonSqueezyResponse<LemonSqueezySubscription[]>> {
  const params: Record<string, string> = {
    'page[number]': page.toString(),
    'page[size]': perPage.toString(),
  }

  if (storeId) {
    params['filter[store_id]'] = storeId
  }

  return fetchLemonSqueezy<LemonSqueezySubscription[]>('/subscriptions', params)
}

// 고객 목록 조회
export async function getCustomers(storeId?: string, page = 1, perPage = 50): Promise<LemonSqueezyResponse<LemonSqueezyCustomer[]>> {
  const params: Record<string, string> = {
    'page[number]': page.toString(),
    'page[size]': perPage.toString(),
  }

  if (storeId) {
    params['filter[store_id]'] = storeId
  }

  return fetchLemonSqueezy<LemonSqueezyCustomer[]>('/customers', params)
}

// 상품 목록 조회
export async function getProducts(storeId?: string): Promise<LemonSqueezyResponse<LemonSqueezyProduct[]>> {
  const params: Record<string, string> = {}

  if (storeId) {
    params['filter[store_id]'] = storeId
  }

  return fetchLemonSqueezy<LemonSqueezyProduct[]>('/products', params)
}

// 통계 계산
export interface ReviewNotesStats {
  // 매출
  totalRevenue: number
  totalRevenueUSD: number
  monthlyRevenue: number
  monthlyRevenueUSD: number

  // 구독
  activeSubscriptions: number
  cancelledSubscriptions: number
  trialSubscriptions: number

  // 고객
  totalCustomers: number
  newCustomersThisMonth: number

  // MRR
  mrr: number

  // 주문
  totalOrders: number
  ordersThisMonth: number
  refundedOrders: number
}

export async function getReviewNotesStats(): Promise<ReviewNotesStats> {
  const storeId = process.env.LEMONSQUEEZY_STORE_ID

  // 병렬로 데이터 조회
  const [ordersRes, subscriptionsRes, customersRes] = await Promise.all([
    getOrders(storeId, 1, 100),
    getSubscriptions(storeId, 1, 100),
    getCustomers(storeId, 1, 100),
  ])

  const orders = ordersRes.data || []
  const subscriptions = subscriptionsRes.data || []
  const customers = customersRes.data || []

  // 이번 달 시작일
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  // 매출 계산
  const paidOrders = orders.filter(o => o.attributes.status === 'paid')
  const totalRevenue = paidOrders.reduce((sum, o) => sum + o.attributes.total, 0)
  const totalRevenueUSD = paidOrders.reduce((sum, o) => sum + o.attributes.total_usd, 0)

  const monthlyOrders = paidOrders.filter(o => new Date(o.attributes.created_at) >= monthStart)
  const monthlyRevenue = monthlyOrders.reduce((sum, o) => sum + o.attributes.total, 0)
  const monthlyRevenueUSD = monthlyOrders.reduce((sum, o) => sum + o.attributes.total_usd, 0)

  // 구독 상태
  const activeSubscriptions = subscriptions.filter(s => s.attributes.status === 'active').length
  const cancelledSubscriptions = subscriptions.filter(s => s.attributes.status === 'cancelled').length
  const trialSubscriptions = subscriptions.filter(s => s.attributes.status === 'on_trial').length

  // 고객 통계
  const totalCustomers = customers.length
  const newCustomersThisMonth = customers.filter(c => new Date(c.attributes.created_at) >= monthStart).length

  // MRR 계산 (활성 고객의 MRR 합계)
  const mrr = customers.reduce((sum, c) => sum + (c.attributes.mrr || 0), 0)

  // 주문 통계
  const totalOrders = orders.length
  const ordersThisMonth = orders.filter(o => new Date(o.attributes.created_at) >= monthStart).length
  const refundedOrders = orders.filter(o => o.attributes.refunded).length

  return {
    totalRevenue,
    totalRevenueUSD,
    monthlyRevenue,
    monthlyRevenueUSD,
    activeSubscriptions,
    cancelledSubscriptions,
    trialSubscriptions,
    totalCustomers,
    newCustomersThisMonth,
    mrr,
    totalOrders,
    ordersThisMonth,
    refundedOrders,
  }
}
