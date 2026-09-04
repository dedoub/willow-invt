import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildVoicecardsLocalAssetMap,
  LOCAL_SHEET_CREATED_EVENT,
  LOCAL_SHEET_FLUSHED_EVENT,
  LOCAL_LIBRARY_SNAPSHOT_EVENT,
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

// ── 스냅샷 기반 현재 보유량 (2026-09-04) ─────────────────────────────
// 생성 이벤트 누적은 "만든 적 있다"는 이력이지 "지금 갖고 있다"가 아니다.
// 삭제·재설치가 이벤트로 남지 않아 대시보드가 보유량을 영구히 부풀렸다.
// 앱이 현재 로컬 덱·카드 수를 스냅샷으로 보내면 그 값이 현재 상태의 정본이다.

test('스냅샷이 있으면 생성 누적 대신 스냅샷이 현재 보유량이다', () => {
  // 덱 3개를 만들고 2개를 지운 기기. 생성 이벤트는 3개 그대로 남아 있다.
  const { assets } = buildVoicecardsLocalAssetMap(
    [
      { device_id: DEVICE, created_at: '2026-09-01T01:00:00.000Z', event_name: LOCAL_SHEET_CREATED_EVENT, properties: { card_count: 10 } },
      { device_id: DEVICE, created_at: '2026-09-01T02:00:00.000Z', event_name: LOCAL_SHEET_CREATED_EVENT, properties: { card_count: 20 } },
      { device_id: DEVICE, created_at: '2026-09-01T03:00:00.000Z', event_name: LOCAL_SHEET_CREATED_EVENT, properties: { card_count: 30 } },
      { device_id: DEVICE, created_at: '2026-09-02T00:00:00.000Z', event_name: LOCAL_LIBRARY_SNAPSHOT_EVENT, properties: { deck_count: 1, card_count: 30 } },
    ],
    ownerOf,
    '2026-09-04',
  )
  assert.equal(assets.get(OWNER)?.sheets, 1)
  assert.equal(assets.get(OWNER)?.cards, 30)
})

test('스냅샷이 없는 기기는 기존 생성 누적 방식으로 남는다', () => {
  // 구버전 앱은 스냅샷을 보내지 않는다. 그 기기까지 0으로 만들면 안 된다.
  const { assets } = buildVoicecardsLocalAssetMap(
    [
      { device_id: DEVICE, created_at: '2026-09-01T01:00:00.000Z', event_name: LOCAL_SHEET_CREATED_EVENT, properties: { card_count: 10 } },
      { device_id: DEVICE, created_at: '2026-09-01T02:00:00.000Z', event_name: LOCAL_SHEET_CREATED_EVENT, properties: { card_count: 20 } },
    ],
    ownerOf,
    '2026-09-04',
  )
  assert.equal(assets.get(OWNER)?.sheets, 2)
  assert.equal(assets.get(OWNER)?.cards, 30)
})

test('재설치로 덱이 0이 되어도 활성화 이력은 지워지지 않는다', () => {
  const { assets, activatedOwnerIds } = buildVoicecardsLocalAssetMap(
    [
      { device_id: DEVICE, created_at: '2026-08-20T01:00:00.000Z', event_name: LOCAL_SHEET_CREATED_EVENT, properties: { card_count: 40 } },
      { device_id: DEVICE, created_at: '2026-09-02T00:00:00.000Z', event_name: LOCAL_LIBRARY_SNAPSHOT_EVENT, properties: { deck_count: 0, card_count: 0 } },
    ],
    ownerOf,
    '2026-09-04',
  )
  assert.equal(assets.get(OWNER)?.sheets, 0)
  assert.equal(assets.get(OWNER)?.cards, 0)
  assert.equal(assets.get(OWNER)?.firstCreatedAt, '2026-08-20T01:00:00.000Z')
  assert.ok(activatedOwnerIds.has(OWNER))
})

test('가장 최근 스냅샷만 현재 상태로 쓴다', () => {
  const { assets } = buildVoicecardsLocalAssetMap(
    [
      { device_id: DEVICE, created_at: '2026-09-01T00:00:00.000Z', event_name: LOCAL_LIBRARY_SNAPSHOT_EVENT, properties: { deck_count: 5, card_count: 100 } },
      { device_id: DEVICE, created_at: '2026-09-03T00:00:00.000Z', event_name: LOCAL_LIBRARY_SNAPSHOT_EVENT, properties: { deck_count: 2, card_count: 40 } },
    ],
    ownerOf,
    '2026-09-04',
  )
  assert.equal(assets.get(OWNER)?.sheets, 2)
  assert.equal(assets.get(OWNER)?.cards, 40)
})

test('스냅샷 이후에 만든 덱은 더해진다 (스냅샷 전송 실패 대비)', () => {
  // 스냅샷은 변경마다 나가지만 전송이 실패할 수 있다. 스냅샷 이후 생성분만
  // 더한다 — 이전 것은 버리므로 삭제 반영은 그대로 유지된다.
  const { assets } = buildVoicecardsLocalAssetMap(
    [
      { device_id: DEVICE, created_at: '2026-09-01T01:00:00.000Z', event_name: LOCAL_SHEET_CREATED_EVENT, properties: { card_count: 10 } },
      { device_id: DEVICE, created_at: '2026-09-02T00:00:00.000Z', event_name: LOCAL_LIBRARY_SNAPSHOT_EVENT, properties: { deck_count: 1, card_count: 10 } },
      { device_id: DEVICE, created_at: '2026-09-03T00:00:00.000Z', event_name: LOCAL_SHEET_CREATED_EVENT, properties: { card_count: 7 } },
    ],
    ownerOf,
    '2026-09-04',
  )
  assert.equal(assets.get(OWNER)?.sheets, 2)
  assert.equal(assets.get(OWNER)?.cards, 17)
})

test('오늘 증가분은 스냅샷이 있어도 보유 중인 생성분에서 센다', () => {
  // 보유량은 스냅샷이 정하고, 오늘 증가분은 그 보유분 중 오늘 만든 것이다.
  const { assets } = buildVoicecardsLocalAssetMap(
    [
      { device_id: DEVICE, created_at: '2026-09-04T02:00:00.000Z', event_name: LOCAL_SHEET_CREATED_EVENT, properties: { card_count: 12 } },
      { device_id: DEVICE, created_at: '2026-09-04T03:00:00.000Z', event_name: LOCAL_LIBRARY_SNAPSHOT_EVENT, properties: { deck_count: 1, card_count: 12 } },
    ],
    ownerOf,
    '2026-09-04',
  )
  assert.equal(assets.get(OWNER)?.sheets, 1)
  assert.equal(assets.get(OWNER)?.sheetsToday, 1)
  assert.equal(assets.get(OWNER)?.cardsToday, 12)
})
