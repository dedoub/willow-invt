import assert from 'node:assert/strict'
import test from 'node:test'

async function loadJourneyHelpers() {
  return import('../voicecards-device-journey').catch(() => ({} as Record<string, unknown>))
}

test('anonymous journey metadata is assigned to its device account', async () => {
  const helpers = await loadJourneyHelpers()
  assert.equal(typeof helpers.buildVoicecardsJourneyMetaMap, 'function')

  const buildMetaMap = helpers.buildVoicecardsJourneyMetaMap as (rows: unknown[]) => Map<string, unknown>
  const metaMap = buildMetaMap([{
    device_id: 'd97a92c6-f770-4931-a88d-d1f1522e87d2',
    user_id: null,
    first_seen_at: '2026-08-14T18:04:14.000Z',
    last_seen_at: '2026-08-14T18:07:52.000Z',
    platform: 'ios',
    app_version: '1.1.132',
    locale: 'en',
    country: 'US',
  }])

  assert.deepEqual(metaMap.get('device:d97a92c6-f770-4931-a88d-d1f1522e87d2'), {
    deviceId: 'd97a92c6-f770-4931-a88d-d1f1522e87d2',
    firstSeenAt: '2026-08-14T18:04:14.000Z',
    lastSeenAt: '2026-08-14T18:07:52.000Z',
    platform: 'ios',
    appVersion: '1.1.132',
    locale: 'en',
    country: 'US',
  })
})

test('device account display name uses the UUID rather than the device prefix', async () => {
  const helpers = await loadJourneyHelpers()
  assert.equal(typeof helpers.voicecardsDeviceDisplayName, 'function')

  const displayName = helpers.voicecardsDeviceDisplayName as (id: string) => string
  assert.equal(displayName('device:d97a92c6-f770-4931-a88d-d1f1522e87d2'), '#d97a')
  assert.equal(displayName('dev:d97a92c6-f770-4931-a88d-d1f1522e87d2'), '#d97a')
})
