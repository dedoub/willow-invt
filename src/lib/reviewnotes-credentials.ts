export type ReviewNotesServiceCredentials = {
  url: string
  serviceKey: string
}

export function reviewNotesServiceCredentials(
  env: Record<string, string | undefined>,
): ReviewNotesServiceCredentials | null {
  const url = env.REVIEWNOTES_SUPABASE_URL
  const serviceKey = env.REVIEWNOTES_SUPABASE_SERVICE_KEY
  if (!url || !serviceKey) return null
  return { url, serviceKey }
}
