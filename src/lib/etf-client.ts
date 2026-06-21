// Client-safe ETF data access. Mirrors the old supabase-etf function signatures
// but goes through /api/etf/* server routes (service-role) instead of querying
// Supabase directly with the public anon key. Use this from client components.
import type {
  ETFProduct,
  ETFProductInput,
  ETFDisplayData,
  HistoricalDataPoint,
  ETFDocument,
  TimeSeriesData,
  AkrosProduct,
} from './etf-types'

async function getJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url)
    if (!res.ok) return fallback
    return (await res.json()) as T
  } catch {
    return fallback
  }
}

// ===== Akros (AUM) =====
export async function fetchAllTimeSeriesData(): Promise<TimeSeriesData[]> {
  return getJson('/api/etf/timeseries', [])
}
export async function fetchAkrosProducts(): Promise<AkrosProduct[]> {
  // /api/akros-products wraps the list as { products: [...] } (legacy route).
  const r = await getJson<{ products?: AkrosProduct[] }>('/api/akros-products', { products: [] })
  return r.products ?? []
}
export async function fetchYearLaunches(year: number): Promise<number> {
  const r = await getJson<{ count: number }>(`/api/etf/year-launches?year=${year}`, { count: 0 })
  return r.count
}

// ===== Willow (ETF meta) =====
export async function fetchETFDisplayData(bank?: string): Promise<ETFDisplayData[]> {
  return getJson(`/api/etf/display${bank ? `?bank=${encodeURIComponent(bank)}` : ''}`, [])
}
export async function fetchETFProducts(bank?: string): Promise<ETFProduct[]> {
  return getJson(`/api/etf/products${bank ? `?bank=${encodeURIComponent(bank)}` : ''}`, [])
}
export async function fetchHistoricalData(products: ETFProduct[], days = 30): Promise<HistoricalDataPoint[]> {
  try {
    const res = await fetch('/api/etf/historical', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ products, days }),
    })
    if (!res.ok) return []
    return (await res.json()) as HistoricalDataPoint[]
  } catch { return [] }
}
export async function createETFProduct(input: ETFProductInput): Promise<ETFProduct | null> {
  try {
    const res = await fetch('/api/etf/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
    if (!res.ok) return null
    return (await res.json()) as ETFProduct
  } catch { return null }
}
export async function updateETFProduct(id: number, input: Partial<ETFProductInput>): Promise<ETFProduct | null> {
  try {
    const res = await fetch('/api/etf/products', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, input }) })
    if (!res.ok) return null
    return (await res.json()) as ETFProduct
  } catch { return null }
}
export async function deleteETFProduct(id: number): Promise<boolean> {
  try {
    const res = await fetch(`/api/etf/products?id=${id}`, { method: 'DELETE' })
    return res.ok
  } catch { return false }
}

// ===== Documents (Willow storage) =====
export async function fetchETFDocuments(symbol: string): Promise<ETFDocument[]> {
  return getJson(`/api/etf/documents?symbol=${encodeURIComponent(symbol)}`, [])
}
export async function uploadETFDocument(symbol: string, file: File): Promise<{ success: boolean; error?: string }> {
  try {
    const fd = new FormData()
    fd.append('symbol', symbol)
    fd.append('file', file)
    const res = await fetch('/api/etf/documents', { method: 'POST', body: fd })
    if (!res.ok) return { success: false, error: `upload failed (${res.status})` }
    return (await res.json()) as { success: boolean; error?: string }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'upload failed' }
  }
}
export async function getDocumentDownloadUrl(symbol: string, fileName: string): Promise<string | null> {
  const r = await getJson<{ url: string | null }>(`/api/etf/document-url?symbol=${encodeURIComponent(symbol)}&fileName=${encodeURIComponent(fileName)}`, { url: null })
  return r.url
}
export async function deleteETFDocument(symbol: string, fileName: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/etf/documents?symbol=${encodeURIComponent(symbol)}&fileName=${encodeURIComponent(fileName)}`, { method: 'DELETE' })
    return res.ok
  } catch { return false }
}
