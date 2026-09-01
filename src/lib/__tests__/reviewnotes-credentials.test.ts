import assert from 'node:assert/strict'
import test from 'node:test'

async function loadCredentialsHelper() {
  return import('../reviewnotes-credentials').catch(() => ({} as Record<string, unknown>))
}

test('ReviewNotes analytics rejects the legacy key even when a URL is configured', async () => {
  const helpers = await loadCredentialsHelper()
  assert.equal(typeof helpers.reviewNotesServiceCredentials, 'function')

  const resolve = helpers.reviewNotesServiceCredentials as (env: Record<string, string | undefined>) => unknown
  assert.equal(resolve({
    REVIEWNOTES_SUPABASE_URL: 'https://example.supabase.co',
    REVIEWNOTES_SUPABASE_KEY: 'legacy-key',
  }), null)
})

test('ReviewNotes analytics accepts only an explicit service key with its URL', async () => {
  const helpers = await loadCredentialsHelper()
  assert.equal(typeof helpers.reviewNotesServiceCredentials, 'function')

  const resolve = helpers.reviewNotesServiceCredentials as (env: Record<string, string | undefined>) => unknown
  assert.deepEqual(resolve({
    REVIEWNOTES_SUPABASE_URL: 'https://example.supabase.co',
    REVIEWNOTES_SUPABASE_SERVICE_KEY: 'service-key',
    REVIEWNOTES_SUPABASE_KEY: 'legacy-key',
  }), {
    url: 'https://example.supabase.co',
    serviceKey: 'service-key',
  })
})
