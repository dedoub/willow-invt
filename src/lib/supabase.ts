import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
// Server-only client using the service role key. The app must NOT depend on the
// public anon key (that would require wide-open RLS). This module is imported
// only by server code; SUPABASE_SECRET_KEY is undefined in the browser by design,
// so it never ships to the client. For client-side public reads use a dedicated
// API route instead of importing this.
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY!

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// Explicit alias for server-side service-role access (same client).
export const getServiceSupabase = () => createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
