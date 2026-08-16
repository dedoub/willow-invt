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
    active_days_7d: 1,
  }])

  assert.deepEqual(metaMap.get('device:d97a92c6-f770-4931-a88d-d1f1522e87d2'), {
    deviceId: 'd97a92c6-f770-4931-a88d-d1f1522e87d2',
    firstSeenAt: '2026-08-14T18:04:14.000Z',
    lastSeenAt: '2026-08-14T18:07:52.000Z',
    platform: 'ios',
    appVersion: '1.1.132',
    locale: 'en',
    country: 'US',
    activeDays7d: 1,
  })
})

test('a merged anonymous journey is assigned to its Google owner', async () => {
  const helpers = await loadJourneyHelpers()
  assert.equal(typeof helpers.buildVoicecardsJourneyMetaMap, 'function')

  const buildMetaMap = helpers.buildVoicecardsJourneyMetaMap as (
    rows: unknown[],
    mergedOwners: ReadonlyMap<string, string>,
  ) => Map<string, unknown>
  const deviceId = '2bc1b06f-6672-4be5-87b8-df0a2e372f4f'
  const metaMap = buildMetaMap([{
    device_id: deviceId,
    user_id: null,
    first_seen_at: '2026-08-16T04:30:00.000Z',
    last_seen_at: '2026-08-16T05:10:00.000Z',
    platform: 'ios',
    app_version: '1.1.132',
    locale: 'en',
    country: 'HU',
    active_days_7d: 1,
  }], new Map([[`device:${deviceId}`, 'google-user-id']]))

  assert.equal(metaMap.has(`device:${deviceId}`), false)
  assert.deepEqual(metaMap.get('google-user-id'), {
    deviceId,
    firstSeenAt: '2026-08-16T04:30:00.000Z',
    lastSeenAt: '2026-08-16T05:10:00.000Z',
    platform: 'ios',
    appVersion: '1.1.132',
    locale: 'en',
    country: 'HU',
    activeDays7d: 1,
  })
})

test('device account display name uses the UUID rather than the device prefix', async () => {
  const helpers = await loadJourneyHelpers()
  assert.equal(typeof helpers.voicecardsDeviceDisplayName, 'function')

  const displayName = helpers.voicecardsDeviceDisplayName as (id: string) => string
  assert.equal(displayName('device:d97a92c6-f770-4931-a88d-d1f1522e87d2'), '#d97a')
  assert.equal(displayName('dev:d97a92c6-f770-4931-a88d-d1f1522e87d2'), '#d97a')
})

test('user stats cache key is versioned when the response schema changes', async () => {
  const helpers = await loadJourneyHelpers()
  assert.equal(helpers.VOICECARDS_USER_STATS_CACHE_KEY, 'voicecards-user-stats-v6')
})

test('device learning activation uses the local deck creation time', async () => {
  const helpers = await loadJourneyHelpers()
  assert.equal(typeof helpers.voicecardsLearningActivationDate, 'function')

  const activationDate = helpers.voicecardsLearningActivationDate as (user: Record<string, unknown>) => string | null
  assert.equal(activationDate({
    id: 'device:5f509ac7-7d5f-4e70-8ff2-9777311329a8',
    createdAt: '',
    installedAt: '2026-08-14T15:45:09.825Z',
    activatedAt: '2026-08-14T16:01:00.000Z',
    sheetCount: 3,
    cards: 55,
    ownCards: 55,
    flips: 0,
  }), '2026-08-14T16:01:00.000Z')
})

test('local deck activation resolves to a live device account or its merged Google owner', async () => {
  const helpers = await loadJourneyHelpers()
  assert.equal(typeof helpers.voicecardsLocalActivationOwnerId, 'function')

  const ownerId = helpers.voicecardsLocalActivationOwnerId as (
    event: { device_id: string | null; user_id: string | null },
    mergedOwners: Map<string, string>,
  ) => string | null
  const deviceId = '5f509ac7-7d5f-4e70-8ff2-9777311329a8'

  assert.equal(ownerId({ device_id: deviceId, user_id: null }, new Map()), `device:${deviceId}`)
  assert.equal(
    ownerId({ device_id: deviceId, user_id: null }, new Map([[`device:${deviceId}`, 'google-user-id']])),
    'google-user-id',
  )
  assert.equal(
    ownerId(
      { device_id: deviceId, user_id: `device:${deviceId}` },
      new Map([[`device:${deviceId}`, 'google-user-id']]),
    ),
    'google-user-id',
  )
})

test('activation alert migration baselines all newly surfaced activations but alerts future ones', async () => {
  const helpers = await loadJourneyHelpers()
  assert.equal(typeof helpers.diffVoicecardsActivationIds, 'function')

  const diff = helpers.diffVoicecardsActivationIds as (
    knownIds: string[],
    activeIds: string[],
    deviceBaselineInitialized: boolean,
  ) => { freshIds: string[]; nextKnownIds: string[] }

  const migrated = diff(['google-old'], ['google-old', 'google-new', 'device:old'], false)
  assert.deepEqual(migrated.freshIds, [])
  assert.deepEqual(new Set(migrated.nextKnownIds), new Set(['google-old', 'google-new', 'device:old']))

  const nextPoll = diff(migrated.nextKnownIds, [...migrated.nextKnownIds, 'google-next', 'device:new'], true)
  assert.deepEqual(nextPoll.freshIds, ['google-next', 'device:new'])
})

test('a merged device activation is known under its Google owner without a duplicate alert', async () => {
  const helpers = await loadJourneyHelpers()
  assert.equal(typeof helpers.expandVoicecardsKnownActivationIds, 'function')

  const expandKnown = helpers.expandVoicecardsKnownActivationIds as (
    knownIds: string[],
    mergedOwners: Map<string, string>,
  ) => string[]
  const known = expandKnown(
    ['device:5f509ac7-7d5f-4e70-8ff2-9777311329a8'],
    new Map([['device:5f509ac7-7d5f-4e70-8ff2-9777311329a8', 'google-user-id']]),
  )

  assert.deepEqual(
    new Set(known),
    new Set(['device:5f509ac7-7d5f-4e70-8ff2-9777311329a8', 'google-user-id']),
  )
})


test('anonymous learning events are assigned to the device account with KST daily counts', async () => {
  const helpers = await loadJourneyHelpers()
  assert.equal(typeof helpers.buildVoicecardsAnonymousLearningMap, 'function')

  const buildLearningMap = helpers.buildVoicecardsAnonymousLearningMap as (
    rows: unknown[],
    deviceOwners: Map<string, string>,
    todayKst: string,
  ) => Map<string, Record<string, number>>
  const deviceId = '5f509ac7-7d5f-4e70-8ff2-9777311329a8'
  const metrics = buildLearningMap([
    { device_id: deviceId, user_id: null, event_name: 'card_attempted', created_at: '2026-08-14T16:10:00.000Z', properties: {} },
    { device_id: deviceId, user_id: null, event_name: 'tts_played', created_at: '2026-08-14T16:11:00.000Z', properties: {} },
    { device_id: deviceId, user_id: null, event_name: 'voice_preview_played', created_at: '2026-08-14T16:12:00.000Z', properties: {} },
    { device_id: deviceId, user_id: null, event_name: 'card_flipped_manual', created_at: '2026-08-14T16:13:00.000Z', properties: { sheet_id: 'local-sheet' } },
    { device_id: deviceId, user_id: null, event_name: 'card_flipped_manual', created_at: '2026-08-14T16:14:00.000Z', properties: { sheet_id: 'demo-en-de' } },
  ], new Map([[deviceId, `device:${deviceId}`]]), '2026-08-15')

  assert.deepEqual(metrics.get(`device:${deviceId}`), {
    flips: 1,
    attempts: 1,
    listens: 2,
    flipsToday: 1,
    attemptsToday: 1,
    listensToday: 2,
  })
})

test('anonymous learning events follow a merged device to its Google owner without duplication', async () => {
  const helpers = await loadJourneyHelpers()
  assert.equal(typeof helpers.buildVoicecardsAnonymousLearningMap, 'function')

  const buildLearningMap = helpers.buildVoicecardsAnonymousLearningMap as (
    rows: unknown[],
    deviceOwners: Map<string, string>,
    todayKst: string,
  ) => Map<string, Record<string, number>>
  const metrics = buildLearningMap([
    { device_id: 'device-a', user_id: null, event_name: 'device_tts_played', created_at: '2026-08-14T16:00:00.000Z', properties: {} },
    { device_id: 'device-b', user_id: null, event_name: 'card_attempted', created_at: '2026-08-14T17:00:00.000Z', properties: {} },
    // user_id가 있는 이벤트는 기존 로그인 사용자 롤업에서 집계하므로 여기서는 제외한다.
    { device_id: 'device-a', user_id: 'google-user', event_name: 'card_attempted', created_at: '2026-08-14T12:00:00.000Z', properties: {} },
  ], new Map([['device-a', 'google-user'], ['device-b', 'google-user']]), '2026-08-15')

  assert.deepEqual(metrics.get('google-user'), {
    flips: 0,
    attempts: 1,
    listens: 1,
    flipsToday: 0,
    attemptsToday: 1,
    listensToday: 1,
  })
})
