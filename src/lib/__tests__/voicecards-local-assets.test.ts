import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildVoicecardsLocalAssetMap,
  LOCAL_SHEET_CREATED_EVENT,
  LOCAL_SHEET_FLUSHED_EVENT,
} from '../voicecards-local-assets'

const DEVICE = '2bc1b06f-6672-4be5-87b8-df0a2e372f4f'
const OWNER = '112110559503510874996'
const ownerOf = (deviceId: string) => (deviceId === DEVICE ? OWNER : null)

test('a local deck backed up to Drive is not counted a second time', () => {
  // gnr.nagyantal, 2026-08-16: 익명 상태에서 40장짜리 로컬 덱 1개를 만들고
  // 로그인 후 Drive로 백업했다. 그 덱은 users.sheet_ids에 들어갔으므로 로컬
  // 쪽에서는 0으로 잡혀야 한다 — 아니면 덱 3개가 4개로 보인다.
  const { assets } = buildVoicecardsLocalAssetMap(
    [
      {
        device_id: DEVICE,
        created_at: '2026-08-16T04:50:35.245Z',
        event_name: LOCAL_SHEET_CREATED_EVENT,
        properties: { card_count: 40 },
      },
      {
        device_id: DEVICE,
        created_at: '2026-08-16T05:12:12.641Z',
        event_name: LOCAL_SHEET_FLUSHED_EVENT,
        properties: null,
      },
    ],
    ownerOf,
    '2026-08-16',
  )

  assert.equal(assets.get(OWNER)?.sheets, 0)
  assert.equal(assets.get(OWNER)?.cards, 0)
  assert.equal(assets.get(OWNER)?.cardsToday, 0)
})

test('duplicate local creation telemetry is counted as one deck', () => {
  const { assets } = buildVoicecardsLocalAssetMap(
    [
      {
        device_id: DEVICE,
        created_at: '2026-08-23T01:13:16.273Z',
        event_name: LOCAL_SHEET_CREATED_EVENT,
        properties: { card_count: 2 },
      },
      {
        device_id: DEVICE,
        created_at: '2026-08-23T01:13:17.295Z',
        event_name: LOCAL_SHEET_CREATED_EVENT,
        properties: { card_count: 2 },
      },
      {
        device_id: DEVICE,
        created_at: '2026-08-23T01:13:22.255Z',
        event_name: LOCAL_SHEET_FLUSHED_EVENT,
        properties: null,
      },
    ],
    ownerOf,
    '2026-08-23',
  )

  assert.equal(assets.get(OWNER)?.sheets, 0)
  assert.equal(assets.get(OWNER)?.cards, 0)
})

test('a local deck that was never backed up is still counted', () => {
  const { assets } = buildVoicecardsLocalAssetMap(
    [{
      device_id: DEVICE,
      created_at: '2026-08-16T04:50:35.245Z',
      event_name: LOCAL_SHEET_CREATED_EVENT,
      properties: { card_count: 12 },
    }],
    ownerOf,
    '2026-08-16',
  )

  assert.deepEqual(assets.get(OWNER), {
    sheets: 1,
    cards: 12,
    sheetsToday: 1,
    cardsToday: 12,
    firstCreatedAt: '2026-08-16T04:50:35.245Z',
  })
})

test('only the flushed decks drop out, oldest first', () => {
  // 로컬 덱 3개 중 1개만 백업됐다면 남은 2개는 그대로 세어야 한다.
  // 이벤트에 덱 id가 없으므로 flushAll의 처리 순서(오래된 것부터)를 따른다.
  const { assets } = buildVoicecardsLocalAssetMap(
    [
      { device_id: DEVICE, created_at: '2026-08-16T01:00:00.000Z', event_name: LOCAL_SHEET_CREATED_EVENT, properties: { card_count: 5 } },
      { device_id: DEVICE, created_at: '2026-08-16T02:00:00.000Z', event_name: LOCAL_SHEET_CREATED_EVENT, properties: { card_count: 7 } },
      { device_id: DEVICE, created_at: '2026-08-16T03:00:00.000Z', event_name: LOCAL_SHEET_CREATED_EVENT, properties: { card_count: 9 } },
      { device_id: DEVICE, created_at: '2026-08-16T04:00:00.000Z', event_name: LOCAL_SHEET_FLUSHED_EVENT, properties: null },
    ],
    ownerOf,
    '2026-08-16',
  )

  assert.equal(assets.get(OWNER)?.sheets, 2)
  assert.equal(assets.get(OWNER)?.cards, 16)
})

test('backing every deck up does not erase the activation timestamp', () => {
  // 활성화(=처음 덱을 만든 시점)는 백업 여부와 무관하다. 기기 계정 행의
  // activatedAt이 여기서 오므로, 이걸 지우면 활성화 사용자가 통계에서 사라진다.
  const { assets, activatedOwnerIds } = buildVoicecardsLocalAssetMap(
    [
      { device_id: DEVICE, created_at: '2026-08-16T04:50:35.245Z', event_name: LOCAL_SHEET_CREATED_EVENT, properties: { card_count: 40 } },
      { device_id: DEVICE, created_at: '2026-08-16T05:12:12.641Z', event_name: LOCAL_SHEET_FLUSHED_EVENT, properties: null },
    ],
    ownerOf,
    '2026-08-16',
  )

  assert.equal(assets.get(OWNER)?.firstCreatedAt, '2026-08-16T04:50:35.245Z')
  assert.ok(activatedOwnerIds.has(OWNER))
})

test('a device with no visible owner contributes nothing', () => {
  const { assets, activatedOwnerIds } = buildVoicecardsLocalAssetMap(
    [{ device_id: 'unknown-device', created_at: '2026-08-16T04:50:35.245Z', event_name: LOCAL_SHEET_CREATED_EVENT, properties: { card_count: 40 } }],
    ownerOf,
    '2026-08-16',
  )

  assert.equal(assets.size, 0)
  assert.equal(activatedOwnerIds.size, 0)
})
