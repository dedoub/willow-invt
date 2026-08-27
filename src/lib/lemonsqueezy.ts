// LemonSqueezy API 유틸리티
// https://docs.lemonsqueezy.com/api
import { kstDateKey, kstMonthStart } from '@/lib/kst'
import { RN_EXCLUDED_EMAILS } from '@/lib/reviewnotes-types'
import { SC_EXCLUDED_EMAILS } from '@/lib/scripta-types'

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
// ─── 크레딧 팩 매출 ────────────────────────────────────────────────────────────
// 리뷰노트와 Scripta는 한 스토어(Willow Investments, 237969)를 쓰고 상품만 다르다.
// 그래서 매출은 store 필터가 아니라 상품 필터로 가른다.
//
// 둘 다 구독을 접고 크레딧 팩 단건 결제로 갔다(리뷰노트 2026-08-24). 단건 결제에는
// MRR이라는 숫자가 없다 — 구독자 0명에 플랜 컬럼만 남은 계정으로 월 매출을 지어내면
// 그게 곧 거짓말이 된다. 그래서 누적 매출·구매 건수·구매자 수만 센다.
const REVIEWNOTES_PRODUCT_ID = Number(process.env.LEMONSQUEEZY_PRODUCT_REVIEWNOTES || 1311143)
const SCRIPTA_PRODUCT_ID = Number(process.env.LEMONSQUEEZY_PRODUCT_SCRIPTA || 1310231)

export interface CreditSalesStats {
  productId: number
  /** 결제 완료 건수 (환불 제외) */
  paidOrders: number
  refundedOrders: number
  /** 결제 완료 매출 (USD 센트) */
  revenueUsd: number
  monthRevenueUsd: number
  monthOrders: number
  /** 구매한 고객 수 (이메일 기준 distinct) */
  buyers: number
  /** 팩별 판매 — 변형(40/440/2,300/4,800 크레딧) 단위 */
  byVariant: Array<{ variant: string; orders: number; revenueUsd: number }>
  /** 일별 매출 (KST) — 스파크라인용 */
  daily: Array<{ date: string; orders: number; revenueUsd: number }>
}

export async function getCreditSalesStats(
  productId: number,
  excludeEmails: string[] = [],
): Promise<CreditSalesStats> {
  const storeId = process.env.LEMONSQUEEZY_STORE_ID
  // LS 주문 API에는 상품 필터가 없어 스토어 주문을 받아 여기서 가른다.
  // 한 스토어에 두 제품 주문이 같이 쌓이므로 페이지를 넉넉히 받아둔다.
  const ordersRes = await getOrders(storeId, 1, 100)
  const all = ordersRes.data || []
  // 운영 계정의 테스트 결제는 매출이 아니다 — 다른 집계와 같은 기준으로 뺀다.
  const excluded = new Set(excludeEmails.map(e => e.toLowerCase()))
  const orders = all.filter(o =>
    o.attributes.first_order_item?.product_id === productId
    && !excluded.has((o.attributes.user_email || '').toLowerCase()))

  const monthStartKst = kstMonthStart()
  const paid = orders.filter(o => o.attributes.status === 'paid')
  const monthPaid = paid.filter(o => kstDateKey(o.attributes.created_at) >= monthStartKst)

  const byVariant = new Map<string, { variant: string; orders: number; revenueUsd: number }>()
  const daily = new Map<string, { date: string; orders: number; revenueUsd: number }>()
  for (const o of paid) {
    const variant = o.attributes.first_order_item?.variant_name || '기본'
    const v = byVariant.get(variant) ?? { variant, orders: 0, revenueUsd: 0 }
    v.orders++; v.revenueUsd += o.attributes.total_usd
    byVariant.set(variant, v)

    const day = kstDateKey(o.attributes.created_at)
    const d = daily.get(day) ?? { date: day, orders: 0, revenueUsd: 0 }
    d.orders++; d.revenueUsd += o.attributes.total_usd
    daily.set(day, d)
  }

  return {
    productId,
    paidOrders: paid.length,
    refundedOrders: orders.filter(o => o.attributes.status === 'refunded' || o.attributes.refunded).length,
    revenueUsd: paid.reduce((sum, o) => sum + o.attributes.total_usd, 0),
    monthRevenueUsd: monthPaid.reduce((sum, o) => sum + o.attributes.total_usd, 0),
    monthOrders: monthPaid.length,
    buyers: new Set(paid.map(o => o.attributes.user_email)).size,
    byVariant: Array.from(byVariant.values()).sort((a, b) => b.revenueUsd - a.revenueUsd),
    daily: Array.from(daily.values()).sort((a, b) => a.date.localeCompare(b.date)),
  }
}

/** 'Scripta Credits' 상품 매출 (운영 계정 제외) */
export const getScriptaSalesStats = () => getCreditSalesStats(SCRIPTA_PRODUCT_ID, SC_EXCLUDED_EMAILS)
/** 'ReviewNotes Credits' 상품 매출 — 구독을 접은 뒤 리뷰노트에서 돈이 오가는 유일한 경로다 */
export const getReviewNotesSalesStats = () => getCreditSalesStats(REVIEWNOTES_PRODUCT_ID, RN_EXCLUDED_EMAILS)

