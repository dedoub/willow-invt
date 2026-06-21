import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Service-role client. Created LAZILY so this module never calls createClient at
// import/eval time. Some client components transitively import server query libs
// that pull this module into their bundle; with eager createClient that crashed
// the browser with "supabaseKey is required" (SUPABASE_SECRET_KEY is undefined in
// the client by design). Lazy creation means the client is only instantiated when
// actually used — which only happens server-side. Client code must use /api/* routes.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

let _client: SupabaseClient | null = null
function serviceClient(): SupabaseClient {
  if (_client) return _client
  _client = createClient(supabaseUrl, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _client
}

// Proxy keeps the existing `supabase.from(...)` / `.storage` / `.rpc` call sites
// working, but defers client creation to first property access (server-side only).
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const c = serviceClient() as unknown as Record<string | symbol, unknown>
    const value = Reflect.get(c, prop, receiver)
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(c) : value
  },
})

export const getServiceSupabase = () => serviceClient()
